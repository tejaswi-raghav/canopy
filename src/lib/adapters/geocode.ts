import * as turf from "@turf/turf";
import { centroidOf, isValidGeometry, polyFrom } from "../geo";
import type { LonLat, Poly } from "../types";

export interface GeocodeHit {
  label: string;
  center: LonLat;
  bbox: [number, number, number, number];
  /** administrative polygon if the provider has one; otherwise null (a radius area is used) */
  boundary: Poly | null;
  kind: string;
}

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export function parseNominatim(rows: any[]): GeocodeHit[] {
  const hits: GeocodeHit[] = [];
  for (const r of rows ?? []) {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const bb = (r.boundingbox ?? []).map(Number); // [south, north, west, east]
    const bbox: [number, number, number, number] = bb.length === 4 && bb.every(Number.isFinite) ? [bb[2], bb[0], bb[3], bb[1]] : [lon - 0.02, lat - 0.02, lon + 0.02, lat + 0.02];
    let boundary: Poly | null = null;
    const g = r.geojson;
    if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) {
      const f: Poly = { type: "Feature", properties: {}, geometry: g };
      if (isValidGeometry(f)) boundary = f;
    }
    hits.push({ label: String(r.display_name ?? ""), center: [lon, lat], bbox, boundary, kind: String(r.type ?? r.class ?? "place") });
  }
  return hits;
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (q.length < 2 || q.length > 120) throw new Error("Enter a city, locality, PIN code or address (2–120 characters).");
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q,
    format: "jsonv2",
    polygon_geojson: "1",
    countrycodes: "in",
    limit: "6",
    addressdetails: "0",
  })}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
  return parseNominatim(await res.json());
}

/** A user-defined neighbourhood: a circle around a point (used for "current location" and when no official polygon exists). */
export function radiusBoundary(center: LonLat, km: number): Poly {
  return turf.circle(center, km, { units: "kilometers", steps: 48 }) as unknown as Poly;
}

export function hitToBoundary(hit: GeocodeHit, fallbackKm = 2): { boundary: Poly; approximate: boolean } {
  if (hit.boundary) return { boundary: hit.boundary, approximate: false };
  return { boundary: radiusBoundary(hit.center, fallbackKm), approximate: true };
}

export { centroidOf, polyFrom };
