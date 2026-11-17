import Link from "next/link";
import { CopyButton } from "../site/copy-button";
import { Icon } from "../site/icon";
import { Catch, Lamp } from "../site/lamp";
import { LINKS } from "../site/links";
import { HeroBackground } from "./motion/hero-background";
import { HeroGhost } from "./motion/hero-ghost";
import { SignatureLive } from "./signature-live";

const INSTALL = "npm i @gotipe/core @gotipe/react";

/** What GoTipe is made of and works with: the strip under the first stage, one endless line. */
const MADE_OF = [
  "TypeScript",
  "Rust / WASM",
  "React",
  "Vue",
  "Svelte",
  "Solid",
  "CommonMark",
  "GitHub Flavored Markdown",
  "Real-time CRDT",
  "PDF",
  "DOCX",
  "MIT core",
];

function MadeOf({ copy = false }: { copy?: boolean }) {
  return (
    <ul className="site-marquee-list" aria-hidden={copy || undefined}>
      {MADE_OF.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * The first stage (Atlas frame 20): the three lines, the calls to action and the install line over
 * the live window — the Markdown file and the document it becomes — then the strip of what GoTipe
 * is made of. The stage stands off the window by the frame on every side; the head floats in it.
 * Behind the content a shader moves in the stage's light and answers the pointer
 * (motion/hero-background.tsx).
 */
export function Hero() {
  return (
    <div className="site-frame">
      <section className="site-stage site-hero" aria-labelledby="site-hero-title">
        <HeroGhost />
        <HeroBackground />
        <div className="site-wrap">
          <div className="site-hero-copy">
            <Link className="site-chip" href={LINKS.repo}>
              <span className="site-chip-tag">
                <span className="site-pulse" aria-hidden="true" />
                v0.1
              </span>
              Open source. Built from scratch.
              <Icon name="arrow-right" />
            </Link>
            <h1 id="site-hero-title" className="site-hero-title">
              <span className="site-hero-line">
                <span className="site-ink">Your editor.</span>
              </span>{" "}
              <span className="site-hero-line">
                <span className="site-ink">Your engine.</span>
              </span>{" "}
              <span className="site-hero-line is-accent">
                <span className="site-ink is-accent">
                  Your <span className="site-hero-select">rules.</span>
                </span>
                <span className="site-hero-caret" aria-hidden="true" />
              </span>
            </h1>
            <p className="site-lede">
              A document editor framework built from the engine up. Lossless Markdown, real-time
              collaboration, and an interface that’s entirely yours.
            </p>
            <div className="site-actions">
              <Link className="site-button site-cta" href={LINKS.docs} data-lamp>
                <Lamp />
                <span>Start building</span>
                <Icon name="arrow-right" />
              </Link>
              {LINKS.playground ? (
                <a className="site-button site-cta is-second" href={LINKS.playground}>
                  <Catch />
                  Try the playground
                  <Icon name="arrow-up-right" />
                </a>
              ) : (
                <a className="site-button site-cta is-second" href={LINKS.repo}>
                  <Catch />
                  View on GitHub
                  <Icon name="arrow-up-right" />
                </a>
              )}
            </div>
            <div className="site-install">
              <code>{INSTALL}</code>
              <CopyButton
                text={INSTALL}
                label="Copy the install command"
                className="site-button is-quiet site-install-copy"
              />
            </div>
          </div>

          <div className="site-hero-window">
            <SignatureLive />
            <p className="site-hero-note">
              Markdown source and the document it becomes. One model, nothing lost. Edit either
              side: the other follows.
            </p>
          </div>

          <div className="site-strip" data-play>
            <p className="site-strip-title">Not a wrapper. A foundation.</p>
            <div className="site-marquee">
              <div className="site-marquee-track">
                <MadeOf />
                <MadeOf copy />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
