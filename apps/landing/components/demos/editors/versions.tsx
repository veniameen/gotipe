import { type HistoryVersion, PageEditor, VersionHistory } from "@gotipe/block-editor";
import type { Block, Document, GoTipeEditor } from "@gotipe/core";
import { useCallback, useState } from "react";
import { DemoTools, ToolButton } from "../frame/tools";
import "../frame/editor-styles";

const PAGE = `# Rollout

We turn the journal on in steps, each after a week of watching.

1. Turn it on for 5% of web users.
2. Compare lost edits with the control group for a week.
3. Open it to everyone, starting with the macOS app.

Drafts are encrypted with the session key from day one.
`;

const ME = { name: "Ana Petrova", person: 2 as const };

const setText = (block: Block, value: string): Block => ({
  ...block,
  content: [{ text: value, marks: [] }],
});

/** Hours before now, so the list reads «today» and «yesterday» whenever the demo opens. */
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/**
 * Saved versions made from the page as it opened: the same block ids, so the panel compares
 * blocks. A real host loads them from its storage; here they live in memory.
 */
function seed(page: Document): HistoryVersion[] {
  const edit = (change: (blocks: Block[]) => Block[]): Document => ({
    ...page,
    blocks: change(structuredClone(page.blocks)),
  });
  const draft = edit((blocks) => blocks.slice(0, 2));
  const review = edit((blocks) =>
    blocks.slice(0, 3).map((block) =>
      block.type === "orderedList" && block.children[0]
        ? {
            ...block,
            children: [
              setText(block.children[0], "Turn it on for 10% of web users."),
              ...block.children.slice(1),
            ],
          }
        : block,
    ),
  );
  return [
    {
      id: "draft",
      name: "First draft",
      createdAt: hoursAgo(30),
      createdBy: "Lev Orlov",
      person: 1,
      snapshot: draft,
    },
    {
      id: "auto",
      name: "",
      auto: true,
      createdAt: hoursAgo(26),
      createdBy: "Mira Kay",
      person: 3,
      snapshot: review,
    },
    {
      id: "review",
      name: "Ready for review",
      createdAt: hoursAgo(3),
      createdBy: ME.name,
      person: ME.person,
      snapshot: review,
    },
  ];
}

export function VersionsDemo() {
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);
  const [versions, setVersions] = useState<HistoryVersion[]>([]);
  const [open, setOpen] = useState(true);
  const ready = useCallback((value: GoTipeEditor) => {
    setEditor(value);
    setVersions(seed(value.getJSON()));
  }, []);
  const save = (name: string, snapshot: Document) =>
    setVersions((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        createdBy: ME.name,
        person: ME.person,
        snapshot,
      },
    ]);

  return (
    <>
      <DemoTools label="Versions">
        <ToolButton
          disabled={!editor}
          onClick={() => editor && save(`Version ${versions.length + 1}`, editor.getJSON())}
        >
          Save version
        </ToolButton>
        <ToolButton pressed={open} onClick={() => setOpen((value) => !value)}>
          History
        </ToolButton>
      </DemoTools>
      <div className="site-demo-history">
        <VersionHistory
          editor={editor}
          versions={versions}
          user={ME}
          open={open}
          onClose={() => setOpen(false)}
          onRestore={(_, { unsaved, names }) => {
            if (unsaved) save(names.unsaved, unsaved);
            if (editor) save(names.restored, editor.getJSON());
          }}
        >
          <PageEditor markdown={PAGE} onReady={ready} locale="en" />
        </VersionHistory>
      </div>
    </>
  );
}
