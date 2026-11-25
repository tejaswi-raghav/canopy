import { areaM2, clipTo, distanceToPolyM, unionAll, walkMinutesToMetres } from "./geo";
import type { AreaDataset, LonLat, Metric, Park, PopulationCell, Poly, Provenance } from "./types";

export const PUBLIC_KINDS = new Set(["park", "garden", "playground", "recreation_ground"]);

export const isPublicPark = (p: Park) => p.access === "public" && PUBLIC_KINDS.has(p.kind);

/* ------------------------------------------------------------------ pure formulas */

export const greenSpacePerPerson = (greenM2: number, population: number): number | null =>
  population > 0 ? greenM2 / population : null;

export const vegetationPercent = (vegetatedM2: number, totalM2: number): number | null =>
  totalM2 > 0 ? (vegetatedM2 / totalM2) * 100 : null;

export const parksPer10k = (count: number, population: number): number | null =>
  population > 0 ? (count / population) * 10_000 : null;

/* ------------------------------------------------------------------ spatial helpers */

const M_PER_DEG_LAT = 111_320;

export function nearestPark(
  pt: LonLat,
  parks: Park[],
  maxM = Infinity,
): { park: Park; distM: number } | null {
  let best: { park: Park; distM: number } | null = null;
  const lonScale = Math.cos((pt[1] * Math.PI) / 180);
  for (const p of parks) {
    const b = p.geometry.bbox ?? bboxFast(p.geometry);
    const dx =
      pt[0] < b[0] ? (b[0] - pt[0]) * M_PER_DEG_LAT * lonScale : pt[0] > b[2] ? (pt[0] - b[2]) * M_PER_DEG_LAT * lonScale : 0;
    const dy = pt[1] < b[1] ? (b[1] - pt[1]) * M_PER_DEG_LAT : pt[1] > b[3] ? (pt[1] - b[3]) * M_PER_DEG_LAT : 0;
    const lower = Math.hypot(dx, dy); // never exceeds the true distance to the polygon
    if (lower > maxM || (best && lower >= best.distM)) continue;
    const d = distanceToPolyM(pt, p.geometry);
    if (d <= maxM && (!best || d < best.distM)) best = { park: p, distM: d };
  }
  return best;
}

function bboxFast(g: Poly): number[] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const rings = g.geometry.type === "Polygon" ? [g.geometry.coordinates] : g.geometry.coordinates;
  for (const poly of rings) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

/** Share of residents (0..100) whose cell centre is within `minutes` of a public park edge. Straight-line. */
export function walkCoverage(cells: PopulationCell[], parks: Park[], minutes: number): number | null {
  const total = cells.reduce((s, c) => s + c.population, 0);
  if (total <= 0) return null;
  const pub = parks.filter(isPublicPark);
  const R = walkMinutesToMetres(minutes);
  let served = 0;
  for (const c of cells) if (nearestPark(c.center, pub, R)) served += c.population;
  return (served / total) * 100;
}

/* ------------------------------------------------------------------ area metrics */

export interface AreaMetrics {
  metrics: Metric[];
  byKey: Record<string, Metric>;
  /** unioned, boundary-clipped public park geometry (for display and double-count checks) */
  publicUnion: Poly | null;
  boundaryAreaM2: number;
  publicParkAreaM2: number;
  mappedGreenAreaM2: number;
  publicParkCount: number;
  walk: { 5: number | null; 10: number | null; 15: number | null };
}

function unavailable(key: string, label: string, unit: string, why: string, prov: Provenance): Metric {
  return { key, label, unit, value: null, provenance: { ...prov, confidence: "n/a" }, note: why };
}

export function computeAreaMetrics(ds: AreaDataset): AreaMetrics {
  const demo = ds.mode === "demo";
  const boundaryArea = areaM2(ds.boundary);
  const parkProv: Provenance = {
    source: demo ? "Canopy demonstration dataset (synthetic)" : "OpenStreetMap contributors (ODbL)",
    observedAt: ds.parks[0]?.provenance.observedAt ?? null,
    method: "Polygons clipped to the selected boundary; duplicates merged; union used so overlapping polygons are counted once.",
    confidence: demo ? "n/a" : "medium",
    demo,
  };

  // Clip to the boundary first so a park straddling the edge contributes only its inside part.
  const inside = ds.parks
    .map((p) => ({ park: p, clipped: clipTo(ds.boundary, p.geometry) }))
    .filter((x): x is { park: Park; clipped: Poly } => x.clipped !== null);

  const publicInside = inside.filter((x) => isPublicPark(x.park));
  const publicUnion = unionAll(publicInside.map((x) => x.clipped));
  const publicArea = publicUnion ? areaM2(publicUnion) : 0;

  const greenUnion = unionAll(inside.filter((x) => PUBLIC_KINDS.has(x.park.kind)).map((x) => x.clipped));
  const mappedGreenArea = greenUnion ? areaM2(greenUnion) : 0;
  const unconfirmedArea = Math.max(0, mappedGreenArea - publicArea);

  const parksCount = publicInside.filter((x) => x.park.kind === "park").length;
  const gardensRec = publicInside.filter((x) => x.park.kind !== "park").length;

  const m: Metric[] = [];
  const add = (x: Metric) => m.push(x);

  add({ key: "parks_count", label: "Mapped public parks", unit: "parks", value: parksCount, provenance: parkProv });
  add({
    key: "gardens_count",
    label: "Public gardens & recreation spaces",
    unit: "spaces",
    value: gardensRec,
    provenance: parkProv,
  });
  add({
    key: "boundary_area",
    label: "Area analysed",
    unit: "km²",
    value: boundaryArea / 1e6,
    provenance: ds.boundaryProvenance,
  });
  add({
    key: "public_park_area",
    label: "Public park area",
    unit: "ha",
    value: publicArea / 1e4,
    provenance: parkProv,
    note: unconfirmedArea > 0 ? `A further ${(unconfirmedArea / 1e4).toFixed(1)} ha of mapped green space has unconfirmed public access and is excluded.` : undefined,
  });
  add({
    key: "public_park_pct",
    label: "Land in public parks",
    unit: "%",
    value: vegetationPercent(publicArea, boundaryArea),
    provenance: parkProv,
  });
  add({
    key: "avg_park_size",
    label: "Average public park size",
    unit: "ha",
    value: publicInside.length ? publicArea / publicInside.length / 1e4 : null,
    provenance: parkProv,
    note: publicInside.length ? undefined : "No public parks mapped.",
  });

  if (ds.vegetation) {
    add({
      key: "vegetation_area",
      label: "Vegetated area",
      unit: "km²",
      value: ds.vegetation.vegetatedAreaM2 / 1e6,
      provenance: ds.vegetation.provenance,
      note: "All vegetation — includes private land, farmland and forest. Not equal to public park area.",
    });
    add({
      key: "vegetation_pct",
      label: "Vegetation cover",
      unit: "%",
      value: vegetationPercent(ds.vegetation.vegetatedAreaM2, boundaryArea),
      provenance: ds.vegetation.provenance,
    });
    add(
      ds.vegetation.canopyPct !== null
        ? { key: "canopy_pct", label: "Tree canopy cover", unit: "%", value: ds.vegetation.canopyPct, provenance: ds.vegetation.provenance }
        : unavailable("canopy_pct", "Tree canopy cover", "%", "No canopy dataset processed for this area.", ds.vegetation.provenance),
    );
  } else {
    const prov: Provenance = { source: "Sentinel-2 / ESA WorldCover (not processed)", observedAt: null, method: "—", confidence: "n/a" };
    const why = "Vegetation cover has not been processed for this area. Run the pipeline in backend/ (see README).";
    add(unavailable("vegetation_pct", "Vegetation cover", "%", why, prov));
    add(unavailable("canopy_pct", "Tree canopy cover", "%", why, prov));
  }

  if (ds.population) {
    const pp = ds.population.provenance;
    add({ key: "population", label: "Estimated population", unit: "people", value: ds.population.total, provenance: pp });
    add({
      key: "density",
      label: "Population density",
      unit: "people/km²",
      value: boundaryArea > 0 ? ds.population.total / (boundaryArea / 1e6) : null,
      provenance: pp,
    });
    add({
      key: "public_park_per_resident",
      label: "Public park area per resident",
      unit: "m²",
      value: greenSpacePerPerson(publicArea, ds.population.total),
      provenance: { ...parkProv, source: `${parkProv.source} ÷ ${pp.source}`, confidence: lowest(parkProv.confidence, pp.confidence) },
    });
    add({
      key: "green_per_resident",
      label: "Mapped green space per resident",
      unit: "m²",
      value: greenSpacePerPerson(mappedGreenArea, ds.population.total),
      provenance: { ...parkProv, source: `${parkProv.source} ÷ ${pp.source}`, confidence: lowest(parkProv.confidence, pp.confidence) },
      note: "Includes mapped green space whose public access is not confirmed.",
    });
    add({
      key: "parks_per_10k",
      label: "Public parks per 10,000 residents",
      unit: "parks",
      value: parksPer10k(publicInside.length, ds.population.total),
      provenance: parkProv,
    });
  } else {
    const prov: Provenance = { source: "GHSL / WorldPop / Census (not loaded)", observedAt: null, method: "—", confidence: "n/a" };
    const why = "No population estimate loaded for this area, so per-resident metrics cannot be calculated.";
    for (const [k, l, u] of [
      ["population", "Estimated population", "people"],
      ["density", "Population density", "people/km²"],
      ["public_park_per_resident", "Public park area per resident", "m²"],
      ["green_per_resident", "Mapped green space per resident", "m²"],
      ["parks_per_10k", "Public parks per 10,000 residents", "parks"],
    ] as const)
      add(unavailable(k, l, u, why, prov));
  }

  const walk: AreaMetrics["walk"] = { 5: null, 10: null, 15: null };
  const cells = ds.population?.cells ?? null;
  for (const min of [5, 10, 15] as const) {
    if (cells && cells.length) {
      walk[min] = walkCoverage(cells, publicInside.map((x) => x.park), min);
      add({
        key: `walk_${min}`,
        label: `Residents within a ${min}-minute walk of a park`,
        unit: "%",
        value: walk[min],
        provenance: {
          source: "Population grid + park polygons",
          observedAt: ds.population?.provenance.observedAt ?? null,
          method: `Straight-line distance ≤ ${walkMinutesToMetres(min)} m (4.8 km/h) from grid-cell centre to park edge. Approximation — not network distance.`,
          confidence: "low",
          demo,
        },
      });
    } else {
      add(
        unavailable(
          `walk_${min}`,
          `Residents within a ${min}-minute walk of a park`,
          "%",
          "Needs a gridded population layer.",
          parkProv,
        ),
      );
    }
  }

  return {
    metrics: m,
    byKey: Object.fromEntries(m.map((x) => [x.key, x])),
    publicUnion,
    boundaryAreaM2: boundaryArea,
    publicParkAreaM2: publicArea,
    mappedGreenAreaM2: mappedGreenArea,
    publicParkCount: publicInside.length,
    walk,
  };
}

const RANK = { high: 3, medium: 2, low: 1, "n/a": 0 } as const;
function lowest(a: keyof typeof RANK, b: keyof typeof RANK): keyof typeof RANK {
  return RANK[a] <= RANK[b] ? a : b;
}
