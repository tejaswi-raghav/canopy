import * as turf from "@turf/turf";
import { areaM2, centroidOf, polyFrom, pointInPoly, unionAll } from "@/lib/geo";
import { uniformHours } from "@/lib/hours";
import {
  AMENITY_KEYS,
  type Amenities,
  type AmenityKey,
  type AreaDataset,
  type LonLat,
  type Neighbourhood,
  type Park,
  type ParkKind,
  type PopulationCell,
  type Poly,
  type Provenance,
} from "@/lib/types";

/**
 * DEMONSTRATION DATA — synthetic.
 * Neighbourhood centres are real localities of Hyderabad so the map lands in the right place, but
 * every boundary, park, facility, population figure and assessment below is generated from a fixed
 * seed for product demonstration. None of it describes the real parks or residents.
 */

export const DEMO_OBSERVED = "2026-01-01";
export const demoProv = (method: string): Provenance => ({
  source: "Canopy demonstration dataset (synthetic)",
  observedAt: DEMO_OBSERVED,
  method,
  confidence: "n/a",
  demo: true,
});

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

interface Seed {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  /** illustrative residents per km² */
  density: number;
  /** illustrative parks per km² */
  parkRate: number;
}

export const DEMO_SEEDS: Seed[] = [
  { id: "jubilee-hills", code: "JH", name: "Jubilee Hills", lat: 17.4326, lon: 78.4071, radiusKm: 1.8, density: 9000, parkRate: 3.0 },
  { id: "banjara-hills", code: "BH", name: "Banjara Hills", lat: 17.4156, lon: 78.4347, radiusKm: 1.6, density: 11000, parkRate: 2.4 },
  { id: "gachibowli", code: "GB", name: "Gachibowli", lat: 17.4401, lon: 78.3489, radiusKm: 2.0, density: 8000, parkRate: 1.6 },
  { id: "kukatpally", code: "KP", name: "Kukatpally", lat: 17.4948, lon: 78.3996, radiusKm: 2.0, density: 21000, parkRate: 0.8 },
  { id: "quthbullapur", code: "QB", name: "Quthbullapur", lat: 17.5133, lon: 78.4560, radiusKm: 2.0, density: 14000, parkRate: 0.7 },
  { id: "secunderabad", code: "SC", name: "Secunderabad", lat: 17.4399, lon: 78.4983, radiusKm: 1.7, density: 17000, parkRate: 1.4 },
  { id: "old-city", code: "OC", name: "Old City", lat: 17.3616, lon: 78.4747, radiusKm: 1.5, density: 38000, parkRate: 0.4 },
  { id: "lb-nagar", code: "LB", name: "LB Nagar", lat: 17.3457, lon: 78.5522, radiusKm: 1.8, density: 24000, parkRate: 0.5 },
];

function blob(center: LonLat, radiusM: number, r: () => number, sides = 10): Poly {
  const pts: number[][] = [];
  for (let i = 0; i < sides; i++) {
    const ang = (i / sides) * Math.PI * 2;
    const rad = radiusM * (0.75 + r() * 0.5);
    const d = turf.destination(center, rad / 1000, (ang * 180) / Math.PI, { units: "kilometers" }).geometry.coordinates;
    pts.push(d);
  }
  pts.push(pts[0]);
  return polyFrom([pts]);
}

function boundaryFor(s: Seed): Poly {
  return blob([s.lon, s.lat], s.radiusKm * 1000, rng(hash(s.id)), 14);
}

function randomPointIn(poly: Poly, r: () => number): LonLat {
  const [x0, y0, x1, y1] = turf.bbox(poly);
  for (let i = 0; i < 200; i++) {
    const p: LonLat = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    if (pointInPoly(p, poly)) return p;
  }
  return centroidOf(poly);
}

function amenitiesFor(r: () => number, richness: number): Amenities {
  const a: Amenities = {};
  for (const k of AMENITY_KEYS) {
    const x = r();
    // each facility is confirmed present, confirmed absent, or left unverified (undefined)
    const pPresent = k === "benches" || k === "walking_track" ? 0.65 * richness + 0.15 : 0.35 * richness;
    if (x < pPresent) a[k as AmenityKey] = "available";
    else if (x < pPresent + 0.2) a[k as AmenityKey] = "unavailable";
    else if (x < pPresent + 0.35) a[k as AmenityKey] = "unverified";
  }
  return a;
}

const KINDS: ParkKind[] = ["park", "park", "park", "garden", "playground", "recreation_ground"];

function makeParks(s: Seed, boundary: Poly): Park[] {
  const r = rng(hash(s.id) ^ 0x9e3779b9);
  const km2 = areaM2(boundary) / 1e6;
  const count = Math.max(2, Math.round(km2 * s.parkRate));
  const richness = Math.min(1, s.parkRate / 2.5 + 0.2);
  const parks: Park[] = [];
  for (let i = 0; i < count; i++) {
    const c = randomPointIn(boundary, r);
    const kind = KINDS[Math.floor(r() * KINDS.length)];
    const radius = kind === "playground" ? 35 + r() * 30 : 60 + r() * 170;
    const geometry = blob(c, radius, r);
    const priv = r() < 0.12; // some mapped green space is private and must not count as public
    const num = String(i + 1).padStart(2, "0");
    const hasAssessment = r() < 0.55;
    const hasVeg = r() < 0.8;
    const park: Park = {
      id: `demo-${s.id}-${num}`,
      name: `Demo ${kind === "park" ? "Park" : kind === "garden" ? "Garden" : kind === "playground" ? "Playground" : "Recreation Ground"} ${s.code}-${num}`,
      kind,
      access: priv ? "private" : "public",
      geometry,
      centroid: centroidOf(geometry),
      areaM2: areaM2(geometry),
      hours: r() < 0.85 ? uniformHours(r() < 0.5 ? "05:00" : "05:30", r() < 0.5 ? "20:00" : "21:00", "Demo", false) : null,
      feeInr: r() < 0.8 ? 0 : 10,
      authority: priv ? null : "Demo municipal authority",
      amenities: amenitiesFor(r, richness),
      vegetation: hasVeg
        ? {
            ndviMean: 0.28 + r() * 0.42,
            canopyPct: 6 + r() * 34,
            ndviSeasonMin: 0.2 + r() * 0.2,
            observedAt: DEMO_OBSERVED,
            source: "Demonstration values",
          }
        : null,
      assessment: hasAssessment
        ? {
            maintenance: Math.round(40 + r() * 55),
            cleanliness: Math.round(40 + r() * 55),
            kind: "community",
            assessedAt: DEMO_OBSERVED,
            source: "Demonstration community observations",
          }
        : { maintenance: null, cleanliness: null, kind: "none", assessedAt: null, source: null },
      neighbourhoodId: s.id,
      provenance: demoProv("Synthetic polygon generated from a fixed seed."),
    };
    parks.push(park);
  }
  return parks;
}

const CELL_M = 250;
function makeCells(s: Seed, boundary: Poly): PopulationCell[] {
  const r = rng(hash(s.id) ^ 0x1234567);
  const [x0, y0, x1, y1] = turf.bbox(boundary);
  const cells: PopulationCell[] = [];
  const dLat = CELL_M / 111_320;
  const center = centroidOf(boundary);
  const maxR = s.radiusKm * 1000;
  let k = 0;
  for (let y = y0 + dLat / 2; y < y1; y += dLat) {
    const dLon = CELL_M / (111_320 * Math.cos((y * Math.PI) / 180));
    for (let x = x0 + dLon / 2; x < x1; x += dLon) {
      const pt: LonLat = [x, y];
      if (!pointInPoly(pt, boundary)) continue;
      const d = turf.distance(center, pt, { units: "meters" });
      const falloff = 1.25 - 0.5 * (d / maxR);
      const pop = Math.round(s.density * ((CELL_M * CELL_M) / 1e6) * falloff * (0.7 + 0.6 * r()));
      cells.push({ id: `${s.id}-c${k++}`, center: pt, population: pop, areaM2: CELL_M * CELL_M });
    }
  }
  return cells;
}

const cache = new Map<string, AreaDataset>();

export const DEMO_SLUGS = ["hyderabad", ...DEMO_SEEDS.map((s) => s.id)];

export function demoDataset(slug: string): AreaDataset | null {
  if (cache.has(slug)) return cache.get(slug)!;
  const seeds = slug === "hyderabad" ? DEMO_SEEDS : DEMO_SEEDS.filter((s) => s.id === slug);
  if (!seeds.length) return null;

  const hoods: Neighbourhood[] = [];
  let parks: Park[] = [];
  let cells: PopulationCell[] = [];
  const boundaries: Poly[] = [];
  for (const s of seeds) {
    const b = boundaryFor(s);
    boundaries.push(b);
    hoods.push({ id: s.id, name: s.name, city: "Hyderabad", boundary: b, boundaryIsApproximate: true });
    parks = parks.concat(makeParks(s, b));
    cells = cells.concat(makeCells(s, b));
  }
  const boundary = seeds.length === 1 ? boundaries[0] : (unionAll(boundaries) as Poly);
  const total = cells.reduce((a, c) => a + c.population, 0);
  const ds: AreaDataset = {
    slug,
    label: seeds.length === 1 ? `${seeds[0].name}, Hyderabad` : "Hyderabad (demonstration, 8 localities)",
    mode: "demo",
    boundary,
    boundaryProvenance: demoProv("Illustrative boundary around a real locality centre; not an official ward polygon."),
    parks,
    population: { total, cells, provenance: demoProv("Synthetic 250 m grid; illustrative densities, not census values.") },
    vegetation: null,
    neighbourhoods: hoods,
    warnings: [
      "Demonstration data. Names, boundaries, facilities, population and assessments are synthetic and do not describe real places.",
    ],
  };
  // synthetic vegetation, derived from the synthetic parks + a fixed share of non-park cover
  const km2 = areaM2(boundary);
  const parkArea = parks.reduce((a, p) => a + p.areaM2, 0);
  const share = 0.1 + 0.12 * (seeds.reduce((a, s) => a + s.parkRate, 0) / seeds.length / 3);
  ds.vegetation = {
    vegetatedAreaM2: Math.min(km2 * 0.6, parkArea + km2 * share),
    canopyPct: Math.round(share * 100 * 0.6),
    provenance: demoProv("Synthetic value, not satellite-derived."),
  };
  cache.set(slug, ds);
  return ds;
}
