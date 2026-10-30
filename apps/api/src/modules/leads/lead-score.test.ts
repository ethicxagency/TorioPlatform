import { describe, expect, it } from 'vitest';
import { computeLeadScore } from './lead-score';

describe('computeLeadScore (rules-v1)', () => {
  it('is 0 for a bare new lead', () => expect(computeLeadScore({ stage: 'NEW' })).toBe(0));
  it('adds points for completeness', () => {
    expect(computeLeadScore({ stage: 'NEW', email: 'a@b.co', phone: '+8801700000000' })).toBe(30);
  });
  it('rewards advanced stages', () => {
    expect(computeLeadScore({ stage: 'QUALIFIED', email: 'a@b.co' })).toBe(35);
  });
  it('caps lost leads at 10', () => {
    expect(
      computeLeadScore({ stage: 'LOST', email: 'a@b.co', phone: '+8801700000000', company: 'X' }),
    ).toBe(10);
  });
  it('never exceeds 100', () => {
    expect(
      computeLeadScore({
        stage: 'WON',
        email: 'a',
        phone: 'b',
        company: 'c',
        jobTitle: 'd',
        dealValue: 5,
        customerId: 'x',
      }),
    ).toBe(100);
  });
});
