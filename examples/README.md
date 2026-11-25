# Starters

Projects to copy, each a complete app on the published `@gotipe/*` packages from npm. They show
the ready block editor with a welcome document; `pnpm check:examples` installs, builds and opens
them in a browser.

| Starter | Start with | Try online |
|---|---|---|
| [Next.js](nextjs) (App Router) | `npx create-next-app@latest my-editor --example https://github.com/veniameen/gotipe/tree/main/examples/nextjs` | [Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fveniameen%2Fgotipe%2Ftree%2Fmain%2Fexamples%2Fnextjs&project-name=gotipe-editor&repository-name=gotipe-editor), [StackBlitz](https://stackblitz.com/github/veniameen/gotipe/tree/main/examples/nextjs?file=components%2Feditor.tsx) |
| [Vite and React](vite-react) | `npx degit veniameen/gotipe/examples/vite-react my-editor` | [StackBlitz](https://stackblitz.com/github/veniameen/gotipe/tree/main/examples/vite-react?file=src%2Feditor.tsx) |

The editor component also installs into an existing React project with shadcn:

```bash
npx shadcn@latest add veniameen/gotipe/block-editor
```

It writes `components/editor.tsx`, the file of the Next.js starter, and installs its packages;
`registry.json` at the root of this repository describes it.

The code here is MIT. The starters install `@gotipe/block-editor` and `@gotipe/theme`, which are
under the [GoTipe Commercial License](../LICENSE-COMMERCIAL).
