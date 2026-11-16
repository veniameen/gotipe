/**
 * The interface locale as `Intl` takes it. A host may name its locale so that it is no language
 * tag (`de_DE`, `""`): `Intl` throws `RangeError` on such a name, and the numbers and dates of the
 * interface then use the browser's language instead of taking the editor down (D-220).
 */
export function intlLocale(locale: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return undefined;
  }
}
