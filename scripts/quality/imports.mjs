import ts from "typescript";

export function importsOf(filename, source) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const result = [];
  const add = (node) => {
    if (node && ts.isStringLiteralLike(node)) result.push(node.text);
  };
  const walk = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypes =
        clause?.isTypeOnly ||
        (clause &&
          !clause.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((entry) => entry.isTypeOnly));
      if (!onlyTypes) add(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      const onlyTypes =
        node.isTypeOnly ||
        (node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 &&
          node.exportClause.elements.every((entry) => entry.isTypeOnly));
      if (!onlyTypes) add(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  return [...new Set(result)];
}

export function cyclesOf(graph) {
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const active = new Set();
  const cycles = [];
  function visit(node) {
    indices.set(node, index);
    low.set(node, index++);
    stack.push(node);
    active.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!indices.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (active.has(next)) low.set(node, Math.min(low.get(node), indices.get(next)));
    }
    if (low.get(node) !== indices.get(node)) return;
    const group = [];
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      group.push(member);
    } while (member !== node);
    if (group.length > 1 || graph.get(node)?.includes(node)) cycles.push(group.sort());
  }
  for (const node of graph.keys()) if (!indices.has(node)) visit(node);
  return cycles;
}
