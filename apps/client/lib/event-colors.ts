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

export function foregroundOn(hex: string): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return "#ffffff";
  }
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.45 ? "#ffffff" : "#0f172a";
}
