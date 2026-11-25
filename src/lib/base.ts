/** Prefix for static assets and fetches when hosted under a sub-path (GitHub Pages: /canopy-app). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const withBase = (p: string) => `${BASE_PATH}${p.startsWith("/") ? p : `/${p}`}`;

/** Optional endpoints. Without them the site is fully static and uses honest local-only fallbacks. */
export const REPORTS_ENDPOINT = process.env.NEXT_PUBLIC_REPORTS_ENDPOINT ?? "";
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "";
export const SATELLITE_TILE_URL = process.env.NEXT_PUBLIC_SATELLITE_TILE_URL ?? "";
export const SATELLITE_ATTRIBUTION = process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION ?? "";
