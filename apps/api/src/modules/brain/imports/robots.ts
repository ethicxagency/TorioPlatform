export interface Robots {
  allowed(path: string): boolean;
  /** Seconds between requests the site asked for, if any. */
  crawlDelay: number | null;
}

const ALLOW_ALL: Robots = { allowed: () => true, crawlDelay: null };

/**
 * A small robots.txt reader: the group for our own user agent wins over `*`, the longest matching rule wins, and Allow
 * beats Disallow on a tie. An empty or unreadable file allows everything, as the standard says.
 */
export function parseRobots(text: string, agent = 'toriobot'): Robots {
  const groups: {
    agents: string[];
    rules: { allow: boolean; path: string }[];
    delay: number | null;
  }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1]!.toLowerCase();
    const v = m[2]!.trim();
    if (k === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [], delay: null };
        groups.push(cur);
      }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === 'allow' || k === 'disallow') {
      if (v) cur.rules.push({ allow: k === 'allow', path: v });
    } else if (k === 'crawl-delay') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) cur.delay = n;
    }
  }
  const mine =
    groups.find((g) => g.agents.some((a) => a !== '*' && agent.startsWith(a))) ??
    groups.find((g) => g.agents.includes('*'));
  if (!mine) return ALLOW_ALL;
  const toRe = (p: string) =>
    new RegExp(
      '^' +
        p
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\\\$$/, '$'),
    );
  const rules = mine.rules.map((r) => ({ ...r, re: toRe(r.path), len: r.path.length }));
  return {
    crawlDelay: mine.delay,
    allowed(path) {
      let best: { allow: boolean; len: number } | null = null;
      for (const r of rules)
        if (r.re.test(path) && (!best || r.len > best.len || (r.len === best.len && r.allow)))
          best = { allow: r.allow, len: r.len };
      return best ? best.allow : true;
    },
  };
}
