import { INTENT_LABEL, cfByKey, cfDisplay, cfHasVal, filled, ruleCheck, SCOPES } from './brain';
import type { BrainAction, BrainConfig, BrainCond, BrainGroup, BrainRule } from './brain';

/**
 * Rule-based PREVIEW of how a configuration would shape a reply.
 *
 * This is NOT an AI model. It is a deterministic simulation (keyword intent detection + the same business
 * rules, guardrails and knowledge the AI would be given) so admins can sanity-check their configuration.
 * The UI must label it as such. A real model-backed test endpoint does not exist yet.
 */

const BN = '০১২৩৪৫৬৭৮৯';
const toBn = (s: string | number) => String(s).replace(/[0-9]/g, (c) => BN[+c]!);
const has = (q: string, a: string[]) => a.some((w) => q.includes(w));
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const INTENT_KW: Record<string, string[]> = {
  fee: ['delivery fee', 'delivery charge'],
  discount: ['discount'],
  avail: ['availability', 'variant', 'in stock'],
  damaged: ['damaged'],
  wholesale: ['wholesale', 'bulk'],
  cod: ['cash on delivery', 'cod '],
  warranty: ['warranty'],
  area: ['service area', 'deliver to'],
  tracking: ['track', 'order number', 'order status'],
  returns: ['return', 'refund'],
  time: ['delivery time', 'delivery date'],
  free: ['free shipping', 'free delivery'],
};
const LOC_WORDS = [
  'dhaka',
  'ঢাকা',
  'inside',
  'outside',
  'baire',
  'বাইরে',
  'moddhe',
  'মধ্যে',
  'chattogram',
  'chittagong',
  'sylhet',
  'khulna',
  'rajshahi',
  'gazipur',
  'narayanganj',
];
const CITIES = [
  'dhaka',
  'chattogram',
  'chittagong',
  'sylhet',
  'khulna',
  'rajshahi',
  'barishal',
  'rangpur',
  'mymensingh',
  'cumilla',
  'comilla',
  'gazipur',
];
const COLOR_WORDS: Record<string, string> = {
  black: 'black',
  kalo: 'black',
  কালো: 'black',
  white: 'white',
  shada: 'white',
  সাদা: 'white',
  grey: 'grey',
  gray: 'grey',
  beige: 'beige',
  sage: 'sage',
  sand: 'sand',
  charcoal: 'charcoal',
  terracotta: 'terracotta',
  natural: 'natural',
  blue: 'blue',
  red: 'red',
  green: 'green',
};
const COLOR_BN: Record<string, string> = { black: 'কালো', white: 'সাদা' };
const GREET: Record<string, Record<Lang, string>> = {
  Friendly: { en: 'Hi there!', bn: 'হ্যালো!', bl: 'Hi!' },
  Professional: {
    en: 'Thank you for reaching out.',
    bn: 'যোগাযোগের জন্য ধন্যবাদ।',
    bl: 'Jogajog korar jonno dhonnobad.',
  },
  Casual: { en: 'Hey!', bn: 'হাই!', bl: 'Hey!' },
  Premium: {
    en: 'Thank you for choosing {b}.',
    bn: '{b} বেছে নেওয়ার জন্য ধন্যবাদ।',
    bl: '{b} beche newar jonno dhonnobad.',
  },
  Playful: { en: 'Hey hey!', bn: 'হেই!', bl: 'Hey hey!' },
};
type Lang = 'en' | 'bn' | 'bl';

function detectLang(q: string, setting: string): Lang {
  if (setting === 'Bengali') return 'bn';
  if (setting === 'English') return 'en';
  if (/[ঀ-৿]/.test(q)) return 'bn';
  if (
    /\b(koto|ki|ache|achhe|lage|din|kobe|korte|hobe|pabo|dibo|apnader|amar|baire|bhai|vai|pete|naki)\b/i.test(
      q,
    )
  )
    return 'bl';
  return 'en';
}

function getIntent(q: string, color: string | null, prod: unknown): string {
  if (
    has(q, [
      'worst',
      'angry',
      'terrible',
      'fraud',
      'scam',
      'disappointed',
      'বাজে',
      'ফালতু',
      'baje',
      'faltu',
      'ridiculous',
    ])
  )
    return 'angry';
  if (has(q, ['wholesale', 'bulk', 'পাইকারি', 'paikari'])) return 'wholesale';
  if (has(q, ['discount', 'coupon', 'promo', 'ছাড়', 'ডিসকাউন্ট', 'cheaper'])) return 'discount';
  if (has(q, ['damaged', 'broken', 'নষ্ট', 'ভাঙা', 'vanga', 'defective'])) return 'damaged';
  if (
    has(q, [
      'return',
      'refund',
      'exchange',
      'wrong item',
      'wrong product',
      'ফেরত',
      'রিটার্ন',
      'ferot',
    ])
  )
    return 'returns';
  if (has(q, ['cash on', 'cod', 'ক্যাশ'])) return 'cod';
  if (has(q, ['warranty', 'guarantee', 'ওয়ারেন্টি'])) return 'warranty';
  if (
    has(q, ['deliver to', 'my area', 'service area', 'your area', 'which area', 'which cities']) ||
    (CITIES.filter((c) => c !== 'dhaka').some((c) => q.includes(c)) &&
      !has(q, ['charge', 'fee', 'koto']))
  )
    return 'area';
  if (color || prod || has(q, ['in stock', 'available in', 'availability', 'stock ache']))
    return 'avail';
  if (has(q, ['track', 'tracking', 'where is my order', 'order status', 'ট্র্যাক', 'কোথায়']))
    return 'tracking';
  if (has(q, ['free', 'ফ্রি'])) return 'free';
  if (
    has(q, [
      'how long',
      'days',
      'kobe',
      'কত দিন',
      'কবে',
      'সময়',
      'lage',
      'লাগে',
      ' din',
      'when will',
    ])
  )
    return 'time';
  if (has(q, ['charge', 'fee', 'cost', 'koto', 'কত', 'চার্জ', 'shipping', 'delivery', 'ডেলিভারি']))
    return 'fee';
  return 'other';
}

interface Ctx {
  intentLabel: string;
  location: string;
  pct: number | null;
  tags: string[];
  amount: number | null;
  stock: string;
}

function evalCond(d: BrainConfig, c: BrainCond, ctx: Ctx, att: string[]): boolean {
  switch (c.s) {
    case 'intent':
      return ctx.intentLabel === c.val;
    case 'location':
      return ctx.location === c.val;
    case 'stock':
      return ctx.stock === c.val;
    case 'tag': {
      const t = ctx.tags.includes(String(c.val).toLowerCase());
      return c.op === 'is' ? t : !t;
    }
    case 'discount': {
      const f = cfByKey(d, c.val);
      if (!f || !f.enabled) {
        att.push(`This rule uses “${f ? f.name : c.val}”, which is disabled or missing.`);
        return true;
      }
      if (ctx.pct == null) return c.op === 'exceeds';
      const lim = Number(f.value);
      return c.op === 'exceeds' ? ctx.pct > lim : ctx.pct <= lim;
    }
    case 'amount': {
      const f = cfByKey(d, c.val);
      if (!f || !f.enabled) {
        att.push(`This rule uses “${f ? f.name : c.val}”, which is disabled or missing.`);
        return false;
      }
      if (ctx.amount == null) return false;
      const lim = Number(f.value);
      return c.op === 'is less than' ? ctx.amount < lim : ctx.amount >= lim;
    }
    case 'field': {
      const f = c.fk ? cfByKey(d, c.fk) : undefined;
      const set = !!(f && f.enabled && cfHasVal(f));
      if (c.op === 'is set') return set;
      if (c.op === 'is not set') return !set;
      return !!f && cfDisplay(f).toLowerCase() === String(c.val).toLowerCase();
    }
  }
  return false;
}
function evalItems(
  d: BrainConfig,
  items: (BrainCond | BrainGroup)[],
  join: 'and' | 'or',
  ctx: Ctx,
  att: string[],
): boolean {
  const res = items.map((it) =>
    'group' in it ? evalItems(d, it.conds, it.join, ctx, att) : evalCond(d, it, ctx, att),
  );
  return join === 'or' ? res.some(Boolean) : res.every(Boolean);
}
interface Hit {
  rule: BrainRule;
  branch: 'then' | 'otherwise';
  actions: { type: BrainAction['type']; text: string }[];
  att: string[];
}
/** Which enabled, complete rules apply to this situation (exported so rule "Test" buttons can reuse it). */
export function runRules(d: BrainConfig, ctx: Ctx): Hit[] {
  const out: Hit[] = [];
  const pri = { High: 0, Medium: 1, Low: 2 };
  [...d.logic]
    .filter((r) => r.enabled && ruleCheck(d, r).issues.length === 0)
    .sort((a, b) => pri[a.priority] - pri[b.priority])
    .forEach((r) => {
      const ints = r.items.filter((i): i is BrainCond => !('group' in i) && i.s === 'intent');
      const relevant = ints.length ? ints.every((i) => evalCond(d, i, ctx, [])) : true;
      if (!relevant) return;
      const att: string[] = [];
      const m = evalItems(d, r.items, r.join, ctx, att);
      if (m) out.push({ rule: r, branch: 'then', actions: r.actions, att });
      else if (r.otherwise && filled(r.otherwise.text))
        out.push({ rule: r, branch: 'otherwise', actions: [r.otherwise], att });
    });
  return out;
}

export interface PreviewResult {
  text: string;
  sources: string[];
  fields: string[];
  instructions: string[];
  rules: string[];
  missing: string[];
  approval: boolean;
  reason: string;
  attention: { text: string; sec: string } | null;
  confidence: 'High' | 'Medium' | 'Low';
  fallback: boolean;
}

export function previewReply(raw: string, d: BrainConfig): PreviewResult {
  const q = raw.toLowerCase();
  const v = d.voice,
    s = d.shipping,
    r = d.returns,
    ru = d.rules;
  const b = d.identity.name || 'our store';
  const L = detectLang(raw, v.language);
  const n = (x: string | number) => (L === 'bn' ? toBn(x) : String(x));
  const t = (en: string, bn: string, bl?: string) =>
    L === 'bn' ? bn : L === 'bl' ? (bl ?? en) : en;
  const tm = (x: string) =>
    L === 'bn'
      ? toBn(x).replace(/business days|days|day|months|month/g, (m) =>
          m.startsWith('mon') ? 'মাস' : 'দিন',
        )
      : L === 'bl'
        ? x.replace(/days|day/g, 'din')
        : x;
  const X = {
    body: '',
    follow: '',
    extra: '',
    tail: '',
    know: [] as string[],
    fields: [] as string[],
    instr: [] as string[],
    rules: [] as string[],
    missing: [] as string[],
    review: false,
    reason: '',
    attention: null as { text: string; sec: string } | null,
    conf: 'High' as PreviewResult['confidence'],
    fb: false,
    angry: false,
  };
  const useF = (f?: { name: string } | null) => {
    if (f && !X.fields.includes(f.name)) X.fields.push(f.name);
  };
  const humanTxt = () =>
    t(
      'Would you like me to connect you with our team?',
      'আপনাকে কি আমাদের টিমের সাথে যুক্ত করে দেব?',
      'Amader team er sathe connect kore dibo?',
    );
  const fallback = (spec: string | null, miss?: string[]) => {
    X.fb = true;
    X.conf = 'Low';
    X.know = ['Guardrails: fallback behaviour'];
    if (miss) X.missing = X.missing.concat(miss);
    const base =
      spec ??
      t(
        "I don't have confirmed information about that right now.",
        'এই বিষয়ে এই মুহূর্তে আমার কাছে নিশ্চিত তথ্য নেই।',
        'Ei bishoye ekhon amar kache confirmed info nei.',
      );
    X.body =
      ru.fallback === 'clarify'
        ? (spec ? spec + ' ' : '') +
          t(
            'Could you share a little more detail — which product or order is this about?',
            'আরেকটু বিস্তারিত বলবেন — কোন প্রোডাক্ট বা অর্ডার নিয়ে জানতে চাইছেন?',
            'Ektu details bolben — kon product ba order niye jante chacchen?',
          )
        : ru.fallback === 'human'
          ? base + ' ' + humanTxt()
          : base;
  };
  const attention = (text: string, sec: string) => {
    X.attention = { text, sec };
    X.review = true;
    X.reason = 'Configuration needs attention';
    X.conf = 'Low';
    X.body = t(
      'Let me confirm this with our team so I give you the right answer.',
      'সঠিক তথ্য দিতে বিষয়টি আমাদের টিমের সাথে নিশ্চিত করে জানাচ্ছি।',
      'Shothik info dite bishoy ta amader team er sathe confirm kore janacchi.',
    );
  };
  const colorKey = Object.keys(COLOR_WORDS).find((w) => q.includes(w));
  const color = colorKey ? COLOR_WORDS[colorKey]! : null;
  const prod = d.products.find(
    (p) =>
      p.name &&
      p.name
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .some((w) => q.includes(w)),
  );
  const key = getIntent(q, color, prod);
  const pm = q.match(/(\d+)\s*(%|percent|পার্সেন্ট)/);
  const ctx: Ctx = {
    intentLabel: (INTENT_LABEL as Record<string, string>)[key] ?? '',
    location: has(q, LOC_WORDS) ? 'known' : 'unknown',
    pct: pm ? Number(pm[1]) : null,
    tags: q.includes('vip') ? ['vip'] : [],
    amount: null,
    stock:
      key === 'avail' && prod && prod.stock && (!color || prod.colors)
        ? 'available'
        : 'missing or outdated',
  };
  const hits = runRules(d, ctx);
  const A = {
    ask: null as string | null,
    noPromise: false,
    human: false,
    escalate: false,
    request: [] as string[],
  };
  for (const h of hits) {
    X.rules.push(h.rule.name + (h.branch === 'otherwise' ? ' · otherwise' : ''));
    for (const a of h.actions) {
      if (a.type === 'Ask the customer' && !A.ask && filled(a.text)) A.ask = a.text;
      if (a.type === 'Do not promise') A.noPromise = true;
      if (a.type === 'Offer human assistance') A.human = true;
      if (a.type === 'Escalate for review') A.escalate = true;
      if (a.type === 'Request information' && filled(a.text)) A.request.push(a.text);
    }
    if (h.att.length && !X.attention) X.attention = { text: h.att[0]!, sec: 'logic' };
  }
  for (const ins of d.instructions) {
    if (!ins.enabled || !filled(ins.content)) continue;
    const txt = (ins.title + ' ' + ins.conditions + ' ' + ins.content).toLowerCase();
    const vip = txt.includes('vip');
    if (vip && !ctx.tags.includes('vip')) continue;
    const kw = INTENT_KW[key] ?? [];
    if (kw.some((k) => txt.includes(k)) || (vip && ctx.tags.includes('vip')))
      X.instr.push(ins.title);
  }
  const cfOn = (k: string) => {
    const f = cfByKey(d, k);
    return f && f.enabled ? f : null;
  };
  const ok = t('Yes. ', 'জি। ', 'Ji. ');
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

  if (key === 'angry') {
    X.angry = true;
    X.know = ['Guardrails: angry customers'];
    X.conf = 'Medium';
    X.body =
      ru.angry === 'Apologise and try to resolve'
        ? t(
            "I'm really sorry about this. Could you share your order number so I can look into it right away?",
            'এই অভিজ্ঞতার জন্য আমরা সত্যিই দুঃখিত। আপনার অর্ডার নম্বরটি দিলে আমি এখনই দেখছি।',
            'Ei ovigotar jonno amra shotti dukkhito. Order number ta dile ekhoni dekhchi.',
          )
        : ru.angry === 'Hand off immediately'
          ? t(
              "I'm connecting you with a member of our team now.",
              'আপনাকে এখনই আমাদের টিমের একজনের সাথে যুক্ত করছি।',
              'Apnake ekhoni amader team er sathe connect korchi.',
            )
          : t(
              "I'm really sorry about this experience, and I understand how frustrating it is. I'm passing this to our team right away so they can help.",
              'এই অভিজ্ঞতার জন্য আমরা সত্যিই দুঃখিত, আপনার বিরক্তি বুঝতে পারছি। বিষয়টি এখনই আমাদের টিমকে জানাচ্ছি।',
              'Ei ovigotar jonno amra shotti dukkhito. Bishoy ta ekhoni amader team ke janacchi.',
            );
    if (ru.sensitive.complaint) {
      X.review = true;
      X.reason = 'Complaints require human review';
    }
  } else if (key === 'wholesale') {
    const f = cfOn('wholesale_available');
    if (!f)
      fallback(
        t(
          "I don't have confirmed information about wholesale orders right now.",
          'পাইকারি অর্ডার সম্পর্কে এই মুহূর্তে নিশ্চিত তথ্য নেই।',
          'Wholesale order niye ekhon confirmed info nei.',
        ),
        ['Wholesale Available (custom field)'],
      );
    else {
      useF(f);
      X.body = f.value
        ? t(
            'Yes, we accept wholesale orders.',
            'জি, আমরা পাইকারি অর্ডার নিই।',
            'Ji, amra wholesale order nei.',
          )
        : t(
            "We don't take wholesale orders at the moment.",
            'এই মুহূর্তে আমরা পাইকারি অর্ডার নিচ্ছি না।',
            'Ekhon amra wholesale order nicchi na.',
          );
      if (f.value) {
        X.missing.push('Wholesale pricing & minimum quantity');
        X.follow = t(
          'Our team can share wholesale pricing.',
          'আমাদের টিম পাইকারি দাম জানাতে পারবে।',
          'Amader team wholesale price janate parbe.',
        );
        A.human = true;
        X.conf = 'Medium';
        if (ru.approvalTopics.includes('Bulk orders')) {
          X.review = true;
          X.reason = 'Bulk orders are on your approval list';
        }
      }
    }
  } else if (key === 'discount') {
    const lim = cfOn('vip_discount_limit');
    X.know = ['Guardrails: discount limit'];
    if (lim && ctx.tags.includes('vip')) useF(lim);
    if (A.noPromise) {
      X.body = t(
        "I'm not able to promise that discount, but I can check with our team whether any offer applies to your order.",
        'আমি এই ছাড়ের নিশ্চয়তা দিতে পারছি না, তবে আপনার অর্ডারে কোনো অফার প্রযোজ্য কিনা টিমের সাথে কথা বলে জানাচ্ছি।',
        'Ei discount er promise dite parchi na, tobe kono offer ache kina team er sathe check kore janacchi.',
      );
      if (ctx.pct == null) X.missing.push('Requested discount amount');
    } else if (lim && ctx.tags.includes('vip'))
      X.body = t(
        `As a VIP customer, you can get up to ${lim.value}% off on this order.`,
        `ভিআইপি গ্রাহক হিসেবে এই অর্ডারে আপনি ${n(String(lim.value))}% পর্যন্ত ছাড় পেতে পারেন।`,
        `VIP customer hisebe ei order e ${lim.value}% porjonto discount paben.`,
      );
    else if (ru.discount === 'None')
      X.body = t(
        "I'm not able to offer a discount directly, but I'll check with our team whether any offer applies to your order.",
        'আমি সরাসরি ছাড় দিতে পারি না, তবে কোনো অফার প্রযোজ্য কিনা টিমের সাথে কথা বলে জানাচ্ছি।',
        'Ami directly discount dite pari na, tobe kono offer ache kina team er sathe check kore janacchi.',
      );
    else
      X.body = t(
        `I can offer ${ru.discount.toLowerCase()} off on this order.`,
        `এই অর্ডারে ${n(ru.discount.replace('Up to ', ''))} পর্যন্ত ছাড় দিতে পারি।`,
        `Ei order e ${ru.discount.replace('Up to ', '')} porjonto discount dite pari.`,
      );
    X.conf = X.missing.length ? 'Medium' : 'High';
    if (ru.approvalTopics.includes('Discounts')) {
      X.review = true;
      X.reason = 'Discounts are on your approval list';
    }
  } else if (key === 'damaged') {
    if (!r.damaged)
      fallback(
        t(
          "I don't have our damaged-product policy confirmed right now.",
          'নষ্ট প্রোডাক্টের নীতিমালা এই মুহূর্তে নিশ্চিত নয়।',
          'Damaged product er policy ekhon confirmed na.',
        ),
        ['Damaged product policy'],
      );
    else {
      X.body =
        t(
          "I'm sorry your item arrived damaged. ",
          'প্রোডাক্টটি নষ্ট অবস্থায় পৌঁছানোর জন্য দুঃখিত। ',
          'Product ta nosto obosthay pouchanor jonno dukkhito. ',
        ) + r.damaged;
      X.know = ['Returns: damaged product policy'];
      const req = A.request.length ? A.request : r.proof ? [r.proof] : [];
      if (req.length) {
        X.follow = t('Please share: ', 'অনুগ্রহ করে পাঠান: ', 'Ei gulo pathan: ') + req.join('; ');
        A.request = [];
        if (r.proof) X.know.push('Returns: required proof');
      }
      if (r.shippingResp)
        X.extra =
          t('Return shipping: ', 'রিটার্ন শিপিং: ', 'Return shipping: ') +
          r.shippingResp.toLowerCase() +
          '.';
    }
  } else if (key === 'returns') {
    const isRefund = has(q, ['refund', 'টাকা ফেরত', 'taka ferot']),
      isEx = has(q, ['exchange', 'এক্সচেঞ্জ', 'বদল']),
      isWrong = has(q, ['wrong']);
    if (isWrong) {
      if (!r.wrong) fallback(null, ['Wrong product policy']);
      else {
        X.body = ok + r.wrong;
        X.know = ['Returns: wrong product policy'];
      }
    } else if (isEx) {
      if (!r.exchange)
        fallback(
          t(
            "I don't have our exchange policy confirmed right now.",
            'এক্সচেঞ্জ নীতিমালা এই মুহূর্তে নিশ্চিত নয়।',
            'Exchange policy ekhon confirmed na.',
          ),
          ['Exchange eligibility'],
        );
      else {
        X.body = ok + r.exchange;
        X.know = ['Returns: exchange eligibility'];
      }
    } else if (!r.eligibility) fallback(null, ['Return eligibility']);
    else {
      X.body =
        r.eligibility +
        (r.window
          ? ' ' +
            t(
              `Returns are accepted within ${r.window} of delivery.`,
              `ডেলিভারির ${tm(r.window)} এর মধ্যে রিটার্ন গ্রহণ করা হয়।`,
              `Delivery er ${tm(r.window)} er moddhe return neya hoy.`,
            )
          : '');
      X.know = ['Returns: eligibility & window'];
      if (isRefund) {
        if (r.refundTime) {
          X.follow = t(
            `Refunds are processed within ${r.refundTime}.`,
            `রিফান্ড ${tm(r.refundTime)} এর মধ্যে প্রসেস করা হয়।`,
            `Refund ${tm(r.refundTime)} er moddhe process hoy.`,
          );
          X.know.push('Returns: refund time');
        } else {
          X.follow = t(
            "I don't have confirmed refund timing right now — our team will confirm it for you.",
            'রিফান্ডের সময়সীমা এই মুহূর্তে নিশ্চিত নয় — আমাদের টিম জানাবে।',
            'Refund er time ekhon confirmed na — amader team janabe.',
          );
          X.missing.push('Refund processing time');
          X.conf = 'Medium';
        }
        if (ru.sensitive.refund || ru.approvalTopics.includes('Refunds')) {
          X.review = true;
          X.reason = 'Refunds require human review';
        }
      }
    }
  } else if (key === 'cod') {
    const f = cfOn('cod_available');
    useF(f);
    X.know = ['Customer Policies: cash on delivery'];
    if (f && !!f.value !== !!s.cod)
      attention(
        `COD Available (custom field) says ${f.value ? 'Yes' : 'No'}, but Cash on delivery is ${s.cod ? 'on' : 'off'} in Customer Policies.`,
        'fields',
      );
    else {
      X.body = s.cod
        ? t(
            `Yes, Cash on Delivery is available${s.coverage === 'Nationwide' ? ' all over Bangladesh' : ''}.`,
            `জি, ক্যাশ অন ডেলিভারি সুবিধা আছে${s.coverage === 'Nationwide' ? ' সারা দেশে' : ''}।`,
            `Ji, Cash on Delivery available${s.coverage === 'Nationwide' ? ' shara desh e' : ''}.`,
          )
        : t(
            "Cash on Delivery isn't available right now.",
            'এই মুহূর্তে ক্যাশ অন ডেলিভারি সুবিধা নেই।',
            'Ekhon Cash on Delivery nei.',
          );
      if (s.payments.length) {
        X.follow = t(
          `You can also pay with ${s.payments.join(', ')}.`,
          `${s.payments.join(', ')} দিয়েও পেমেন্ট করতে পারবেন।`,
          `${s.payments.join(', ')} diye o payment korte parben.`,
        );
        X.know.push('Customer Policies: payment methods');
      }
    }
  } else if (key === 'warranty') {
    const f = cfOn('warranty_period');
    if (!f || !cfHasVal(f))
      fallback(
        t(
          "I don't have our warranty details confirmed right now.",
          'ওয়ারেন্টির তথ্য এই মুহূর্তে নিশ্চিত নয়।',
          'Warranty info ekhon confirmed na.',
        ),
        ['Warranty Period (custom field)'],
      );
    else {
      useF(f);
      X.body = t(
        `Our warranty period is ${f.value}${f.desc ? ' and covers ' + lcFirst(f.desc.replace(/^Warranty covering /i, '')).replace(/\.$/, '') : ''}.`,
        `আমাদের ওয়ারেন্টি সময়কাল ${tm(String(f.value))}।`,
        `Amader warranty period ${f.value}.`,
      );
      X.missing.push('Warranty claim process');
      X.follow = t(
        'For a claim, our team will guide you through the steps.',
        'ক্লেইমের জন্য আমাদের টিম আপনাকে সাহায্য করবে।',
        'Claim er jonno amader team help korbe.',
      );
      X.conf = 'Medium';
    }
  } else if (key === 'area') {
    const f = cfOn('service_areas');
    const list = arr(f?.value);
    if (f && list.length && s.coverage === 'Nationwide') {
      useF(f);
      X.know = ['Customer Policies: delivery coverage'];
      attention(
        `Service Areas lists only ${list.join(', ')}, but delivery coverage is set to Nationwide.`,
        'policies',
      );
    } else if (f && list.length) {
      useF(f);
      const city = CITIES.find((c) => q.includes(c));
      if (city) {
        const inL = list.some(
          (x) => x.toLowerCase() === city || (city === 'chittagong' && x === 'Chattogram'),
        );
        const C = city[0]!.toUpperCase() + city.slice(1);
        X.body = inL
          ? t(
              `Yes, we deliver to ${C}.`,
              `জি, আমরা ${C}-এ ডেলিভারি দিই।`,
              `Ji, amra ${C} e delivery dei.`,
            )
          : t(
              `We currently deliver to ${list.join(', ')}. ${C} isn't on our list yet.`,
              `আমরা বর্তমানে ${list.join(', ')}-এ ডেলিভারি দিই। ${C} এখনো তালিকায় নেই।`,
              `Amra ekhon ${list.join(', ')} e delivery dei. ${C} ekhono list e nei.`,
            );
      } else {
        X.body = t(
          `We currently deliver to ${list.join(', ')}.`,
          `আমরা বর্তমানে ${list.join(', ')}-এ ডেলিভারি দিই।`,
          `Amra ekhon ${list.join(', ')} e delivery dei.`,
        );
        X.follow = t('Which area are you in?', 'আপনি কোন এলাকায় আছেন?', 'Apni kon area te achen?');
      }
    } else if (!filled(s.coverage)) fallback(null, ['Delivery coverage']);
    else {
      X.know = ['Customer Policies: delivery coverage'];
      X.body = t(
        `We deliver ${s.coverage === 'Nationwide' ? 'all over Bangladesh' : 'to ' + s.coverage}.`,
        `আমরা ${s.coverage === 'Nationwide' ? 'সারা দেশে' : s.coverage} ডেলিভারি দিই।`,
        `Amra ${s.coverage === 'Nationwide' ? 'shara desh e' : s.coverage} delivery dei.`,
      );
    }
  } else if (key === 'avail') {
    const ruleHit = hits.some(
      (h) => h.branch === 'then' && h.rule.items.some((i) => !('group' in i) && i.s === 'stock'),
    );
    if (!prod) {
      if (ruleHit) {
        X.body = color
          ? t(
              `Availability of the ${color} variant needs confirmation.`,
              `${COLOR_BN[color] ?? color} ভ্যারিয়েন্টের স্টক নিশ্চিত করতে হবে।`,
              `${color} variant er availability confirm korte hobe.`,
            )
          : t(
              'Availability needs confirmation.',
              'স্টক নিশ্চিত করতে হবে।',
              'Availability confirm korte hobe.',
            );
        X.missing.push('Which product the customer means');
        if (color) X.missing.push(`${color[0]!.toUpperCase() + color.slice(1)} variant stock`);
        X.conf = 'Low';
      } else
        fallback(
          color
            ? t(
                `I can help check that for you. I don't have confirmed information about the ${color} variant right now.`,
                `আমি দেখে জানাতে পারি। ${COLOR_BN[color] ?? color} ভ্যারিয়েন্ট সম্পর্কে এই মুহূর্তে নিশ্চিত তথ্য নেই।`,
                `Ami check kore dite pari. ${color} variant er confirmed info ekhon nei.`,
              )
            : null,
          ['Which product the customer means'],
        );
    } else {
      X.know = ['Product: ' + prod.name];
      const cols = prod.colors
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (color) {
        const av = cols.some((c) => c.toLowerCase() === color);
        X.body = av
          ? t(
              `Yes — ${prod.name} comes in ${color}.`,
              `জি, ${prod.name} ${COLOR_BN[color] ?? color} রঙে আছে।`,
              `Ji, ${prod.name} ${color} color e ache.`,
            )
          : t(
              `${prod.name} currently comes in ${cols.join(', ')}. ${color[0]!.toUpperCase() + color.slice(1)} isn't one of the listed colours.`,
              `${prod.name} বর্তমানে ${cols.join(', ')} রঙে পাওয়া যায়। ${COLOR_BN[color] ?? color} রঙটি তালিকায় নেই।`,
              `${prod.name} ekhon ${cols.join(', ')} color e ache. ${color} color ta list e nei.`,
            );
        if (!av && ru.alternatives) {
          X.follow = t(
            'I can suggest a similar item from our catalog if you like.',
            'চাইলে ক্যাটালগ থেকে কাছাকাছি একটি প্রোডাক্ট সাজেস্ট করতে পারি।',
            'Chaile catalog theke similar ekta product suggest korte pari.',
          );
          X.know.push('Guardrails: recommend alternatives');
        }
      } else
        X.body =
          t(
            `${prod.name} is ৳${prod.price}`,
            `${prod.name} এর দাম ৳${n(prod.price)}`,
            `${prod.name} er dam ৳${prod.price}`,
          ) +
          (cols.length
            ? t(
                `, available in ${cols.join(', ')}.`,
                `, ${cols.join(', ')} রঙে পাওয়া যায়।`,
                `, ${cols.join(', ')} color e ache.`,
              )
            : '.');
      const stk = (
        {
          'Low stock': t(
            'Only a few are left in stock.',
            'স্টকে অল্প কয়েকটি বাকি আছে।',
            'Stock e olpo koyekta ache.',
          ),
          'Out of stock': t(
            "It's currently out of stock.",
            'এটি বর্তমানে স্টকে নেই।',
            'Eta ekhon stock e nei.',
          ),
          'Pre-order': t(
            'It is available on pre-order.',
            'এটি প্রি-অর্ডারে পাওয়া যাচ্ছে।',
            'Eta pre-order e available.',
          ),
        } as Record<string, string>
      )[prod.stock];
      if (stk) {
        if (!X.follow) X.follow = stk;
        else X.extra = stk;
      }
    }
  } else if (key === 'tracking') {
    if (!s.tracking) fallback(null, ['Tracking instructions']);
    else {
      X.body =
        t('You can track your order like this: ', 'অর্ডার ট্র্যাক করতে: ', 'Order track korte: ') +
        s.tracking;
      X.know = ['Customer Policies: tracking'];
    }
  } else if (key === 'free') {
    X.know = ['Customer Policies: free shipping'];
    if (s.freeShip && s.threshold)
      X.body = t(
        `Orders of ৳${s.threshold} or more get free delivery.`,
        `৳${n(s.threshold)} বা তার বেশি অর্ডারে ডেলিভারি ফ্রি।`,
        `৳${s.threshold} ba tar beshi order e delivery free.`,
      );
    else if (!s.freeShip)
      X.body = t(
        "We don't offer free delivery at the moment.",
        'এই মুহূর্তে ফ্রি ডেলিভারি সুবিধা নেই।',
        'Ekhon free delivery nei.',
      );
    else fallback(null, ['Free shipping threshold']);
  } else if (key === 'time') {
    if (!s.timeInside && !s.timeOutside) fallback(null, ['Delivery time']);
    else {
      X.body = t(
        `Delivery inside Dhaka usually takes ${s.timeInside}, and outside Dhaka ${s.timeOutside}.`,
        `ঢাকার মধ্যে সাধারণত ${tm(s.timeInside)} এবং ঢাকার বাইরে ${tm(s.timeOutside)} সময় লাগে।`,
        `Dhakar moddhe usually ${tm(s.timeInside)}, Dhakar baire ${tm(s.timeOutside)} lage.`,
      );
      X.know = ['Customer Policies: delivery time'];
      if (!ru.promises) {
        X.follow = t(
          'These are estimates, not guaranteed dates.',
          'এটি আনুমানিক সময়, নির্দিষ্ট তারিখের নিশ্চয়তা নয়।',
          'Eta estimate, exact date er guarantee na.',
        );
        X.know.push('Guardrails: no delivery promises');
      }
      if (ru.sensitive.delivery && has(q, ['tomorrow', 'today', 'kalke', 'আজ', 'কাল', 'exact'])) {
        X.review = true;
        X.reason = 'Specific delivery commitments require review';
      }
    }
  } else if (key === 'fee') {
    if (A.ask) {
      X.body = A.ask;
      X.know = ['Customer Policies: delivery fees'];
      X.missing.push('Customer’s delivery location');
    } else if (!s.feeInside || !s.feeOutside)
      fallback(
        t(
          "I don't have confirmed delivery charges right now.",
          'ডেলিভারি চার্জ এই মুহূর্তে নিশ্চিত নয়।',
          'Delivery charge ekhon confirmed na.',
        ),
        ['Delivery fees'],
      );
    else {
      X.know = ['Customer Policies: delivery fees'];
      const out =
        has(q, ['outside', 'baire', 'বাইরে']) ||
        CITIES.filter((c) => c !== 'dhaka').some((c) => q.includes(c));
      const inn = !out && has(q, ['dhaka', 'ঢাকা', 'inside', 'moddhe', 'মধ্যে']);
      X.body = out
        ? t(
            `Delivery outside Dhaka is ৳${s.feeOutside}.`,
            `ঢাকার বাইরে ডেলিভারি চার্জ ৳${n(s.feeOutside)}।`,
            `Dhakar baire delivery charge ৳${s.feeOutside}.`,
          )
        : inn
          ? t(
              `Delivery inside Dhaka is ৳${s.feeInside}.`,
              `ঢাকার মধ্যে ডেলিভারি চার্জ ৳${n(s.feeInside)}।`,
              `Dhakar moddhe delivery charge ৳${s.feeInside}.`,
            )
          : t(
              `Delivery inside Dhaka is ৳${s.feeInside} and outside Dhaka is ৳${s.feeOutside}.`,
              `ঢাকার মধ্যে ডেলিভারি চার্জ ৳${n(s.feeInside)} এবং ঢাকার বাইরে ৳${n(s.feeOutside)}।`,
              `Dhakar moddhe delivery charge ৳${s.feeInside}, Dhakar baire ৳${s.feeOutside}.`,
            );
      const fq = d.faqs.find((f) => f.active && f.cat === 'Delivery');
      if (fq) X.know.push('FAQ: ' + fq.q);
      if (s.freeShip && s.threshold) {
        X.extra = t(
          `Orders of ৳${s.threshold} or more ship free.`,
          `৳${n(s.threshold)} বা তার বেশি অর্ডারে ডেলিভারি ফ্রি।`,
          `৳${s.threshold} er beshi order e delivery free.`,
        );
        X.know.push('Customer Policies: free shipping');
      }
    }
  } else {
    const f = d.customFields.find((x) => {
      if (!x.enabled || x.scope === SCOPES[2]) return false;
      const w = x.name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((y) => y.length > 3);
      return w.length > 0 && w.filter((y) => q.includes(y)).length >= Math.min(2, w.length);
    });
    if (f) {
      useF(f);
      if (!cfHasVal(f)) fallback(null, [f.name]);
      else
        X.body = t(
          `${f.name}: ${cfDisplay(f)}.`,
          `${f.name}: ${cfDisplay(f)}।`,
          `${f.name}: ${cfDisplay(f)}.`,
        );
    } else {
      const fq = d.faqs.find(
        (x) =>
          x.active &&
          x.q
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 4)
            .filter((w) => q.includes(w)).length >= 2,
      );
      if (fq) {
        X.body = fq.a;
        X.know = ['FAQ: ' + fq.q];
      } else fallback(null, ['No matching knowledge, field or rule']);
    }
  }
  if (X.attention && !X.reason) attention(X.attention.text, X.attention.sec);
  if (!X.fb && !X.attention) {
    if (A.request.length)
      X.follow =
        (X.follow ? X.follow + ' ' : '') +
        t('Please share: ', 'অনুগ্রহ করে পাঠান: ', 'Ei gulo pathan: ') +
        A.request.join('; ');
    if (A.human) X.tail = humanTxt();
    if (A.escalate) {
      X.review = true;
      X.reason = X.reason || 'A business rule requires human review';
    }
    if (X.missing.length && X.conf === 'High') X.conf = 'Medium';
  }
  const g = v.greeting.trim() || GREET[v.tone]![L].replace('{b}', b);
  const parts: string[] = [];
  if (v.length !== 'Concise') parts.push(g + (v.emoji === 'Moderate' && !X.angry ? ' 👋' : ''));
  parts.push(X.body);
  if (!X.fb && v.length !== 'Concise' && X.follow) parts.push(X.follow);
  if (!X.fb && v.length === 'Detailed' && X.extra) parts.push(X.extra);
  if (X.tail) parts.push(X.tail);
  if (v.formality >= 4) parts.push(t('Thank you.', 'ধন্যবাদ।', 'Dhonnobad.'));
  let out = parts.filter(Boolean).join(' ');
  if (v.emoji !== 'None' && !X.angry && !X.attention) out += v.emoji === 'Moderate' ? ' 😊' : ' 🙂';
  return {
    text: out,
    sources: X.fb ? X.know : X.know.concat(['Brand voice']),
    fields: X.fields,
    instructions: X.instr,
    rules: X.rules,
    missing: X.missing,
    approval: X.review,
    reason: X.reason,
    attention: X.attention,
    confidence: X.attention ? 'Low' : X.conf,
    fallback: X.fb,
  };
}
