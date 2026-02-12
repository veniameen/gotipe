export type FocusRegion =
  | "skip-nav"
  | "toolbar"
  | "editor"
  | "slash-menu"
  | "bubble-menu"
  | "link-dialog"
  | "footer";

export class FocusManager {
  private regions = new Map<FocusRegion, HTMLElement>();
  private focusStack: HTMLElement[] = [];

  register(region: FocusRegion, element: HTMLElement): void {
    this.regions.set(region, element);
    element.setAttribute("data-gotipe-region", region);
  }

  unregister(region: FocusRegion): void {
    this.regions.delete(region);
  }

  focusRegion(region: FocusRegion): void {
    const el = this.regions.get(region);
    if (el) {
      this.focusStack.push(document.activeElement as HTMLElement);
      el.focus();
    }
  }

  restoreFocus(): void {
    const prev = this.focusStack.pop();
    if (prev?.isConnected) prev.focus();
  }

  trapFocusIn(container: HTMLElement): () => void {
    const focusable = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    container.addEventListener("keydown", handler);
    first?.focus();
    return () => container.removeEventListener("keydown", handler);
  }
}
