/** Vite's `?raw` imports: the tests read the site's sources and styles as text. */
declare module "*?raw" {
  const source: string;
  export default source;
}
