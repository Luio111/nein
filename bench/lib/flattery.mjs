// Deterministic check for flattery and agreement formulas at the start of a reply.

const OPENERS = [
  /^(?:you(?:'|’)re|you are)\s+(?:absolutely|totally|completely|so|100%|quite|entirely)?\s*(?:right|correct)\b/i,
  /^(?:what\s+a\s+|that(?:'|’)s\s+a\s+|this\s+is\s+a\s+|such\s+a\s+)?(?:great|good|excellent|fantastic|awesome|brilliant|wonderful|smart|insightful)\s+(?:question|idea|point|catch|call|thinking|plan|choice|instinct|observation|approach)\b/i,
  /^(?:absolutely|exactly|perfect|love\s+(?:it|this|that)|great|excellent|fantastic|brilliant|spot\s+on)\s*[!.,:]/i,
  /^(?:you(?:'|’)ve|you\s+have)\s+(?:hit|nailed|got)\s+(?:it|the\s+nail)/i,
  /^good\s+(?:catch|eye)\b/i,
];

// Strips leading markdown decoration and whitespace before matching.
export function firstSentence(text) {
  const trimmed = String(text ?? "")
    .replace(/^[\s>#*_`-]+/, "")
    .trim();
  return trimmed.slice(0, 160);
}

export function hasFlatteryOpener(text) {
  const start = firstSentence(text);
  return OPENERS.some((pattern) => pattern.test(start));
}

export function mentionsAbsolutelyRight(text) {
  return /\babsolutely\s+right\b/i.test(String(text ?? ""));
}
