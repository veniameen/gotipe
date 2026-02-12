import type { BlockView, GoTipeEditor } from "@gotipe/core";

export function CodeBlockView({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  const language = (block.attrs.language as string) || "plaintext";
  const code = typeof block.content === "string" ? block.content : "";

  return (
    <div data-block-id={block.id} data-block-type="codeBlock" className="gotipe-code-block">
      <div className="gotipe-code-block-header">
        <select
          value={language}
          onChange={(e) =>
            editor.chain().setBlockAttrs(block.id, { language: e.target.value }).run()
          }
          aria-label="Programming language"
        >
          <option value="plaintext">Plain text</option>
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="rust">Rust</option>
          <option value="go">Go</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="json">JSON</option>
          <option value="sql">SQL</option>
          <option value="bash">Bash</option>
        </select>
        <button
          type="button"
          aria-label="Copy code"
          onClick={() => navigator.clipboard.writeText(code)}
        >
          Copy
        </button>
      </div>
      <pre>
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}
