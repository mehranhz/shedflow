import type { CSSProperties } from "react";

import { foregroundOn } from "@/lib/event-colors";

export const DEFAULT_BRAND = "#0069ff";

export function brandStyle(brandColor?: string | null): CSSProperties {
  const brand = brandColor && /^#([0-9a-f]{6})$/i.test(brandColor) ? brandColor : DEFAULT_BRAND;
  const foreground = foregroundOn(brand);
  return {
    "--brand": brand,
    "--brand-foreground": foreground,
    "--primary": brand,
    "--primary-foreground": foreground,
    "--ring": brand,
  } as CSSProperties;
}
