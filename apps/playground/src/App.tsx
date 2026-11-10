import { ThemeToggle } from "@gotipe/block-editor";
import { getTheme, setTheme } from "@gotipe/theme";
import { useEffect, useState } from "react";

import { AIExample } from "./examples/ai";
// Existing examples
import { BasicExample } from "./examples/basic";
import { CollaborationExample } from "./examples/collaboration";
import { CommentsExample } from "./examples/comments";
import { CustomExample } from "./examples/custom";
import { I18nExample } from "./examples/i18n";
import { SuggestionsExample } from "./examples/suggestions";
import { VersionsExample } from "./examples/versions";

import { AgentEditor } from "./templates/agent-editor";
import { HeadlessEditor } from "./templates/headless-editor";
// New templates
import { NotionEditor } from "./templates/notion-editor";
import { SimpleEditor } from "./templates/simple-editor";

/* ------------------------------------------------------------------ */
/*  Route registry                                                     */
/* ------------------------------------------------------------------ */

interface RouteEntry {
  name: string;
  category: "Templates" | "Extensions";
  component: React.ComponentType;
}

const ROUTES: Record<string, RouteEntry> = {
  // Templates
  agent: { name: "Agent Editor", category: "Templates", component: AgentEditor },
  notion: { name: "Notion-like", category: "Templates", component: NotionEditor },
  simple: { name: "Simple Editor", category: "Templates", component: SimpleEditor },
  headless: { name: "Headless", category: "Templates", component: HeadlessEditor },
  // Extension demos
  basic: { name: "Basic Editor", category: "Extensions", component: BasicExample },
  collaboration: { name: "Collaboration", category: "Extensions", component: CollaborationExample },
  comments: { name: "Comments", category: "Extensions", component: CommentsExample },
  suggestions: { name: "Track Changes", category: "Extensions", component: SuggestionsExample },
  versions: { name: "Versions", category: "Extensions", component: VersionsExample },
  ai: { name: "AI Features", category: "Extensions", component: AIExample },
  custom: { name: "Custom", category: "Extensions", component: CustomExample },
  i18n: { name: "i18n & RTL", category: "Extensions", component: I18nExample },
};

const CATEGORIES = ["Templates", "Extensions"] as const;
const DEFAULT_ROUTE = "basic";

function getRouteFromHash(): string {
  const hash = window.location.hash.replace("#", "");
  return hash && hash in ROUTES ? hash : DEFAULT_ROUTE;
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar({ active, onNavigate }: { active: string; onNavigate: (key: string) => void }) {
  return (
    <nav className="gotipe-sidebar" aria-label="Editor examples">
      {CATEGORIES.map((category) => (
        <div key={category}>
          <div className="gotipe-sidebar-category">{category}</div>
          {Object.entries(ROUTES)
            .filter(([, route]) => route.category === category)
            .map(([key, route]) => (
              <button
                type="button"
                key={key}
                className={`gotipe-sidebar-item ${active === key ? "active" : ""}`}
                data-gotipe-nav={key}
                aria-current={active === key ? "page" : undefined}
                onClick={() => onNavigate(key)}
              >
                {route.name}
              </button>
            ))}
        </div>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export function App() {
  const [active, setActive] = useState(getRouteFromHash);

  useEffect(() => setTheme(getTheme().mode), []);

  useEffect(() => {
    const onHashChange = () => setActive(getRouteFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (key: string) => {
    window.location.hash = key;
    setActive(key);
  };

  const route = ROUTES[active];
  const ActiveComponent = route?.component ?? BasicExample;

  return (
    <div className="gotipe-playground" data-gotipe-playground>
      <header className="gotipe-playground-header" data-gotipe-header>
        <h1>
          GoTipe <span>Playground</span>
        </h1>
        <ThemeToggle />
      </header>
      <label className="gotipe-mobile-navigation">
        <span>Example</span>
        <select value={active} onChange={(event) => navigate(event.target.value)}>
          {CATEGORIES.map((category) => (
            <optgroup key={category} label={category}>
              {Object.entries(ROUTES)
                .filter(([, item]) => item.category === category)
                .map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <Sidebar active={active} onNavigate={navigate} />
      <main className="gotipe-playground-main" data-gotipe-main data-gotipe-route={active}>
        <ActiveComponent key={active} />
      </main>
    </div>
  );
}
