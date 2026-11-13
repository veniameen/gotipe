import type { EditorHost, GoTipeEditor } from "@gotipe/core";
import {
  Blockquote,
  Bold,
  BulletList,
  Callout,
  CodeBlock,
  Divider,
  File,
  Heading,
  Highlight,
  History,
  Image,
  InlineCode,
  Italic,
  Link,
  ListItem,
  OrderedList,
  Paragraph,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TextColor,
  TodoList,
  Underline,
} from "@gotipe/core/extensions";
import { createEditor, defineExtension, saveAsset } from "@gotipe/core/js";
import type { I18n } from "@gotipe/i18n";
import { markdownRawNodeSpec } from "@gotipe/markdown";
import { type BlockViews, GoTipeI18nProvider, useGoTipeI18n } from "@gotipe/react";
import {
  type CommentState,
  type ProposalState,
  type ReviewProposal,
  applyAnchoredEdits,
} from "@gotipe/suggestions";
import type { ThemePreset } from "@gotipe/theme";
import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { BlockEditor } from "../components/block-editor";
import type { CodeHighlighter } from "../highlight/types";
import { ReviewBar } from "../review/review-bar";
import { type PageReviewProps, type ReviewApi, ReviewLayer } from "../review/review-layer";
import { MarkdownSession } from "./markdown-session";
import { PageOverlayContext } from "./overlay";
import {
  type PageBlockCommand,
  type PageBlockKind,
  insertPageBlock,
  pageBlockCommands,
} from "./page-commands";
import { createPageBlockViews } from "./page-views";

/** Raw Markdown the editor keeps as is (HTML, footnotes, definitions…). */
export const MarkdownRawExtension = defineExtension({
  name: "markdownRaw",
  nodes: [{ ...markdownRawNodeSpec }],
});

/** Inline Markdown kept verbatim (footnote references, inline HTML…). */
export const MarkdownRawMark = defineExtension({
  name: "mdRaw",
  marks: [{ name: "mdRaw", attrs: {}, rank: 90 }],
});

/** Extensions for a Markdown document (GFM blocks and marks). */
export function pageExtensions() {
  return [
    Paragraph,
    Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    BulletList,
    OrderedList,
    ListItem,
    TodoList,
    CodeBlock,
    Image,
    File,
    Blockquote,
    Callout,
    Divider,
    Table,
    Bold,
    Italic,
    Strikethrough,
    InlineCode,
    Link,
    Underline,
    Highlight,
    TextColor,
    Superscript,
    Subscript,
    History,
    MarkdownRawExtension,
    MarkdownRawMark,
  ];
}

export interface PageEditorHandle {
  readonly editor: GoTipeEditor | null;
  /** The current document as Markdown (untouched blocks byte-for-byte). */
  getMarkdown(): string;
  focus(position?: "start" | "end"): void;
  /** Inserts a block at the caret (the toolbar's «blocks» and «image» buttons). */
  insertBlock(kind: PageBlockKind): void;
  /** The page title: text of the leading `# heading`, or null when the file has none. */
  getTitle(): string | null;
  /** Focuses the title and selects its text («Переименовать»). */
  selectTitle(): void;
  /** Review actions (null without `review`). */
  readonly review: ReviewApi | null;
}

export interface PageEditorProps {
  /** The file's text. A new value that differs from the last emitted draft replaces the document, keeping focus, caret and scroll. */
  markdown: string;
  /** The draft changed (called after every edit; debounce the save in the host). */
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  /** Assets, links, errors. */
  host?: EditorHost;
  /** Locale of the UI strings (`en` by default, `ru` built in) or a ready `I18n`. */
  locale?: string;
  i18n?: I18n;
  /** Shown in the title when the file has no `# heading` (the file name). */
  titlePlaceholder?: string;
  /** Suggestions, comments and collaborator cursors supplied by the host. */
  review?: PageReviewProps;
  /** Show the edit bar above the page. */
  reviewBar?: { title?: React.ReactNode; extra?: React.ReactNode[] } | false;
  /**
   * One of the shared views (GoTipe Atlas, frames 1–4 and 19): `notion` (default), `docs`,
   * `modern` or `minimal`. The page has no theme of its own.
   */
  view?: ThemePreset;
  /** Optional code highlighter (`@gotipe/block-editor/shiki`). */
  highlight?: CodeHighlighter;
  /**
   * The host's own block views; they win over the page's and the shared ones. E.g. a quote that
   * starts with a bold label the host gives a look of its own.
   */
  blockViews?: BlockViews;
  /** Blocks offered by «/» (default: all). */
  blocks?: PageBlockKind[];
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Called once the editor exists. */
  onReady?: (editor: GoTipeEditor) => void;
  /** Called when the editor reports an error (same as `host.onError`). */
  onError?: EditorHost["onError"];
}

const PageEditorInner = forwardRef<PageEditorHandle, PageEditorProps>(
  function PageEditorInner(props, ref) {
    const {
      markdown,
      onChange,
      readOnly = false,
      host,
      titlePlaceholder,
      review,
      reviewBar,
      view = "notion",
      highlight,
      blockViews: hostViews,
      blocks: allowedBlocks,
      autoFocus,
      className,
      style,
      onReady,
      onError,
    } = props;
    const i18n = useGoTipeI18n();
    const [editor, setEditor] = useState<GoTipeEditor | null>(null);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
    const sessionRef = useRef<MarkdownSession | null>(null);
    if (!sessionRef.current) sessionRef.current = new MarkdownSession({ ensureTitle: true });
    const session = sessionRef.current;
    const reviewApi = useRef<ReviewApi | null>(null);
    const [resolved, setResolved] = useState<Set<string>>(() => new Set());
    const [reviewStates, setReviewStates] = useState<{
      proposals: ProposalState[];
      comments: CommentState[];
    }>({
      proposals: [],
      comments: [],
    });

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const hostRef = useRef(host);
    hostRef.current = host;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    const initial = useRef({ markdown, readOnly, autoFocus });

    // Create the editor once (JS engine: no WASM, no eval).
    useEffect(() => {
      let cancelled = false;
      let created: GoTipeEditor | null = null;
      const stableHost: EditorHost = {
        get imageSources() {
          return hostRef.current?.imageSources;
        },
        saveAsset: (file, info) => {
          const save = hostRef.current?.saveAsset;
          if (!save) return saveAsset({}, file, info.kind);
          return save(file, info);
        },
        resolveAsset: (src) => hostRef.current?.resolveAsset?.(src) ?? src,
        openLink: (href, info) => {
          if (hostRef.current?.openLink) hostRef.current.openLink(href, info);
          else if (info.newTab) window.open(href, "_blank", "noopener,noreferrer");
          else window.location.assign(href);
        },
        onError: (error) => {
          hostRef.current?.onError?.(error);
          onErrorRef.current?.(error);
        },
      };
      void (async () => {
        const ed = await createEditor({
          extensions: pageExtensions(),
          content: session.parse(initial.current.markdown),
          editable: !initial.current.readOnly,
          engine: "js",
          host: stableHost,
        });
        if (cancelled) {
          ed.destroy();
          return;
        }
        created = ed;
        setEditor(ed);
      })();
      return () => {
        cancelled = true;
        created?.destroy();
      };
    }, [session]);

    // Emit the draft after edits.
    useEffect(() => {
      if (!editor) return;
      onReady?.(editor);
      let frame: number | null = null;
      const flush = () => {
        frame = null;
        const { text } = session.serialize(editor);
        if (text !== session.lastText) {
          session.lastText = text;
          onChangeRef.current?.(text);
        }
      };
      const off = editor.on("update", () => {
        session.touch();
        if (frame === null) frame = requestAnimationFrame(flush);
      });
      if (initial.current.autoFocus) editor.focus("end");
      return () => {
        off();
        if (frame !== null) cancelAnimationFrame(frame);
      };
    }, [editor, session, onReady]);

    // External replacement (file changed on disk, accepted suggestion…).
    useEffect(() => {
      if (!editor) return;
      if (markdown === session.lastText) return;
      session.load(editor, markdown, true);
    }, [editor, session, markdown]);

    useEffect(() => {
      editor?.setEditable(!readOnly);
    }, [editor, readOnly]);

    const commands = useMemo<PageBlockCommand[]>(
      () => pageBlockCommands(i18n, allowedBlocks),
      [i18n, allowedBlocks],
    );
    const blockViews = useMemo<BlockViews>(
      () => ({ ...createPageBlockViews({ highlight, titlePlaceholder }), ...hostViews }),
      [highlight, titlePlaceholder, hostViews],
    );

    const localAccept = useCallback(
      (proposal: ReviewProposal): boolean => {
        if (!editor) return false;
        const current = session.serialize(editor).text;
        const result = applyAnchoredEdits(current, proposal.edits);
        if (!result.ok) return false;
        session.load(editor, result.text, true);
        onChangeRef.current?.(result.text);
        setResolved((prev) => new Set(prev).add(proposal.id));
        return true;
      },
      [editor, session],
    );

    const effectiveReview = useMemo<PageReviewProps | null>(() => {
      if (!review) return null;
      const visible = review.proposals.filter((p) => !resolved.has(p.id));
      return {
        ...review,
        proposals: visible,
        onReject:
          review.onReject ??
          ((id: string) => {
            setResolved((prev) => new Set(prev).add(id));
            return true;
          }),
      };
    }, [review, resolved]);

    useImperativeHandle(
      ref,
      () => ({
        get editor() {
          return editor;
        },
        getMarkdown: () =>
          editor ? session.serialize(editor).text : (session.lastText ?? markdown),
        focus: (position) => editor?.focus(position),
        insertBlock: (kind) => {
          if (editor) insertPageBlock(editor, kind);
        },
        getTitle: () => {
          const first = editor?.getViewState().blocks[0];
          if (!first || first.type !== "heading" || Number(first.attrs.level) !== 1) return null;
          const text = Array.isArray(first.content)
            ? first.content.map((sp) => sp.text).join("")
            : "";
          return text.trim() ? text : null;
        },
        selectTitle: () => {
          const first = editor?.getViewState().blocks[0];
          if (!editor || !first) return;
          const length = Array.isArray(first.content)
            ? first.content.reduce((n, sp) => n + sp.text.length, 0)
            : 0;
          editor.focus();
          editor.setSelection({
            anchor: { blockId: first.id, offset: 0 },
            head: { blockId: first.id, offset: length },
          });
        },
        get review() {
          return reviewApi.current;
        },
      }),
      [editor, session, markdown],
    );

    return (
      <div
        ref={setRoot}
        className={`gotipe-page${className ? ` ${className}` : ""}`}
        style={style}
        data-gotipe-page=""
        data-gt-view={view}
        data-readonly={readOnly ? "" : undefined}
      >
        <PageOverlayContext.Provider value={overlay}>
          {effectiveReview && reviewBar !== false && reviewBar !== undefined ? (
            <ReviewBar
              title={reviewBar.title}
              extra={reviewBar.extra}
              states={reviewStates.proposals}
              onAcceptAll={() => reviewApi.current?.acceptAll()}
              onRejectAll={() => reviewApi.current?.rejectAll()}
            />
          ) : null}
          {/* the shared editor: its panel, «/», handle, block and column menus (Atlas, frame 19) */}
          <BlockEditor
            editor={editor}
            view={view}
            className="gotipe-page-editor"
            highlight={highlight}
            blockViews={blockViews}
            slashCommands={commands}
            ariaLabel={i18n.t("page.ariaLabel")}
            errorToast={!host?.onError && !onError}
            showAiCommandBar={false}
          />
          {editor && effectiveReview ? (
            <ReviewLayer
              editor={editor}
              session={session}
              root={root}
              review={effectiveReview}
              onLocalAccept={localAccept}
              apiRef={reviewApi}
              onStates={setReviewStates}
            />
          ) : null}
          <div ref={setOverlay} className="gotipe-page-overlay" />
        </PageOverlayContext.Provider>
      </div>
    );
  },
);

/**
 * A reusable document editor: GFM Markdown in, Markdown out (untouched blocks keep
 * their bytes), model suggestions with cursors — on top of the shared BlockEditor and its views.
 * Runs on the JS engine — no WASM, no eval — so it works under
 * `script-src 'self'`. Errors go to `host.onError` / `onError` only.
 */
export const PageEditor = forwardRef<PageEditorHandle, PageEditorProps>(
  function PageEditor(props, ref) {
    const { locale = "en", i18n } = props;
    return (
      <GoTipeI18nProvider i18n={i18n} locale={locale}>
        <PageEditorInner {...props} ref={ref} />
      </GoTipeI18nProvider>
    );
  },
);
