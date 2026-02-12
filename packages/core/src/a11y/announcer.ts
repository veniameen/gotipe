export class A11yAnnouncer {
  private politeRegion: HTMLElement;
  private assertiveRegion: HTMLElement;

  constructor() {
    this.politeRegion = this.createRegion("polite");
    this.assertiveRegion = this.createRegion("assertive");
  }

  announce(message: string, priority: "polite" | "assertive" = "polite"): void {
    const region = priority === "assertive" ? this.assertiveRegion : this.politeRegion;
    region.textContent = "";
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }

  logCollabEvent(userName: string, action: string): void {
    this.announce(`${userName} ${action}`, "polite");
  }

  destroy(): void {
    this.politeRegion.remove();
    this.assertiveRegion.remove();
  }

  private createRegion(live: string): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", live);
    el.setAttribute("aria-atomic", "true");
    el.className = "gotipe-sr-only";
    el.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
    document.body.appendChild(el);
    return el;
  }
}
