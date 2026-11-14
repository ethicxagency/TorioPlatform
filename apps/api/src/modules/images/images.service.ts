import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AVATAR_TYPES, IMAGE_MAX_BYTES, LOGO_TYPES } from '@torio/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';

export type ImageKind = 'USER_AVATAR' | 'WORKSPACE_LOGO';
export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}
export interface ProcessedImage {
  bytes: Buffer;
  width: number;
  height: number;
}

const AVATAR_SIZE = 512;
const LOGO_MAX = { width: 1024, height: 512 };

/** What the file really is, from its first bytes, never from the name or the declared type. */
export function sniff(buf: Buffer): 'png' | 'jpeg' | 'webp' | 'svg' | null {
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString() === 'RIFF' &&
    buf.subarray(8, 12).toString() === 'WEBP'
  )
    return 'webp';
  const head = buf.subarray(0, 512).toString('utf8').trimStart();
  if (/^(?:<\?xml|<!--|<!DOCTYPE|<svg)/i.test(head) && /<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

/**
 * An SVG is accepted only when it is plain shapes: scripts, event handlers, embedded or linked resources, external references,
 * styles that import things and entity tricks all refuse the file. What passes is then drawn to pixels, so no SVG is ever stored
 * or served.
 */
export function assertSafeSvg(text: string) {
  const bad =
    /<\s*(script|foreignObject|iframe|object|embed|image|use|audio|video|link|style|animate|set)\b|\son[a-z]+\s*=|<!ENTITY|<!DOCTYPE[^>]*\[|(?:xlink:)?href\s*=\s*["'](?!#)|javascript:|data:|url\s*\(\s*["']?(?!#)/i;
  if (bad.test(text))
    throw new BadRequestException(
      'That SVG contains elements that are not allowed. Export it as plain shapes, or use a PNG.',
    );
}

/** Turns an upload into a plain WebP of a sensible size, or refuses it. */
@Injectable()
export class ImagesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async process(kind: ImageKind, file: UploadedFile | undefined): Promise<ProcessedImage> {
    if (!file?.buffer?.length) throw new BadRequestException('Choose an image to upload.');
    if (file.size > IMAGE_MAX_BYTES)
      throw new BadRequestException('That image is larger than 2 MB.');
    const allowed: readonly string[] = kind === 'USER_AVATAR' ? AVATAR_TYPES : LOGO_TYPES;
    const type = sniff(file.buffer);
    const typeMime = type === 'svg' ? 'image/svg+xml' : type ? `image/${type}` : null;
    if (!typeMime || !allowed.includes(typeMime))
      throw new BadRequestException(
        kind === 'USER_AVATAR'
          ? 'Use a PNG, JPG or WebP image.'
          : 'Use a PNG, JPG, WebP or SVG image.',
      );
    if (type === 'svg') assertSafeSvg(file.buffer.toString('utf8'));
    // sharp is loaded here, not at start-up, so a missing native build can only affect uploads, never the whole API.
    const sharp = (await import('sharp')).default;
    try {
      let img = sharp(file.buffer, {
        limitInputPixels: 16_000_000,
        failOn: 'error',
        density: type === 'svg' ? 300 : undefined,
      }).rotate();
      img =
        kind === 'USER_AVATAR'
          ? img.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
          : img.resize(LOGO_MAX.width, LOGO_MAX.height, {
              fit: 'inside',
              withoutEnlargement: true,
            });
      const { data, info } = await img
        .webp({ quality: 88, alphaQuality: 100 })
        .toBuffer({ resolveWithObject: true });
      return { bytes: data, width: info.width, height: info.height };
    } catch {
      throw new BadRequestException('That file could not be read as an image.');
    }
  }

  /** The public address of a stored picture. The id is unguessable and changes on every upload, so it can be cached for good. */
  url(id: string) {
    return `${(this.config.API_URL ?? this.config.WEB_URL).replace(/\/$/, '')}/api/v1/images/${id}`;
  }

  /** Stores a picture for an owner, replacing (and deleting) the one it had. */
  async save(kind: ImageKind, ownerId: string, img: ProcessedImage, uploadedBy: string) {
    const db = this.prisma.client;
    const row = await db.$transaction(async (tx) => {
      await tx.storedImage.deleteMany({ where: { kind, ownerId } });
      return tx.storedImage.create({
        data: {
          kind,
          ownerId,
          contentType: 'image/webp',
          bytes: new Uint8Array(img.bytes),
          width: img.width,
          height: img.height,
          sizeBytes: img.bytes.length,
          uploadedBy,
        },
      });
    });
    return { id: row.id, url: this.url(row.id) };
  }

  async remove(kind: ImageKind, ownerId: string) {
    await this.prisma.client.storedImage.deleteMany({ where: { kind, ownerId } });
  }

  async get(id: string) {
    const row = await this.prisma.client.storedImage.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Image not found');
    return row;
  }

  /** Bytes of a workspace's stored logo, for documents. Null when it has none. */
  async logoOf(workspaceId: string) {
    return this.prisma.client.storedImage.findUnique({
      where: { kind_ownerId: { kind: 'WORKSPACE_LOGO', ownerId: workspaceId } },
    });
  }
}
