import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { createPrismaClient } from '@torio/database';

/**
 * Development seed. Creates a demo workspace with one user per role.
 * Passwords are for local development only and are generated per run unless
 * SEED_PASSWORD is provided; they are printed once, never stored in source.
 */
type Db = ReturnType<typeof createPrismaClient>;

/** Clearly-labelled SAMPLE inbox data (customers have isSample=true). Skipped if channels already exist. */
async function seedInbox(prisma: Db, workspaceId: string) {
  if ((await prisma.channel.count({ where: { workspaceId } })) > 0) return;
  const mkChannel = (provider: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER', displayName: string) =>
    prisma.channel.create({
      data: {
        workspaceId,
        provider,
        displayName: `${displayName} (sample)`,
        status: 'CONNECTED',
        isSample: true,
        accountName: `${displayName} sample account`,
        connectedAt: new Date(),
      },
    });
  const [wa, ig, fb] = await Promise.all([
    mkChannel('WHATSAPP', 'WhatsApp'),
    mkChannel('INSTAGRAM', 'Instagram'),
    mkChannel('MESSENGER', 'Messenger'),
  ]);
  const agent = await prisma.user.findUniqueOrThrow({ where: { email: 'agent@urbannest.test' } });
  const mins = (m: number) => new Date(Date.now() - m * 60_000);

  const samples = [
    {
      name: 'Tanvir Hasan',
      phone: '+880 1712-345678',
      email: 'tanvir.hasan@example.test',
      location: 'Dhaka, BD',
      ch: wa,
      tags: ['Hot Lead'],
      lead: 'INTERESTED' as const,
      assignee: agent.id,
      wait: 14,
      unread: 2,
      priority: 'NORMAL' as const,
      msgs: [
        ['INBOUND', 'আসসালামু আলাইকুম, প্রোডাক্টটা এখনো available?', 30],
        ['OUTBOUND', 'ওয়ালাইকুম আসসালাম! হ্যাঁ, Available আছে।', 27],
        ['NOTE', 'Customer prefers Sage — check stock before confirming 2 units.', 25],
        ['INBOUND', 'ভাই এই প্রোডাক্টের দাম কত?', 14],
      ],
    },
    {
      name: 'Ayesha Siddiqua',
      handle: '@ayesha.sid',
      email: 'ayesha.s@example.test',
      location: 'Dhaka, BD',
      ch: ig,
      tags: ['Complaint'],
      lead: 'CONVERTED' as const,
      assignee: null,
      wait: 6,
      unread: 2,
      priority: 'HIGH' as const,
      msgs: [
        ['INBOUND', 'My vase arrived broken 😞', 7],
        ['INBOUND', 'What do I do now?', 6],
      ],
    },
    {
      name: 'Rakib Hossain',
      email: 'rakib.hossain@example.test',
      location: 'Sylhet, BD',
      ch: fb,
      tags: [],
      lead: 'NEW' as const,
      assignee: null,
      wait: 125,
      unread: 2,
      priority: 'NORMAL' as const,
      msgs: [
        ['INBOUND', 'Delivery kobe hobe?', 126],
        ['INBOUND', 'Sylhet e ki delivery dey?', 125],
      ],
    },
    {
      name: 'Shakil Ahmed',
      phone: '+880 1611-980234',
      location: 'Dhaka, BD',
      ch: wa,
      tags: ['Hot Lead', 'COD'],
      lead: 'INTERESTED' as const,
      assignee: agent.id,
      wait: 3,
      unread: 1,
      priority: 'NORMAL' as const,
      msgs: [
        ['INBOUND', '2 pcs লাগবে, cash on delivery হবে?', 60],
        ['OUTBOUND', 'হ্যাঁ, COD available। ঠিকানা দিন।', 58],
        ['INBOUND', 'Dhaka, Mirpur-10', 3],
      ],
    },
    {
      name: 'Sharmin Akter',
      handle: '@sharmin.akter',
      location: 'Chattogram, BD',
      ch: ig,
      tags: ['VIP'],
      lead: 'CONVERTED' as const,
      assignee: agent.id,
      wait: null,
      unread: 0,
      priority: 'NORMAL' as const,
      status: 'RESOLVED' as const,
      msgs: [
        ['INBOUND', 'Thank you so much! Received the order today.', 1300],
        ['OUTBOUND', 'So glad to hear that! Thanks for choosing us.', 1290],
        ['EVENT', 'Farid Ahmed resolved this conversation', 1289],
      ],
    },
  ];

  for (const s of samples) {
    const customer = await prisma.customer.create({
      data: {
        workspaceId,
        name: s.name,
        phone: s.phone,
        email: s.email,
        handle: s.handle,
        location: s.location,
        tags: s.tags,
        leadStatus: s.lead,
        isSample: true,
      },
    });
    const real = s.msgs.filter((m) => m[0] === 'INBOUND' || m[0] === 'OUTBOUND');
    const last = real[real.length - 1]!;
    const conv = await prisma.conversation.create({
      data: {
        workspaceId,
        channelId: s.ch.id,
        customerId: customer.id,
        assigneeId: s.assignee,
        priority: s.priority,
        status: s.status ?? 'OPEN',
        unreadCount: s.unread,
        waitingSince: s.wait == null ? null : mins(s.wait),
        lastMessageAt: mins(Number(last[2])),
        lastMessagePreview: String(last[1]),
      },
    });
    for (const [kind, body, ago] of s.msgs) {
      await prisma.message.create({
        data: {
          workspaceId,
          conversationId: conv.id,
          kind: kind as 'INBOUND' | 'OUTBOUND' | 'NOTE' | 'EVENT',
          body: String(body),
          createdAt: mins(Number(ago)),
          authorId: kind === 'OUTBOUND' || kind === 'NOTE' ? agent.id : null,
          deliveryStatus: kind === 'OUTBOUND' ? 'DELIVERED' : null,
        },
      });
    }
  }

  await prisma.savedReply.createMany({
    data: [
      {
        workspaceId,
        shortcut: '/price',
        title: 'Product price',
        body: 'Nordic Ceramic Vase-এর দাম ৳১,৪৫০। White, Sage আর Sand — কোন রঙটি পছন্দ?',
      },
      {
        workspaceId,
        shortcut: '/delivery',
        title: 'Delivery charges & time',
        body: 'ঢাকার মধ্যে ডেলিভারি চার্জ ৳৬০ (১–২ দিন), ঢাকার বাইরে ৳১২০ (৩–৫ দিন)।',
      },
      {
        workspaceId,
        shortcut: '/cod',
        title: 'Cash on delivery',
        body: 'Ji, Cash on Delivery available. Apnar full address ta diben?',
      },
      {
        workspaceId,
        shortcut: '/thanks',
        title: 'Thank you',
        body: 'Thank you for shopping with UrbanNest, {name}! Let us know if you need anything else.',
      },
    ],
  });
}

/** Clearly labelled SAMPLE leads (tag "sample"). Skipped if the workspace already has leads. */
async function seedLeads(prisma: Db, workspaceId: string) {
  if ((await prisma.lead.count({ where: { workspaceId } })) > 0) return;
  const owners = await prisma.user.findMany({
    where: { memberships: { some: { workspaceId } } },
    select: { id: true },
  });
  const customers = await prisma.customer.findMany({
    where: { workspaceId, isSample: true },
    take: 3,
  });
  const days = (d: number) => new Date(Date.now() - d * 86_400_000);
  const rows = [
    {
      name: 'Nusrat Jahan',
      company: 'Jahan Home Decor',
      jobTitle: 'Founder',
      email: 'nusrat@example.test',
      phone: '+8801898221340',
      source: 'INSTAGRAM',
      stage: 'QUALIFIED',
      dealValue: 45000,
      age: 3,
    },
    {
      name: 'Imran Kabir',
      company: 'Kabir Traders',
      jobTitle: 'Buyer',
      email: 'imran@example.test',
      phone: '+8801711000222',
      source: 'WHATSAPP',
      stage: 'PROPOSAL',
      dealValue: 120000,
      age: 9,
    },
    {
      name: 'Mim Rahman',
      company: null,
      jobTitle: null,
      email: null,
      phone: '+8801622334455',
      source: 'MESSENGER',
      stage: 'NEW',
      dealValue: null,
      age: 1,
    },
    {
      name: 'Farhana Islam',
      company: 'Rajshahi Crafts',
      jobTitle: 'Owner',
      email: 'farhana@example.test',
      phone: null,
      source: 'WEBSITE',
      stage: 'CONTACTED',
      dealValue: 18000,
      age: 12,
    },
    {
      name: 'Sumon Chowdhury',
      company: 'Chowdhury & Sons',
      jobTitle: 'Manager',
      email: 'sumon@example.test',
      phone: '+8801555666777',
      source: 'MANUAL',
      stage: 'WON',
      dealValue: 95000,
      age: 40,
    },
    {
      name: 'Rakib Hossain',
      company: null,
      jobTitle: null,
      email: 'rakib@example.test',
      phone: null,
      source: 'IMPORT',
      stage: 'LOST',
      dealValue: null,
      age: 25,
    },
  ] as const;
  for (const [i, r] of rows.entries()) {
    const score = Math.min(
      100,
      { NEW: 0, CONTACTED: 10, QUALIFIED: 20, PROPOSAL: 30, WON: 35, LOST: 0 }[r.stage] +
        (r.email ? 15 : 0) +
        (r.phone ? 15 : 0) +
        (r.company ? 10 : 0) +
        (r.jobTitle ? 5 : 0) +
        (r.dealValue ? 10 : 0),
    );
    const lead = await prisma.lead.create({
      data: {
        workspaceId,
        name: r.name,
        company: r.company,
        jobTitle: r.jobTitle,
        email: r.email,
        phone: r.phone,
        phoneKey: r.phone ? r.phone.replace(/\D/g, '') : null,
        source: r.source,
        stage: r.stage,
        dealValue: r.dealValue,
        tags: ['sample'],
        score: r.stage === 'LOST' ? Math.min(score, 10) : score,
        ownerId: i % 3 === 2 ? null : owners[i % owners.length]?.id,
        customerId: customers[i]?.id ?? null,
        createdAt: days(r.age),
        lastActivityAt: days(Math.max(0, r.age - 1)),
      },
    });
    await prisma.leadActivity.create({
      data: {
        workspaceId,
        leadId: lead.id,
        type: 'CREATED',
        body: 'Sample lead created by the development seed',
        createdAt: days(r.age),
      },
    });
  }
}

/** Clearly labelled SAMPLE orders (isSample). Skipped if the workspace already has orders. Payments are manual records. */
async function seedOrders(prisma: Db, workspaceId: string) {
  if ((await prisma.order.count({ where: { workspaceId } })) > 0) return;
  const customers = await prisma.customer.findMany({
    where: { workspaceId, isSample: true },
    orderBy: { createdAt: 'asc' },
    take: 4,
  });
  if (customers.length === 0) return;
  const days = (d: number) => new Date(Date.now() - d * 86_400_000);
  const plans = [
    {
      age: 20,
      items: [
        ['Linen sofa (sample)', 1, 42_000],
        ['Cushion set (sample)', 2, 3_500],
      ],
      paid: 49_000,
      status: 'COMPLETED',
      ful: 'FULFILLED',
    },
    {
      age: 12,
      items: [['Oak side table (sample)', 2, 9_500]],
      paid: 9_500,
      status: 'PROCESSING',
      ful: 'PROCESSING',
    },
    {
      age: 8,
      items: [['Ceramic vase (sample)', 3, 2_400]],
      paid: 0,
      status: 'CONFIRMED',
      ful: 'UNFULFILLED',
    },
    {
      age: 5,
      items: [['Floor lamp (sample)', 1, 11_000]],
      paid: 0,
      status: 'PENDING',
      ful: 'UNFULFILLED',
    },
    {
      age: 3,
      items: [['Wall mirror (sample)', 1, 15_000]],
      paid: 0,
      status: 'CANCELLED',
      ful: 'UNFULFILLED',
    },
    {
      age: 1,
      items: [['Bookshelf (sample)', 1, 28_000]],
      paid: 10_000,
      status: 'CONFIRMED',
      ful: 'UNFULFILLED',
    },
  ] as const;
  let seq = 0;
  for (const [i, p] of plans.entries()) {
    seq++;
    const lines = p.items.map(([name, quantity, unitPriceMinor], position) => ({
      workspaceId,
      position,
      name,
      quantity,
      unitPriceMinor,
      lineTotalMinor: quantity * unitPriceMinor,
    }));
    const subtotal = lines.reduce((a, l) => a + l.lineTotalMinor, 0);
    const shipping = 1_000;
    const total = subtotal + shipping;
    const at = days(p.age);
    const order = await prisma.order.create({
      data: {
        workspaceId,
        number: 1000 + seq,
        customerId: customers[i % customers.length]!.id,
        // New demo data is in the platform default currency; existing rows are never rewritten.
        currency: 'BDT',
        subtotalMinor: subtotal,
        shippingMinor: shipping,
        totalMinor: total,
        paidMinor: p.paid,
        status: p.status,
        paymentStatus: p.paid <= 0 ? 'UNPAID' : p.paid >= total ? 'PAID' : 'PARTIALLY_PAID',
        fulfillmentStatus: p.ful,
        isSample: true,
        createdAt: at,
        completedAt: p.status === 'COMPLETED' ? at : null,
        cancelledAt: p.status === 'CANCELLED' ? at : null,
        items: { create: lines },
      },
    });
    await prisma.orderEvent.create({
      data: {
        workspaceId,
        orderId: order.id,
        type: 'created',
        description: 'Sample order created by the development seed',
        createdAt: at,
      },
    });
    if (p.paid > 0)
      await prisma.orderPayment.create({
        data: {
          workspaceId,
          orderId: order.id,
          amountMinor: p.paid,
          method: 'BANK_TRANSFER',
          paidAt: at,
        },
      });
  }
  await prisma.workspace.update({ where: { id: workspaceId }, data: { orderSeq: seq } });
}

/** Sample Brain (clearly named "sample"). Skipped if the workspace already has one. Mirrors the shared config schema. */
async function seedBrain(prisma: Db, workspaceId: string) {
  if (await prisma.brainConfig.findUnique({ where: { workspaceId } })) return;
  const data = {
    identity: {
      name: 'UrbanNest (sample)',
      category: 'Home & Lifestyle',
      website: 'urbannest.example',
      country: 'Bangladesh',
      market: 'Dhaka & major cities',
      languages: ['Bengali', 'English'],
      currency: 'BDT (৳)',
      description: 'Sample data: modern home essentials for compact city apartments.',
      audience: 'Urban homeowners and renters aged 22–40',
      positioning: 'Affordable, modern home essentials',
      usp: 'Designer-look pieces at everyday prices.',
    },
    products: [
      {
        id: 'p1',
        name: 'Nordic Ceramic Vase',
        category: 'Décor',
        description: 'Matte ceramic vase, hand-finished.',
        price: '1450',
        variants: 'Small, Large',
        sizes: '18 cm, 24 cm',
        colors: 'White, Sage, Sand',
        stock: 'In stock',
        benefits: 'Works with fresh or dried flowers.',
        usage: 'Wipe with a damp cloth.',
        limitations: 'Indoor use only.',
        faqs: '',
      },
    ],
    shipping: {
      providers: ['Pathao', 'Steadfast'],
      coverage: 'Nationwide',
      feeInside: '60',
      feeOutside: '120',
      timeInside: '1–2 days',
      timeOutside: '3–5 days',
      cod: true,
      payments: ['bKash', 'Nagad'],
      freeShip: true,
      threshold: '3000',
      processing: '1 business day',
      tracking: 'We send a tracking link by SMS once your parcel is handed to the courier.',
    },
    returns: {
      eligibility: 'Unused items in original packaging can be returned.',
      window: '7 days',
      exchange: 'Exchanges are possible within 7 days.',
      refundTime: '5–7 business days',
      damaged: 'Send a photo within 48 hours of delivery and we will replace it free of charge.',
      wrong: 'We will collect the wrong item and send the correct one.',
      shippingResp: 'Customer pays, except damaged or wrong items',
      proof: 'Order number and an unboxing photo.',
      escalation: 'Hand off to the support lead for disputes.',
    },
    voice: {
      tone: 'Friendly',
      language: 'Mixed',
      formality: 3,
      length: 'Balanced',
      emoji: 'Minimal',
      greeting: '',
      terms: 'Address customers as “apni”.',
      avoid: 'cheap, guaranteed',
      examples: '',
    },
    rules: {
      always: 'Confirm the product name before sharing a price.',
      never: 'Never promise exact delivery dates.',
      approvalTopics: ['Discounts', 'Refunds'],
      escalate: 'Escalate complaints to a team member.',
      discount: 'None',
      alternatives: true,
      competitors: false,
      promises: false,
      angry: 'Apologise, acknowledge, then hand off',
      fallback: 'human',
      sensitive: { refund: true, payment: true, complaint: true, delivery: true },
    },
    cfCats: [],
    customFields: [
      {
        id: 'cf1',
        name: 'COD Available',
        key: 'cod_available',
        desc: 'Whether customers can pay cash on delivery.',
        type: 'Boolean',
        value: true,
        options: '',
        category: 'Payments',
        required: true,
        scope: 'AI replies & Inbox suggestions',
        min: '',
        max: '',
        maxLen: '',
        def: '',
        unit: '',
        enabled: true,
      },
    ],
    instructions: [
      {
        id: 'in1',
        title: 'Verify delivery location before quoting a fee',
        content:
          'If the customer has not provided a location, ask whether the address is inside or outside Dhaka.',
        category: 'Shipping',
        priority: 'High',
        enabled: true,
        conditions: 'Customer asks about delivery charges',
        example: 'Delivery charge koto?',
        expected: 'Asks inside or outside Dhaka.',
      },
    ],
    logic: [
      {
        id: 'r1',
        name: 'Ask for location before quoting delivery fee',
        enabled: true,
        priority: 'High',
        join: 'and',
        items: [
          { id: 'c1', s: 'intent', op: 'is', val: 'Asks about delivery charges' },
          { id: 'c2', s: 'location', op: 'is', val: 'unknown' },
        ],
        actions: [
          {
            id: 'a1',
            type: 'Ask the customer',
            text: 'Is your delivery address inside or outside Dhaka?',
          },
        ],
        test: 'Delivery charge koto?',
      },
    ],
    faqs: [
      {
        id: 'f1',
        q: 'How much is the delivery charge?',
        a: '৳60 inside Dhaka and ৳120 outside.',
        cat: 'Delivery',
        active: true,
      },
      {
        id: 'f2',
        q: 'Do you offer cash on delivery?',
        a: 'Yes, nationwide.',
        cat: 'Payments',
        active: true,
      },
    ],
  };
  await prisma.brainConfig.create({ data: { workspaceId, data, version: 1 } });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = createPrismaClient(url);

  const password = process.env.SEED_PASSWORD ?? `Dev-${Math.random().toString(36).slice(2, 12)}A1`;
  const passwordHash = await hash(password, { algorithm: 2 });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'urbannest-demo' },
    update: {},
    create: { name: 'UrbanNest (demo)', slug: 'urbannest-demo', defaultCurrency: 'BDT' },
  });

  const people = [
    { email: 'owner@urbannest.test', name: 'Rahim Haque', role: 'OWNER' as const },
    { email: 'admin@urbannest.test', name: 'Nadia Islam', role: 'ADMIN' as const },
    { email: 'agent@urbannest.test', name: 'Farid Ahmed', role: 'AGENT' as const },
  ];

  for (const p of people) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: { email: p.email, name: p.name, passwordHash, emailVerifiedAt: new Date() },
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: { role: p.role },
      create: { workspaceId: workspace.id, userId: user.id, role: p.role },
    });
  }

  await seedInbox(prisma, workspace.id);
  await seedLeads(prisma, workspace.id);
  await seedBrain(prisma, workspace.id);
  await seedOrders(prisma, workspace.id);

  // A local-only Super Admin so /admin can be tried. Real deployments create theirs with `pnpm admin:create`.
  if ((await prisma.platformAdmin.count()) === 0) {
    const adminPassword =
      process.env.ADMIN_PASSWORD ?? `Adm-${Math.random().toString(36).slice(2, 14)}-Aa1`;
    await prisma.platformAdmin.create({
      data: {
        email: 'admin@torio.local',
        name: 'Platform Admin',
        passwordHash: await hash(adminPassword, { algorithm: 2 }),
      },
    });
    console.log(`Created Super Admin admin@torio.local. Password (shown once): ${adminPassword}`);
  }

  console.log(`Seeded workspace "${workspace.slug}" with ${people.length} users.`);
  console.log(`Dev password for newly created users: ${password}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
