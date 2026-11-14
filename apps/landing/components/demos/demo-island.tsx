"use client";

import {
  type CSSProperties,
  type ComponentType,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { DEMO_LOADERS } from "./loaders";
import { DEMO_META, type DemoName, isDemoName } from "./names";
import { ensureRandomUUID } from "./secure-ids";
import "./island.css";

type Load = { state: "loading" } | { state: "ready"; Demo: ComponentType } | { state: "failed" };

/** How far below the viewport a demo starts to load. */
const NEAR_VIEWPORT = "400px 0px";

/**
 * A live demo of a documentation page: the window («Live editor», a hint, Reset) holding the
 * height of the mounted demo from the start, and the editor inside, fetched as its own chunk once the window nears the viewport.
 * Rendered on the server as the empty window; the editor exists only in the browser.
 */
export function DemoIsland({ name }: { name: string }) {
  if (!isDemoName(name)) {
    return (
      <p className="site-demo-missing" role="note">
        No live demo is available here.
      </p>
    );
  }
  return <Island name={name} />;
}

function Island({ name }: { name: DemoName }) {
  const meta = DEMO_META[name];
  const root = useRef<HTMLElement>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  // a late chunk after unmount is dropped; a retry replaces the earlier request
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const start = useCallback(() => {
    const id = ++request.current;
    ensureRandomUUID();
    setLoad({ state: "loading" });
    DEMO_LOADERS[name]().then(
      (Demo) => id === request.current && setLoad({ state: "ready", Demo }),
      () => id === request.current && setLoad({ state: "failed" }),
    );
  }, [name]);

  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      start();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        start();
      },
      { rootMargin: NEAR_VIEWPORT },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [start]);

  const ready = load.state === "ready";
  return (
    <section
      ref={root}
      className="site-demo"
      data-demo={name}
      // the window's height while the demo loads: the height of the mounted demo (site tokens),
      // and past the library's 640 px fold the -wide one where the demo has it
      style={
        {
          "--site-demo-h": `var(--site-demo-h-${name})`,
          "--site-demo-h-wide": `var(--site-demo-h-${name}-wide, var(--site-demo-h-${name}))`,
        } as CSSProperties
      }
      aria-label={`Live demo: ${meta.title}`}
    >
      <div className="site-demo-bar">
        <span className="site-demo-tag">Live editor</span>
        {meta.tag && <span className="site-demo-tag is-accent">{meta.tag}</span>}
        <span className="site-demo-hint">{meta.hint}</span>
        <button
          type="button"
          className="site-demo-reset"
          disabled={!ready}
          onClick={() => setGeneration((value) => value + 1)}
          aria-label={`Reset the ${meta.title.toLowerCase()} demo`}
        >
          Reset
        </button>
      </div>
      <div className="site-demo-body" aria-busy={!ready}>
        {ready ? (
          <load.Demo key={generation} />
        ) : load.state === "failed" ? (
          <div className="site-demo-state" role="alert">
            <p>The demo could not load.</p>
            <button type="button" className="site-demo-button" onClick={start}>
              Try again
            </button>
          </div>
        ) : (
          <DemoPlaceholder />
        )}
      </div>
    </section>
  );
}

/** Quiet lines where the document will be, in the window's own height. */
export function DemoPlaceholder() {
  return (
    <output className="site-demo-placeholder">
      <span className="site-sr">Loading the editor…</span>
      <span className="site-demo-lines" aria-hidden="true">
        <span className="site-demo-line is-title" />
        <span className="site-demo-line" />
        <span className="site-demo-line" />
        <span className="site-demo-line is-short" />
      </span>
    </output>
  );
}
