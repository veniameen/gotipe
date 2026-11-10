import type { Step, Transaction } from "../types/state";
import type { ViewState } from "../types/view";

/** Commands only read a snapshot and append to their owning chain's transaction. */
export interface CommandPort {
  getState(): ViewState;
  allowsChild?: (parentType: string, childType: string) => boolean;
  append(...steps: Step[]): void;
  select(selection: Transaction["selection"]): void;
}
