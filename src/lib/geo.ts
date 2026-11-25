import * as turf from "@turf/turf";
import type { LonLat, Poly } from "./types";

/** Average adult walking speed used for catchments: 4.8 km/h = 80 m/min. */
export const WALK_M_PER_MIN = 80;
export const walkMinutesToMetres = (min: number) => min * WALK_M_PER_MIN;

export function polyFrom(coords: number[][][], props: Record<string, unknown> = {}): Poly {
  return { type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: coords } };
}

/** Geodesic (spherical) area in m². Adequate for park-scale polygons (<0.5% error); see /methodology. */
export function areaM2(p: Poly): number {
  try {
    return turf.area(p);
  } catch {
    return 0;
  }
}

export function centroidOf(p: Poly): LonLat {
  const c = turf.centroid(p).geometry.coordinates;
  return [c[0], c[1]];
}

/** Reject malformed geometry before it reaches area/union maths. */
export function isValidGeometry(p: Poly | null | undefined): boolean {
  if (!p || p.type !== "Feature" || !p.geometry) return false;
  const rings: number[][][] =
    p.geometry.type === "Polygon"
      ? [p.geometry.coordinates[0] ?? []]
      : p.geometry.type === "MultiPolygon"
        ? p.geometry.coordinates.map((c) => c[0] ?? [])
        : [];
  if (rings.length === 0) return false;
  for (const ring of rings) {
    if (ring.length < 4) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) return false;
    if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90))
      return false;
  }
  return areaM2(p) > 0;
}

/** Union without double counting. Returns null for an empty list. */
export function unionAll(polys: Poly[]): Poly | null {
  const valid = polys.filter(isValidGeometry);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  try {
    return turf.union(turf.featureCollection(valid as any)) as Poly | null;
  } catch {
    // Fall back to incremental union so one bad polygon cannot sink the whole area.
    let acc: Poly | null = null;
    for (const p of valid) {
      try {
        acc = acc ? ((turf.union(turf.featureCollection([acc, p] as any)) as Poly | null) ?? acc) : p;
      } catch {
        /* skip polygon */
      }
    }
    return acc;
  }
}

export function clipTo(boundary: Poly, p: Poly): Poly | null {
  try {
    return turf.intersect(turf.featureCollection([boundary, p] as any)) as Poly | null;
  } catch {
    return null;
  }
}

/** Metres from a point to the nearest edge of a polygon (0 when inside). Straight-line approximation. */
export function distanceToPolyM(pt: LonLat, p: Poly): number {
  const d = turf.pointToPolygonDistance(turf.point(pt), p as any, { units: "meters" });
  return d < 0 ? 0 : d;
}

export function haversineM(a: LonLat, b: LonLat): number {
  return turf.distance(turf.point(a), turf.point(b), { units: "meters" });
}

export function pointInPoly(pt: LonLat, p: Poly): boolean {
  return turf.booleanPointInPolygon(turf.point(pt), p as any);
}

export function bboxOf(p: Poly): [number, number, number, number] {
  const b = turf.bbox(p);
  return [b[0], b[1], b[2], b[3]];
}

/** Approximate walking-time ring for map display (a circle, labelled as straight-line). */
export function walkRing(center: LonLat, minutes: number): Poly {
  return turf.circle(center, walkMinutesToMetres(minutes), { units: "meters", steps: 64 }) as unknown as Poly;
}
