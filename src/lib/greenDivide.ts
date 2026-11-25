import { distanceToPolyM } from "./geo";
import { isPublicPark } from "./metrics";
import { computeQuality } from "./scoring";
import type { LonLat, Park, PopulationCell } from "./types";

/** Often-cited WHO-derived benchmark of 9 m² of green space per person. Configurable; see /methodology. */
export const DEFAULT_BENCHMARK_M2 = 9;
export const CATCHMENT_M = 1000;

export interface DivideCell {
  id: string;
  center: LonLat;
  population: number;
  densityPerKm2: number;
  nearestParkM: number | null;
  /** 2SFCA supply: public park m² available per resident within the catchment */
  supplyM2PerPerson: number;
  avgQuality: number | null;
  confirmedFacilities: number;
  /** 0..100, higher = greater unmet need. null if not computable */
  index: number | null;
  flagged: boolean;
  drivers: string[];
}

export interface DivideResult {
  cells: DivideCell[];
  medianDensity: number;
  p90Density: number;
  benchmark: number;
  flaggedPopulation: number;
  totalPopulation: number;
}

const M_PER_DEG_LAT = 111_320;
function quickLower(pt: LonLat, b: number[]) {
  const s = Math.cos((pt[1] * Math.PI) / 180);
  const dx = pt[0] < b[0] ? (b[0] - pt[0]) * M_PER_DEG_LAT * s : pt[0] > b[2] ? (pt[0] - b[2]) * M_PER_DEG_LAT * s : 0;
  const dy = pt[1] < b[1] ? (b[1] - pt[1]) * M_PER_DEG_LAT : pt[1] > b[3] ? (pt[1] - b[3]) * M_PER_DEG_LAT : 0;
  return Math.hypot(dx, dy);
}
function boundsOf(p: Park): number[] {
  const g = p.geometry.geometry;
  const rings = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of rings) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};

/**
 * Two-step floating catchment area (2SFCA) supply–demand ratio, a standard method for
 * park accessibility. Step 1: each park's area ÷ residents within its catchment.
 * Step 2: each cell sums the ratios of parks within reach.
 */
export function computeGreenDivide(
  cells: PopulationCell[],
  parksAll: Park[],
  opts: { benchmark?: number; catchmentM?: number } = {},
): DivideResult {
  const benchmark = opts.benchmark ?? DEFAULT_BENCHMARK_M2;
  const d0 = opts.catchmentM ?? CATCHMENT_M;
  const parks = parksAll.filter(isPublicPark);
  const bounds = parks.map(boundsOf);
  const quality = parks.map((p) => computeQuality(p));
  const facilityCount = parks.map(
    (p) =>
      (["walking_track", "running_track", "cycling_path", "outdoor_gym", "swings", "slides", "playground", "basketball", "badminton", "football", "yoga"] as const).filter(
        (k) => p.amenities[k] === "available",
      ).length,
  );

  // distance matrix with bounding-box pruning
  const dist: (number | null)[][] = cells.map((c) =>
    parks.map((p, j) => {
      const lower = quickLower(c.center, bounds[j]);
      if (lower > d0 * 3) return null; // too far to matter for any measure; nearest handled below
      return distanceToPolyM(c.center, p.geometry);
    }),
  );

  // step 1
  const R = parks.map((p, j) => {
    let pop = 0;
    cells.forEach((c, i) => {
      const d = dist[i][j];
      if (d !== null && d <= d0) pop += c.population;
    });
    return pop > 0 ? p.areaM2 / pop : 0;
  });

  const densities = cells.map((c) => (c.areaM2 > 0 ? c.population / (c.areaM2 / 1e6) : 0));
  const med = quantile(densities, 0.5);
  const p90 = quantile(densities, 0.9) || 1;

  const out: DivideCell[] = cells.map((c, i) => {
    let supply = 0;
    let nearest: number | null = null;
    const qs: number[] = [];
    let fac = 0;
    let nFac = 0;
    parks.forEach((_, j) => {
      const d = dist[i][j];
      if (d === null) return;
      if (nearest === null || d < nearest) nearest = d;
      if (d <= d0) {
        supply += R[j];
        if (quality[j].status === "scored") qs.push(quality[j].overall!);
        fac += facilityCount[j];
        nFac++;
      }
    });
    const density = densities[i];
    const comps: { w: number; v: number; why: string }[] = [];
    comps.push({ w: 0.35, v: 1 - Math.min(1, supply / benchmark), why: `${supply.toFixed(1)} m² of public park per resident within ${d0 / 1000} km (benchmark ${benchmark} m²)` });
    comps.push({ w: 0.25, v: nearest === null ? 1 : Math.min(1, nearest / 1200), why: nearest === null ? "no public park within reach" : `nearest park ${Math.round(nearest)} m away (straight line)` });
    comps.push({ w: 0.2, v: Math.min(1, density / p90), why: `${Math.round(density).toLocaleString("en-IN")} people/km²` });
    const avgQ = qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null;
    if (avgQ !== null) comps.push({ w: 0.1, v: 1 - avgQ / 100, why: `nearby parks average ${Math.round(avgQ)}/100 quality` });
    comps.push({ w: 0.1, v: nFac ? 1 - Math.min(1, fac / (6 * Math.max(1, nFac))) : 1, why: `${fac} confirmed recreation facilities nearby` });
    const wsum = comps.reduce((s, x) => s + x.w, 0);
    const index = Math.round((comps.reduce((s, x) => s + x.w * x.v, 0) / wsum) * 100);
    const drivers = [...comps].sort((a, b) => b.w * b.v - a.w * a.v).slice(0, 2).map((x) => x.why);
    return {
      id: c.id,
      center: c.center,
      population: c.population,
      densityPerKm2: density,
      nearestParkM: nearest,
      supplyM2PerPerson: supply,
      avgQuality: avgQ,
      confirmedFacilities: fac,
      index,
      flagged: index >= 60 && density >= med,
      drivers,
    };
  });

  return {
    cells: out,
    medianDensity: med,
    p90Density: p90,
    benchmark,
    flaggedPopulation: out.filter((c) => c.flagged).reduce((s, c) => s + c.population, 0),
    totalPopulation: cells.reduce((s, c) => s + c.population, 0),
  };
}

export interface Suggestion {
  cellId: string;
  center: LonLat;
  kind: "pocket_park_candidate" | "improve_existing_park" | "access_improvement";
  title: string;
  detail: string;
  priority: number;
  population: number;
}

export const FEASIBILITY_CAVEAT =
  "Candidate locations are indications only. Land ownership, environmental constraints and planning feasibility must be assessed before any decision.";

export function suggestInterventions(res: DivideResult, parks: Park[], limit = 8): Suggestion[] {
  const pub = parks.filter(isPublicPark);
  const sugg: Suggestion[] = [];
  for (const c of res.cells.filter((x) => x.flagged)) {
    const priority = (c.index ?? 0) * Math.log10(10 + c.population);
    if (c.nearestParkM === null || c.nearestParkM >= 800) {
      sugg.push({
        cellId: c.id, center: c.center, kind: "pocket_park_candidate", priority, population: c.population,
        title: "Pocket-park candidate area",
        detail: `Residents here are ${c.nearestParkM === null ? "beyond reach of any mapped public park" : `${Math.round(c.nearestParkM)} m from the nearest public park`}. Worth investigating for a small park. ${FEASIBILITY_CAVEAT}`,
      });
    } else {
      const near = pub.map((p) => ({ p, d: distanceToPolyM(c.center, p.geometry) })).sort((a, b) => a.d - b.d)[0];
      const q = near ? computeQuality(near.p) : null;
      if (near && q && (q.status === "insufficient" || q.overall! < 60 || c.supplyM2PerPerson < res.benchmark)) {
        sugg.push({
          cellId: c.id, center: c.center, kind: "improve_existing_park", priority, population: c.population,
          title: `Improve ${near.p.name}`,
          detail: `Serves a dense catchment with ${c.supplyM2PerPerson.toFixed(1)} m² of park per resident. ${q.status === "scored" ? `Current quality ${q.overall}/100.` : "Quality cannot be scored — verify facilities first."} ${q.improvements.slice(0, 2).join(" ")}`,
        });
      }
      if (near && near.p.amenities.accessible_paths !== "available") {
        sugg.push({
          cellId: c.id, center: c.center, kind: "access_improvement", priority: priority * 0.8, population: c.population,
          title: `Verify / improve accessible paths at ${near.p.name}`,
          detail: "Wheelchair-accessible paths are not confirmed at the nearest park.",
        });
      }
    }
  }
  return sugg.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
