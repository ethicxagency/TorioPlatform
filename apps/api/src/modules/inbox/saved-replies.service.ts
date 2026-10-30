import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const select = { id: true, shortcut: true, title: true, body: true } as const;

@Injectable()
export class SavedRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.client.savedReply.findMany({
      where: { workspaceId },
      orderBy: { shortcut: 'asc' },
      select,
    });
  }

  async create(workspaceId: string, input: { shortcut: string; title: string; body: string }) {
    const dup = await this.prisma.client.savedReply.findUnique({
      where: { workspaceId_shortcut: { workspaceId, shortcut: input.shortcut } },
    });
    if (dup) throw new ConflictException('A saved reply with this shortcut already exists');
    return this.prisma.client.savedReply.create({ data: { workspaceId, ...input }, select });
  }

  async remove(workspaceId: string, id: string) {
    const res = await this.prisma.client.savedReply.deleteMany({ where: { id, workspaceId } });
    if (res.count === 0) throw new NotFoundException('Saved reply not found');
  }
}
