import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(workspaceId: string, q: string) {
    const db = this.prisma.client;
    const contains = { contains: q, mode: 'insensitive' as const };
    const [conversations, customers] = await Promise.all([
      db.conversation.findMany({
        where: {
          workspaceId,
          OR: [
            { customer: { name: contains } },
            { customer: { phone: contains } },
            { customer: { handle: contains } },
            { lastMessagePreview: contains },
          ],
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 6,
        include: { customer: { select: { name: true } }, channel: { select: { provider: true } } },
      }),
      db.customer.findMany({
        where: { workspaceId, OR: [{ name: contains }, { phone: contains }, { email: contains }] },
        orderBy: { name: 'asc' },
        take: 6,
        select: { id: true, name: true, phone: true, email: true },
      }),
    ]);
    return {
      conversations: conversations.map((c) => ({
        id: c.id,
        customerName: c.customer.name,
        provider: c.channel.provider,
        preview: c.lastMessagePreview,
        status: c.status,
      })),
      customers,
    };
  }
}
