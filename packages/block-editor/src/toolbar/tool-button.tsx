import { type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { useId } from "react";
import { ariaKeys } from "../components/formatting/keys";
import { Tip } from "../components/formatting/tip";
import { PageIcon, type PageIconName } from "../page/icons";

type Chain = ReturnType<GoTipeEditor["chain"]>;

/**
 * Runs a command on the editor's selection and gives the keys back to the text. A command that
 * changes nothing does nothing; one that fails is reported, not swallowed.
 */
export function runTool(editor: GoTipeEditor, command: (chain: Chain) => void): void {
  if (!editor.isEditable || editor.isDestroyed) return;
  try {
    const chain = editor.chain().focus();
    command(chain);
    chain.run();
  } catch (failure) {
    editor.reportError(
      new GoTipeError("TRANSFORM_ERROR", failure instanceof Error ? failure.message : String(failure)),
    );
  }
}

export interface ToolButtonProps {
  icon: PageIconName;
  /** The accessible name and the tooltip. */
  label: string;
  /** The bound key: shown in the tooltip and as aria-keyshortcuts. */
  binding?: string;
  /** For a switch: whether it is on (aria-pressed). */
  pressed?: boolean;
  /** Why it can't act now: the button stays focusable, the tooltip says why. */
  reason?: string | null;
  onRun: () => void;
  /** Marks the button for hosts and tests, e.g. `data-mark="bold"`. */
  data?: Record<`data-${string}`, string>;
}

/**
 * A square tool of the fixed toolbar (Atlas frame 31). It never takes the focus from the text on
 * press, so the selection it acts on stays where it was.
 */
export function ToolButton({ icon, label, binding, pressed, reason, onRun, data }: ToolButtonProps) {
  const tip = useId();
  return (
    <button
      type="button"
      className="gotipe-format-tool"
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={binding ? ariaKeys(binding) : undefined}
      aria-disabled={reason ? true : undefined}
      aria-describedby={reason ? tip : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!reason) onRun();
      }}
      {...data}
    >
      <PageIcon name={icon} />
      <Tip id={tip} label={reason ?? label} binding={reason ? undefined : binding} />
    </button>
  );
}
