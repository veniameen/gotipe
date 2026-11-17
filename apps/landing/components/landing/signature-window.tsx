"use client";

import { type ReactNode, useId, useState } from "react";
import { Icon } from "../site/icon";
import { type SourcePiece, piecesOf } from "./markdown-lines";

export interface SignatureWindowProps {
  /** The lines of the Markdown file, as the writer produced them. */
  lines: string[];
  /** Lines of the block the caret is in (0-based). */
  current?: ReadonlySet<number>;
  /** «12 lines in · 12 lines out · 0 rewritten» */
  summary: string;
  /** Whether the document pane is the live editor (the status reads «Synced») or its picture. */
  live: boolean;
  /** The source pane takes typing (the live window); without it the pane only shows the lines. */
  source?: SourceInput;
  /** The document pane. */
  children: ReactNode;
}

/** The source pane as a field: the file's text and what the person does in it. */
export interface SourceInput {
  /** The file as the field shows it: its final line break is the end of the last line. */
  value: string;
  /** The person typed: the field's new text. */
  onInput(value: string): void;
  /** The caret moved (or the field took the focus): the field's text and the caret's offset. */
  onCaret(value: string, offset: number): void;
  onFocus(): void;
  onBlur(): void;
}

type Pane = "document" | "source";

function Piece({ piece }: { piece: SourcePiece }) {
  return piece.mark ? <span className="is-mark">{piece.text}</span> : <>{piece.text}</>;
}

/**
 * The window of the first stage (Atlas frame 20): the Markdown source with line numbers on the
 * left, the document on the right, the count of lines under both. A phone has room for one pane:
 * a switch over them shows the document or its source (`data-pane`), both stay in the page.
 *
 * The live source is a field over its own picture: the numbered, coloured lines lie beneath a
 * text field with the same type and wrapping, whose text is clear, so the person sees the colours
 * and types into the field (its caret and selection).
 */
export function SignatureWindow({
  lines,
  current,
  summary,
  live,
  source,
  children,
}: SignatureWindowProps) {
  const [pane, setPane] = useState<Pane>("document");
  const ids = useId();
  const tab = (value: Pane, label: string) => (
    <button
      type="button"
      className="site-pane-tab"
      aria-pressed={pane === value}
      aria-controls={`${ids}-${value}`}
      onClick={() => setPane(value)}
    >
      {label}
    </button>
  );
  return (
    <figure className="site-window" aria-label="Markdown source and the document it becomes">
      <div className="site-window-bar">
        <span className="site-window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <Icon name="page" />
        <span className="site-window-path">
          <span className="site-window-trail">
            Workspace<span aria-hidden="true">/</span>
          </span>
          <strong>Launch notes</strong>
        </span>
        <span className="site-window-end">
          <span className="site-tag">notes.md</span>
          <span className="gotipe-avatars" aria-hidden="true">
            <span className="gotipe-avatar" data-person="2">
              M
            </span>
            <span className="gotipe-avatar" data-person="1">
              J
            </span>
          </span>
        </span>
      </div>
      <fieldset className="site-pane-tabs">
        <legend className="site-sr">Pane</legend>
        {tab("document", "Document")}
        {tab("source", "Markdown")}
      </fieldset>
      <div className="site-split" data-pane={pane}>
        <section id={`${ids}-source`} className="site-src" aria-label="Markdown source">
          <p className="site-pane-head">
            <span>Markdown source</span>
            <span>.md</span>
          </p>
          <div className="site-src-code">
            <ol
              className="site-src-lines"
              aria-label={source ? undefined : "Markdown source lines"}
              aria-hidden={source ? true : undefined}
            >
              {lines.map((line, index) => (
                <li
                  // a line's place is its identity: the pane shows the file line by line
                  key={index}
                  className={current?.has(index) ? "is-current" : undefined}
                >
                  {line && (
                    <code>
                      {piecesOf(line).map((piece, at) => (
                        <Piece key={at} piece={piece} />
                      ))}
                    </code>
                  )}
                </li>
              ))}
            </ol>
            {source && (
              <textarea
                className="site-src-input"
                aria-label="Markdown"
                value={source.value}
                rows={1}
                wrap="soft"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                onChange={(event) => source.onInput(event.currentTarget.value)}
                onSelect={(event) =>
                  source.onCaret(event.currentTarget.value, event.currentTarget.selectionStart)
                }
                onFocus={(event) => {
                  source.onFocus();
                  source.onCaret(event.currentTarget.value, event.currentTarget.selectionStart);
                }}
                onBlur={source.onBlur}
              />
            )}
          </div>
          <p className="site-pane-foot">
            <span className="is-dot">UTF-8</span>
            <span>CommonMark</span>
          </p>
        </section>
        <section id={`${ids}-document`} className="site-render" aria-label="Document">
          <p className="site-pane-head">
            <span>Document</span>
            <span className={live ? "is-live" : undefined}>{live ? "Synced" : "Preview"}</span>
          </p>
          {children}
        </section>
      </div>
      <figcaption className="site-window-foot">
        <span aria-live="polite">{summary}</span>
        <span className="is-accent">Lossless by design</span>
      </figcaption>
    </figure>
  );
}
