/**
 * Owns `editor.batch(fn)`: every local change committed while `fn` runs is one undo step.
 * It uses the boundary the typing step uses: the first recorded change of a batch starts a
 * step (one snapshot of the local history, a new group of the native one) and every later
 * one `joins` it, as typing that goes on with its step does. The typing step ends when the
 * outermost batch starts and when it ends (`close`), so typing before and after is a step of
 * its own. A nested batch is part of the outer one. Undo, Redo and a history reset inside
 * `fn` end the group (`end`): what follows starts a new one. Only what `fn` does before it
 * returns is grouped; a change after an `await` is a step of its own.
 */
export function createUndoBatch(close: () => void) {
  let depth = 0;
  let open = false;
  return {
    run(fn: () => void): void {
      if (depth++ === 0) {
        close();
        open = false;
      }
      try {
        fn();
      } finally {
        if (--depth === 0) {
          open = false;
          close();
        }
      }
    },
    joins(): boolean {
      return depth > 0 && open;
    },
    record(): void {
      open = depth > 0;
    },
    end(): void {
      open = false;
    },
  };
}
