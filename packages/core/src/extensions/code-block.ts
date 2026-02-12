import { defineExtension } from "../types/extension";

export interface CodeBlockOptions {
  languages: string[];
  defaultLanguage: string;
  syntaxHighlight: boolean;
}

export const CodeBlock = defineExtension<CodeBlockOptions>({
  name: "codeBlock",
  options: {
    languages: [
      "javascript",
      "typescript",
      "python",
      "rust",
      "go",
      "html",
      "css",
      "json",
      "sql",
      "bash",
    ],
    defaultLanguage: "plain",
    syntaxHighlight: true,
  },
  nodes: [
    {
      name: "codeBlock",
      group: ["block"],
      content: "rawText",
      attrs: {
        language: { type: "string", default: "plain" },
      },
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: false,
    },
  ],
  inputRules: [
    {
      pattern: /^```(\w+)?\s$/,
      handler: (editor, match) => {
        const language = match[1] || "plain";
        editor.chain().setBlockType("codeBlock", { language }).run();
      },
    },
  ],
  keybindings: [
    {
      key: "Tab",
      when: "inCodeBlock",
      command: (editor) => {
        editor.chain().insertText("  ").run();
        return true;
      },
    },
    {
      key: "Escape",
      when: "inCodeBlock",
      command: (editor) => {
        editor.chain().insertBlockAfter("paragraph").run();
        return true;
      },
    },
  ],
  slashCommands: [
    {
      name: "Code Block",
      aliases: ["code", "pre", "codeblock"],
      description: "Insert a code block",
      icon: "code",
      group: "basic",
      execute: (editor) => editor.chain().setBlockType("codeBlock").run(),
    },
  ],
});
