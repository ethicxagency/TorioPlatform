/**
 * A small per-provider circuit breaker, kept in process memory. After `threshold` failures in a row the provider is skipped for
 * `coolMs`, so a provider that is down is not hit (and billed, and waited on) by every request. One probe is allowed after the
 * cool-down; its outcome closes or re-opens the circuit. It is a protection, not a record: provider health shown to admins comes
 * from stored checks and calls.
 */
export class CircuitBreaker {
  private readonly state = new Map<string, { fails: number; openUntil: number }>();
  constructor(
    private readonly threshold = 5,
    private readonly coolMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const s = this.state.get(key);
    return !s || s.openUntil <= this.now();
  }
  success(key: string) {
    this.state.delete(key);
  }
  failure(key: string) {
    const s = this.state.get(key) ?? { fails: 0, openUntil: 0 };
    s.fails += 1;
    if (s.fails >= this.threshold) s.openUntil = this.now() + this.coolMs;
    this.state.set(key, s);
  }
  isOpen(key: string) {
    return !this.allow(key);
  }
}
