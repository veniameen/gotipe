import { highlightLines } from "@/lib/docs/highlight";
import "../site/code-tokens.css";
import { SAMPLES } from "./code-sample";
import { CodeTabs, type HighlightedSample } from "./code-tabs";

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
 * «From install to your first edit.»: the dark panel with the steps and the samples in tabs, their
 * tokens highlighted at build time (the same highlighter and colours as the docs).
 */
export async function QuickStart() {
  const samples: HighlightedSample[] = await Promise.all(
    SAMPLES.map(async (sample) => ({
      tab: sample.tab,
      file: sample.file,
      text: sample.text,
      lines: await highlightLines(sample.text.trimEnd(), sample.language),
    })),
  );
  const first = samples[0]?.lines.length ?? 0;
  return (
    <section className="site-section" aria-labelledby="site-start-title">
      <div className="site-wrap">
        <div className="site-panel" data-theme="dark" data-reveal>
          <div className="site-panel-copy">
            <p className="site-eyebrow">Less setup. More building.</p>
            <h2 id="site-start-title" className="site-title">
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
              <span>{first} lines · one component</span>
              <span>No editor to configure.</span>
            </p>
          </div>
          <div className="site-panel-code">
            <CodeTabs samples={samples} />
          </div>
        </div>
      </div>
    </section>
  );
}
