/** Whether a native input/selection belongs to this document surface. */
export function ownsInputTarget(root: HTMLElement, target: EventTarget | null): boolean {
  const node = target instanceof Node ? target : null;
  if (!node || !root.contains(node)) return false;
  let element = node instanceof Element ? node : node.parentElement;
  let editableTableCell = false;
  while (element && element !== root) {
    if (
      element.matches(
        "input, textarea, select, button, [data-gotipe-input], [data-gotipe-widget]",
      ) ||
      element.hasAttribute("data-gotipe-editor")
    )
      return false;
    if (
      element.matches(
        'td[data-block-id][data-block-type="tableCell"][contenteditable="true"], th[data-block-id][data-block-type="tableHeader"][contenteditable="true"]',
      )
    )
      editableTableCell = true;
    if (
      element.getAttribute("contenteditable") === "false" &&
      !(editableTableCell && element.getAttribute("data-block-type") === "table")
    )
      return false;
    element = element.parentElement;
  }
  return element === root;
}
