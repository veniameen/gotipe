import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GoTipe — The Rust-Powered Editor Framework',
  description:
    'Block-first rich text editor with WASM performance, real-time collaboration, and AI-first design.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
