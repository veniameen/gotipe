/** Supported detection matches the native email, formatted phone and Luhn-card contract. */
export interface PiiMatch {
  pii_type: "Email" | "Phone" | "CreditCard";
  start: number;
  end: number;
  matched_text: string;
}
const digit = "\\p{Decimal_Number}";
const space = "\\p{White_Space}";
const word = "\\p{Alphabetic}\\p{Mark}\\p{Decimal_Number}\\p{Connector_Punctuation}\\u200c\\u200d";
const phonePattern = `(?:\\+?1[-.${space}]?)?(?:\\(?${digit}{3}\\)?[-.${space}]?)?${digit}{3}[-.${space}]?${digit}{4}`;
const cardPattern = `(?<![${word}])${digit}{4}[-${space}]?${digit}{4}[-${space}]?${digit}{4}[-${space}]?${digit}{4}(?![${word}])`;
function luhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = digits.length - 1, alternate = false; i >= 0; i--, alternate = !alternate) {
    let value = Number(digits[i]);
    if (alternate) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  }
  return sum % 10 === 0;
}
export function detectPii(text: string): PiiMatch[] {
  const result: PiiMatch[] = [];
  const append = (pii_type: PiiMatch["pii_type"], start: number, value: string) =>
    result.push({ pii_type, start, end: start + value.length, matched_text: value });
  // Tokenize local runs once: retrying an unanchored greedy email expression at
  // every character makes long non-email words quadratic in JS RegExp engines.
  const tokens = /[a-zA-Z0-9._%+-]+@?[a-zA-Z0-9.-]*/g;
  for (const token of text.matchAll(tokens)) {
    if (!token[0].includes("@")) continue;
    const email = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.exec(token[0]);
    if (email) append("Email", token.index!, email[0]);
  }
  for (const match of text.matchAll(new RegExp(phonePattern, "gu"))) {
    if (match[0].replace(/[^0-9]/g, "").length >= 10) append("Phone", match.index!, match[0]);
  }
  for (const match of text.matchAll(new RegExp(cardPattern, "gu"))) {
    if (luhn(match[0].replace(/[^0-9]/g, ""))) append("CreditCard", match.index!, match[0]);
  }
  return result.sort((a, b) => a.start - b.start);
}
/** Blocking preserves document coordinates; redaction would invalidate review anchors. */
export function assertNoPii(value: unknown): void {
  if (typeof value === "string") {
    if (detectPii(value).length)
      throw new Error(
        "AI request contains a detected email, phone or card number. Remove it or disable PII detection explicitly.",
      );
  } else if (Array.isArray(value)) {
    for (const item of value) assertNoPii(item);
  } else if (value && typeof value === "object" && !(value instanceof AbortSignal)) {
    for (const item of Object.values(value)) assertNoPii(item);
  }
}
