import type { AmenityKey, Amenities, Confidence, Park } from "./types";

export const QUALITY_WEIGHTS = {
  maintenance: 0.25,
  vegetation: 0.2,
  facilities: 0.2,
  safety: 0.15,
  accessibility: 0.1,
  comfort: 0.1,
} as const;
export type QualityKey = keyof typeof QUALITY_WEIGHTS;

const LABELS: Record<QualityKey, string> = {
  maintenance: "Cleanliness & maintenance",
  vegetation: "Vegetation & shade",
  facilities: "Recreational facilities",
  safety: "Safety infrastructure",
  accessibility: "Accessibility",
  comfort: "Comfort & basic amenities",
};

const RECREATION: AmenityKey[] = [
  "walking_track",
  "running_track",
  "cycling_path",
  "outdoor_gym",
  "swings",
  "slides",
  "playground",
  "basketball",
  "badminton",
  "football",
  "yoga",
];

/** Minimum evidence before a provisional score may be shown. */
export const MIN_WEIGHT_COVERAGE = 0.45;
export const MIN_COMPONENTS = 2;

export interface QualityComponent {
  key: QualityKey;
  label: string;
  weight: number;
  /** 0..100, or null when there is no evidence */
  score: number | null;
  evidence: string[];
  /** true when the score only reflects confirmed items and may under-state the park */
  lowerBound: boolean;
}

export interface QualityResult {
  status: "scored" | "insufficient";
  overall: number | null;
  components: QualityComponent[];
  /** share of total weight backed by evidence, 0..1 */
  completeness: number;
  confidence: Confidence;
  assessedAt: string | null;
  basis: "derived" | "derived+inspection" | "derived+community";
  improvements: string[];
  disclaimer: string;
}

export const QUALITY_DISCLAIMER =
  "The Canopy Park Quality Score is computed from the evidence shown. It is not an official municipal inspection.";

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** available → 100, unavailable → 0, unverified → excluded (absence of data is not absence of a facility). */
function verifiedAvg(a: Amenities, keys: AmenityKey[], weights: Partial<Record<AmenityKey, number>> = {}) {
  let num = 0;
  let den = 0;
  const lines: string[] = [];
  for (const k of keys) {
    const s = a[k];
    if (s !== "available" && s !== "unavailable") continue;
    const w = weights[k] ?? 1;
    num += (s === "available" ? 100 : 0) * w;
    den += w;
    lines.push(`${k.replace(/_/g, " ")}: ${s}`);
  }
  return { score: den > 0 ? num / den : null, n: lines.length, lines };
}

export function scoreVegetation01(ndviMean: number): number {
  // NDVI 0.15 (sparse) → 0, 0.65+ (dense healthy vegetation) → 100
  return clamp(((ndviMean - 0.15) / 0.5) * 100);
}
export const scoreCanopy = (pct: number) => clamp((pct / 40) * 100); // 40 % canopy ≈ excellent for a park

export function computeQuality(park: Park): QualityResult {
  const a = park.amenities;
  const comps: QualityComponent[] = [];
  const push = (key: QualityKey, score: number | null, evidence: string[], lowerBound = false) =>
    comps.push({ key, label: LABELS[key], weight: QUALITY_WEIGHTS[key], score: score === null ? null : Math.round(score), evidence, lowerBound });

  // maintenance
  const as = park.assessment;
  const mVals = [as.maintenance, as.cleanliness].filter((x): x is number => x !== null);
  push(
    "maintenance",
    mVals.length ? mean(mVals) : null,
    mVals.length
      ? [`${as.kind === "official_inspection" ? "Official inspection" : "Community observations"} (${as.source ?? "source unspecified"}), ${as.assessedAt ?? "date unknown"}`]
      : ["No maintenance or cleanliness evidence"],
  );

  // vegetation & shade
  const v = park.vegetation;
  const vVals: number[] = [];
  const vEv: string[] = [];
  if (v?.ndviMean != null) {
    vVals.push(scoreVegetation01(v.ndviMean));
    vEv.push(`Mean NDVI ${v.ndviMean.toFixed(2)}`);
  }
  if (v?.canopyPct != null) {
    vVals.push(scoreCanopy(v.canopyPct));
    vEv.push(`Tree canopy ${v.canopyPct.toFixed(0)}%`);
  }
  push("vegetation", vVals.length ? mean(vVals) : null, vEv.length ? vEv : ["No vegetation measurement for this park"]);

  // facilities
  const avail = RECREATION.filter((k) => a[k] === "available").length;
  const verified = RECREATION.filter((k) => a[k] === "available" || a[k] === "unavailable").length;
  const unverified = RECREATION.length - verified;
  push(
    "facilities",
    verified > 0 ? Math.min(100, (avail / 6) * 100) : null,
    verified > 0 ? [`${avail} recreation facilities confirmed available`, `${unverified} not verified`] : ["No facility data"],
    unverified > 0,
  );

  const safety = verifiedAvg(a, ["lighting", "security"]);
  push("safety", safety.score, safety.n ? safety.lines : ["No safety data"], safety.n < 2);

  const acc = verifiedAvg(a, ["accessible_paths", "parking"], { accessible_paths: 2 });
  push("accessibility", acc.score, acc.n ? acc.lines : ["No accessibility data"], acc.n < 2);

  const comfort = verifiedAvg(a, ["benches", "drinking_water", "toilets", "shaded_seating"]);
  push("comfort", comfort.n >= 2 ? comfort.score : null, comfort.n >= 2 ? comfort.lines : ["Fewer than two comfort amenities verified"], comfort.n < 4);

  const scored = comps.filter((c) => c.score !== null);
  const weightCovered = scored.reduce((s, c) => s + c.weight, 0);
  const completeness = Math.round(weightCovered * 100) / 100;
  const enough = scored.length >= MIN_COMPONENTS && weightCovered >= MIN_WEIGHT_COVERAGE;

  const improvements: string[] = [];
  for (const c of comps) {
    if (c.score === null) improvements.push(`${c.label}: no evidence yet — needs verification.`);
    else if (c.score < 60) improvements.push(`${c.label}: scores ${c.score}/100 — ${c.lowerBound ? "some items unverified, " : ""}room to improve.`);
  }

  const overall = enough ? Math.round(scored.reduce((s, c) => s + c.score! * c.weight, 0) / weightCovered) : null;

  let confidence: Confidence = "low";
  if (enough) {
    if (completeness >= 0.85 && as.kind === "official_inspection") confidence = "high";
    else if (completeness >= 0.65) confidence = "medium";
  } else confidence = "n/a";

  return {
    status: enough ? "scored" : "insufficient",
    overall,
    components: comps,
    completeness,
    confidence,
    assessedAt: as.assessedAt ?? park.vegetation?.observedAt ?? park.provenance.observedAt,
    basis: as.kind === "official_inspection" ? "derived+inspection" : as.kind === "community" ? "derived+community" : "derived",
    improvements,
    disclaimer: QUALITY_DISCLAIMER,
  };
}

/* ------------------------------------------------------------------ ecological score (separate from visitor experience) */

export interface EcoResult {
  status: "scored" | "insufficient";
  overall: number | null;
  parts: { label: string; score: number | null; detail: string }[];
  note: string;
}

export function computeEcologicalScore(park: Park): EcoResult {
  const v = park.vegetation;
  const parts: EcoResult["parts"] = [
    {
      label: "Vegetation density (NDVI)",
      score: v?.ndviMean != null ? Math.round(scoreVegetation01(v.ndviMean)) : null,
      detail: v?.ndviMean != null ? `Mean NDVI ${v.ndviMean.toFixed(2)}` : "No NDVI measurement",
    },
    {
      label: "Tree canopy",
      score: v?.canopyPct != null ? Math.round(scoreCanopy(v.canopyPct)) : null,
      detail: v?.canopyPct != null ? `${v.canopyPct.toFixed(0)}% canopy` : "No canopy measurement",
    },
    {
      label: "Seasonal resilience",
      score:
        v?.ndviSeasonMin != null && v.ndviMean
          ? Math.round(clamp((v.ndviSeasonMin / v.ndviMean) * 100))
          : null,
      detail:
        v?.ndviSeasonMin != null && v.ndviMean
          ? `Dry-season NDVI is ${Math.round((v.ndviSeasonMin / v.ndviMean) * 100)}% of the annual mean`
          : "No seasonal series",
    },
  ];
  const w = [0.4, 0.35, 0.25];
  let num = 0;
  let den = 0;
  parts.forEach((p, i) => {
    if (p.score !== null) {
      num += p.score * w[i];
      den += w[i];
    }
  });
  const ok = den >= 0.4;
  return {
    status: ok ? "scored" : "insufficient",
    overall: ok ? Math.round(num / den) : null,
    parts,
    note: "Ecological quality describes the vegetation, not how pleasant or well maintained the park is for visitors.",
  };
}
