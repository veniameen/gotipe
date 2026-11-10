import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoTipe — An editor of your own",
  description:
    "Own your document model and editing experience with GoTipe: a block editor with JavaScript and Rust/WASM engines, Markdown, collaboration and review.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
