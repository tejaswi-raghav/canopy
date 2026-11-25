import { haversineM } from "./geo";
import { openStatus, istParts, type OpenStatus } from "./hours";
import { computeQuality } from "./scoring";
import type { ActivityKey, AgeGroup, AmenityKey, HourWeather, LonLat, Park } from "./types";

export const REC_WEIGHTS = {
  activity: 0.25,
  distance: 0.2,
  quality: 0.2,
  weather: 0.15,
  infrastructure: 0.1,
  crowd: 0.1,
} as const;
type RecKey = keyof typeof REC_WEIGHTS;

export const ACTIVITY_LABELS: Record<ActivityKey, string> = {
  walking: "Walking",
  jogging: "Jogging / running",
  cycling: "Cycling",
  yoga: "Yoga",
  outdoor_gym: "Outdoor gym",
  playground: "Playground",
  basketball: "Basketball",
  badminton: "Badminton",
  football: "Football",
  relax: "Relaxing",
  reading: "Reading",
  socialise: "Socialising",
  photography: "Photography",
  picnic: "Picnic",
};

/** Which amenities support an activity (any-of). Activities with [] are supported by greenery alone. */
export const ACTIVITY_NEEDS: Record<ActivityKey, AmenityKey[]> = {
  walking: ["walking_track", "accessible_paths"],
  jogging: ["running_track", "walking_track"],
  cycling: ["cycling_path"],
  yoga: ["yoga"],
  outdoor_gym: ["outdoor_gym"],
  playground: ["playground", "swings", "slides"],
  basketball: ["basketball"],
  badminton: ["badminton"],
  football: ["football"],
  relax: ["benches", "shaded_seating"],
  reading: ["benches", "shaded_seating"],
  socialise: ["benches"],
  photography: [],
  picnic: ["benches"],
};

export const ACTIVITY_INTENSITY: Record<ActivityKey, 0 | 1 | 2> = {
  walking: 1, jogging: 2, cycling: 2, yoga: 1, outdoor_gym: 2, playground: 1, basketball: 2,
  badminton: 2, football: 2, relax: 0, reading: 0, socialise: 0, photography: 0, picnic: 0,
};

/** Suggested starting points only. Users can always choose anything. */
export const AGE_SUGGESTIONS: Record<AgeGroup, ActivityKey[]> = {
  "5-12": ["playground", "football", "cycling"],
  "13-17": ["basketball", "football", "badminton", "cycling", "socialise"],
  "18-25": ["jogging", "outdoor_gym", "photography", "reading", "socialise"],
  "26-45": ["walking", "jogging", "yoga", "outdoor_gym", "relax"],
  "46-59": ["walking", "yoga", "relax", "badminton"],
  "60+": ["walking", "relax", "yoga", "socialise"],
};

export interface UserPrefs {
  origin: LonLat;
  ageGroup?: AgeGroup;
  activities: ActivityKey[];
  maxDistanceM: number;
  minutesAvailable?: number;
  wheelchair?: boolean;
  ambience: "quiet" | "social" | "any";
  preferShade: boolean;
  timeOfDay?: "morning" | "evening" | "any";
}

export interface Recommendation {
  park: Park;
  score: number; // 0..100
  distM: number;
  status: OpenStatus;
  parts: { key: RecKey; label: string; value: number | null; weight: number }[];
  reasons: string[];
  caveats: string[];
}

export interface Rejection {
  park: Park;
  reason: string;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  /** next-best options when the top pick is closed / unsuitable now */
  alternatives: Recommendation[];
  rejected: Rejection[];
  weightsUsed: Record<RecKey, number>;
  missing: RecKey[];
}

export function weatherSuitability(
  w: HourWeather | undefined,
  intensity: 0 | 1 | 2,
  ageGroup?: AgeGroup,
  hasLighting: boolean | null = null,
): { score: number | null; notes: string[] } {
  if (!w) return { score: null, notes: [] };
  const notes: string[] = [];
  let s = 1;
  const sensitive = ageGroup === "60+" || ageGroup === "5-12";
  if (w.tempC !== null) {
    const hot = sensitive ? 29 : 31;
    if (w.tempC > hot) {
      const pen = Math.min(1, (w.tempC - hot) / 8) * (0.5 + 0.25 * intensity);
      s -= pen;
      notes.push(`hot (${Math.round(w.tempC)}°C)`);
    } else if (w.tempC < 12) {
      s -= 0.25;
      notes.push(`cool (${Math.round(w.tempC)}°C)`);
    } else notes.push(`comfortable ${Math.round(w.tempC)}°C`);
  }
  if (w.rainProb !== null && w.rainProb > 40) {
    s -= Math.min(0.6, ((w.rainProb - 40) / 60) * 0.7);
    notes.push(`${Math.round(w.rainProb)}% rain chance`);
  }
  if (w.aqi !== null && w.aqi > 100) {
    s -= Math.min(0.8, ((w.aqi - 100) / 150) * (0.5 + 0.25 * intensity));
    notes.push(`poor air quality (AQI ${Math.round(w.aqi)})`);
  }
  if (w.uv !== null && w.uv >= 8) {
    s -= 0.15 + (sensitive ? 0.1 : 0);
    notes.push(`high UV (${w.uv.toFixed(0)})`);
  }
  if (w.isDaylight === false) {
    s -= hasLighting ? 0.1 : 0.45;
    notes.push(hasLighting ? "after dark (park lit)" : "after dark");
  }
  return { score: Math.max(0, Math.min(1, s)), notes };
}

function activityCompat(park: Park, prefs: UserPrefs): { value: number | null; supported: ActivityKey[]; unknown: ActivityKey[]; missing: ActivityKey[] } {
  if (prefs.activities.length === 0) return { value: null, supported: [], unknown: [], missing: [] };
  const supported: ActivityKey[] = [];
  const unknown: ActivityKey[] = [];
  const missing: ActivityKey[] = [];
  let sum = 0;
  for (const act of prefs.activities) {
    const needs = ACTIVITY_NEEDS[act];
    if (needs.length === 0) {
      // greenery-only activity: use vegetation evidence if present, else neutral
      const ndvi = park.vegetation?.ndviMean;
      sum += ndvi != null ? Math.min(1, ndvi / 0.6) : 0.5;
      if (ndvi != null) supported.push(act);
      else unknown.push(act);
      continue;
    }
    const states = needs.map((k) => park.amenities[k]);
    if (states.includes("available")) {
      sum += 1;
      supported.push(act);
    } else if (states.some((s) => s === undefined || s === "unverified")) {
      sum += 0.35; // plausible but unconfirmed
      unknown.push(act);
    } else {
      missing.push(act);
    }
  }
  return { value: sum / prefs.activities.length, supported, unknown, missing };
}

export function recommend(
  parks: Park[],
  prefs: UserPrefs,
  at: Date,
  weatherByHour?: Record<number, HourWeather>,
  opts: { limit?: number; crowdPct?: (p: Park, hour: number) => number | null } = {},
): RecommendationResult {
  const limit = opts.limit ?? 5;
  const { hour } = istParts(at);
  const w = weatherByHour?.[hour];
  const rejected: Rejection[] = [];
  const cands: Recommendation[] = [];
  const intensity = Math.max(0, ...prefs.activities.map((a) => ACTIVITY_INTENSITY[a])) as 0 | 1 | 2;

  // adaptive weights: accessibility needs and shade preference shift weight, then renormalise
  const base: Record<RecKey, number> = { ...REC_WEIGHTS };
  if (prefs.wheelchair) {
    base.infrastructure += 0.08;
    base.activity -= 0.04;
    base.crowd -= 0.04;
  }
  if (prefs.activities.length === 0) {
    base.quality += base.activity;
    base.activity = 0;
  }

  type Raw = { park: Park; distM: number; status: OpenStatus; vals: Record<RecKey, number | null>; reasons: string[]; caveats: string[] };
  const raws: Raw[] = [];

  for (const park of parks) {
    const distM = haversineM(prefs.origin, park.centroid);
    if (park.access === "private") {
      rejected.push({ park, reason: "Private — not open to the public" });
      continue;
    }
    if (distM > prefs.maxDistanceM) {
      rejected.push({ park, reason: `Beyond your ${(prefs.maxDistanceM / 1000).toFixed(1)} km limit (${(distM / 1000).toFixed(1)} km away)` });
      continue;
    }
    const status = openStatus(park.hours, at);
    if (status === "closed") {
      rejected.push({ park, reason: "Closed at your chosen time" });
      continue;
    }
    if (prefs.wheelchair && park.amenities.accessible_paths === "unavailable") {
      rejected.push({ park, reason: "No wheelchair-accessible paths" });
      continue;
    }

    const reasons: string[] = [];
    const caveats: string[] = [];
    const vals: Record<RecKey, number | null> = { activity: null, distance: null, quality: null, weather: null, infrastructure: null, crowd: null };

    const act = activityCompat(park, prefs);
    vals.activity = act.value;
    if (act.supported.length) reasons.push(`confirmed facilities for ${act.supported.map((a) => ACTIVITY_LABELS[a].toLowerCase()).join(", ")}`);
    if (act.unknown.length) caveats.push(`${act.unknown.map((a) => ACTIVITY_LABELS[a].toLowerCase()).join(", ")}: facilities not verified`);
    if (act.missing.length) caveats.push(`no ${act.missing.map((a) => ACTIVITY_LABELS[a].toLowerCase()).join(", ")} facilities`);

    vals.distance = Math.max(0, 1 - distM / Math.max(1, prefs.maxDistanceM)) ** 0.8;
    reasons.push(`${distM < 1000 ? `${Math.round(distM)} m` : `${(distM / 1000).toFixed(1)} km`} away (straight line)`);

    const q = computeQuality(park);
    vals.quality = q.status === "scored" ? q.overall! / 100 : null;
    if (q.status === "scored" && q.overall! >= 70) reasons.push(`quality score ${q.overall}/100 (${q.confidence} confidence)`);
    if (q.status === "insufficient") caveats.push("not enough evidence to score park quality");

    const ws = weatherSuitability(w, intensity, prefs.ageGroup, park.amenities.lighting === "available" ? true : park.amenities.lighting === "unavailable" ? false : null);
    vals.weather = ws.score;
    if (ws.score !== null && ws.score >= 0.7) reasons.push(`suitable conditions then (${ws.notes.join(", ")})`);
    if (ws.score !== null && ws.score < 0.5) caveats.push(`conditions: ${ws.notes.join(", ")}`);

    // infrastructure: comfort + accessibility + (shade if wanted) from verified items
    const infraKeys: AmenityKey[] = ["benches", "drinking_water", "toilets", "lighting"];
    if (prefs.wheelchair) infraKeys.push("accessible_paths", "accessible_paths");
    if (prefs.preferShade) infraKeys.push("shaded_seating", "shaded_seating");
    const ver = infraKeys.filter((k) => park.amenities[k] === "available" || park.amenities[k] === "unavailable");
    vals.infrastructure = ver.length ? ver.filter((k) => park.amenities[k] === "available").length / ver.length : null;
    if (prefs.preferShade && park.amenities.shaded_seating === "available") reasons.push("has shaded seating");
    if (prefs.wheelchair && park.amenities.accessible_paths === "available") reasons.push("wheelchair-accessible paths confirmed");
    if (prefs.wheelchair && park.amenities.accessible_paths !== "available") caveats.push("wheelchair access not verified");

    const crowd = opts.crowdPct?.(park, hour) ?? null; // only verified aggregate data; otherwise unavailable
    if (crowd !== null && prefs.ambience !== "any") vals.crowd = prefs.ambience === "quiet" ? 1 - crowd : crowd;

    if (status === "unknown") caveats.push("opening hours not verified");
    raws.push({ park, distM, status, vals, reasons, caveats });
  }

  // renormalise over components with data (per candidate set) — unknown ≠ zero
  const missing = (Object.keys(base) as RecKey[]).filter((k) => base[k] > 0 && raws.every((r) => r.vals[k] === null));
  const weightsUsed = { ...base } as Record<RecKey, number>;
  for (const k of missing) weightsUsed[k] = 0;
  const wsum = Object.values(weightsUsed).reduce((a, b) => a + b, 0) || 1;
  (Object.keys(weightsUsed) as RecKey[]).forEach((k) => (weightsUsed[k] /= wsum));

  for (const r of raws) {
    let num = 0;
    let den = 0;
    const parts: Recommendation["parts"] = [];
    for (const k of Object.keys(weightsUsed) as RecKey[]) {
      const wgt = weightsUsed[k];
      parts.push({ key: k, label: k, value: r.vals[k], weight: wgt });
      if (wgt > 0 && r.vals[k] !== null) {
        num += wgt * r.vals[k]!;
        den += wgt;
      }
    }
    const score = den > 0 ? Math.round((num / den) * 100) : 0;
    cands.push({ park: r.park, score, distM: r.distM, status: r.status, parts, reasons: r.reasons, caveats: r.caveats });
  }

  cands.sort((a, b) => b.score - a.score || a.distM - b.distM);
  return {
    recommendations: cands.slice(0, limit),
    alternatives: cands.slice(limit, limit + 3),
    rejected,
    weightsUsed,
    missing,
  };
}

export function explain(r: Recommendation): string {
  const why = r.reasons.length ? `Recommended because ${joinNatural(r.reasons)}.` : "Recommended on available evidence.";
  return r.caveats.length ? `${why} Note: ${r.caveats.join("; ")}.` : why;
}

function joinNatural(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
