import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { SOCKET_EVENTS } from '@torio/types';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';

const workspaceMsg = z.object({ workspaceId: z.uuid() });
const conversationMsg = z.object({ workspaceId: z.uuid(), conversationId: z.uuid() });

export const workspaceRoom = (workspaceId: string) => `ws:${workspaceId}`;
export const conversationRoom = (workspaceId: string, conversationId: string) =>
  `ws:${workspaceId}:conv:${conversationId}`;

type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Realtime foundation. Connections are authenticated with the same access JWT as REST.
 * Rooms are joined only after a database membership + permission check, so a user can
 * never receive events for a workspace they do not belong to.
 *
 * Clients should treat events as hints and refetch via REST after (re)connect;
 * `system:resync` is emitted on connect to trigger that.
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly authz: AuthorizationService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string') return next(new Error('unauthorized'));
      try {
        const p = await this.jwt.verifyAsync<AccessTokenPayload>(token, { algorithms: ['HS256'] });
        socket.data.userId = p.sub;
        // Drop the connection when the access token expires; client reconnects with a fresh one.
        const ms = Math.max(0, p.exp * 1000 - Date.now());
        const timer = setTimeout(() => socket.disconnect(true), ms);
        timer.unref();
        socket.once('disconnect', () => clearTimeout(timer));
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    client.emit(SOCKET_EVENTS.resync, { reason: 'connected' });
  }

  @SubscribeMessage(SOCKET_EVENTS.ping)
  ping(): Ack<{ pong: true; ts: number }> {
    return { ok: true, pong: true, ts: Date.now() };
  }

  @SubscribeMessage(SOCKET_EVENTS.workspaceJoin)
  async joinWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    const parsed = workspaceMsg.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'invalid_payload' };
    if (!(await this.allowed(client, parsed.data.workspaceId)))
      return { ok: false, error: 'forbidden' };
    await client.join(workspaceRoom(parsed.data.workspaceId));
    return { ok: true };
  }

  @SubscribeMessage(SOCKET_EVENTS.workspaceLeave)
  async leaveWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    const parsed = workspaceMsg.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'invalid_payload' };
    await client.leave(workspaceRoom(parsed.data.workspaceId));
    return { ok: true };
  }

  @SubscribeMessage(SOCKET_EVENTS.conversationSubscribe)
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const parsed = conversationMsg.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'invalid_payload' };
    // TODO(inbox): also verify the conversation belongs to the workspace and the agent may view it.
    if (!(await this.allowed(client, parsed.data.workspaceId)))
      return { ok: false, error: 'forbidden' };
    await client.join(conversationRoom(parsed.data.workspaceId, parsed.data.conversationId));
    return { ok: true };
  }

  @SubscribeMessage(SOCKET_EVENTS.conversationUnsubscribe)
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const parsed = conversationMsg.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'invalid_payload' };
    await client.leave(conversationRoom(parsed.data.workspaceId, parsed.data.conversationId));
    return { ok: true };
  }

  /** Server-side publish helpers for future Inbox services. */
  emitToWorkspace(workspaceId: string, event: string, payload: unknown) {
    this.server.to(workspaceRoom(workspaceId)).emit(event, payload);
  }

  emitToConversation(workspaceId: string, conversationId: string, event: string, payload: unknown) {
    this.server.to(conversationRoom(workspaceId, conversationId)).emit(event, payload);
  }

  private async allowed(client: Socket, workspaceId: string): Promise<boolean> {
    try {
      await this.authz.assertPermission(
        client.data.userId as string,
        workspaceId,
        'conversations:read',
      );
      return true;
    } catch (e) {
      this.logger.debug(`room join denied: ${(e as Error).message}`);
      return false;
    }
  }
}
