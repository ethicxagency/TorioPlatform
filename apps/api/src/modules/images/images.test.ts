/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles stand in for the Prisma client */
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { assertSafeSvg, ImagesService, sniff } from './images.service';

const svc = new ImagesService(
  {} as never,
  { WEB_URL: 'https://app.test', API_URL: 'https://api.test/' } as never,
);
const png = (w: number, h: number, alpha = 1) =>
  sharp({
    create: { width: w, height: h, channels: 4, background: { r: 91, g: 92, b: 226, alpha } },
  })
    .png()
    .toBuffer();
const file = (buffer: Buffer, mimetype: string) => ({ buffer, mimetype, size: buffer.length });
const meta = (b: Buffer) => sharp(b).metadata();

describe('picture processing', () => {
  it('makes a custom avatar a square WebP, cropping to fill, whatever it was uploaded as', async () => {
    const out = await svc.process('USER_AVATAR', file(await png(1200, 600), 'image/png'));
    const m = await meta(out.bytes);
    expect(m.format).toBe('webp');
    expect([m.width, m.height]).toEqual([512, 512]);
    const jpg = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#fff' },
    })
      .jpeg()
      .toBuffer();
    expect(
      (await meta((await svc.process('USER_AVATAR', file(jpg, 'image/jpeg'))).bytes)).format,
    ).toBe('webp');
  });
  it('keeps a logo’s shape and transparency, and never enlarges it', async () => {
    const out = await svc.process('WORKSPACE_LOGO', file(await png(400, 100, 0.5), 'image/png'));
    const m = await meta(out.bytes);
    expect([m.width, m.height]).toEqual([400, 100]);
    expect(m.hasAlpha).toBe(true);
    const big = await svc.process('WORKSPACE_LOGO', file(await png(3000, 1000), 'image/png'));
    expect((await meta(big.bytes)).width).toBeLessThanOrEqual(1024);
  });
  it('refuses files that are too big, not images, or the wrong kind for the place', async () => {
    const small = await png(10, 10);
    await expect(
      svc.process('USER_AVATAR', { buffer: small, mimetype: 'image/png', size: 3 * 1024 * 1024 }),
    ).rejects.toThrow(/2 MB/);
    await expect(
      svc.process('USER_AVATAR', file(Buffer.from('not an image at all'), 'image/png')),
    ).rejects.toThrow(/PNG, JPG or WebP/);
    await expect(svc.process('USER_AVATAR', undefined)).rejects.toThrow(/Choose an image/);
    // a script renamed .png is still a script: the content decides, not the declared type
    await expect(
      svc.process('WORKSPACE_LOGO', file(Buffer.from('<script>alert(1)</script>'), 'image/png')),
    ).rejects.toBeInstanceOf(BadRequestException);
    // an avatar cannot be an SVG
    await expect(
      svc.process(
        'USER_AVATAR',
        file(
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
          'image/svg+xml',
        ),
      ),
    ).rejects.toThrow(/PNG, JPG or WebP/);
  });
  it('turns a plain SVG logo into pixels and refuses an unsafe one', async () => {
    const ok = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60"><rect width="200" height="60" rx="8" fill="#5B5CE2"/><circle cx="30" cy="30" r="14" fill="#fff"/></svg>',
    );
    const out = await svc.process('WORKSPACE_LOGO', file(ok, 'image/svg+xml'));
    const m = await meta(out.bytes);
    expect(m.format).toBe('webp'); // no SVG is ever stored or served
    expect(m.width).toBeGreaterThan(0);
    for (const bad of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="http://evil/x.svg#a"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(http://evil)</style></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(http://evil/x)"/></svg>',
    ])
      await expect(
        svc.process('WORKSPACE_LOGO', file(Buffer.from(bad), 'image/svg+xml')),
      ).rejects.toThrow(/not allowed/);
    expect(() => assertSafeSvg('<svg><rect fill="url(#grad)"/></svg>')).not.toThrow(); // an in-file gradient is fine
  });
  it('recognises formats by their first bytes', async () => {
    expect(sniff(await png(2, 2))).toBe('png');
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('jpeg');
    expect(
      sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])),
    ).toBe('webp');
    expect(sniff(Buffer.from('<?xml version="1.0"?><svg xmlns="x"/>'))).toBe('svg');
    expect(sniff(Buffer.from('GIF89a'))).toBeNull();
  });
  it('addresses a picture by an unguessable id on the API origin', () => {
    expect(svc.url('abc')).toBe('https://api.test/api/v1/images/abc');
  });
});

describe('storing pictures', () => {
  it('replaces and deletes the previous picture of the same owner and kind, in one step', async () => {
    const rows: Record<string, any>[] = [];
    let n = 0;
    const prisma = {
      client: {
        $transaction: async (fn: any) => fn(prisma.client),
        storedImage: {
          deleteMany: async ({ where }: any) => {
            for (let i = rows.length - 1; i >= 0; i--)
              if (rows[i]!.kind === where.kind && rows[i]!.ownerId === where.ownerId)
                rows.splice(i, 1);
          },
          create: async ({ data }: any) => (rows.push({ id: `id-${++n}`, ...data }), rows.at(-1)),
        },
      },
    };
    const s = new ImagesService(prisma as never, { WEB_URL: 'https://app.test' } as never);
    const img = { bytes: Buffer.from('x'), width: 1, height: 1 };
    const a = await s.save('USER_AVATAR', 'u1', img, 'u1');
    const b = await s.save('USER_AVATAR', 'u1', img, 'u1');
    await s.save('WORKSPACE_LOGO', 'u1', img, 'u1'); // same owner id, different kind: kept apart
    expect(rows.filter((r) => r.kind === 'USER_AVATAR')).toHaveLength(1);
    expect(a.id).not.toBe(b.id); // a new address each time, so caches never show an old picture
    expect(rows.map((r) => r.kind).sort()).toEqual(['USER_AVATAR', 'WORKSPACE_LOGO']);
  });
});
