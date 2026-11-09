import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { GraphError } from '../whatsapp/whatsapp.api';
import { withinServiceWindow } from '../whatsapp/whatsapp.delivery.service';
import { explain } from './meta.connection.service';
import { MetaGraphProvider } from './meta.graph-provider';
import { unpackCredential } from './meta.credentials';

/**
 * Sends agent replies on Messenger and Instagram channels and records the outcome on the message. Idempotent: a message
 * that already has a provider id is never sent twice. Other providers, and sample channels, are skipped.
 */
@Injectable()
export class MetaDeliveryService {
  private readonly log = new Logger(MetaDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly graph: MetaGraphProvider,
  ) {}

  async deliver(workspaceId: string, messageId: string): Promise<'sent' | 'skipped' | 'failed'> {
    const db = this.prisma.client;
    const msg = await db.message.findFirst({
      where: { id: messageId, workspaceId, kind: 'OUTBOUND' },
      include: { conversation: { include: { channel: { include: { credential: true } } } } },
    });
    if (!msg || msg.externalId) return 'skipped';
    const { conversation: conv } = msg;
    const ch = conv.channel;
    if (
      (ch.provider !== 'MESSENGER' && ch.provider !== 'INSTAGRAM') ||
      ch.isSample ||
      !ch.credential
    )
      return 'skipped';

    const fail = async (reason: string) => {
      await db.message.update({
        where: { id: msg.id },
        data: { deliveryStatus: 'FAILED', errorMessage: reason.slice(0, 300) },
      });
      return 'failed' as const;
    };
    const name = ch.provider === 'INSTAGRAM' ? 'Instagram' : 'Messenger';
    if (ch.status !== 'CONNECTED') return fail(`This ${name} channel needs to be reconnected.`);
    const contact = await db.channelContact.findFirst({
      where: { channelId: ch.id, customerId: conv.customerId },
    });
    if (!contact) return fail(`This customer has no ${name} identity to reply to.`);
    if (!withinServiceWindow(conv.lastInboundAt))
      return fail(
        `The 24-hour messaging window has closed. ${name} only allows replies within 24 hours of the customer’s last message.`,
      );
    const cred = unpackCredential(this.crypto.decrypt(ch.credential.ciphertext));
    if (!cred) return fail(`This ${name} connection is incomplete. Reconnect the channel.`);

    try {
      const id = await this.graph
        .get()
        .sendText(cred.pageId, cred.token, contact.externalId, msg.body);
      await db.message.update({
        where: { id: msg.id },
        data: { externalId: id, deliveryStatus: 'SENT', errorMessage: null },
      });
      return 'sent';
    } catch (e) {
      this.log.warn(
        `${name} send failed for ${msg.id}: ${e instanceof GraphError ? `${e.status}/${e.code}` : String(e)}`,
      );
      if (e instanceof GraphError && e.tokenExpired)
        await db.channel.update({
          where: { id: ch.id },
          data: { status: 'EXPIRED', lastError: 'Meta authorization expired or was revoked.' },
        });
      return fail(explain(e));
    }
  }
}
