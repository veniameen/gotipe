"use client";

import { Icon } from "@/components/site/icon";
import { SEARCH_INDEX_URL } from "@/lib/docs/paths";
import {
  type Range,
  type SearchEntry,
  type SearchGroup,
  type SearchHit,
  search,
} from "@/lib/docs/search-rank";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

type Index = { state: "idle" | "loading" | "failed" } | { state: "ready"; entries: SearchEntry[] };

const SearchContext = createContext<(opener: HTMLElement | null) => void>(() => {});

/** The index, fetched once on the first opening and kept for the visit. */
let indexRequest: Promise<SearchEntry[]> | null = null;
function loadIndex(): Promise<SearchEntry[]> {
  indexRequest ??= fetch(SEARCH_INDEX_URL).then((response) => {
    if (!response.ok) throw new Error(`search index: HTTP ${response.status}`);
    return response.json() as Promise<SearchEntry[]>;
  });
  indexRequest.catch(() => {
    indexRequest = null;
  });
  return indexRequest;
}

/** Holds the search dialog of the docs; ⌘K or Ctrl+K opens it from anywhere on the page. */
export function SearchRoot({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const isOpen = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const show = useCallback((from: HTMLElement | null) => {
    if (isOpen.current) return;
    isOpen.current = true;
    opener.current = from ?? (document.activeElement as HTMLElement | null);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    isOpen.current = false;
    setOpen(false);
  }, []);

  // focus goes back once the modal is gone: while it is open, the page behind it is inert
  useEffect(() => {
    if (open) return;
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) target.focus();
  }, [open]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "k")
        return;
      // an editor on the page (a live demo) owns its own shortcuts, Mod+K among them
      const target = event.target instanceof Element ? event.target : null;
      if (event.defaultPrevented || target?.closest("[contenteditable], .site-demo")) return;
      event.preventDefault();
      show(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  return (
    <SearchContext.Provider value={show}>
      {children}
      {open && <SearchDialog onClose={close} />}
    </SearchContext.Provider>
  );
}

/** The field of the head on wide screens: a button that opens the dialog. */
export function SearchField() {
  const open = useContext(SearchContext);
  return (
    <button
      type="button"
      className="site-search"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={(event) => open(event.currentTarget)}
    >
      <Icon name="search" />
      Search docs
      <span className="site-kbd" aria-hidden="true">
        ⌘K
      </span>
    </button>
  );
}

/** The icon button of phones. */
export function SearchButton() {
  const open = useContext(SearchContext);
  return (
    <button
      type="button"
      className="site-button is-quiet site-head-button is-icon site-search-button"
      aria-label="Search docs"
      aria-haspopup="dialog"
      onClick={(event) => open(event.currentTarget)}
    >
      <Icon name="search" />
    </button>
  );
}

function Marked({ text, ranges }: { text: string; ranges: Range[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const id = useId();
  const [index, setIndex] = useState<Index>({ state: "loading" });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    let alive = true;
    loadIndex().then(
      (entries) => alive && setIndex({ state: "ready", entries }),
      () => alive && setIndex({ state: "failed" }),
    );
    return () => {
      alive = false;
      if (element.open) element.close();
    };
  }, []);

  const groups: SearchGroup[] = useMemo(
    () => (index.state === "ready" ? search(index.entries, query) : []),
    [index, query],
  );
  const hits: SearchHit[] = useMemo(() => groups.flatMap((group) => group.hits), [groups]);
  const current = Math.min(active, Math.max(hits.length - 1, 0));
  const optionId = (n: number) => `${id}-option-${n}`;

  useEffect(() => {
    list.current
      ?.querySelector(`[id="${CSS.escape(optionId(current))}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });

  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    onClose();
    router.push(hit.entry.u);
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!hits.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(hits[current]);
    } else if (event.key === "Escape") {
      // a search field clears itself on Escape; here Escape closes the dialog, as its foot says
      event.preventDefault();
      onClose();
    }
  };

  let n = -1;
  const status =
    index.state === "failed"
      ? "Search is unavailable right now."
      : index.state !== "ready"
        ? "Loading the index…"
        : query.trim() && !hits.length
          ? `Nothing found for “${query.trim()}”.`
          : "";

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the backdrop closes for the pointer; the dialog's own Escape serves the keyboard
    <dialog
      ref={dialog}
      className="site-dialog"
      aria-label="Search the documentation"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="site-dialog-input">
        <Icon name="search" />
        <input
          type="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={hits.length ? optionId(current) : undefined}
          aria-autocomplete="list"
          aria-label="Search docs"
          placeholder="Search docs"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        <button
          type="button"
          className="site-kbd site-dialog-close"
          aria-label="Close search"
          onClick={onClose}
        >
          <span aria-hidden="true">esc</span>
        </button>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a combobox's listbox of rich options (title and line); <select> cannot hold them */}
      {/* biome-ignore lint/a11y/useFocusableInteractive: the combobox's input keeps focus and points into the list (aria-activedescendant) */}
      <div
        role="listbox"
        ref={list}
        id={`${id}-list`}
        className="site-results"
        aria-label="Results"
      >
        {groups.map((group, groupIndex) => (
          // biome-ignore lint/a11y/useSemanticElements: a group of listbox options; <fieldset> is for form controls
          <div key={group.section} role="group" aria-labelledby={`${id}-group-${groupIndex}`}>
            <p className="site-results-title" id={`${id}-group-${groupIndex}`} role="presentation">
              {group.section}
            </p>
            {group.hits.map((hit) => {
              n += 1;
              const mine = n;
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the input owns the keyboard (combobox, aria-activedescendant)
                // biome-ignore lint/a11y/useFocusableInteractive: options are reached through aria-activedescendant, focus stays in the input
                // biome-ignore lint/a11y/useSemanticElements: a rich option of a combobox's listbox; <option> holds text only
                <div
                  role="option"
                  key={hit.entry.u}
                  id={optionId(mine)}
                  tabIndex={-1}
                  aria-selected={mine === current}
                  className={`site-result${mine === current ? " is-active" : ""}`}
                  onMouseMove={() => mine !== current && setActive(mine)}
                  onClick={() => go(hit)}
                >
                  <Icon name={hit.entry.k === "page" ? "page" : "hash"} />
                  <span className="site-result-text">
                    <Marked text={hit.entry.t} ranges={hit.titleRanges} />
                    <small>
                      <Marked text={hit.detail} ranges={hit.detailRanges} />
                    </small>
                  </span>
                  {mine === current && (
                    <span className="site-kbd site-result-go" aria-hidden="true">
                      ↵
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <output className="site-results-status">{status}</output>
      <div className="site-dialog-foot" aria-hidden="true">
        <span>
          <span className="site-kbd">↑</span>
          <span className="site-kbd">↓</span> move
        </span>
        <span>
          <span className="site-kbd">↵</span> open
        </span>
        <span>
          <span className="site-kbd">esc</span> close
        </span>
      </div>
    </dialog>
  );
}
