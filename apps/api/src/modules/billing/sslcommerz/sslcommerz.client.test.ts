import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { judge, readValidation, verifyIpnSignature } from './sslcommerz.client';
import { addTerm } from './sslcommerz.service';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');
const exp = { tranId: 'TORIO-ABC', amountMinor: 450_000, currency: 'BDT' };
const ok = {
  status: 'VALID',
  tran_id: 'TORIO-ABC',
  store_id: 'st1',
  amount: '4500.00',
  currency_type: 'BDT',
  currency_amount: '4500.00',
  risk_level: '0',
};

describe('payment validation verdict', () => {
  it('accepts exactly the payment Torio created, whether the gateway says VALID or VALIDATED', () => {
    expect(judge(readValidation(ok), exp, 'st1')).toEqual({ ok: true });
    expect(judge(readValidation({ ...ok, status: 'VALIDATED' }), exp, 'st1')).toEqual({ ok: true });
  });
  it('refuses anything that differs: status, id, store, currency, amount (including a cent), and flags risk', () => {
    const bad = (over: object) => judge(readValidation({ ...ok, ...over }), exp, 'st1');
    expect(bad({ status: 'INVALID_TRANSACTION' })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(bad({ status: 'FAILED' })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(bad({ tran_id: 'TORIO-OTHER' })).toMatchObject({ ok: false, kind: 'mismatch' });
    expect(bad({ store_id: 'other' })).toMatchObject({ ok: false, kind: 'mismatch' });
    expect(bad({ currency_type: 'USD' })).toMatchObject({ ok: false, kind: 'mismatch' });
    expect(bad({ currency_amount: '4499.99' })).toMatchObject({ ok: false, kind: 'mismatch' });
    expect(bad({ currency_amount: 'abc' })).toMatchObject({ ok: false, kind: 'mismatch' });
    expect(bad({ risk_level: '1' })).toMatchObject({ ok: false, kind: 'risk' });
  });
  it('keeps no card number or personal field from the gateway answer', () => {
    const v = readValidation({
      ...ok,
      card_no: '4111XXXXXXXX1111',
      cus_email: 'a@b.co',
      card_type: 'VISA',
    });
    expect(JSON.stringify(v.raw)).not.toMatch(/4111|a@b\.co/);
    expect(v.method).toBe('VISA');
  });
});

describe('IPN signature', () => {
  const body = (key: string, sign?: string): Record<string, string> => ({
    tran_id: 'T1',
    status: 'VALID',
    val_id: 'V1',
    verify_key: 'status,tran_id,val_id',
    verify_sign: sign ?? md5(`status=VALID&store_passwd=${md5(key)}&tran_id=T1&val_id=V1`),
  });
  it('verifies the documented scheme with the store password, and rejects a wrong password, a changed field or a missing signature', () => {
    expect(verifyIpnSignature(body('pw'), 'pw')).toBe(true);
    expect(verifyIpnSignature(body('pw'), 'other')).toBe(false);
    expect(verifyIpnSignature({ ...body('pw'), status: 'FAILED' }, 'pw')).toBe(false);
    expect(verifyIpnSignature({ tran_id: 'T1' }, 'pw')).toBe(false);
    expect(verifyIpnSignature(body('pw', 'zz'), 'pw')).toBe(false);
  });
});

describe('term length', () => {
  it('adds one calendar month or year, in UTC', () => {
    expect(addTerm(new Date('2026-01-31T10:00:00Z'), 'MONTH').toISOString().slice(0, 7)).toMatch(
      /2026-0[23]/,
    );
    expect(addTerm(new Date('2026-11-14T10:00:00Z'), 'MONTH').toISOString().slice(0, 10)).toBe(
      '2026-12-14',
    );
    expect(addTerm(new Date('2026-11-14T10:00:00Z'), 'YEAR').toISOString().slice(0, 10)).toBe(
      '2027-11-14',
    );
  });
});
