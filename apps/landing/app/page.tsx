export default function Home() {
  return (
    <main>
      <section className="py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          The Rust-Powered Editor Framework
        </h1>
        <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto">
          Block-first rich text editor with WASM performance, real-time collaboration, and AI-first
          design. Notion-like UX, fully extensible.
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <a
            href="https://docs.gotipe.com/quickstart"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Get Started
          </a>
          <a
            href="https://playground.gotipe.com"
            className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
          >
            Try Playground
          </a>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 px-6">
          <Feature
            title="Rust/WASM Performance"
            description="<1ms keystroke processing. EditorState lives in WASM for native speed."
          />
          <Feature
            title="Block-First Model"
            description="Documents are Block arrays. Each block is an extension. Fully composable."
          />
          <Feature
            title="Real-Time CRDT"
            description="Custom CRDT engine with binary sync protocol. No Yjs dependency."
          />
          <Feature
            title="AI-First"
            description="Ghost text, command palette, provider fallback (OpenAI/Anthropic/Gemini)."
          />
          <Feature
            title="Multi-Framework"
            description="React, Vue, Svelte, Solid. First-class adapters, not wrappers."
          />
          <Feature
            title="Full Export"
            description="PDF (typst), DOCX, HTML, Markdown. Server-side via Go Cloud."
          />
        </div>
      </section>

      <section className="py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Pricing</h2>
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 px-6">
          <PricingCard
            name="Core (MIT)"
            price="Free"
            features={[
              'Headless editor',
              'All extensions',
              'CRDT collaboration',
              'AI layer',
              'Export API',
              'React/Vue/Svelte/Solid',
            ]}
          />
          <PricingCard
            name="Block Editor"
            price="$149/yr"
            features={[
              'Notion-like UI',
              'SlashMenu',
              'BubbleMenu',
              'DragHandle',
              'Themes',
              '1 production domain',
            ]}
          />
          <PricingCard
            name="Cloud Starter"
            price="$29/mo"
            highlight
            features={[
              'Block Editor included',
              '1K documents',
              '10K AI requests/mo',
              '1K exports/mo',
              '1K MAU',
              'Email support',
            ]}
          />
          <PricingCard
            name="Cloud Pro"
            price="$99/mo"
            features={[
              'Block Editor included',
              '10K documents',
              '100K AI requests/mo',
              'Unlimited exports',
              '10K MAU',
              '99.9% SLA',
            ]}
          />
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <h2 className="text-3xl font-bold text-center mb-12">GoTipe vs Alternatives</h2>
        <ComparisonTable />
      </section>
    </main>
  );
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-gray-600">{description}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  features,
  highlight,
}: {
  name: string;
  price: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-6 rounded-xl border ${highlight ? 'border-blue-500 shadow-lg' : 'border-gray-200'}`}
    >
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="text-3xl font-bold mt-2">{price}</p>
      <ul className="mt-4 space-y-2">
        {features.map((f) => (
          <li key={f} className="text-sm text-gray-600">
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonTable() {
  const rows = [
    ['Engine', 'Rust/WASM', 'JS (ProseMirror)', 'JS', 'JS'],
    ['Model', 'Block-first', 'Node tree', 'Node tree', 'Nested nodes'],
    ['CRDT', 'Built-in (custom)', 'Yjs (addon)', 'None', 'None'],
    ['AI', 'Built-in', 'Addon ($)', 'None', 'None'],
    ['Export PDF/DOCX', 'Built-in', 'None', 'None', 'None'],
    ['Frameworks', 'React/Vue/Svelte/Solid', 'React/Vue', 'React', 'React'],
    ['License', 'MIT + Commercial UI', 'MIT + Commercial ext', 'MIT', 'MIT'],
    ['Cloud', '$29/mo', '$49/mo', 'None', 'None'],
  ];

  return (
    <div className="overflow-x-auto px-6">
      <table className="w-full max-w-4xl mx-auto text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left p-3">Feature</th>
            <th className="p-3">GoTipe</th>
            <th className="p-3">Tiptap</th>
            <th className="p-3">Lexical</th>
            <th className="p-3">Slate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([feature, ...values]) => (
            <tr key={feature} className="border-b">
              <td className="p-3 font-medium">{feature}</td>
              {values.map((v, i) => (
                <td key={i} className="p-3 text-center">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
