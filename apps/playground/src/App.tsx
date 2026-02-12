import { useState } from 'react';
import { BasicExample } from './examples/basic';
import { CollaborationExample } from './examples/collaboration';
import { CommentsExample } from './examples/comments';
import { SuggestionsExample } from './examples/suggestions';
import { VersionsExample } from './examples/versions';
import { AIExample } from './examples/ai';
import { CustomExample } from './examples/custom';
import { I18nExample } from './examples/i18n';

const EXAMPLES = {
  basic: { name: 'Basic Editor', component: BasicExample },
  collaboration: { name: 'Collaboration', component: CollaborationExample },
  comments: { name: 'Comments', component: CommentsExample },
  suggestions: { name: 'Track Changes', component: SuggestionsExample },
  versions: { name: 'Versions', component: VersionsExample },
  ai: { name: 'AI Features', component: AIExample },
  custom: { name: 'Custom Extensions', component: CustomExample },
  i18n: { name: 'i18n & RTL', component: I18nExample },
} as const;

type ExampleKey = keyof typeof EXAMPLES;

export function App() {
  const [active, setActive] = useState<ExampleKey>('basic');
  const ActiveComponent = EXAMPLES[active].component;

  return (
    <div className="gotipe-playground" data-gotipe-playground>
      <header className="gotipe-playground-header" data-gotipe-header>
        <h1>GoTipe Playground</h1>
        <nav>
          {(Object.entries(EXAMPLES) as [ExampleKey, (typeof EXAMPLES)[ExampleKey]][]).map(
            ([key, { name }]) => (
              <button
                key={key}
                data-gotipe-nav={key}
                className={active === key ? 'active' : ''}
                onClick={() => setActive(key)}
              >
                {name}
              </button>
            ),
          )}
        </nav>
      </header>
      <main className="gotipe-playground-main" data-gotipe-main>
        <ActiveComponent />
      </main>
    </div>
  );
}
