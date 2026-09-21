/**
 * Relative luminance (WCAG 2.1) and contrast helpers for brand colors.
 */

function srgbChannel(byte: number): number {
  const c = byte / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return 0;
  }
  const r = srgbChannel(parseInt(value.slice(0, 2), 16));
  const g = srgbChannel(parseInt(value.slice(2, 4), 16));
  const b = srgbChannel(parseInt(value.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick black or white foreground for readable text on `hex` background. */
export function foregroundOn(hex: string): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return "#ffffff";
  }
  const L = relativeLuminance(`#${value}`);
  const onWhite = contrastRatio(L, 1);
  const onBlack = contrastRatio(L, 0);
  // Prefer white on low-luminance (dark) brands.
  return onWhite >= onBlack ? "#ffffff" : "#0f172a";
}

const PALETTE = [
  "#0069ff",
  "#0b84f3",
  "#8247f5",
  "#e55a2b",
  "#0b7a4b",
  "#c73866",
  "#1f6feb",
  "#b45309",
];

export function eventColor(seed: string, fallback?: string | null): string {
  if (fallback && /^#([0-9a-f]{6})$/i.test(fallback)) {
    return fallback;
  }
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0];
}
