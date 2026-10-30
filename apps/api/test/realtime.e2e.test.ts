import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, makePrismaFake, type FakeMembership } from './helpers';

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const CONV = '33333333-3333-4333-8333-333333333333';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const memberships: FakeMembership[] = [
  { id: 'm1', workspaceId: WS_A, userId: USER_A, role: 'AGENT', createdAt: new Date(0) },
];

describe('realtime gateway', () => {
  let app: INestApplication;
  let url: string;
  let token: (id: string) => Promise<string>;
  const sockets: Socket[] = [];

  const connect = (auth: object) => {
    const s = io(`${url}/realtime`, { auth, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    return s;
  };
  const emit = <T>(s: Socket, event: string, payload?: unknown) =>
    s.timeout(3000).emitWithAck(event, payload) as Promise<T>;

  beforeAll(async () => {
    ({ app, token } = await createTestApp(makePrismaFake(memberships)));
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', 'localhost');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await app.close();
  });

  it('rejects connections without a valid token', async () => {
    const s = connect({});
    const err = await new Promise<Error>((res) => s.on('connect_error', res));
    expect(err.message).toBe('unauthorized');
  });

  it('answers ping and sends a resync hint on connect', async () => {
    const s = connect({ token: await token(USER_A) });
    const resync = new Promise((res) => s.on('system:resync', res));
    await new Promise<void>((res) => s.on('connect', () => res()));
    await resync;
    expect(await emit(s, 'system:ping')).toMatchObject({ ok: true, pong: true });
  });

  it('lets a member join their workspace and subscribe to a conversation', async () => {
    const s = connect({ token: await token(USER_A) });
    await new Promise<void>((res) => s.on('connect', () => res()));
    expect(await emit(s, 'workspace:join', { workspaceId: WS_A })).toEqual({ ok: true });
    expect(
      await emit(s, 'conversation:subscribe', { workspaceId: WS_A, conversationId: CONV }),
    ).toEqual({ ok: true });
  });

  it('refuses rooms for workspaces the user does not belong to', async () => {
    const s = connect({ token: await token(USER_A) });
    await new Promise<void>((res) => s.on('connect', () => res()));
    expect(await emit(s, 'workspace:join', { workspaceId: WS_B })).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(
      await emit(s, 'conversation:subscribe', { workspaceId: WS_B, conversationId: CONV }),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    });
  });

  it('rejects malformed payloads', async () => {
    const s = connect({ token: await token(USER_A) });
    await new Promise<void>((res) => s.on('connect', () => res()));
    expect(await emit(s, 'workspace:join', { workspaceId: 'nope' })).toEqual({
      ok: false,
      error: 'invalid_payload',
    });
  });
});
