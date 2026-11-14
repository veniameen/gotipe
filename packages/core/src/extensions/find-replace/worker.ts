import { scanText } from "./scan";

/** One regular-expression search over several texts. */
export interface ScanJob {
  source: string;
  flags: string;
  wholeWord: boolean;
  texts: string[];
}

/** The `[from, to)` pairs per text, the time budget ran out, the pattern threw, or no Worker. */
export type ScanAnswer =
  | { kind: "done"; ranges: number[][] }
  | { kind: "timeout" }
  | { kind: "error"; message: string }
  | { kind: "unavailable" };

interface Running {
  id: number;
  timeout: number;
  resolve: (answer: ScanAnswer | null) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/** How long a new Worker may take to start before searches run on the page instead. */
const STARTUP = 5000;

/** The Worker's script: the page's scanner and a message loop. */
const workerProgram = () => `"use strict";
const scan = ${scanText.toString()};
self.onmessage = (event) => {
  const job = event.data;
  try {
    const pattern = new RegExp(job.source, job.flags);
    const ranges = job.texts.map((text) => scan(text, pattern, job.wholeWord, Infinity));
    self.postMessage({ id: job.id, ranges });
  } catch (error) {
    self.postMessage({ id: job.id, error: String((error && error.message) || error) });
  }
};
self.postMessage({ ready: true });`;

/** The page can start a Worker from a Blob URL. A CSP can still refuse it; that shows later. */
export function workersAvailable(): boolean {
  return (
    typeof Worker === "function" &&
    typeof Blob === "function" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  );
}

/**
 * Runs searches one at a time in a dedicated Worker, so a pattern that backtracks without end
 * never blocks the page: when a search outlives its time budget the Worker is terminated and
 * the next search starts a new one. A newer search replaces one still waiting for its turn.
 */
export class ScanWorker {
  private worker: Worker | null = null;
  private url: string | null = null;
  private ready = false;
  private startup: ReturnType<typeof setTimeout> | undefined;
  private broken = !workersAvailable();
  private running: Running | null = null;
  private queued: { job: ScanJob; running: Running } | null = null;
  private ids = 0;

  /**
   * `false` once Workers turned out to be unavailable here; searches then run on the page.
   * Starts the Worker, so a page that refuses it synchronously is known at once.
   */
  get usable(): boolean {
    this.start();
    return !this.broken;
  }

  /** The answer, or `null` when a newer search replaced this one before it started. */
  run(job: ScanJob, timeout: number): Promise<ScanAnswer | null> {
    return new Promise((resolve) => {
      this.queued?.running.resolve(null);
      this.queued = { job, running: { id: ++this.ids, timeout, resolve } };
      this.pump();
    });
  }

  destroy(): void {
    this.stop();
    this.broken = true;
    this.settle(null);
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private pump(): void {
    if (this.running || !this.queued) return;
    const { job, running } = this.queued;
    this.queued = null;
    const worker = this.start();
    if (!worker) {
      running.resolve({ kind: "unavailable" });
      return;
    }
    this.running = running;
    if (this.ready) this.arm(running);
    worker.postMessage({ ...job, id: running.id });
  }

  /** Starts the time budget of `running`: from the moment the Worker can take it. */
  private arm(running: Running): void {
    running.timer = setTimeout(() => {
      this.stop();
      this.finish(running.id, { kind: "timeout" });
    }, running.timeout);
  }

  private finish(id: number, answer: ScanAnswer): void {
    const running = this.running;
    if (!running || running.id !== id) return;
    clearTimeout(running.timer);
    this.running = null;
    running.resolve(answer);
    this.pump();
  }

  private start(): Worker | null {
    if (this.worker || this.broken) return this.worker;
    try {
      this.url ??= URL.createObjectURL(new Blob([workerProgram()], { type: "text/javascript" }));
      const worker = new Worker(this.url);
      // A terminated Worker may still report; only the current one counts.
      worker.onmessage = (event: MessageEvent) => {
        if (this.worker === worker) this.receive(event.data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (this.worker === worker) this.fail();
      };
      worker.onmessageerror = () => {
        if (this.worker === worker) this.fail();
      };
      this.worker = worker;
      this.ready = false;
      this.startup = setTimeout(() => this.fail(), STARTUP);
      return worker;
    } catch {
      this.broken = true;
      return null;
    }
  }

  private receive(data: { ready?: true; id?: number; ranges?: number[][]; error?: string }): void {
    if (data.ready) {
      clearTimeout(this.startup);
      this.ready = true;
      if (this.running) this.arm(this.running);
    } else if (data.id !== undefined)
      this.finish(
        data.id,
        data.error !== undefined
          ? { kind: "error", message: data.error }
          : { kind: "done", ranges: data.ranges ?? [] },
      );
  }

  /** The Worker cannot run here (a CSP, a failed start): every search gets `unavailable`. */
  private fail(): void {
    this.stop();
    this.broken = true;
    this.settle({ kind: "unavailable" });
  }

  private settle(answer: ScanAnswer | null): void {
    const running = this.running;
    const queued = this.queued;
    this.running = null;
    this.queued = null;
    clearTimeout(running?.timer);
    running?.resolve(answer);
    queued?.running.resolve(answer);
  }

  private stop(): void {
    clearTimeout(this.startup);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }
}
