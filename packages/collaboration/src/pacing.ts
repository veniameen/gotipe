/**
 * Paces update frames. A burst of typing becomes at most one frame per `spacing`
 * ms; a token bucket then bounds any minute to `burst + 60 * perSecond` frames
 * (300 by default). With presence, at most 10 messages a second, a connection
 * stays under Cloud's default `RATE_LIMIT_WS` of 1000 messages a minute.
 */
export class FramePacer {
  private tokens: number;
  private refilled = 0;
  private sent = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly burst = 60,
    private readonly perSecond = 4,
    private readonly spacing = 50,
  ) {
    this.tokens = burst;
  }

  /** Milliseconds until a frame may leave; 0 means now. A backlog skips the spacing. */
  delay(now: number, backlog = false): number {
    this.refill(now);
    const token = this.tokens >= 1 ? 0 : ((1 - this.tokens) * 1000) / this.perSecond;
    const spacing = backlog ? 0 : this.sent + this.spacing - now;
    // The epsilon absorbs the rounding of fractional tokens.
    return Math.max(0, Math.ceil(Math.max(token, spacing) - 1e-6));
  }

  /** Records a frame that left at `now`. */
  spend(now: number): void {
    this.refill(now);
    this.tokens -= 1;
    this.sent = now;
  }

  private refill(now: number): void {
    const elapsed = Math.max(0, now - this.refilled);
    this.tokens = Math.min(this.burst, this.tokens + (elapsed * this.perSecond) / 1000);
    this.refilled = now;
  }
}
