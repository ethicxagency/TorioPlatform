import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import type { ConnectWhatsAppInput } from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { ChannelCryptoService } from './channel-crypto.service';
import { GraphError } from './whatsapp.api';
import { WhatsAppGraphProvider } from './whatsapp.graph-provider';

const mask = (n: string) => (n.length > 6 ? `${n.slice(0, 4)}••••${n.slice(-3)}` : '••••');

@Injectable()
export class WhatsAppConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly graph: WhatsAppGraphProvider,
    private readonly channels: ChannelsService,
  ) {}

  /** Only a number Meta confirms with this token is connected; nothing is stored otherwise. */
  async connect(workspaceId: string, actorId: string, input: ConnectWhatsAppInput) {
    if (!this.crypto.configured)
      throw new ServiceUnavailableException(
        'WhatsApp isn’t configured on this server (META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN and CHANNEL_ENCRYPTION_KEY are required).',
      );
    const db = this.prisma.client;
    const taken = await db.channel.findUnique({
      where: {
        provider_externalAccountId: {
          provider: 'WHATSAPP',
          externalAccountId: input.phoneNumberId,
        },
      },
    });
    if (taken)
      throw new ConflictException(
        taken.workspaceId === workspaceId
          ? 'This WhatsApp number is already connected to this workspace.'
          : 'This WhatsApp number is already connected to another workspace.',
      );
    let info;
    try {
      info = await this.graph.get().phoneNumber(input.phoneNumberId, input.accessToken);
    } catch (e) {
      throw new BadRequestException(
        e instanceof GraphError
          ? `Meta rejected this phone number ID or token: ${e.message}`
          : 'Could not reach Meta to verify this number. Try again.',
      );
    }
    try {
      const channel = await db.$transaction(async (tx) => {
        const c = await tx.channel.create({
          data: {
            workspaceId,
            provider: 'WHATSAPP',
            displayName: input.displayName,
            status: 'CONNECTED',
            accountName: info.verified_name ?? null,
            accountMask: mask(info.display_phone_number ?? input.phoneNumberId),
            externalAccountId: input.phoneNumberId,
            connectedAt: new Date(),
            lastHealthCheckAt: new Date(),
          },
        });
        await tx.channelCredential.create({
          data: {
            workspaceId,
            channelId: c.id,
            ciphertext: this.crypto.encrypt(input.accessToken),
          },
        });
        await tx.auditLog.create({
          data: {
            workspaceId,
            actorId,
            action: 'channel.connect',
            entityType: 'channel',
            entityId: c.id,
            metadata: { provider: 'WHATSAPP' },
          },
        });
        return c;
      });
      return this.channels.get(workspaceId, channel.id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('This WhatsApp number is already connected.');
      throw e;
    }
  }

  /** A real call to Meta; the result (and any error) is what the Channels page shows. */
  async health(workspaceId: string, channelId: string) {
    const db = this.prisma.client;
    const ch = await db.channel.findFirst({
      where: { id: channelId, workspaceId, provider: 'WHATSAPP' },
      include: { credential: true },
    });
    if (!ch) throw new BadRequestException('WhatsApp channel not found');
    const checkedAt = new Date();
    if (!ch.credential || !ch.externalAccountId)
      return {
        ok: false,
        checkedAt: checkedAt.toISOString(),
        qualityRating: null,
        displayPhoneNumber: null,
        error: 'This channel has no live WhatsApp connection.',
      };
    try {
      const info = await this.graph
        .get()
        .phoneNumber(ch.externalAccountId, this.crypto.decrypt(ch.credential.ciphertext));
      await db.channel.update({
        where: { id: ch.id },
        data: { status: 'CONNECTED', lastHealthCheckAt: checkedAt, lastError: null },
      });
      return {
        ok: true,
        checkedAt: checkedAt.toISOString(),
        qualityRating: info.quality_rating ?? null,
        displayPhoneNumber: info.display_phone_number ?? null,
        error: null,
      };
    } catch (e) {
      const expired = e instanceof GraphError && e.tokenExpired;
      const error = e instanceof GraphError ? e.message : 'Could not reach WhatsApp.';
      await db.channel.update({
        where: { id: ch.id },
        data: {
          status: expired ? 'EXPIRED' : 'NEEDS_ATTENTION',
          lastHealthCheckAt: checkedAt,
          lastError: error.slice(0, 300),
        },
      });
      return {
        ok: false,
        checkedAt: checkedAt.toISOString(),
        qualityRating: null,
        displayPhoneNumber: null,
        error,
      };
    }
  }
}
