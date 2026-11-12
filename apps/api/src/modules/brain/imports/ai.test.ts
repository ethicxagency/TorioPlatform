import { describe, expect, it } from 'vitest';
import { groundedCandidates, isGrounded, parseAnswer } from './ai';

const pages = [
  {
    url: 'https://a.test/faq',
    text: 'We deliver nationwide within three working days. Cash on delivery is available for all orders.',
  },
];

describe('AI grounding', () => {
  it('keeps entries the page supports and drops invented ones or ones citing an unknown page', () => {
    const a = parseAnswer(
      'Here: ' +
        JSON.stringify({
          business: null,
          faqs: [
            {
              q: 'Do you deliver nationwide?',
              a: 'We deliver nationwide within three working days.',
              url: 'https://a.test/faq',
            },
            {
              q: 'Do you ship to Mars?',
              a: 'Rockets leave every Friday from Cape Canaveral.',
              url: 'https://a.test/faq',
            },
            {
              q: 'Cash on delivery?',
              a: 'Cash on delivery is available.',
              url: 'https://other.test/page',
            },
          ],
          policies: [],
        }),
    )!;
    const c = groundedCandidates(a, pages);
    expect(c.map((x) => x.title)).toEqual(['Do you deliver nationwide?']);
    expect(c[0]!.confidence).toBeLessThan(90);
  });
  it('rejects answers that do not match the schema', () => {
    expect(parseAnswer('no json here')).toBeNull();
    expect(parseAnswer('{"faqs":[{"q":1}]}')).toBeNull();
  });
  it('isGrounded needs most significant words present', () => {
    expect(isGrounded('nationwide delivery working days', pages[0]!.text)).toBe(true);
    expect(isGrounded('rocket launch schedule friday', pages[0]!.text)).toBe(false);
    expect(isGrounded('a b c', pages[0]!.text)).toBe(false);
  });
});
