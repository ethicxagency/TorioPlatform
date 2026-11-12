import { describe, expect, it } from 'vitest';
import { parseRobots } from './robots';

describe('parseRobots', () => {
  it('allows everything when there is no usable file', () => {
    expect(parseRobots('').allowed('/anything')).toBe(true);
    expect(parseRobots('garbage').allowed('/x')).toBe(true);
  });
  it('applies the * group, longest match wins, Allow beats Disallow on a tie', () => {
    const r = parseRobots(
      'User-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /tmp$\nCrawl-delay: 2',
    );
    expect(r.allowed('/shop')).toBe(true);
    expect(r.allowed('/private/data')).toBe(false);
    expect(r.allowed('/private/open/page')).toBe(true);
    expect(r.allowed('/tmp')).toBe(false);
    expect(r.allowed('/tmp/x')).toBe(true);
    expect(r.crawlDelay).toBe(2);
  });
  it('prefers a group for our own agent over *', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: TorioBot\nAllow: /');
    expect(r.allowed('/page')).toBe(true);
    expect(parseRobots('User-agent: *\nDisallow: /').allowed('/page')).toBe(false);
  });
  it('supports wildcards', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /search?*');
    expect(r.allowed('/a/b.pdf')).toBe(false);
    expect(r.allowed('/a/b.pdf.html')).toBe(true);
    expect(r.allowed('/search?q=1')).toBe(false);
  });
});
