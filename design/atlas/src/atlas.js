// The theme switch of the atlas: every frame and the page around it follow the chosen theme.
(() => {
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll(".at-seg > button")];
  for (const button of buttons) {
    button.addEventListener("click", () => {
      root.dataset.theme = button.dataset.themeChoice;
      for (const other of buttons) {
        other.setAttribute("aria-pressed", String(other === button));
      }
    });
  }
})();

// A bar that scrolls sideways marks the side with more tools (`data-more`), as the library marks a
// wide table: the theme fades that edge.
(() => {
  for (const track of document.querySelectorAll(".gotipe-toolbar-track")) {
    const update = () => {
      const left = track.scrollLeft > 1;
      const right = track.scrollLeft + track.clientWidth < track.scrollWidth - 1;
      const more = left && right ? "both" : left ? "left" : right ? "right" : null;
      if (more) track.dataset.more = more;
      else delete track.dataset.more;
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    new ResizeObserver(update).observe(track);
  }
})();
