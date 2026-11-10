import { GoTipeError } from "../error";
import type { TransactionContext, TransactionFilter } from "../types/state";

/** Filters own no state; each receives detached snapshots and cannot nest dispatch. */
export function createTransactionFilters() {
  const filters = new Set<TransactionFilter>();
  let running = false;
  return {
    assertIdle(): void {
      if (running)
        throw new GoTipeError(
          "TRANSFORM_ERROR",
          "A transaction filter cannot dispatch another transaction",
        );
    },
    get size() {
      return filters.size;
    },
    add(filter: TransactionFilter): () => void {
      filters.add(filter);
      return () => filters.delete(filter);
    },
    check(context: TransactionContext): boolean {
      if (running)
        throw new GoTipeError(
          "TRANSFORM_ERROR",
          "A transaction filter cannot dispatch another transaction",
        );
      running = true;
      try {
        for (const filter of filters) if (!filter(structuredClone(context))) return false;
        return true;
      } finally {
        running = false;
      }
    },
    clear(): void {
      filters.clear();
    },
  };
}
