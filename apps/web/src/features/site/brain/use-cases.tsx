import { ClipboardCheck, Gift, Headphones, UserSearch, type LucideIcon } from 'lucide-react';
import { Reveal } from './reveal';
import { eyebrow, h2, wrap } from './shared';

const CASES: {
  icon: LucideIcon;
  title: string;
  text: string;
  color: string;
  chat: [from: 'c' | 'b', line: string][];
}[] = [
  {
    icon: Headphones,
    title: 'Intelligent Customer Support',
    text: 'Answers from your policies and FAQs, in your voice.',
    color: '#5B5CE2',
    chat: [
      ['c', 'Can I return this if it doesn’t fit?'],
      ['b', 'Yes, within 7 days if it’s unused. Want the return steps?'],
    ],
  },
  {
    icon: Gift,
    title: 'Product Recommendations',
    text: 'Suggests items from your catalog that match the question.',
    color: '#0EA5A4',
    chat: [
      ['c', 'Something for a small living room?'],
      ['b', 'The 2-seater Linen Sofa fits well. I can share colours.'],
    ],
  },
  {
    icon: ClipboardCheck,
    title: 'Order & Purchase Assistance',
    text: 'Helps a customer reach the order, with your team in control.',
    color: '#D97706',
    chat: [
      ['c', 'I’ll take the grey one.'],
      ['b', 'Great. I’ll prepare the order details for my teammate to confirm.'],
    ],
  },
  {
    icon: UserSearch,
    title: 'Lead Qualification',
    text: 'Asks the questions your team would ask, then hands over.',
    color: '#C026D3',
    chat: [
      ['c', 'Do you do bulk orders for offices?'],
      ['b', 'We do. How many pieces, and by when? I’ll pass this to sales.'],
    ],
  },
];

export function UseCases() {
  return (
    <section aria-labelledby="uc-h" className="bg-white py-20 sm:py-28">
      <div className={wrap}>
        <Reveal className="max-w-[680px]">
          <p className={eyebrow}>Real business use cases</p>
          <h2 id="uc-h" className={h2}>
            Built for the conversations you already have.
          </h2>
        </Reveal>
        <ul className="m-0 mt-12 grid list-none gap-5 p-0 md:grid-cols-2">
          {CASES.map((c, i) => (
            <Reveal as="li" key={c.title} delay={(i % 2) * 90}>
              <article className="group h-full rounded-[28px] border border-[#E6E6F8] bg-[linear-gradient(180deg,#FFFFFF,#F9F9FF)] p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-[#C9C9F0] hover:shadow-[0_26px_60px_-34px_rgba(60,60,160,0.55)] motion-reduce:transition-none motion-reduce:hover:transform-none">
                <div className="flex items-start gap-3.5">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: `${c.color}1A`, color: c.color }}
                  >
                    <c.icon size={21} aria-hidden />
                  </span>
                  <div>
                    <h3 className="m-0 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[#0F1033]">
                      {c.title}
                    </h3>
                    <p className="m-0 mt-1 text-[14px] leading-snug text-[#4A4D6A]">{c.text}</p>
                  </div>
                </div>
                <div
                  className="mt-5 flex flex-col gap-2 rounded-2xl bg-white/80 p-3.5"
                  aria-label="Example conversation"
                >
                  {c.chat.map(([f, line], j) => (
                    <p
                      key={j}
                      style={{ transitionDelay: `${j * 120}ms` }}
                      className={
                        f === 'c'
                          ? 'm-0 max-w-[82%] self-start rounded-2xl rounded-bl-md bg-[#EEF0F7] px-3.5 py-2 text-[13.5px] leading-snug text-[#1A1B4B] transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none'
                          : 'm-0 max-w-[88%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13.5px] leading-snug text-white transition-transform duration-300 group-hover:-translate-x-0.5 motion-reduce:transition-none'
                      }
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
        <p className="m-0 mt-5 text-xs text-[#8A8DAA]">
          Illustrative conversations with sample details, not recorded customer chats.
        </p>
      </div>
    </section>
  );
}
