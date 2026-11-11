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
