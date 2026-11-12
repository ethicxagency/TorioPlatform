import { describe, expect, it } from 'vitest';
import { statusTimes } from './order-parts';

const ev = (description: string, createdAt: string) => ({
  id: createdAt,
  type: 'status',
  description,
  actor: null,
  createdAt,
});

describe('statusTimes', () => {
  it('uses the stored moments and the status-change history, and invents nothing', () => {
    const t = statusTimes({
      createdAt: '2026-11-10T10:00:00.000Z',
      completedAt: null,
      cancelledAt: null,
      events: [
        ev('Status changed from Pending to Confirmed', '2026-11-10T11:00:00.000Z'),
        ev('Status changed from Confirmed to Processing — packed', '2026-11-10T12:00:00.000Z'),
        { ...ev('Payment recorded', '2026-11-10T13:00:00.000Z'), type: 'payment' },
      ],
    });
    expect(t).toEqual({
      PENDING: '2026-11-10T10:00:00.000Z',
      CONFIRMED: '2026-11-10T11:00:00.000Z',
      PROCESSING: '2026-11-10T12:00:00.000Z',
    });
  });
  it('prefers the order’s own completed and cancelled times', () => {
    const t = statusTimes({
      createdAt: 'a',
      completedAt: '2026-11-11T00:00:00.000Z',
      cancelledAt: null,
      events: [ev('Status changed from Processing to Completed', '2026-11-10T00:00:00.000Z')],
    });
    expect(t.COMPLETED).toBe('2026-11-11T00:00:00.000Z');
  });
  it('keeps the latest entry when a status was reached more than once', () => {
    const t = statusTimes({
      createdAt: 'a',
      completedAt: null,
      cancelledAt: null,
      events: [
        ev('Status changed from Pending to Confirmed', '2026-11-10T11:00:00.000Z'),
        ev('Status changed from Pending to Confirmed', '2026-11-10T15:00:00.000Z'),
      ],
    });
    expect(t.CONFIRMED).toBe('2026-11-10T15:00:00.000Z');
  });
});
