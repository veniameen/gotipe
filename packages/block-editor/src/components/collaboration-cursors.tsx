import type { Decoration } from "@gotipe/core";

export function CollaborationCursors({ decorations }: { decorations: Decoration[] }) {
  const cursors = decorations.filter(
    (d): d is Extract<Decoration, { type: "remote-cursor" }> => d.type === "remote-cursor",
  );

  return (
    <>
      {cursors.map((cursor) => (
        <div
          key={cursor.peerId}
          className="gotipe-remote-cursor"
          style={{ backgroundColor: cursor.user.color }}
          data-peer-id={cursor.peerId}
        >
          <span
            className="gotipe-remote-cursor-label"
            style={{ backgroundColor: cursor.user.color }}
          >
            {cursor.user.name}
          </span>
        </div>
      ))}
    </>
  );
}
