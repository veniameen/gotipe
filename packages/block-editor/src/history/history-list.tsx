import type { I18n } from "@gotipe/i18n";
import type React from "react";
import { useRef } from "react";
import { PageIcon } from "../page/icons";
import { type HistoryRow, dayLabel, groupByDay, initials, timeLabel } from "./history-model";

export interface HistoryListProps {
  i18n: I18n;
  rows: HistoryRow[];
  selected: string;
  now: Date;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelect(id: string): void;
  onClose?: () => void;
  /** The list of a row's label: the name, «Текущая» or «Автосохранение». */
  nameOf(row: HistoryRow): string;
  listRef: React.RefObject<HTMLDivElement | null>;
}

/** Words added and removed: green and red, a side that is zero is left out. */
export function WordStat({ i18n, row }: { i18n: I18n; row: HistoryRow }) {
  const { added, removed } = row.words;
  if (!added && !removed) return <span className="gotipe-diff-stat" />;
  return (
    <span
      className="gotipe-diff-stat"
      role="img"
      aria-label={i18n.t("history.words", { added, removed })}
    >
      {added ? <span className="is-add">+{added}</span> : null}
      {added && removed ? " " : null}
      {removed ? <span className="is-del">−{removed}</span> : null}
    </span>
  );
}

/**
 * The panel of versions (GoTipe Atlas, frame 30): days, then versions — name, words added and
 * removed, the author and the time. Arrows, Home and End move along the list; Enter chooses.
 */
export function HistoryList({
  i18n,
  rows,
  selected,
  now,
  loading,
  error,
  onRetry,
  onSelect,
  onClose,
  nameOf,
  listRef,
}: HistoryListProps) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const keys = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    const row = rows[index];
    if (!row) return;
    let next = index;
    if (event.key === "ArrowDown") next = Math.min(rows.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = rows.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(row.id);
      return;
    } else return;
    event.preventDefault();
    rowRefs.current.get(rows[next]!.id)?.focus();
  };
  const days = groupByDay(rows);
  const words = { today: i18n.t("history.today"), yesterday: i18n.t("history.yesterday") };
  const focusable = rows.some((row) => row.id === selected) ? selected : rows[0]?.id;
  let position = -1;
  return (
    <aside className="gotipe-panel" aria-label={i18n.t("history.title")}>
      <div className="gotipe-panel-head">
        <h2 className="gotipe-panel-title">{i18n.t("history.title")}</h2>
        <span className="gotipe-tool-spacer" />
        {onClose ? (
          <button
            type="button"
            className="gotipe-review-icon-btn"
            aria-label={i18n.t("history.close")}
            title={i18n.t("history.close")}
            onClick={onClose}
          >
            <PageIcon name="close" />
          </button>
        ) : null}
      </div>
      {loading ? (
        <p className="gotipe-history-note" role="status" aria-busy="true">
          {i18n.t("history.loading")}
        </p>
      ) : error ? (
        <div className="gotipe-history-note is-error" role="alert">
          <p>{error || i18n.t("history.loadFailed")}</p>
          {onRetry ? (
            <button type="button" className="gotipe-btn" onClick={onRetry}>
              {i18n.t("history.retry")}
            </button>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <p className="gotipe-history-note">{i18n.t("history.empty")}</p>
      ) : (
        <div
          ref={listRef}
          className="gotipe-history-list"
          role="listbox"
          aria-label={i18n.t("history.list")}
        >
          {days.map((day) => (
            <div
              key={day.key}
              role="group"
              aria-label={dayLabel(day.date, now, i18n.locale, words)}
            >
              <p className="gotipe-history-day" aria-hidden="true">
                {dayLabel(day.date, now, i18n.locale, words)}
              </p>
              {day.rows.map((row) => {
                position++;
                const index = position;
                const current = row.id === selected;
                return (
                  <div
                    key={row.id}
                    ref={(element) => {
                      if (element) rowRefs.current.set(row.id, element);
                      else rowRefs.current.delete(row.id);
                    }}
                    role="option"
                    aria-selected={current}
                    tabIndex={row.id === focusable ? 0 : -1}
                    data-version-id={row.id}
                    className={`gotipe-history-item${current ? " is-current" : ""}`}
                    onClick={() => onSelect(row.id)}
                    onKeyDown={(event) => keys(event, index)}
                  >
                    <span className="gotipe-version-name">{nameOf(row)}</span>
                    <WordStat i18n={i18n} row={row} />
                    <span className="gotipe-version-meta">
                      {row.author ? (
                        <span className="gotipe-avatar" data-person={row.person} aria-hidden="true">
                          {initials(row.author)}
                        </span>
                      ) : null}
                      <time dateTime={row.time.toISOString()}>
                        {timeLabel(row.time, i18n.locale)}
                      </time>
                      {row.author ? ` · ${row.author}` : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
