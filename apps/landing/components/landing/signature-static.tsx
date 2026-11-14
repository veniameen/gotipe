import { StaticDoc, StaticTodos } from "./static-doc";

/** The signature document before the editor arrives (and without JavaScript). */
export function SignatureStatic() {
  return (
    <StaticDoc>
      <h2 className="site-static-title">Everything here syncs live</h2>
      <p>
        <strong>Every block is a transaction</strong> the engine replays. Two cursors, one document.
      </p>
      <h3>Launch checklist</h3>
      <StaticTodos
        items={[
          [true, "Engine compiles to WASM"],
          [true, "Docs run on 0.1"],
          [false, "Cut the release note"],
        ]}
      />
      <blockquote>
        <p>Paste a link — Markdown stays intact.</p>
      </blockquote>
    </StaticDoc>
  );
}
