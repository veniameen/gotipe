import { highlightLines } from "@/lib/docs/highlight";
import { CopyButton } from "../site/copy-button";
import "../site/code-tokens.css";
import { SAMPLE_FILE, SAMPLE_TEXT } from "./code-sample";

const STEPS = [
  {
    title: "Install",
    text: "The engine, the React adapter and the ready editor. Add the theme’s CSS once.",
  },
  {
    title: "Create",
    text: "Pick a preset or your own extensions; the engine is chosen for you.",
  },
  {
    title: "Save",
    text: "JSON, HTML or Markdown from every update — your storage, your format.",
  },
];

/**
 * «From install to your first edit.»: the dark panel with the steps and the React sample, its
 * tokens highlighted at build time (the same highlighter and colours as the docs).
 */
export async function QuickStart() {
  const lines = await highlightLines(SAMPLE_TEXT.trimEnd(), "tsx");
  return (
    <section className="site-section" aria-labelledby="site-start-title">
      <div className="site-wrap">
        <div className="site-panel" data-theme="dark">
          <div className="site-panel-copy">
            <p className="site-eyebrow">Less setup. More building.</p>
            <h2 id="site-start-title">
              From install
              <br />
              to your first edit.
            </h2>
            <ol className="site-panel-steps">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="site-panel-note">
              <span>{lines.length} lines · one component</span>
              <span>No editor to configure.</span>
            </p>
          </div>
          <div className="site-panel-code" data-gt-view="docs">
            <div className="gotipe-code-block">
              <div className="gotipe-code-block-header">
                <span className="site-file">{SAMPLE_FILE}</span>
                <CopyButton
                  text={SAMPLE_TEXT}
                  label={`Copy ${SAMPLE_FILE}`}
                  className="site-copy"
                  showText
                />
              </div>
              <div className="gotipe-code-block-scroll">
                <span className="gotipe-code-block-line-numbers" aria-hidden="true">
                  {lines.map((_, index) => `${index + 1}\n`).join("")}
                </span>
                {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a code sample that scrolls sideways is reachable from the keyboard */}
                <pre tabIndex={0} aria-label={`${SAMPLE_FILE}, React sample`}>
                  <code
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time highlighter output of a constant sample, every text escaped (lib/docs/highlight.ts)
                    dangerouslySetInnerHTML={{
                      __html: lines
                        .map((line) => `<span class="site-code-line">${line}\n</span>`)
                        .join(""),
                    }}
                  />
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
