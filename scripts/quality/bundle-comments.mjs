import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// esbuild drops the comments that stand between statements but keeps, when it does not
// minify, those inside expressions and class bodies: a JSDoc on an object property or a
// class member, a comment in an array, before an argument or a branch of `?:`. Budgets
// measure unminified output, so such a comment costs bytes in every graph that reaches
// it (D-167). esbuild drops a comment before a statement or on a TypeScript-only member (a
// signature without a body), and TypeScript keeps the latter in the declarations.
const STATEMENT_LISTS = new Set([
  ts.SyntaxKind.SourceFile,
  ts.SyntaxKind.Block,
  ts.SyntaxKind.ModuleBlock,
  ts.SyntaxKind.CaseBlock,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.DefaultClause,
]);
// Annotations that bundlers read, and legal notices, are not documentation.
const FUNCTIONAL =
  /^\/\*\s*[@#]__(?:PURE|NO_SIDE_EFFECTS)__\s*\*\/$|^\/\*!|@license|@preserve|@vite-ignore|webpack[A-Z]\w*:/;

/** Comments of emitted JavaScript that stand inside an expression or a class body. */
export function keptComments(code, fileName = "bundle.js") {
  const source = ts.createSourceFile(
    fileName,
    code,
    { languageVersion: ts.ScriptTarget.Latest, jsDocParsingMode: ts.JSDocParsingMode.ParseNone },
    true,
    ts.ScriptKind.JS,
  );
  const visited = new Set();
  const found = new Map();
  function visit(node) {
    // Every comment lies in the trivia before a token; the outermost node that starts
    // there tells whether the trivia separates statements.
    if (!visited.has(node.pos)) {
      visited.add(node.pos);
      const betweenStatements =
        node.kind === ts.SyntaxKind.SourceFile ||
        node.kind === ts.SyntaxKind.EndOfFileToken ||
        STATEMENT_LISTS.has(node.parent?.kind);
      const ranges = betweenStatements
        ? []
        : [
            ...(ts.getLeadingCommentRanges(code, node.pos) ?? []),
            ...(ts.getTrailingCommentRanges(code, node.pos) ?? []),
          ];
      for (const range of ranges) {
        const text = code.slice(range.pos, range.end);
        if (!FUNCTIONAL.test(text))
          found.set(range.pos, {
            line: source.getLineAndCharacterOfPosition(range.pos).line + 1,
            text,
          });
      }
    }
    for (const child of node.getChildren(source)) visit(child);
  }
  visit(source);
  return [...found.values()].sort((a, b) => a.line - b.line);
}

/** Kept comments of every workspace package's emitted ESM, by package name. */
export function packageComments(packages) {
  const result = new Map();
  for (const [name, { directory }] of packages) {
    const dist = path.join(directory, "dist");
    if (!fs.existsSync(dist)) continue;
    const comments = fs
      .readdirSync(dist, { recursive: true })
      .filter((file) => /\.m?js$/.test(file))
      .sort()
      .flatMap((file) =>
        keptComments(fs.readFileSync(path.join(dist, file), "utf8"), file).map((comment) => ({
          file: path.join(path.basename(directory), "dist", file),
          ...comment,
        })),
      );
    result.set(name, comments);
  }
  return result;
}

/** Errors for packages above their known count, and for counts that can be lowered. */
export function checkComments(comments, known) {
  const errors = [];
  for (const name of Object.keys(known)) {
    if (!comments.has(name)) errors.push(`${name}: no build to check against its known count`);
  }
  for (const [name, list] of comments) {
    const allowed = known[name] ?? 0;
    if (list.length > allowed) {
      errors.push(
        `${name}: ${list.length} comments inside expressions or class bodies ship in its JavaScript (known: ${allowed}). Put each before a statement, into the function body or onto a TypeScript signature without a body:\n${list
          .map(
            ({ file, line, text }) =>
              `  ${file}:${line} ${text.replace(/\s+/g, " ").slice(0, 100)}`,
          )
          .join("\n")}`,
      );
    } else if (list.length < allowed) {
      errors.push(
        `${name}: ${list.length} kept comments, fewer than the known ${allowed}; lower it in config/bundle-comments.json`,
      );
    }
  }
  return errors;
}
