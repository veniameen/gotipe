import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { THEME_SCRIPT } from "../components/site/theme-state";
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import "../styles/fonts.css";
import "../styles/tokens-site.css";
import "../styles/base.css";
import "../styles/site.css";
import "../styles/head.css";
import "../styles/foot.css";

export const metadata: Metadata = {
  title: {
    default: "GoTipe — Your editor. Your engine. Your rules.",
    template: "%s · GoTipe",
  },
  description:
    "A document editor framework built from the engine up: lossless Markdown, real-time collaboration and an interface that is entirely yours. TypeScript and Rust/WASM.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Every page of the site: the theme before the first paint, the Latin subsets of Inter and the
 * mono preloaded, the skip link. Pages draw their own head, `<main id="main">` and foot.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script of this repository, needed before the first paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link
          rel="preload"
          href="/fonts/InterVariable-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/JetBrainsMono-Regular-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <a className="site-skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
