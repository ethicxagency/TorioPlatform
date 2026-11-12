import { describe, expect, it } from 'vitest';
import { feedCreateSchema, feedPreviewRequestSchema, resolveProductSchema } from './brain-imports';

describe('import request schemas', () => {
  it('accept a partial field mapping (only the columns the person changed)', () => {
    expect(feedPreviewRequestSchema.safeParse({ url: 'https://a.test/f.xml', mapping: { price: 'cost' } }).success).toBe(true);
    expect(feedCreateSchema.safeParse({ url: 'https://a.test/f.xml', name: 'Feed', mapping: { name: 'title' } }).success).toBe(true);
    expect(feedPreviewRequestSchema.safeParse({ url: 'https://a.test/f.xml', mapping: { nope: 'x' } }).success).toBe(false);
  });
  it('resolve: fields are optional per field, limited to known fields, and the winner may be null', () => {
    const id = '9d0f0000-0000-4000-8000-000000000001';
    expect(resolveProductSchema.safeParse({ recordIds: [id], winnerId: null }).data).toMatchObject({ fields: {}, updateBrain: false });
    expect(resolveProductSchema.safeParse({ recordIds: [id], winnerId: id, fields: { price: 'brain' } }).success).toBe(true);
    expect(resolveProductSchema.safeParse({ recordIds: [id], winnerId: id, fields: { colour: 'x' } }).success).toBe(false);
    expect(resolveProductSchema.safeParse({ recordIds: [], winnerId: null }).success).toBe(false);
  });
});
