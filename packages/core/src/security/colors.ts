/** Inert CSS colors only; no declarations, URLs, variable references or escaped tokens. */
export function toSafeColor(value: unknown): string | null {
  return typeof value === "string" &&
    /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.% ,/+\-]+\))$/i.test(value)
    ? value
    : null;
}
