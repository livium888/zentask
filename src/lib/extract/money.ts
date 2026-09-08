/**
 * Amounts of money in OCR text.
 *
 * Decimal separators are the trap: "1.234,56" and "1,234.56" are the same
 * amount written by different halves of the world, and a receipt gives no
 * hint which. The rule used here is that the *last* separator is the decimal
 * one when it is followed by exactly two digits — which is true for both
 * conventions — and everything else is a thousands separator.
 */

export type MoneyMatch = {
  /** Value in major units. 12.50, not 1250. */
  amount: number;
  currency: string;
  /** Formatted back for display, e.g. "£12.50". */
  label: string;
  raw: string;
  index: number;
};

const SYMBOLS: Record<string, string> = {
  "£": "GBP",
  "$": "USD",
  "€": "EUR",
  "¥": "JPY",
  "₺": "TRY",
  "₹": "INR",
  "lei": "RON",
};

const CODES = ["GBP", "USD", "EUR", "RON", "CHF", "PLN", "SEK", "NOK", "DKK", "CAD", "AUD", "JPY"];

const NUMBER = String.raw`\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

function parseAmount(text: string): number | undefined {
  const cleaned = text.replace(/\s/g, "");
  const lastSeparator = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  if (lastSeparator === -1) {
    const whole = Number(cleaned);
    return Number.isFinite(whole) ? whole : undefined;
  }
  const decimals = cleaned.length - lastSeparator - 1;
  if (decimals === 1 || decimals === 2) {
    const major = cleaned.slice(0, lastSeparator).replace(/[.,]/g, "");
    const minor = cleaned.slice(lastSeparator + 1);
    const value = Number(`${major}.${minor}`);
    return Number.isFinite(value) ? value : undefined;
  }
  // Three digits after the separator means it was a thousands mark.
  const value = Number(cleaned.replace(/[.,]/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

function format(amount: number, currency: string): string {
  const symbol = Object.entries(SYMBOLS).find(([, code]) => code === currency)?.[0];
  const shown = amount.toFixed(2).replace(/\.00$/, "");
  if (symbol && symbol.length === 1) return `${symbol}${shown}`;
  return `${shown} ${currency}`;
}

export function findMoney(text: string): MoneyMatch[] {
  const out: MoneyMatch[] = [];
  const seen = new Set<number>();

  const symbolClass = Object.keys(SYMBOLS).filter((s) => s.length === 1).join("");
  const symbolFirst = new RegExp(String.raw`([${symbolClass}])\s?(${NUMBER})`, "g");
  for (const m of text.matchAll(symbolFirst)) {
    const [symbol, number] = [m[1], m[2]];
    if (!symbol || !number) continue;
    const amount = parseAmount(number);
    const currency = SYMBOLS[symbol];
    if (amount === undefined || !currency) continue;
    out.push({ amount, currency, label: format(amount, currency), raw: m[0], index: m.index });
    seen.add(m.index);
  }

  const codeAfter = new RegExp(String.raw`(${NUMBER})\s?(${CODES.join("|")}|lei)\b`, "gi");
  for (const m of text.matchAll(codeAfter)) {
    const [number, code] = [m[1], m[2]];
    if (!number || !code) continue;
    const amount = parseAmount(number);
    if (amount === undefined) continue;
    const currency = code.toLowerCase() === "lei" ? "RON" : code.toUpperCase();
    if ([...seen].some((i) => Math.abs(i - m.index) < 4)) continue;
    out.push({ amount, currency, label: format(amount, currency), raw: m[0], index: m.index });
  }

  return out.sort((a, b) => a.index - b.index);
}

/** The amount a bill is actually asking for: the largest one on the page. */
export function pickAmount(text: string): MoneyMatch | undefined {
  const all = findMoney(text);
  if (all.length === 0) return undefined;
  return all.reduce((best, m) => (m.amount > best.amount ? m : best));
}
