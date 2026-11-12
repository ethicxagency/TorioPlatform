import 'dotenv/config';
import { createPrismaClient } from '@torio/database';
import { enrichBrain, seedBrain, seedInbox, seedLeads, seedOrders } from './seed-data';

/**
 * Fills ONE existing store with clearly-labelled sample data so every page has something to show: conversations, leads and
 * customers, orders, a filled-in Brain, and a complimentary demo subscription with a few demo invoices.
 *
 *   pnpm db:seed:demo [store-slug]        (default: torio-qa)
 *
 * Local development only: it refuses to run with NODE_ENV=production or against a database that is not on this machine.
 * Each part is skipped when the store already has that kind of data, so running it twice changes nothing.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to add demo data in production');
  const host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host))
    throw new Error(`Refusing to add demo data: the database is not local (${host}).`);

  const slug = process.argv[2] ?? 'torio-qa';
  const prisma = createPrismaClient(url);
  const ws = await prisma.workspace.findUnique({ where: { slug } });
  if (!ws) throw new Error(`No store with the slug "${slug}". Pass an existing store slug.`);

  await seedInbox(prisma, ws.id);
  await seedLeads(prisma, ws.id);
  await seedBrain(prisma, ws.id);
  await seedOrders(prisma, ws.id);
  await enrichBrain(prisma, ws.id);

  // Billing: only if the store has no subscription. A complimentary plan, so nothing here looks like a real payment.
  if ((await prisma.subscription.count({ where: { workspaceId: ws.id } })) === 0) {
    const day = 86_400_000;
    const now = Date.now();
    await prisma.workspace.update({
      where: { id: ws.id },
      data: {
        contactEmail: ws.contactEmail ?? 'billing@demo.test',
        country: ws.country ?? 'BD',
        defaultCurrency: ws.defaultCurrency ?? 'BDT',
      },
    });
    await prisma.billingAccount.upsert({
      where: { workspaceId: ws.id },
      update: {},
      create: { workspaceId: ws.id, companyName: `${ws.name} (demo)`, billingEmail: 'billing@demo.test', country: 'BD', city: 'Dhaka' },
    });
    await prisma.subscription.create({
      data: {
        workspaceId: ws.id,
        planKey: 'growth',
        interval: 'MONTH',
        status: 'ACTIVE',
        source: 'MANUAL',
        grantReason: 'Demo data',
        providerSubscriptionId: `demo-${ws.id}`,
        priceMinor: 450_000,
        currency: 'BDT',
        startedAt: new Date(now - 75 * day),
        currentPeriodStart: new Date(now - 15 * day),
        currentPeriodEnd: new Date(now + 15 * day),
        lastEventAt: new Date(),
      },
    });
    const invoices = [
      { n: 1, ago: 75, status: 'PAID' as const },
      { n: 2, ago: 45, status: 'PAID' as const },
      { n: 3, ago: 15, status: 'PAID' as const },
      { n: 4, ago: 1, status: 'PENDING' as const },
    ];
    for (const i of invoices) {
      await prisma.invoice.create({
        data: {
          workspaceId: ws.id,
          providerInvoiceId: `demo-inv-${ws.id}-${i.n}`,
          number: `DEMO-${String(i.n).padStart(4, '0')}`,
          status: i.status,
          currency: 'BDT',
          subtotalMinor: 450_000,
          taxMinor: 0,
          totalMinor: 450_000,
          amountPaidMinor: i.status === 'PAID' ? 450_000 : 0,
          periodStart: new Date(now - (i.ago + 30) * day),
          periodEnd: new Date(now - i.ago * day),
          planKey: 'growth',
          customerSnapshot: { companyName: `${ws.name} (demo)`, billingEmail: 'billing@demo.test', country: 'BD', city: 'Dhaka' },
          paymentSummary: i.status === 'PAID' ? 'Demo payment' : null,
          issuedAt: new Date(now - i.ago * day),
          lastEventAt: new Date(),
          lines: { create: [{ position: 0, description: 'Growth plan (demo)', quantity: 1, amountMinor: 450_000 }] },
        },
      });
    }
  }

  console.log(`Demo data added to "${ws.name}" (${ws.slug}). Anything it already had was left as it was.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
