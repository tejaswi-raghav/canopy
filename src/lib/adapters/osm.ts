import { areaM2, centroidOf, isValidGeometry, pointInPoly, polyFrom } from "../geo";
import { dedupeParks } from "../dedupe";
import { parseOsmOpeningHours } from "../hours";
import type { Amenities, AccessKind, Park, ParkKind, Poly, Provenance } from "../types";

/* ---------------------------------------------------------------- types for the slice of Overpass JSON we use */

export interface OverpassElement {
  type: "way" | "relation" | "node";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
}
export interface OverpassResponse {
  elements: OverpassElement[];
  osm3s?: { timestamp_osm_base?: string };
}

const PARK_RE = "^(park|garden|playground|recreation_ground|nature_reserve)$";

export function buildOverpassQuery(bbox: [number, number, number, number], timeoutS = 90): string {
  const [w, s, e, n] = bbox;
  const b = `${s},${w},${n},${e}`;
  return `[out:json][timeout:${timeoutS}];
(way["leisure"~"${PARK_RE}"](${b});relation["leisure"~"${PARK_RE}"](${b}););
out geom tags;
(way["leisure"~"^(pitch|track|fitness_station|playground)$"](${b});
 node["leisure"~"^(fitness_station|playground)$"](${b});
 node["amenity"~"^(bench|drinking_water|toilets)$"](${b});
 node["playground"~"^(swing|slide)$"](${b}););
out center tags;`;
}

/* ---------------------------------------------------------------- geometry assembly */

type Pt = [number, number];
const key = (p: Pt) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
const toPts = (g: { lat: number; lon: number }[]): Pt[] => g.map((x) => [x.lon, x.lat]);

/** Join open way segments end-to-end into closed rings (relation outer/inner members). */
export function assembleRings(segments: Pt[][]): Pt[][] {
  const rings: Pt[][] = [];
  const open = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  while (open.length) {
    let ring = open.shift()!;
    let grew = true;
    while (grew && key(ring[0]) !== key(ring[ring.length - 1])) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const s = open[i];
        const end = key(ring[ring.length - 1]);
        if (key(s[0]) === end) ring = ring.concat(s.slice(1));
        else if (key(s[s.length - 1]) === end) ring = ring.concat([...s].reverse().slice(1));
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function elementPolygon(el: OverpassElement): Poly | null {
  if (el.type === "way" && el.geometry) {
    const pts = toPts(el.geometry);
    if (pts.length >= 4 && key(pts[0]) === key(pts[pts.length - 1])) return polyFrom([pts]);
    return null; // an unclosed way is a line, not an area
  }
  if (el.type === "relation" && el.members) {
    const outers = assembleRings(el.members.filter((m) => m.role === "outer" && m.geometry).map((m) => toPts(m.geometry!)));
    const inners = assembleRings(el.members.filter((m) => m.role === "inner" && m.geometry).map((m) => toPts(m.geometry!)));
    if (!outers.length) return null;
    const polys = outers.map((o) => [o]);
    // attach each hole to the first outer ring that contains its first vertex
    for (const hole of inners) {
      const test = hole[0];
      const idx = outers.findIndex((o) => pointInPoly(test, polyFrom([o])));
      if (idx >= 0) polys[idx].push(hole);
    }
    if (polys.length === 1) return polyFrom(polys[0]);
    return { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: polys } };
  }
  return null;
}

/* ---------------------------------------------------------------- tag interpretation */

function kindOf(tags: Record<string, string>): ParkKind {
  switch (tags.leisure) {
    case "park": return "park";
    case "garden": return "garden";
    case "playground": return "playground";
    case "recreation_ground": return "recreation_ground";
    case "nature_reserve": return "nature_reserve";
    default: return "other_green";
  }
}

/**
 * Access follows OSM convention: leisure=park / playground / recreation_ground are public unless an access
 * tag says otherwise. Gardens and reserves are NOT assumed public (many are private) and stay `unknown`.
 */
export function accessOf(tags: Record<string, string>, kind: ParkKind): AccessKind {
  const a = tags.access;
  if (a === "private" || a === "no") return "private";
  if (a === "customers" || a === "permit" || a === "members") return "restricted";
  if (a === "yes" || a === "permissive") return "public";
  return kind === "park" || kind === "playground" || kind === "recreation_ground" ? "public" : "unknown";
}

const yn = (v: string | undefined): "available" | "unavailable" | undefined =>
  v === "yes" ? "available" : v === "no" ? "unavailable" : undefined;

function amenitiesFromParkTags(t: Record<string, string>): Amenities {
  const a: Amenities = {};
  const set = <K extends keyof Amenities>(k: K, v: Amenities[K] | undefined) => v && (a[k] = v);
  set("lighting", yn(t.lit));
  set("accessible_paths", t.wheelchair === "yes" || t.wheelchair === "designated" ? "available" : t.wheelchair === "no" ? "unavailable" : undefined);
  set("pet_friendly", t.dog === "yes" || t.dog === "leashed" ? "available" : t.dog === "no" ? "unavailable" : undefined);
  set("toilets", yn(t.toilets));
  set("drinking_water", yn(t.drinking_water));
  set("benches", yn(t.bench));
  return a;
}

function applyFeature(a: Amenities, t: Record<string, string>) {
  if (t.leisure === "pitch") {
    const sport = (t.sport ?? "").split(";");
    if (sport.includes("basketball")) a.basketball = "available";
    if (sport.includes("badminton")) a.badminton = "available";
    if (sport.includes("soccer") || sport.includes("football")) a.football = "available";
  }
  if (t.leisure === "track") {
    if ((t.sport ?? "").match(/running|athletics/)) a.running_track = "available";
    else a.walking_track = "available";
  }
  if (t.leisure === "fitness_station") a.outdoor_gym = "available";
  if (t.leisure === "playground") a.playground = "available";
  if (t.playground === "swing") a.swings = "available";
  if (t.playground === "slide") a.slides = "available";
  if (t.amenity === "bench") a.benches = "available";
  if (t.amenity === "drinking_water") a.drinking_water = "available";
  if (t.amenity === "toilets") a.toilets = "available";
}

/* ---------------------------------------------------------------- main parser */

export function parseOverpass(resp: OverpassResponse, boundary?: Poly): Park[] {
  const observedAt = resp.osm3s?.timestamp_osm_base?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const prov: Provenance = {
    source: "OpenStreetMap contributors (ODbL) via Overpass API",
    observedAt,
    method: "Park polygons from OSM leisure tags; facilities from tagged features inside each polygon. Untagged facilities are 'unverified', never 'absent'.",
    confidence: "medium",
  };
  const features = resp.elements.filter((e) => e.tags && !(e.tags.leisure && /^(park|garden|playground|recreation_ground|nature_reserve)$/.test(e.tags.leisure) && (e.geometry || e.members)));
  const parks: Park[] = [];
  for (const el of resp.elements) {
    const t = el.tags;
    if (!t?.leisure || !/^(park|garden|playground|recreation_ground|nature_reserve)$/.test(t.leisure)) continue;
    if (!el.geometry && !el.members) continue;
    const geom = elementPolygon(el);
    if (!geom || !isValidGeometry(geom)) continue;
    const kind = kindOf(t);
    const c = centroidOf(geom);
    const amenities = amenitiesFromParkTags(t);
    parks.push({
      id: `osm-${el.type}-${el.id}`,
      osmRef: `${el.type}/${el.id}`,
      name: t.name ?? t["name:en"] ?? `Unnamed ${kind.replace(/_/g, " ")}`,
      kind,
      access: accessOf(t, kind),
      geometry: geom,
      centroid: c,
      areaM2: areaM2(geom),
      hours: parseOsmOpeningHours(t.opening_hours),
      feeInr: t.fee === "no" ? 0 : null,
      authority: t.operator ?? null,
      amenities,
      vegetation: null,
      assessment: { maintenance: null, cleanliness: null, kind: "none", assessedAt: null, source: null },
      provenance: prov,
    });
  }
  // facilities → parks (point-in-polygon on element centre)
  for (const f of features) {
    const pt: [number, number] | null = f.center ? [f.center.lon, f.center.lat] : f.lat !== undefined && f.lon !== undefined ? [f.lon, f.lat] : null;
    if (!pt || !f.tags) continue;
    for (const p of parks) {
      if (pointInPoly(pt, p.geometry)) applyFeature(p.amenities, f.tags);
    }
  }
  // Boundary clipping happens later in computeAreaMetrics so parks straddling the edge are measured correctly.
  void boundary;
  return dedupeParks(parks);
}

/* ---------------------------------------------------------------- network */

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export async function fetchParks(
  bbox: [number, number, number, number],
  boundary?: Poly,
  signal?: AbortSignal,
  endpoint = OVERPASS_URL,
): Promise<Park[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    body: new URLSearchParams({ data: buildOverpassQuery(bbox) }),
    signal,
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  return parseOverpass((await res.json()) as OverpassResponse, boundary);
}
