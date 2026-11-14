import type { ReactNode } from "react";
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
  /** The document pane. */
  children: ReactNode;
}

function Piece({ piece }: { piece: SourcePiece }) {
  return piece.mark ? <span className="is-mark">{piece.text}</span> : <>{piece.text}</>;
}

/**
 * The window of «Plain text. Rich possibilities.» (Atlas frame 20): the Markdown source with
 * line numbers on the left, the document on the right, the count of lines under both.
 */
export function SignatureWindow({ lines, current, summary, live, children }: SignatureWindowProps) {
  return (
    <figure className="site-window" aria-label="Markdown source and the document it becomes">
      <div className="site-window-bar">
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
          <Icon name="more" />
        </span>
      </div>
      <div className="site-split">
        <section className="site-src" aria-label="Markdown source">
          <p className="site-pane-head">
            <span>Markdown source</span>
            <span>.md</span>
          </p>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the source scrolls sideways on narrow windows; the keyboard reaches it */}
          <ol className="site-src-lines" tabIndex={0} aria-label="Markdown source lines">
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
          <p className="site-pane-foot">
            <span className="is-dot">UTF-8</span>
            <span>CommonMark</span>
          </p>
        </section>
        <section className="site-render" aria-label="Document">
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
