import type { GoTipeEditor } from "@gotipe/core";
import {
  type CharacterCountController,
  type CharacterCountState,
  getCharacterCount,
} from "@gotipe/core/extensions";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { intlLocale } from "../i18n/intl-locale";
import { useBlockEditorI18n } from "../i18n/strings";
import { paintOverLimit } from "./over-limit";

export interface StatusLineOptions {
  /**
   * The most characters the host allows. Default: the `CharacterCount` extension's `limit`. A
   * limit set only here is shown, not enforced: text past it is tinted where it stands.
   */
  limit?: number | null;
  /** Share of the limit from which the count takes the warning tone. Default 0.9. */
  warning?: number;
  /** Why the limit exists, shown over the count past it, e.g. «Release notes — up to 8 000». */
  reason?: string;
}

function useCounts(controller: CharacterCountController): CharacterCountState {
  return useSyncExternalStore(
    useCallback((notify) => controller.subscribe(notify), [controller]),
    () => controller.getState(),
    () => controller.getState(),
  );
}

/**
 * The quiet line under the document (Atlas frame 26): words and characters. Near a limit the
 * characters take the warning tone, past it the danger tone with the reason in a tooltip, and the
 * text that does not fit is tinted. Needs the `CharacterCount` extension.
 */
export function StatusLine({ editor, ...options }: StatusLineOptions & { editor: GoTipeEditor }) {
  const controller = getCharacterCount(editor);
  return controller ? <Status editor={editor} controller={controller} {...options} /> : null;
}

function Status({
  editor,
  controller,
  limit: ownLimit,
  warning = 0.9,
  reason,
}: StatusLineOptions & { editor: GoTipeEditor; controller: CharacterCountController }) {
  const i18n = useBlockEditorI18n();
  const tip = useId();
  const counts = useCounts(controller);
  const limit =
    ownLimit === undefined ? counts.limit : ownLimit === null ? null : Math.max(0, ownLimit);
  useEffect(() => paintOverLimit(editor, limit), [editor, limit]);
  const number = new Intl.NumberFormat(intlLocale(i18n.locale));
  const words = i18n.plural("status.words", counts.words, {
    count: number.format(counts.words),
  });
  const tone =
    limit === null
      ? null
      : counts.characters > limit
        ? "is-over"
        : counts.characters >= limit * warning
          ? "is-near"
          : null;
  const characters =
    limit === null || tone === null
      ? i18n.plural("status.characters", counts.characters, {
          count: number.format(counts.characters),
        })
      : i18n.plural("status.charactersOf", limit, {
          count: number.format(counts.characters),
          limit: number.format(limit),
        });
  const why =
    tone === "is-over" && limit !== null
      ? (reason ?? i18n.plural("status.limit", limit, { limit: number.format(limit) }))
      : null;
  // Screen readers hear the count when its tone changes (near, past, back), not every keystroke.
  const [announced, setAnnounced] = useState("");
  const toneSeen = useRef(tone);
  useEffect(() => {
    if (toneSeen.current === tone) return;
    toneSeen.current = tone;
    setAnnounced(tone ? [characters, why].filter(Boolean).join(". ") : "");
  }, [tone, characters, why]);
  return (
    <footer className="gotipe-status" aria-label={i18n.t("status.label")}>
      <span className="gotipe-status-part">{words}</span>
      <span className="gotipe-status-sep" aria-hidden="true">
        {" · "}
      </span>
      <span
        className={`gotipe-status-part${tone ? ` ${tone}` : ""}`}
        tabIndex={why ? 0 : undefined}
        aria-describedby={why ? tip : undefined}
      >
        {characters}
        {why && (
          <span id={tip} className="gotipe-tip gotipe-status-tip" role="tooltip">
            {why}
          </span>
        )}
      </span>
      <span className="gotipe-sr-only" role="status">
        {announced}
      </span>
    </footer>
  );
}
