import { BlockEditor } from "@gotipe/block-editor";
import type { RemotePeer } from "@gotipe/block-editor";
import { LocalCollaborationBridge } from "@gotipe/collaboration";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useEffect, useRef, useState } from "react";
import { ExampleWrapper } from "../shared/example-wrapper";

const ALICE = { name: "Alice", color: "#FF6B6B" };
const BOB = { name: "Bob", color: "#4ECDC4" };

const INITIAL_CONTENT = {
  version: 1,
  blocks: [
    {
      id: "collab-h1",
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Real-time Collaboration", marks: [] }],
      children: [],
    },
    {
      id: "collab-p1",
      type: "paragraph",
      attrs: {},
      content: [
        { text: "Type in either editor — changes sync ", marks: [] },
        { text: "instantly", marks: [{ type: "bold", attrs: {} }] },
        {
          text: " to the other panel. You can also see the remote cursor and selection.",
          marks: [],
        },
      ],
      children: [],
    },
    {
      id: "collab-p2",
      type: "paragraph",
      attrs: {},
      content: [
        {
          text: "Try selecting text to see the remote selection highlight, or just move the cursor around.",
          marks: [],
        },
      ],
      children: [],
    },
    {
      id: "collab-p3",
      type: "paragraph",
      attrs: {},
      content: [],
      children: [],
    },
  ],
};

function usePeers(bridge: LocalCollaborationBridge, peerId: string): RemotePeer[] {
  const [peers, setPeers] = useState<RemotePeer[]>([]);

  useEffect(() => {
    const update = () => {
      setPeers(bridge.getPeersFor(peerId));
    };
    const unsub = bridge.onPeersChange(update);
    update();
    return unsub;
  }, [bridge, peerId]);

  return peers;
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: connected ? "#16a34a" : "#d4d4d4",
        marginRight: 6,
      }}
    />
  );
}

function EditorPanel({
  label,
  user,
  peerId,
  bridge,
  editor,
}: {
  label: string;
  user: { name: string; color: string };
  peerId: string;
  bridge: LocalCollaborationBridge;
  editor: ReturnType<typeof useEditor>;
}) {
  const remotePeers = usePeers(bridge, peerId);

  return (
    <div className="gotipe-collab-panel">
      <div className="gotipe-collab-panel-header">
        <ConnectionDot connected={!!editor} />
        <span
          className="gotipe-collab-user-badge"
          style={{ backgroundColor: user.color, color: "#fff" }}
        >
          {label}
        </span>
        {remotePeers.length > 0 && (
          <span className="gotipe-collab-peer-count">
            {remotePeers.length} peer{remotePeers.length > 1 ? "s" : ""} connected
          </span>
        )}
      </div>
      <BlockEditor
        editor={editor}
        showThemeToggle={false}
        showAiCommandBar={false}
        remotePeers={remotePeers}
      />
    </div>
  );
}

export function CollaborationExample() {
  const bridgeRef = useRef<LocalCollaborationBridge | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = new LocalCollaborationBridge();
  }
  const bridge = bridgeRef.current;

  const editor1 = useEditor({
    engine: "wasm",
    content: INITIAL_CONTENT,
    extensions: [DefaultPreset],
  });

  const editor2 = useEditor({
    engine: "wasm",
    content: INITIAL_CONTENT,
    extensions: [DefaultPreset],
  });

  // Join editors to bridge once they're ready
  useEffect(() => {
    if (editor1 && editor2) {
      bridge.join("alice", editor1, ALICE);
      bridge.join("bob", editor2, BOB);
      return () => {
        bridge.leave("alice");
        bridge.leave("bob");
      };
    }
  }, [editor1, editor2, bridge]);

  // Cleanup
  useEffect(() => {
    return () => {
      bridge.destroy();
    };
  }, [bridge]);

  return (
    <ExampleWrapper
      title="Collaboration"
      description="Two editors synced via LocalCollaborationBridge. Changes in one editor appear in the other in real time. Remote cursors and selections are shown with user colors."
      tags={["collaboration", "crdt", "awareness"]}
    >
      <div data-gotipe-example="collaboration" className="gotipe-collab-grid">
        <EditorPanel label="Alice" user={ALICE} peerId="alice" bridge={bridge} editor={editor1} />
        <EditorPanel label="Bob" user={BOB} peerId="bob" bridge={bridge} editor={editor2} />
      </div>
    </ExampleWrapper>
  );
}
