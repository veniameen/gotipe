import { BlockEditor, type RemotePeer } from "@gotipe/block-editor";
import { LocalCollaborationBridge } from "@gotipe/collaboration";
import type { GoTipeEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useEffect, useState } from "react";
import { bold, documentOf, text } from "../frame/content";
import "../frame/editor-styles";

const DOCUMENT = documentOf("collab", (b) => [
  b.heading(3, "Shared notes"),
  b.paragraph(text("Agenda: "), text("beta dates", bold), text(", pricing, the docs.")),
]);

/** The people's colours are the theme's person tokens (the bridge takes hex values). */
function personColor(index: 1 | 2): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--gt-person-${index}`)
    .trim();
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ? value : "";
}

const PEOPLE = [
  { id: "ana", name: "Ana", person: 1 },
  { id: "lev", name: "Lev", person: 2 },
] as const;

function usePeers(bridge: LocalCollaborationBridge | null, peerId: string): RemotePeer[] {
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  useEffect(() => {
    if (!bridge) return;
    const update = () => setPeers(bridge.getPeersFor(peerId));
    update();
    return bridge.onPeersChange(update);
  }, [bridge, peerId]);
  return peers;
}

function Pane({
  name,
  person,
  peerId,
  bridge,
  editor,
}: {
  name: string;
  person: 1 | 2;
  peerId: string;
  bridge: LocalCollaborationBridge | null;
  editor: GoTipeEditor | null;
}) {
  const peers = usePeers(bridge, peerId);
  return (
    <section className="site-demo-pane" aria-label={`${name}'s editor`}>
      <header className="site-demo-pane-head">
        <span className="site-demo-person" data-person={person} aria-hidden="true" />
        {name}
        <span className="site-demo-pane-note">
          {!editor ? "Loading the engine…" : peers.length ? "Connected" : "Alone"}
        </span>
      </header>
      <div className="site-demo-scroll">
        <BlockEditor
          editor={editor}
          remotePeers={peers}
          showAiCommandBar={false}
          ariaLabel={`Shared notes, ${name}`}
        />
      </div>
    </section>
  );
}

export function CollaborationDemo() {
  const left = useEditor({ engine: "wasm", extensions: [DefaultPreset], content: DOCUMENT });
  const right = useEditor({ engine: "wasm", extensions: [DefaultPreset], content: DOCUMENT });
  const [bridge, setBridge] = useState<LocalCollaborationBridge | null>(null);
  const [failed, setFailed] = useState("");

  // One bridge for the two editors; it ends with them.
  useEffect(() => {
    if (!left || !right) return;
    const next = new LocalCollaborationBridge();
    try {
      next.join(PEOPLE[0].id, left, { name: PEOPLE[0].name, color: personColor(1) });
      next.join(PEOPLE[1].id, right, { name: PEOPLE[1].name, color: personColor(2) });
      setBridge(next);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    }
    return () => {
      setBridge(null);
      next.destroy();
    };
  }, [left, right]);

  return (
    <div className="site-demo-panes">
      {failed && (
        <p className="site-demo-alert" role="alert">
          {failed}
        </p>
      )}
      {PEOPLE.map((p, index) => (
        <Pane
          key={p.id}
          name={p.name}
          person={p.person}
          peerId={p.id}
          bridge={bridge}
          editor={index === 0 ? left : right}
        />
      ))}
    </div>
  );
}
