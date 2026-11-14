import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  CHANNEL_LABEL,
  type BrainConfig,
  type OutboundFeed,
  type OutboundFeedPreview,
  type SalesChannels,
} from '@torio/contracts';
import type { Prisma } from '@torio/database';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { BrainService } from '../brain/brain.service';
import { parsePrice } from '../brain/imports/xml';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { safeHttpUrl } from './catalog-map';
import { statusOf } from './catalog.service';

type Stored = BrainConfig['products'][number];
type Channel = 'GOOGLE' | 'META' | 'TIKTOK' | 'CUSTOM';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/** XML text with the characters XML forbids removed and the five special ones escaped. */
export const xmlText = (v: string) =>
  v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const el = (tag: string, v: string | undefined | null) =>
  v ? `      <${tag}>${xmlText(v)}</${tag}>\n` : '';

const money = (text: string | undefined, fallback: string) => {
  const p = parsePrice(text ?? '');
  const cur = p.currency || fallback;
  return p.amount && cur ? `${Number(p.amount).toFixed(2)} ${cur}` : '';
};

export interface FeedProduct {
  product: Stored;
  /** Why it is left out of the feed, when it is. */
  excluded: string[];
}

/** Which products a feed carries, and which are left out and why. Drafts and archived products are never published. */
export function selectForFeed(
  products: Stored[],
  opts: { inStockOnly: boolean; fallbackCurrency: string },
): FeedProduct[] {
  return products
    .filter((p) => statusOf(p) === 'ACTIVE')
    .map((p) => {
      const excluded: string[] = [];
      if (!p.name.trim()) excluded.push('no title');
      if (!money(p.price, opts.fallbackCurrency)) excluded.push('no price or currency');
      if (!safeHttpUrl(p.url ?? '')) excluded.push('no product page link');
      if (!(p.images ?? []).some((i) => safeHttpUrl(i))) excluded.push('no image');
      if (opts.inStockOnly && p.stock === 'Out of stock') excluded.push('out of stock');
      return { product: p, excluded };
    });
}

const AVAILABILITY: Record<string, { g: string; meta: string }> = {
  'In stock': { g: 'in_stock', meta: 'in stock' },
  'Low stock': { g: 'in_stock', meta: 'in stock' },
  'Out of stock': { g: 'out_of_stock', meta: 'out of stock' },
  'Pre-order': { g: 'preorder', meta: 'preorder' },
};

/** Builds the feed XML for one channel from the products that qualify. Pure, so it is tested without a database. */
export function buildFeedXml(
  channel: Channel,
  products: Stored[],
  ctx: { storeName: string; storeUrl: string; fallbackCurrency: string },
): string {
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n';
  if (channel === 'CUSTOM') {
    const items = products
      .map((p) => {
        const imgs = (p.images ?? []).map(safeHttpUrl).filter(Boolean);
        return (
          `  <product>\n` +
          el('id', p.externalId || p.id) +
          el('sku', p.sku) +
          el('title', p.name) +
          el('description', p.description) +
          el('link', safeHttpUrl(p.url ?? '')) +
          el('price', money(p.price, ctx.fallbackCurrency)) +
          el('compare_at_price', money(p.compareAtPrice, ctx.fallbackCurrency)) +
          el('availability', p.stock) +
          el('brand', p.brand) +
          el('category', p.category) +
          el('gtin', p.gtin) +
          el('mpn', p.mpn) +
          el('image', imgs[0]) +
          imgs
            .slice(1)
            .map((i) => el('additional_image', i))
            .join('') +
          `  </product>\n`
        ).replace(/^ {6}/gm, '    ');
      })
      .join('');
    return `${head}<products>\n${items}</products>\n`;
  }
  const meta = channel === 'META';
  const items = products
    .map((p) => {
      const imgs = (p.images ?? []).map(safeHttpUrl).filter(Boolean);
      const sale = money(p.price, ctx.fallbackCurrency);
      const regular = money(p.compareAtPrice, ctx.fallbackCurrency);
      const onSale = regular && Number(regular.split(' ')[0]) > Number(sale.split(' ')[0]);
      const av = AVAILABILITY[p.stock] ?? AVAILABILITY['In stock']!;
      return (
        `    <item>\n` +
        el('g:id', p.externalId || p.sku || p.id) +
        el('g:title', p.name.slice(0, 150)) +
        el('g:description', p.description || p.name) +
        el('g:link', safeHttpUrl(p.url ?? '')) +
        el('g:image_link', imgs[0]) +
        imgs
          .slice(1, 11)
          .map((i) => el('g:additional_image_link', i))
          .join('') +
        el('g:availability', meta ? av.meta : av.g) +
        el('g:condition', 'new') +
        el('g:price', onSale ? regular : sale) +
        (onSale ? el('g:sale_price', sale) : '') +
        el('g:brand', p.brand) +
        el('g:gtin', p.gtin) +
        el('g:mpn', p.mpn) +
        el('g:product_type', p.category) +
        el('g:color', (p.colors ?? '').split(',')[0]?.trim()) +
        `    </item>\n`
      ).replace(/^ {6}/gm, '      ');
    })
    .join('');
  return (
    `${head}<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n` +
    `    <title>${xmlText(ctx.storeName)}</title>\n    <link>${xmlText(ctx.storeUrl)}</link>\n` +
    `    <description>${xmlText(`${ctx.storeName} product feed`)}</description>\n${items}  </channel>\n</rss>\n`
  );
}

/**
 * Feeds Torio publishes for sales channels. The address carries a random 256-bit token; only a hash of it identifies the
 * feed, and it can be rotated (the old address stops working at once), paused or deleted. Torio publishes the file; it
 * cannot see whether Google, Meta or TikTok has fetched or accepted it, so nothing here claims a connection.
 */
@Injectable()
export class CatalogFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
    private readonly crypto: ChannelCryptoService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  private base() {
    return (this.cfg.API_URL ?? this.cfg.WEB_URL).replace(/\/$/, '');
  }
  private addressOf(token: string) {
    return `${this.base()}/api/v1/catalog-feed/${token}.xml`;
  }

  private async context(workspaceId: string) {
    const ws = await this.prisma.client.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, defaultCurrency: true },
    });
    const doc = await this.brain.get(workspaceId);
    return {
      products: doc.config.products,
      storeName: doc.config.identity.name || ws?.name || 'Store',
      storeUrl: safeHttpUrl(doc.config.identity.website) || this.cfg.WEB_URL,
      fallbackCurrency: (ws?.defaultCurrency ?? '').toUpperCase(),
    };
  }

  private view(
    f: {
      id: string;
      name: string;
      channel: Channel;
      status: 'ACTIVE' | 'PAUSED';
      inStockOnly: boolean;
      tokenCipher: string;
      lastServedAt: Date | null;
      servedCount: number;
      createdAt: Date;
    },
    included: number,
  ): OutboundFeed {
    let url = '';
    try {
      url = this.addressOf(this.crypto.decrypt(f.tokenCipher));
    } catch {
      url = ''; // the encryption key changed; the feed must be rotated to get a new address
    }
    return {
      id: f.id,
      name: f.name,
      channel: f.channel,
      status: f.status,
      inStockOnly: f.inStockOnly,
      url,
      productCount: included,
      lastServedAt: f.lastServedAt?.toISOString() ?? null,
      servedCount: f.servedCount,
      createdAt: f.createdAt.toISOString(),
    };
  }

  async channels(workspaceId: string): Promise<SalesChannels> {
    const [rows, ctx, sources] = await Promise.all([
      this.prisma.client.catalogFeed.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.context(workspaceId),
      this.prisma.client.importSource.findMany({
        where: { workspaceId, kind: { in: ['META_CATALOG', 'GOOGLE_MERCHANT'] } },
      }),
    ]);
    const feeds = rows.map((f) => {
      const sel = selectForFeed(ctx.products, {
        inStockOnly: f.inStockOnly,
        fallbackCurrency: ctx.fallbackCurrency,
      });
      return this.view(f, sel.filter((s) => !s.excluded.length).length);
    });
    const conn = (kind: 'META_CATALOG' | 'GOOGLE_MERCHANT', label: string) => {
      const s = sources.find((x) => x.kind === kind && x.status !== 'DISCONNECTED');
      return {
        kind,
        label,
        connected: !!s && s.status !== 'ERROR',
        name: s?.name ?? null,
        lastSyncedAt: s?.lastSyncedAt?.toISOString() ?? null,
        lastError: s?.lastError ?? null,
      };
    };
    return {
      feeds,
      connections: [
        conn('META_CATALOG', 'Meta Commerce Catalog'),
        conn('GOOGLE_MERCHANT', 'Google Merchant Center'),
      ],
    };
  }

  async create(
    workspaceId: string,
    userId: string,
    b: { name: string; channel: Channel; inStockOnly: boolean },
  ) {
    if (!this.crypto.configured)
      throw new ServiceUnavailableException(
        'Product feeds need the server encryption key to be configured.',
      );
    const token = randomBytes(32).toString('base64url');
    const f = await this.prisma.client.catalogFeed.create({
      data: {
        workspaceId,
        name: b.name,
        channel: b.channel,
        inStockOnly: b.inStockOnly,
        tokenHash: hash(token),
        tokenCipher: this.crypto.encrypt(token),
        createdById: userId,
      },
    });
    await this.audit(
      workspaceId,
      userId,
      f.id,
      `Created the ${CHANNEL_LABEL[b.channel]} feed ${b.name}`,
    );
    return (await this.channels(workspaceId)).feeds.find((x) => x.id === f.id)!;
  }

  private async mine(workspaceId: string, id: string) {
    const f = await this.prisma.client.catalogFeed.findFirst({ where: { id, workspaceId } });
    if (!f) throw new NotFoundException('Feed not found.');
    return f;
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    b: { name?: string; status?: 'ACTIVE' | 'PAUSED'; inStockOnly?: boolean },
  ) {
    await this.mine(workspaceId, id);
    await this.prisma.client.catalogFeed.update({ where: { id }, data: b });
    await this.audit(
      workspaceId,
      userId,
      id,
      b.status
        ? `${b.status === 'PAUSED' ? 'Paused' : 'Resumed'} a product feed`
        : 'Edited a product feed',
    );
    return (await this.channels(workspaceId)).feeds.find((x) => x.id === id)!;
  }

  /** A new secret address. The old one stops working immediately. */
  async rotate(workspaceId: string, userId: string, id: string) {
    await this.mine(workspaceId, id);
    if (!this.crypto.configured)
      throw new ServiceUnavailableException(
        'Product feeds need the server encryption key to be configured.',
      );
    const token = randomBytes(32).toString('base64url');
    await this.prisma.client.catalogFeed.update({
      where: { id },
      data: { tokenHash: hash(token), tokenCipher: this.crypto.encrypt(token) },
    });
    await this.audit(workspaceId, userId, id, 'Rotated a product feed address');
    return (await this.channels(workspaceId)).feeds.find((x) => x.id === id)!;
  }

  async remove(workspaceId: string, userId: string, id: string) {
    await this.mine(workspaceId, id);
    await this.prisma.client.catalogFeed.delete({ where: { id } });
    await this.audit(workspaceId, userId, id, 'Deleted a product feed');
    return { ok: true };
  }

  async preview(workspaceId: string, id: string): Promise<OutboundFeedPreview> {
    const f = await this.mine(workspaceId, id);
    const ctx = await this.context(workspaceId);
    const sel = selectForFeed(ctx.products, {
      inStockOnly: f.inStockOnly,
      fallbackCurrency: ctx.fallbackCurrency,
    });
    const included = sel.filter((s) => !s.excluded.length).map((s) => s.product);
    const xml = buildFeedXml(f.channel, included.slice(0, 3), ctx);
    return {
      included: included.length,
      excluded: sel
        .filter((s) => s.excluded.length)
        .slice(0, 50)
        .map((s) => ({ id: s.product.id, name: s.product.name, reasons: s.excluded })),
      excludedCount: sel.filter((s) => s.excluded.length).length,
      notPublished: ctx.products.filter((p) => statusOf(p) !== 'ACTIVE').length,
      sampleXml: xml,
    };
  }

  /** The public file. Unknown and paused tokens answer identically, so a token cannot be probed. */
  async serve(token: string): Promise<string> {
    const clean = token.replace(/\.xml$/i, '');
    if (clean.length < 32 || clean.length > 128) throw new NotFoundException();
    const f = await this.prisma.client.catalogFeed.findUnique({
      where: { tokenHash: hash(clean) },
    });
    if (!f || f.status !== 'ACTIVE') throw new NotFoundException();
    const ctx = await this.context(f.workspaceId);
    const included = selectForFeed(ctx.products, {
      inStockOnly: f.inStockOnly,
      fallbackCurrency: ctx.fallbackCurrency,
    })
      .filter((s) => !s.excluded.length)
      .map((s) => s.product);
    void this.prisma.client.catalogFeed
      .update({
        where: { id: f.id },
        data: { lastServedAt: new Date(), servedCount: { increment: 1 } },
      })
      .catch(() => undefined);
    return buildFeedXml(f.channel, included, ctx);
  }

  private audit(workspaceId: string, userId: string, entityId: string, description: string) {
    return this.prisma.client.auditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'catalog.feed',
        entityType: 'catalog_feed',
        entityId,
        metadata: { description } as Prisma.InputJsonValue,
      },
    });
  }
}
