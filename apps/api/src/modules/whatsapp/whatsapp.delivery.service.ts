import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChannelCryptoService } from './channel-crypto.service';
import { GraphError } from './whatsapp.api';
import { WhatsAppGraphProvider } from './whatsapp.graph-provider';

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Pure rule: free-form replies are only allowed within 24 hours of the customer's last message. */
export const withinServiceWindow = (lastInboundAt: Date | null, now = new Date()) =>
  !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;

/**
 * Sends agent replies on WhatsApp channels and records the outcome on the message. Idempotent: a message that already
 * has a provider id is never sent again, so a retry can't create a duplicate. Non-WhatsApp or sample channels are
 * left PENDING exactly as before.
 */
@Injectable()
export class WhatsAppDeliveryService {
  private readonly log = new Logger(WhatsAppDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly graph: WhatsAppGraphProvider,
  ) {}

  async deliver(workspaceId: string, messageId: string): Promise<'sent' | 'skipped' | 'failed'> {
    const db = this.prisma.client;
    const msg = await db.message.findFirst({
      where: { id: messageId, workspaceId, kind: 'OUTBOUND' },
      include: {
        conversation: {
          include: {
            customer: { select: { phoneKey: true, messagingOptOutAt: true } },
            channel: { include: { credential: true } },
          },
        },
      },
    });
    if (!msg || msg.externalId) return 'skipped';
    const { conversation: conv } = msg;
    const ch = conv.channel;
    if (ch.provider !== 'WHATSAPP' || ch.isSample || !ch.credential || !ch.externalAccountId)
      return 'skipped';

    const fail = async (reason: string) => {
      await db.message.update({
        where: { id: msg.id },
        data: { deliveryStatus: 'FAILED', errorMessage: reason.slice(0, 300) },
      });
      return 'failed' as const;
    };
    if (ch.status !== 'CONNECTED') return fail('This WhatsApp channel needs to be reconnected.');
    if (conv.customer.messagingOptOutAt)
      return fail(
        'This customer opted out of messages. Replies are blocked until they message “START”.',
      );
    if (!conv.customer.phoneKey) return fail('This customer has no WhatsApp phone number.');
    if (!withinServiceWindow(conv.lastInboundAt))
      return fail(
        'The 24-hour customer service window has closed. WhatsApp only allows an approved template message now (templates aren’t supported in Torio yet).',
      );

    try {
      const token = this.crypto.decrypt(ch.credential.ciphertext);
      const id = await this.graph
        .get()
        .sendText(ch.externalAccountId, token, conv.customer.phoneKey, msg.body);
      await db.message.update({
        where: { id: msg.id },
        data: { externalId: id, deliveryStatus: 'SENT', errorMessage: null },
      });
      return 'sent';
    } catch (e) {
      this.log.warn(`WhatsApp send failed for ${msg.id}: ${String(e)}`);
      if (e instanceof GraphError && e.tokenExpired)
        await db.channel.update({
          where: { id: ch.id },
          data: { status: 'EXPIRED', lastError: 'WhatsApp access token is invalid or expired.' },
        });
      return fail(e instanceof GraphError ? e.message : 'Could not reach WhatsApp. Try again.');
    }
  }
}
