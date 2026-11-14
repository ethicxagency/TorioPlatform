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
  it('trims transparent padding around a logo without touching its artwork or its shape', async () => {
    // 600x300 transparent canvas with a 200x80 solid block in the middle
    const block = await sharp({
      create: {
        width: 200,
        height: 80,
        channels: 4,
        background: { r: 200, g: 30, b: 30, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const padded = await sharp({
      create: { width: 600, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: block, left: 200, top: 110 }])
      .png()
      .toBuffer();
    const out = await svc.process('WORKSPACE_LOGO', file(padded, 'image/png'));
    expect([out.width, out.height]).toEqual([200, 80]);
    const { data, info } = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true });
    const last = (info.width * info.height - 1) * info.channels;
    expect([data[0], data[last]]).toEqual([200, 200]); // artwork at both corners: no margin left
    expect(out.width / out.height).toBeCloseTo(2.5, 1);
  });
  it('keeps a logo that has no margin to trim exactly as it is, and a flat image whole', async () => {
    const solid = await svc.process('WORKSPACE_LOGO', file(await png(300, 120), 'image/png'));
    expect([solid.width, solid.height]).toEqual([300, 120]);
    const clear = await svc.process('WORKSPACE_LOGO', file(await png(64, 64, 0), 'image/png'));
    expect([clear.width, clear.height]).toEqual([64, 64]);
  });
  it('processes the dark-background logo exactly like the main logo, and refuses unsafe files for it', async () => {
    const out = await svc.process('WORKSPACE_LOGO_LIGHT', file(await png(400, 100), 'image/png'));
    expect([out.width, out.height]).toEqual([400, 100]);
    await expect(
      svc.process('WORKSPACE_LOGO_LIGHT', file(Buffer.from('<script>x</script>'), 'image/png')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('serves standard smaller widths, never enlarges, and ignores other widths', async () => {
    const big = await sharp({
      create: { width: 1000, height: 250, channels: 4, background: '#5B5CE2' },
    })
      .webp()
      .toBuffer();
    const row = { id: 'x1', bytes: new Uint8Array(big), width: 1000 };
    expect((await meta(await svc.sized(row, 360))).width).toBe(360);
    expect((await meta(await svc.sized(row, 360))).height).toBe(90);
    expect((await meta(await svc.sized(row, 123))).width).toBe(1000);
    expect((await meta(await svc.sized(row, undefined))).width).toBe(1000);
    expect((await meta(await svc.sized({ ...row, id: 'x2', width: 200 }, 360))).width).toBe(1000);
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
