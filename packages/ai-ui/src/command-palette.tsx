import type { AiCommand } from "@gotipe/ai";
import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useState } from "react";

export interface AiCommandPaletteProps {
  editor: GoTipeEditor;
  commands: AiCommand[];
  onClose: () => void;
}

export function AiCommandPalette({ editor, commands, onClose }: AiCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const filtered = commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase()),
  );

  const handleSelect = useCallback(
    async (command: AiCommand) => {
      setLoading(true);
      try {
        await command.execute(editor, { selectedText: "" });
      } finally {
        setLoading(false);
        onClose();
      }
    },
    [editor, onClose],
  );

  return (
    <dialog className="gotipe-ai-command-palette" aria-label="AI Commands" open>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask AI..."
        aria-label="Search AI commands"
      />
      {loading && <div className="gotipe-ai-loading">Processing...</div>}
      <div className="gotipe-ai-commands-list" role="listbox" tabIndex={0}>
        {filtered.map((cmd) => (
          <button
            type="button"
            key={cmd.name}
            role="option"
            className="gotipe-ai-command-item"
            onClick={() => handleSelect(cmd)}
          >
            <span>{cmd.name}</span>
            <span style={{ color: "var(--gt-text-muted)", fontSize: "0.85em" }}>
              {cmd.description}
            </span>
          </button>
        ))}
      </div>
    </dialog>
  );
}
