import type { EditorHost, GoTipeEditor } from "@gotipe/core";
import {
  Blockquote,
  Bold,
  BulletList,
  Callout,
  CharacterCount,
  CodeBlock,
  Divider,
  File,
  FindReplace,
  Heading,
  Highlight,
  History,
  Image,
  InlineCode,
  Italic,
  Link,
  ListItem,
  Mention,
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
import { GoTipeError, createEditor, defineExtension, saveAsset } from "@gotipe/core/js";
import type { I18n } from "@gotipe/i18n";
import { markdownRawNodeSpec } from "@gotipe/markdown";
import { type BlockViews, GoTipeI18nProvider, TableMergeGuardProvider } from "@gotipe/react";
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
import { EmojiCommand, EmojiSuggestion, MentionSuggestion } from "../atoms/extensions";
import { BlockEditor, type BlockEditorProps } from "../components/block-editor";
import { EditorFailure } from "../components/editor-states";
import type { CodeHighlighter } from "../highlight/types";
import { useBlockEditorI18n } from "../i18n/strings";
import { ReviewBar } from "../review/review-bar";
import { type PageReviewProps, type ReviewApi, ReviewLayer } from "../review/review-layer";
import { markdownTableGuard } from "../table/markdown-guard";
import { MarkdownSession } from "./markdown-session";
import { PageOverlayContext } from "./overlay";
import {
  type PageBlockCommand,
  type PageBlockKind,
  insertPageBlock,
  pageBlockCommands,
} from "./page-commands";
import { type PageTitleLevel, createPageBlockViews } from "./page-views";

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

/**
 * Extensions for a Markdown document (GFM blocks and marks), the “:” emoji list and “/” →
 * Emoji; with `mentions` also mentions and the “@” list (written as `[@name](mention:user-id)`).
 */
export function pageExtensions(options: { mentions?: boolean } = {}) {
  const atoms = options.mentions ? [Mention, MentionSuggestion] : [];
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
    // Find (Mod+F) and the counter change no document: Markdown keeps every byte. Alignment,
    // direction and fonts are not added: Markdown cannot hold them.
    FindReplace,
    CharacterCount,
    MarkdownRawExtension,
    MarkdownRawMark,
    EmojiSuggestion,
    EmojiCommand,
    ...atoms,
  ];
}

export interface PageEditorHandle {
  readonly editor: GoTipeEditor | null;
  /** The current document as Markdown (untouched blocks byte-for-byte). */
  getMarkdown(): string;
  focus(position?: "start" | "end"): void;
  /** Inserts a block at the caret (the toolbar's “blocks” and “image” buttons). */
  insertBlock(kind: PageBlockKind): void;
  /** The page title: text of the leading `# heading`, or null when the file has none. */
  getTitle(): string | null;
  /** Focuses the title and selects its text (“Rename”). */
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
  /**
   * The HTML level of the page title, the file's leading `# heading` (default 1: an `h1`). It looks
   * the same at any level; pass 2 when the host page has its own `h1`. Other headings keep theirs.
   */
  titleLevel?: PageTitleLevel;
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
  /** Blocks offered by “/” (default: all). */
  blocks?: PageBlockKind[];
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Called once the editor exists. */
  onReady?: (editor: GoTipeEditor) => void;
  /** Called when the editor reports an error and when it cannot be created (as `host.onError`). */
  onError?: EditorHost["onError"];
  /**
   * People and pages of the “@” list (Atlas frame 22), as `BlockEditor`'s `mentions`. Read when
   * the page opens: with it the page reads and writes `[@name](mention:user-id)` as mentions.
   */
  mentions?: BlockEditorProps["mentions"];
  /** The team's emoji and the recent list (Atlas frame 23), as `BlockEditor`'s `emoji`. */
  emoji?: BlockEditorProps["emoji"];
  /** Words and characters under the page (Atlas frame 26), as `BlockEditor`'s `status`. */
  status?: BlockEditorProps["status"];
}

const PageEditorInner = forwardRef<PageEditorHandle, PageEditorProps>(
  function PageEditorInner(props, ref) {
    const {
      markdown,
      onChange,
      readOnly = false,
      host,
      titlePlaceholder,
      titleLevel = 1,
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
    const i18n = useBlockEditorI18n();
    const [editor, setEditor] = useState<GoTipeEditor | null>(null);
    /** The editor could not be created: the page shows that instead of loading forever. */
    const [failed, setFailed] = useState(false);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
    const sessionRef = useRef<MarkdownSession | null>(null);
    if (!sessionRef.current)
      sessionRef.current = new MarkdownSession({
        ensureTitle: true,
        atoms: props.mentions ? { mention: true } : undefined,
      });
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
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    /** The editor `onReady` and the first `autoFocus` were run for: once per editor. */
    const readied = useRef<GoTipeEditor | null>(null);
    const initial = useRef({ markdown, readOnly, autoFocus, mentions: !!props.mentions });

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
      // Reading the Markdown and checking the document can fail: that rejects the creation.
      const create = async () =>
        createEditor({
          extensions: pageExtensions({ mentions: initial.current.mentions }),
          content: session.parse(initial.current.markdown),
          editable: !initial.current.readOnly,
          engine: "js",
          host: stableHost,
        });
      create().then(
        (ed) => {
          if (cancelled) {
            ed.destroy();
            return;
          }
          created = ed;
          setEditor(ed);
        },
        (reason: unknown) => {
          if (cancelled) return;
          setFailed(true);
          const error = creationError(reason);
          if (hostRef.current?.onError || onErrorRef.current) stableHost.onError?.(error);
          else console.error("GoTipe: Failed to create editor:", error);
        },
      );
      return () => {
        cancelled = true;
        created?.destroy();
      };
    }, [session]);

    // Emit the draft after edits. A new `onReady` from the host does not run this again: the
    // pending draft stays, and the caret stays where the person put it.
    useEffect(() => {
      if (!editor) return;
      const first = readied.current !== editor;
      readied.current = editor;
      if (first) onReadyRef.current?.(editor);
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
      if (first && initial.current.autoFocus) editor.focus("end");
      return () => {
        off();
        if (frame !== null) cancelAnimationFrame(frame);
      };
    }, [editor, session]);

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
    const slashCommands = useMemo(
      () => [...commands, ...(EmojiCommand.slashCommands ?? [])],
      [commands],
    );
    const blockViews = useMemo<BlockViews>(
      () => ({
        ...createPageBlockViews({ highlight, titlePlaceholder, titleLevel }),
        ...hostViews,
      }),
      [highlight, titlePlaceholder, titleLevel, hostViews],
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

    // merged cells only where the Markdown page can keep the table (an HTML table read back)
    const mergeGuard = useMemo(() => markdownTableGuard(i18n.t("table.mergeMarkdownHint")), [i18n]);

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
          {/* the shared editor: its panel, “/”, handle, block and column menus (Atlas, frame 19) */}
          {failed ? (
            <div className="gotipe-block-editor" data-gotipe-block-failed="" data-gt-view={view}>
              <EditorFailure />
            </div>
          ) : (
            <TableMergeGuardProvider value={mergeGuard}>
              <BlockEditor
                editor={editor}
                view={view}
                className="gotipe-page-editor"
                highlight={highlight}
                blockViews={blockViews}
                slashCommands={slashCommands}
                mentions={props.mentions}
                emoji={props.emoji}
                ariaLabel={i18n.t("page.ariaLabel")}
                errorToast={!host?.onError && !onError}
                showAiCommandBar={false}
                status={props.status}
              />
            </TableMergeGuardProvider>
          )}
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

/** A failed creation as an editor error: a reason that is not a `GoTipeError` becomes one. */
function creationError(reason: unknown): GoTipeError {
  if (reason instanceof GoTipeError) return reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  return new GoTipeError("EDITOR_NOT_INITIALIZED", message, { cause: reason });
}

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
