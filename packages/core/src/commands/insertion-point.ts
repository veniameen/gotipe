import type { BlockView } from "../types/view";

const structuralChildren: Record<string, readonly string[]> = {
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  todoList: ["todoItem"],
  table: ["tableRow"],
  tableRow: ["tableCell", "tableHeader"],
  columns: ["column"],
};

/** Insert beside the selected leaf, climbing out of a structural-only parent. */
export function insertionPoint(
  blocks: BlockView[],
  selectedId: string,
  insertedType: string,
  side: "before" | "after" = "after",
  allowsChild?: (parentType: string, childType: string) => boolean,
): { parentId: string | null; index: number } {
  const path: { block: BlockView; index: number }[] = [];
  const find = (siblings: BlockView[]): boolean => {
    for (let index = 0; index < siblings.length; index++) {
      const block = siblings[index]!;
      path.push({ block, index });
      if (block.id === selectedId || find(block.children)) return true;
      path.pop();
    }
    return false;
  };
  if (!find(blocks)) return { parentId: null, index: blocks.length };
  while (path.length > 1) {
    const parent = path[path.length - 2]!.block;
    const allowed = structuralChildren[parent.type];
    if (
      allowsChild
        ? allowsChild(parent.type, insertedType)
        : !allowed || allowed.includes(insertedType)
    )
      break;
    path.pop();
  }
  const target = path[path.length - 1]!;
  return {
    parentId: path[path.length - 2]?.block.id ?? null,
    index: target.index + (side === "after" ? 1 : 0),
  };
}
