import type { Step, Transaction } from "../types/state";
import type { ViewState } from "../types/view";
import type { CommandSchema } from "./schema";

/** Commands only read a snapshot and append to their owning chain's transaction. */
export interface CommandPort {
  getState(): ViewState;
  allowsChild?: (parentType: string, childType: string) => boolean;
  schema: CommandSchema;
  append(...steps: Step[]): void;
  select(selection: Transaction["selection"]): void;
}
