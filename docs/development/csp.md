# CSP and the library's network boundaries

PageEditor uses `@gotipe/core/js`: creating and editing a document does not
require WebAssembly, eval, a Worker, a CDN, or a network service. The application
supplies the code, CSS, and fonts. Highlighting is optional: a separate Shiki adapter loads
only the local grammars/themes the host specifies and uses the JavaScript engine.

`apps/playground/tests/csp/` is a technical consumer of the public library, not a
product screen. Its production configuration `vite.csp.config.ts` sets a strict
policy and an exact alias `@gotipe/core` → `@gotipe/core/js`; public subpaths,
including presets, are preserved. The output lives only in the ignored `output/`.

```sh
pnpm --filter @gotipe/playground build:csp-test
pnpm --filter @gotipe/playground preview:csp-test --host 127.0.0.1
```

Open `http://127.0.0.1:5310/tests/csp/index.html`. The policy in the HTML:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'none'
```

The browser check includes Unicode input, Undo, a checkbox from the keyboard, a theme change,
and read-only. Record `securitypolicyviolation`, page errors, and the real
requests from reload until the actions finish. For the base example only
the app's own HTML/JS/CSS resources are allowed; there must be no `.wasm` and no external requests.
Development HMR is not proof that the production CSP works.

GoTipe has no separate Wiki application. Compatibility of this consumer
build does not replace testing a real application that uses the library.

The host separately allows the media, AI, and collaboration domains it needs. GoTipe does not
widen the CSP automatically. Choosing the WASM engine/export requires a separate host
policy and is not part of the promise of a JS-only PageEditor under `script-src 'self'`.
