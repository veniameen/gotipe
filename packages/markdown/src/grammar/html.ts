/** HTML syntax is preserved as source tokens; it is never executed by the reader. */
export const INLINE_HTML =
  /^(?:<!--(?:>|->|[\s\S]*?-->)|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![A-Z][^>]*>|<\/[A-Za-z][A-Za-z\d-]*\s*>|<[A-Za-z][A-Za-z\d-]*(?:\s+[A-Za-z_:][A-Za-z\d_.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>)/;
export const ANGLE_LINK =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: CommonMark URI autolinks exclude ASCII controls and space, not Unicode whitespace.
  /^<([A-Za-z][A-Za-z\d+.-]{1,31}:[^<>\x00-\x20]*)>|^<([A-Za-z\d.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d.-]*[A-Za-z\d])?)>/;
