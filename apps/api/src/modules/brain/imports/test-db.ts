/* eslint-disable @typescript-eslint/no-explicit-any -- the in-memory table stand-in is deliberately loosely typed */
/** A tiny in-memory stand-in for the three import tables, scoped the way the real queries are. */
export function fakeDb() {
  const t = { jobs: [] as any[], sources: [] as any[], records: [] as any[], audit: [] as any[] };
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const match = (row: any, where: any): boolean =>
    Object.entries(where ?? {}).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in (v as any)) return (v as any).in.includes(row[k]);
      if (v && typeof v === 'object' && 'not' in (v as any)) return row[k] !== (v as any).not;
      return row[k] === v;
    });
  const model = (rows: any[], extra: (row: any) => void = () => undefined) => ({
    findFirst: async ({ where }: any) => rows.find((r) => match(r, where)) ?? null,
    findUnique: async ({ where }: any) => rows.find((r) => match(r, where)) ?? null,
    findMany: async ({ where }: any = {}) => rows.filter((r) => match(r, where)),
    create: async ({ data }: any) => {
      const row = { id: id(), createdAt: new Date(), status: 'QUEUED', confidence: 50, ...data };
      extra(row);
      rows.push(row);
      return row;
    },
    createMany: async ({ data }: any) => {
      for (const d of data) rows.push({ id: id(), status: 'PENDING', createdAt: new Date(), ...d });
    },
    update: async ({ where, data }: any) => {
      const r = rows.find((x) => match(x, where))!;
      Object.assign(r, data);
      return r;
    },
    updateMany: async ({ where, data }: any) => {
      const m = rows.filter((x) => match(x, where));
      m.forEach((x) => Object.assign(x, data));
      return { count: m.length };
    },
    deleteMany: async ({ where }: any) => {
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], where)) rows.splice(i, 1);
    },
    count: async ({ where }: any) => rows.filter((r) => match(r, where)).length,
    groupBy: async ({ where }: any) => {
      const m = rows.filter((r) => match(r, where));
      const cats = [...new Set(m.map((r) => r.category))];
      return cats.map((category) => ({
        category,
        _count: m.filter((r) => r.category === category).length,
      }));
    },
  });
  const client = {
    importJob: model(t.jobs),
    importSource: model(t.sources),
    importRecord: model(t.records),
    auditLog: model(t.audit),
  };
  return { t, client };
}
