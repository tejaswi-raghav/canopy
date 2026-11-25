import { demoDataset } from "@/data/demo";
import { fetchParks } from "./adapters/osm";
import { geocode, hitToBoundary, type GeocodeHit } from "./adapters/geocode";
import { areaM2, bboxOf } from "./geo";
import { withBase } from "./base";
import type { AreaDataset, PopulationCell, Provenance } from "./types";

export const MAX_LIVE_AREA_KM2 = 400;

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

interface PopFile {
  total: number;
  cells?: { id: string; lon: number; lat: number; population: number; areaM2: number }[];
  source: string;
  observedAt: string;
  method: string;
}
interface VegFile {
  vegetatedAreaM2: number;
  canopyPct: number | null;
  source: string;
  observedAt: string;
  method: string;
}

async function optionalJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(withBase(path));
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Build a live dataset (OpenStreetMap) for a geocoder hit. Population / vegetation load only if the pipeline produced files. */
export async function liveDataset(hit: GeocodeHit, radiusKm = 2, signal?: AbortSignal): Promise<AreaDataset> {
  const { boundary, approximate } = hitToBoundary(hit, radiusKm);
  const km2 = areaM2(boundary) / 1e6;
  if (km2 > MAX_LIVE_AREA_KM2)
    throw new Error(`That area is ${Math.round(km2)} km², too large for live browser analysis (limit ${MAX_LIVE_AREA_KM2} km²). Pick a locality, or precompute the city with the backend pipeline.`);
  const parks = await fetchParks(bboxOf(boundary), boundary, signal);
  const slug = slugify(hit.label.split(",").slice(0, 2).join(" "));
  const warnings: string[] = [];
  if (approximate) warnings.push(`No official boundary polygon was available, so a ${radiusKm} km radius around the point is used.`);

  const popFile = await optionalJson<PopFile>(`/data/population/${slug}.json`);
  const vegFile = await optionalJson<VegFile>(`/data/vegetation/${slug}.json`);
  const popProv = (f: PopFile): Provenance => ({ source: f.source, observedAt: f.observedAt, method: f.method, confidence: "medium" });
  const cells: PopulationCell[] | null = popFile?.cells ? popFile.cells.map((c) => ({ id: c.id, center: [c.lon, c.lat], population: c.population, areaM2: c.areaM2 })) : null;

  return {
    slug,
    label: hit.label.split(",").slice(0, 3).join(","),
    mode: "live",
    boundary,
    boundaryProvenance: {
      source: approximate ? "User-defined radius" : "OpenStreetMap / Nominatim administrative boundary",
      observedAt: new Date().toISOString().slice(0, 10),
      method: approximate ? "Circle around geocoded point" : "Administrative polygon returned by the geocoder",
      confidence: approximate ? "low" : "medium",
    },
    parks,
    population: popFile ? { total: popFile.total, cells, provenance: popProv(popFile) } : null,
    vegetation: vegFile
      ? { vegetatedAreaM2: vegFile.vegetatedAreaM2, canopyPct: vegFile.canopyPct, provenance: { source: vegFile.source, observedAt: vegFile.observedAt, method: vegFile.method, confidence: "medium" } }
      : null,
    warnings,
  };
}

export async function resolveQuery(q: string, signal?: AbortSignal): Promise<{ demo: AreaDataset | null; hits: GeocodeHit[] }> {
  const s = slugify(q);
  const demo = demoDataset(s) ?? (s.includes("hyderabad") && !s.includes("-") ? demoDataset("hyderabad") : null);
  let hits: GeocodeHit[] = [];
  try {
    hits = await geocode(q, signal);
  } catch (e) {
    if (!demo) throw e;
  }
  return { demo, hits };
}
