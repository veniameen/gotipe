import { useState, useEffect, lazy, Suspense } from 'react';

// Existing examples
import { BasicExample } from './examples/basic';
import { CollaborationExample } from './examples/collaboration';
import { CommentsExample } from './examples/comments';
import { SuggestionsExample } from './examples/suggestions';
import { VersionsExample } from './examples/versions';
import { AIExample } from './examples/ai';
import { CustomExample } from './examples/custom';
import { I18nExample } from './examples/i18n';

// New templates
import { NotionEditor } from './templates/notion-editor';
import { SimpleEditor } from './templates/simple-editor';
import { HeadlessEditor } from './templates/headless-editor';
import { AgentEditor } from './templates/agent-editor';
import { WikiPageExample } from './wiki/wiki-page-example';

/* ------------------------------------------------------------------ */
/*  Route registry                                                     */
/* ------------------------------------------------------------------ */

interface RouteEntry {
  name: string;
  category: 'Templates' | 'Extensions';
  component: React.ComponentType;
}

const ROUTES: Record<string, RouteEntry> = {
  // Templates
  agent:    { name: 'Agent Editor',    category: 'Templates',  component: AgentEditor },
  wiki:     { name: 'Wiki',  category: 'Templates',  component: WikiPageExample },
  notion:   { name: 'Notion-like',     category: 'Templates',  component: NotionEditor },
  simple:   { name: 'Simple Editor',   category: 'Templates',  component: SimpleEditor },
  headless: { name: 'Headless',        category: 'Templates',  component: HeadlessEditor },
  // Extension demos
  basic:         { name: 'Basic Editor',    category: 'Extensions', component: BasicExample },
  collaboration: { name: 'Collaboration',   category: 'Extensions', component: CollaborationExample },
  comments:      { name: 'Comments',        category: 'Extensions', component: CommentsExample },
  suggestions:   { name: 'Track Changes',   category: 'Extensions', component: SuggestionsExample },
  versions:      { name: 'Versions',        category: 'Extensions', component: VersionsExample },
  ai:            { name: 'AI Features',     category: 'Extensions', component: AIExample },
  custom:        { name: 'Custom',          category: 'Extensions', component: CustomExample },
  i18n:          { name: 'i18n & RTL',      category: 'Extensions', component: I18nExample },
};

const CATEGORIES = ['Templates', 'Extensions'] as const;
const DEFAULT_ROUTE = 'agent';

function getRouteFromHash(): string {
  const hash = window.location.hash.replace('#', '');
  return hash && hash in ROUTES ? hash : DEFAULT_ROUTE;
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar({ active, onNavigate }: { active: string; onNavigate: (key: string) => void }) {
  return (
    <aside className="gotipe-sidebar">
      {CATEGORIES.map((category) => (
        <div key={category}>
          <div className="gotipe-sidebar-category">{category}</div>
          {Object.entries(ROUTES)
            .filter(([, route]) => route.category === category)
            .map(([key, route]) => (
              <button
                key={key}
                className={`gotipe-sidebar-item ${active === key ? 'active' : ''}`}
                data-gotipe-nav={key}
                onClick={() => onNavigate(key)}
              >
                {route.name}
              </button>
            ))}
        </div>
      ))}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export function App() {
  const [active, setActive] = useState(getRouteFromHash);

  useEffect(() => {
    const onHashChange = () => setActive(getRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (key: string) => {
    window.location.hash = key;
    setActive(key);
  };

  const route = ROUTES[active];
  const ActiveComponent = route?.component ?? ROUTES[DEFAULT_ROUTE].component;

  return (
    <div className="gotipe-playground" data-gotipe-playground>
      <header className="gotipe-playground-header" data-gotipe-header>
        <h1>GoTipe Playground</h1>
      </header>
      <Sidebar active={active} onNavigate={navigate} />
      <main className="gotipe-playground-main" data-gotipe-main>
        <ActiveComponent key={active} />
      </main>
    </div>
  );
}
