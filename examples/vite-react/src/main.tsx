import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "./editor";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main>
      <Editor />
    </main>
  </StrictMode>,
);
