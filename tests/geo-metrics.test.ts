import { describe, expect, it } from "vitest";
import { areaM2, isValidGeometry, polyFrom, unionAll, walkMinutesToMetres, distanceToPolyM } from "@/lib/geo";
import { computeAreaMetrics, greenSpacePerPerson, parksPer10k, vegetationPercent, walkCoverage, isPublicPark } from "@/lib/metrics";
import type { AreaDataset } from "@/lib/types";
import { box, mkPark } from "./helpers";

describe("geometry", () => {
  it("matches the closed-form spherical rectangle area (independent check)", () => {
    const lon = 78.4, lat = 17.4, dLon = 0.01, dLat = 0.01;
    const R = 6378137; // radius used by turf
    const rad = Math.PI / 180;
    const expected = R * R * (dLon * rad) * (Math.sin((lat + dLat) * rad) - Math.sin(lat * rad));
    expect(Math.abs(areaM2(box(lon, lat, dLon, dLat)) - expected) / expected).toBeLessThan(0.003); // turf's ring integral is within ~0.25% of the closed form
  });

  it("union counts overlapping polygons once", () => {
    const a = box(78.4, 17.4, 0.01, 0.01);
    const b = box(78.405, 17.4, 0.01, 0.01); // overlaps half of a
    const u = unionAll([a, b])!;
    expect(areaM2(u)).toBeLessThan(areaM2(a) + areaM2(b));
    expect(areaM2(u)).toBeCloseTo(areaM2(box(78.4, 17.4, 0.015, 0.01)), -2);
  });

  it("rejects malformed geometry", () => {
    expect(isValidGeometry(polyFrom([[[0, 0], [1, 0], [1, 1]]]))).toBe(false); // unclosed, <4 points
    expect(isValidGeometry(polyFrom([[[0, 0], [1, 0], [1, 1], [0, 0]]]))).toBe(true);
    expect(isValidGeometry(polyFrom([[[0, 0], [NaN, 0], [1, 1], [0, 0]]]))).toBe(false);
    expect(isValidGeometry(null)).toBe(false);
  });

  it("converts walk minutes at 4.8 km/h", () => {
    expect(walkMinutesToMetres(5)).toBe(400);
    expect(walkMinutesToMetres(15)).toBe(1200);
  });

  it("distance is 0 inside and positive outside", () => {
    const p = box(78.4, 17.4, 0.01, 0.01);
    expect(distanceToPolyM([78.405, 17.405], p)).toBe(0);
    const d = distanceToPolyM([78.41, 17.405], p); // on the east edge
    expect(d).toBeLessThan(1);
    // 0.01° of longitude at 17.4°N is 111,320 m × cos(17.4°) × 0.01 ≈ 1,062 m (independent calculation)
    expect(Math.abs(distanceToPolyM([78.42, 17.405], p) - 1062.4)).toBeLessThan(5);
  });
});

describe("formulas", () => {
  it("green space per person", () => {
    expect(greenSpacePerPerson(90_000, 10_000)).toBe(9);
    expect(greenSpacePerPerson(100, 0)).toBeNull();
  });
  it("vegetation percentage", () => {
    expect(vegetationPercent(250, 1000)).toBe(25);
    expect(vegetationPercent(1, 0)).toBeNull();
  });
  it("parks per 10k", () => expect(parksPer10k(5, 20_000)).toBe(2.5));
});

function dataset(): AreaDataset {
  const boundary = box(78.4, 17.4, 0.04, 0.04);
  const park1 = mkPark("p1", box(78.41, 17.41, 0.005, 0.005));
  const park2 = mkPark("p2", box(78.4125, 17.41, 0.005, 0.005)); // overlaps p1 (different record)
  const priv = mkPark("priv", box(78.42, 17.42, 0.005, 0.005), { access: "private", kind: "garden" });
  const straddle = mkPark("edge", box(78.438, 17.41, 0.01, 0.005)); // half outside boundary
  const cells = [
    { id: "a", center: [78.4125, 17.4125] as [number, number], population: 600, areaM2: 62500 }, // inside p1
    { id: "b", center: [78.4305, 17.3905] as [number, number], population: 400, areaM2: 62500 }, // far from parks
  ];
  const prov = { source: "t", observedAt: "2026-01-01", method: "t", confidence: "high" as const };
  return {
    slug: "t", label: "t", mode: "live", boundary, boundaryProvenance: prov,
    parks: [park1, park2, priv, straddle],
    population: { total: 1000, cells, provenance: prov },
    vegetation: { vegetatedAreaM2: 2_000_000, canopyPct: 12, provenance: prov },
    warnings: [],
  };
}

describe("computeAreaMetrics", () => {
  const ds = dataset();
  const m = computeAreaMetrics(ds);

  it("never counts overlapping or private land as public park area", () => {
    const p1 = ds.parks[0], p2 = ds.parks[1];
    const naive = p1.areaM2 + p2.areaM2;
    // unioned area of p1/p2 + inside-part of the straddling park
    expect(m.publicParkAreaM2).toBeLessThan(naive + ds.parks[3].areaM2);
    expect(ds.parks.filter(isPublicPark)).toHaveLength(3);
    expect(m.mappedGreenAreaM2).toBeGreaterThan(m.publicParkAreaM2); // private garden adds to mapped, not public
  });

  it("clips a boundary-straddling park to its inside half", () => {
    const edge = ds.parks[3];
    const only = computeAreaMetrics({ ...ds, parks: [edge] });
    expect(only.publicParkAreaM2 / edge.areaM2).toBeGreaterThan(0.15);
    expect(only.publicParkAreaM2 / edge.areaM2).toBeLessThan(0.3); // ~0.2 of it lies inside
  });

  it("computes per-resident metrics with the same boundary", () => {
    expect(m.byKey.public_park_per_resident.value).toBeCloseTo(m.publicParkAreaM2 / 1000, 6);
    expect(m.byKey.vegetation_pct.value).toBeCloseTo((2_000_000 / m.boundaryAreaM2) * 100, 6);
  });

  it("walk coverage counts only residents near a park", () => {
    expect(walkCoverage(ds.population!.cells!, ds.parks, 5)).toBeCloseTo(60, 5);
  });

  it("returns honest unavailable states when population / vegetation are missing", () => {
    const x = computeAreaMetrics({ ...ds, population: null, vegetation: null });
    for (const k of ["population", "public_park_per_resident", "vegetation_pct", "walk_10"]) {
      expect(x.byKey[k].value).toBeNull();
      expect(x.byKey[k].note).toBeTruthy();
    }
    expect(x.byKey.parks_count.value).not.toBeNull();
  });
});
