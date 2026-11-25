import * as turf from "@turf/turf";
import { areaM2, centroidOf, clipTo, haversineM, isValidGeometry, unionAll } from "./geo";
import type { AmenityKey, AmenityState, Amenities, Park } from "./types";
import { AMENITY_KEYS } from "./types";

export const normaliseName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(the|park|garden|gardens|udyan|udyanam|ground|grounds|playground|children'?s)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const PAD_DEG = 0.0012; // ≈130 m

function bboxes(p: Park) {
  const b = turf.bbox(p.geometry);
  return [b[0] - PAD_DEG, b[1] - PAD_DEG, b[2] + PAD_DEG, b[3] + PAD_DEG] as const;
}
const bboxOverlap = (a: readonly number[], b: readonly number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

function mergeAmenities(list: Amenities[]): Amenities {
  const out: Amenities = {};
  for (const k of AMENITY_KEYS) {
    const states = list.map((a) => a[k]).filter(Boolean) as AmenityState[];
    if (states.length === 0) continue;
    // Any source confirming presence wins; absence only stands if nobody confirms presence.
    out[k as AmenityKey] = states.includes("available")
      ? "available"
      : states.includes("unavailable")
        ? "unavailable"
        : "unverified";
  }
  return out;
}

/** True when two records almost certainly describe the same park. */
function sameParkLikely(a: Park, b: Park): boolean {
  const na = normaliseName(a.name);
  const nb = normaliseName(b.name);
  const namesMatch = na !== "" && na === nb;
  const clip = clipTo(a.geometry, b.geometry);
  if (clip) {
    const overlap = areaM2(clip) / Math.max(1, Math.min(a.areaM2, b.areaM2));
    if (overlap > 0.5) return true;
  }
  if (namesMatch) {
    // same name and touching / within ~100 m (OSM often splits one park into several ways)
    const d = haversineM(a.centroid, b.centroid);
    if (d < 400) return true;
    if (clip) return true;
    const near = turf.booleanIntersects(a.geometry as any, b.geometry as any);
    if (near) return true;
  }
  return false;
}

/** Merge duplicate / fragmented park records so nothing is double counted. */
export function dedupeParks(parks: Park[]): Park[] {
  const valid = parks.filter((p) => isValidGeometry(p.geometry));
  const n = valid.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const boxes = valid.map(bboxes);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!bboxOverlap(boxes[i], boxes[j])) continue;
      if (sameParkLikely(valid[i], valid[j])) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Park[]>();
  valid.forEach((p, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), p]);
  });
  const out: Park[] = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      out.push(members[0]);
      continue;
    }
    const sorted = [...members].sort((a, b) => b.areaM2 - a.areaM2);
    const lead = sorted[0];
    const geom = unionAll(members.map((m) => m.geometry)) ?? lead.geometry;
    const named = sorted.find((m) => m.name && !/^unnamed/i.test(m.name)) ?? lead;
    out.push({
      ...lead,
      name: named.name,
      geometry: geom,
      areaM2: areaM2(geom),
      centroid: centroidOf(geom),
      amenities: mergeAmenities(members.map((m) => m.amenities)),
      hours: members.find((m) => m.hours)?.hours ?? null,
      feeInr: members.find((m) => m.feeInr !== null)?.feeInr ?? null,
      authority: members.find((m) => m.authority)?.authority ?? null,
      vegetation: members.find((m) => m.vegetation)?.vegetation ?? null,
      access: members.some((m) => m.access === "public") ? "public" : lead.access,
    });
  }
  return out;
}
