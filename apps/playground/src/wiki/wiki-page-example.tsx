import type { EditorHost, GoTipeError } from '@gotipe/core';
import { LaneAvatars, PageEditor, type PageEditorHandle, PageIcon } from '@gotipe/block-editor';
import type { LaneCursor, ReviewComment, ReviewProposal } from '@gotipe/suggestions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LANES, SAMPLE_PAGE, TURN } from './sample';
import '@gotipe/theme/page.css';
import './wiki.css';

/** A picture for `assets/statuses.png` (the demo host has no disk). */
const STATUSES_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="150" viewBox="0 0 640 150">
  <rect width="640" height="150" rx="10" fill="#f1f1ef"/>
  <g font-family="Inter, system-ui, sans-serif" font-size="14" fill="#262625">
    <rect x="24" y="52" width="120" height="44" rx="8" fill="#fff" stroke="#d9d9d6"/><text x="84" y="79" text-anchor="middle">new</text>
    <rect x="184" y="52" width="120" height="44" rx="8" fill="#fff" stroke="#d9d9d6"/><text x="244" y="79" text-anchor="middle">open</text>
    <rect x="344" y="52" width="120" height="44" rx="8" fill="#fff" stroke="#d9d9d6"/><text x="404" y="79" text-anchor="middle">in_progress</text>
    <rect x="504" y="52" width="112" height="44" rx="8" fill="#fff" stroke="#d9d9d6"/><text x="560" y="79" text-anchor="middle">done</text>
  </g>
  <g stroke="#0864d4" stroke-width="2" fill="none"><path d="M144 74h36M304 74h36M464 74h36"/></g>
</svg>`,
)}`;

interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info';
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * «Как вики SpecOrbit»: the page tab of the workbench panel (Specimen v6,
 * к. 6 / д. 3) on GoTipe's PageEditor. Everything SpecOrbit does in its
 * runtime is mocked here: assets live in memory, accepting a suggestion
 * applies it locally, errors become toasts.
 */
export function WikiPageExample({ standalone = false }: { standalone?: boolean }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const [readOnly, setReadOnly] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [file, setFile] = useState(SAMPLE_PAGE);
  const [draft, setDraft] = useState(SAMPLE_PAGE);
  const [proposals, setProposals] = useState<ReviewProposal[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [cursors, setCursors] = useState<LaneCursor[]>([]);
  const [turnRunning, setTurnRunning] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const assets = useRef(new Map<string, string>([['assets/statuses.png', STATUSES_SVG]]));
  const pageRef = useRef<PageEditorHandle>(null);
  const timers = useRef<number[]>([]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, kind }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const host = useMemo<EditorHost>(
    () => ({
      async saveAsset(blob, info) {
        if (info.size > 5 * 1024 * 1024) throw new Error('Больше 5 МБ');
        const name = info.name.replace(/[^\p{L}\p{N}._-]+/gu, '-');
        const path = `assets/${name}`;
        assets.current.set(path, await readAsDataUrl(blob));
        return { src: path, name: info.name };
      },
      resolveAsset(src) {
        return assets.current.get(src) ?? null;
      },
      openLink(href) {
        toast(`Открыть: ${href}`);
      },
      onError(error: GoTipeError) {
        toast(`${error.code}: ${error.message}`, 'error');
      },
    }),
    [toast],
  );

  const runs = useRef(0);
  const runTurn = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setProposals([]);
    setComments([]);
    setTurnRunning(true);
    runs.current += 1;
    const run = runs.current;
    const id = (base: string) => `${base}-${run}`;
    for (const step of TURN) {
      timers.current.push(
        window.setTimeout(() => {
          if (step.cursors) {
            setCursors(step.cursors.map((c) => (c.proposalId ? { ...c, proposalId: id(c.proposalId) } : c)));
          }
          if (step.proposal) setProposals((prev) => [...prev, { ...step.proposal!, id: id(step.proposal!.id) }]);
          if (step.comment) setComments((prev) => [...prev, { ...step.comment!, id: id(step.comment!.id) }]);
        }, step.at),
      );
    }
    timers.current.push(window.setTimeout(() => setTurnRunning(false), TURN[TURN.length - 1]!.at + 400));
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // E2E hook: change the file "on disk" without touching focus.
  useEffect(() => {
    (window as unknown as { __gotipeWiki?: unknown }).__gotipeWiki = {
      replaceOnDisk: (from: string, to: string) => setFile((prev) => prev.replace(from, to)),
      get editor() {
        return pageRef.current?.editor ?? null;
      },
    };
  }, []);

  const removeProposal = (id: string) => setProposals((prev) => prev.filter((p) => p.id !== id));

  const changedLines = useMemo(() => {
    const a = file.split('\n');
    const b = draft.split('\n');
    let n = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) n++;
    return n;
  }, [file, draft]);

  return (
    <div className={`so-root${standalone ? ' so-standalone' : ''}`} data-theme={theme} data-gotipe-example="wiki">
      <div className="so-panel">
        <div className="so-tabs" role="tablist">
          <button type="button" className="so-tab is-on" role="tab" aria-selected="true">
            <PageIcon name="table" />
            <span>Выкат статусов задач</span>
          </button>
        </div>
        <div className="so-tools">
          <button type="button" className="so-ib" title="Ход модели" aria-label="Ход модели" onClick={runTurn} disabled={readOnly}>
            <PageIcon name="agent" />
          </button>
          <button
            type="button"
            className="so-ib"
            aria-label="Изображение"
            disabled={readOnly}
            onClick={() => pageRef.current?.insertBlock('image')}
          >
            <PageIcon name="image" />
          </button>
          <button
            type="button"
            className="so-ib"
            aria-label="Таблица"
            disabled={readOnly}
            onClick={() => pageRef.current?.insertBlock('table')}
          >
            <PageIcon name="table" />
          </button>
          <span className="so-sp" />
          <LaneAvatars lanes={LANES} cursors={turnRunning ? cursors : []} />
          <button
            type="button"
            className={`so-ib${readOnly ? ' is-on' : ''}`}
            aria-label="Только чтение"
            aria-pressed={readOnly}
            data-gotipe-wiki-readonly=""
            onClick={() => setReadOnly((v) => !v)}
          >
            <PageIcon name="todo" />
          </button>
          <button
            type="button"
            className={`so-ib${showSource ? ' is-on' : ''}`}
            aria-label="Markdown"
            aria-pressed={showSource}
            onClick={() => setShowSource((v) => !v)}
          >
            <PageIcon name="markdown" />
          </button>
          <button
            type="button"
            className="so-ib"
            aria-label="Тема"
            data-gotipe-wiki-theme=""
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            <PageIcon name={theme === 'light' ? 'callout' : 'agent'} />
          </button>
        </div>
        <div className="so-body">
          <PageEditor
            ref={pageRef}
            className="so-page"
            markdown={file}
            onChange={setDraft}
            readOnly={readOnly}
            host={host}
            locale="ru"
            titlePlaceholder="vykat-statusov-zadach"
            review={{
              lanes: LANES,
              proposals,
              comments,
              cursors: turnRunning ? cursors : [],
              onReject: (id) => {
                removeProposal(id);
                return true;
              },
              onReply: (commentId, text) => {
                setComments((prev) =>
                  prev.map((c) =>
                    c.id === commentId
                      ? { ...c, replies: [...(c.replies ?? []), { id: String(Date.now()), author: 'Вы', text }] }
                      : c,
                  ),
                );
                return true;
              },
            }}
            reviewBar={
              proposals.length > 0 || turnRunning
                ? { title: 'Правит GigaChat 2', extra: ['3,6 тыс. токенов'] }
                : false
            }
          />
          {showSource ? (
            <aside className="so-source" aria-label="Markdown">
              <div className="so-source-head">
                docs/pages/vykat-statusov-zadach.md
                <span>{changedLines === 0 ? 'без изменений' : `строк изменено: ${changedLines}`}</span>
              </div>
              <pre data-gotipe-wiki-source="">{draft}</pre>
              <div className="so-source-actions">
                <button type="button" className="so-btn" onClick={() => setFile(draft)}>
                  Сохранить
                </button>
                <button
                  type="button"
                  className="so-btn"
                  onClick={() =>
                    setFile(
                      `${draft.replace('Снять дамп tasks на стенде', 'Снять дамп tasks на стенде (готово 09.11)')}`,
                    )
                  }
                >
                  Изменить на диске
                </button>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
      <div className="so-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`so-toast is-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
