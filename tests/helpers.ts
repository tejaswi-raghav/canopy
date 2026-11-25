import { areaM2, centroidOf, polyFrom } from "@/lib/geo";
import type { Park, Poly } from "@/lib/types";

export const box = (lon: number, lat: number, dLon: number, dLat: number): Poly =>
  polyFrom([[[lon, lat], [lon + dLon, lat], [lon + dLon, lat + dLat], [lon, lat + dLat], [lon, lat]]]);

export function mkPark(id: string, geom: Poly, over: Partial<Park> = {}): Park {
  return {
    id,
    name: id,
    kind: "park",
    access: "public",
    geometry: geom,
    centroid: centroidOf(geom),
    areaM2: areaM2(geom),
    hours: null,
    feeInr: null,
    authority: null,
    amenities: {},
    vegetation: null,
    assessment: { maintenance: null, cleanliness: null, kind: "none", assessedAt: null, source: null },
    provenance: { source: "test", observedAt: "2026-01-01", method: "test", confidence: "high" },
    ...over,
  };
}
