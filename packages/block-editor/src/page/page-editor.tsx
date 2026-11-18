import type { GoTipeEditor } from "@gotipe/core";
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
import { GoTipeError, createEditor, defineExtension } from "@gotipe/core/js";
import { markdownRawNodeSpec } from "@gotipe/markdown";
import { type BlockViews, GoTipeI18nProvider, TableMergeGuardProvider } from "@gotipe/react";
import {
  type CommentState,
  type ProposalState,
  type ReviewProposal,
  applyAnchoredEdits,
} from "@gotipe/suggestions";
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
import { BlockEditor } from "../components/block-editor";
import { EditorFailure } from "../components/editor-states";
import { useBlockEditorI18n } from "../i18n/strings";
import { ReviewBar } from "../review/review-bar";
import { type PageReviewProps, type ReviewApi, ReviewLayer } from "../review/review-layer";
import { markdownTableGuard } from "../table/markdown-guard";
import { MarkdownSession } from "./markdown-session";
import { PageOverlayContext } from "./overlay";
import { type PageBlockKind, insertPageBlock, pageBlockCommands } from "./page-commands";
import type { PageEditorHandle, PageEditorProps } from "./page-editor-props";
import { createPageHost } from "./page-host";
import { createPageBlockViews } from "./page-views";
import { usePageDraft } from "./use-page-draft";

export type { PageEditorHandle, PageEditorProps, PageSlashMenu } from "./page-editor-props";

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
      reviewLayout = "auto",
      reviewBar,
      view = "notion",
      narrow = true,
      highlight,
      blockViews: hostViews,
      blocks: allowedBlocks,
      slashMenu,
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
    /** The editor `onReady` and the first `autoFocus` were run for: once per editor each. */
    const readied = useRef<GoTipeEditor | null>(null);
    const focused = useRef<GoTipeEditor | null>(null);
    const initial = useRef({ markdown, readOnly, autoFocus, mentions: !!props.mentions });

    // Create the editor once (JS engine: no WASM, no eval).
    useEffect(() => {
      let cancelled = false;
      let created: GoTipeEditor | null = null;
      const stableHost = createPageHost(hostRef, onErrorRef);
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

    // The draft goes out once a frame after edits, or at once on `flush()`. A new `onReady` from
    // the host does not run this again: the pending draft stays, and so does the caret.
    const draft = usePageDraft(
      editor,
      session,
      markdown,
      onChangeRef,
      props.undoableReplace ?? true,
    );
    // `autoFocus` comes once the host has had the render `onReady` causes: its state update is
    // batched with `focusFor`, and the focus waits for every effect of that commit (the host's
    // subscriptions included). No frame or timer decides it.
    const [focusFor, setFocusFor] = useState<GoTipeEditor | null>(null);
    useEffect(() => {
      if (!editor || readied.current === editor) return;
      readied.current = editor;
      onReadyRef.current?.(editor);
      if (initial.current.autoFocus) setFocusFor(editor);
    }, [editor]);
    // Under StrictMode the effect runs twice: the cleanup drops the first run's focus.
    useEffect(() => {
      const target = focusFor;
      if (!target || focused.current === target) return;
      let live = true;
      queueMicrotask(() => {
        if (!live || target.isDestroyed || focused.current === target) return;
        focused.current = target;
        target.focus("end");
      });
      return () => {
        live = false;
      };
    }, [focusFor]);

    useEffect(() => {
      editor?.setEditable(!readOnly);
    }, [editor, readOnly]);

    const slashCommands = useMemo(() => {
      const defaults = [
        ...pageBlockCommands(i18n, allowedBlocks),
        ...(EmojiCommand.slashCommands ?? []),
      ];
      const custom = slashMenu?.commands;
      return typeof custom === "function" ? custom(defaults) : (custom ?? defaults);
    }, [i18n, allowedBlocks, slashMenu?.commands]);
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
        getMarkdown: () => {
          // before the editor exists: a text given to setMarkdown, else the last one
          return editor ? session.serialize(editor).text : draft.flush();
        },
        flush: draft.flush,
        setMarkdown: draft.setMarkdown,
        focus: (position) => editor?.focus(position),
        insertBlock: (kind) => {
          if (editor) insertBelowTitle(editor, kind);
        },
        getTitle: () => pageTitle(editor),
        selectTitle: () => selectPageTitle(editor),
        get review() {
          return reviewApi.current;
        },
      }),
      [editor, session, draft],
    );

    // merged cells only where the Markdown page can keep the table (an HTML table read back)
    const mergeGuard = useMemo(() => markdownTableGuard(i18n.t("table.mergeMarkdownHint")), [i18n]);
    const head =
      props.icon || props.header ? (
        <header className="gotipe-page-head" data-gotipe-page-head="">
          {props.icon ? <div className="gotipe-page-head-icon">{props.icon}</div> : null}
          {props.header}
        </header>
      ) : undefined;

    return (
      <div
        ref={setRoot}
        className={`gotipe-page${className ? ` ${className}` : ""}`}
        style={style}
        data-gotipe-page=""
        data-gt-view={view}
        data-gt-narrow={narrow ? undefined : "off"}
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
                narrow={narrow}
                className="gotipe-page-editor"
                header={head}
                starters={false}
                highlight={highlight}
                blockViews={blockViews}
                slashCommands={slashCommands}
                slashGroups={slashMenu?.groups}
                slashDescriptions={slashMenu?.descriptions}
                media={props.media}
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
              layout={reviewLayout}
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

/** Inserts a block at the caret; from the title, a new block under it: the title stays. */
function insertBelowTitle(editor: GoTipeEditor, kind: PageBlockKind): void {
  const title = editor.getViewState().blocks[0];
  const current = editor.getCurrentBlock();
  if (title && current?.id === title.id && isTitle(title)) {
    editor.chain().insertBlockAfter("paragraph", {}).run();
    const below = editor.getViewState().blocks[1];
    if (below) {
      const at = { blockId: below.id, offset: 0 };
      editor.setSelection({ anchor: at, head: at });
    }
  }
  insertPageBlock(editor, kind);
}

function isTitle(block: { type: string; attrs: Record<string, unknown> }): boolean {
  return block.type === "heading" && Number(block.attrs.level) === 1;
}

/** The page title: text of the leading `# heading`, or null when there is none. */
function pageTitle(editor: GoTipeEditor | null): string | null {
  const first = editor?.getViewState().blocks[0];
  if (!first || !isTitle(first)) return null;
  const text = Array.isArray(first.content) ? first.content.map((sp) => sp.text).join("") : "";
  return text.trim() ? text : null;
}

/** Focuses the title and selects its text (“Rename”). */
function selectPageTitle(editor: GoTipeEditor | null): void {
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
}

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
