import { describe, expect, it } from "vitest";
import { computeEcologicalScore, computeQuality, QUALITY_WEIGHTS } from "@/lib/scoring";
import { box, mkPark } from "./helpers";

const g = box(78.4, 17.4, 0.003, 0.003);

describe("Park quality score", () => {
  it("weights sum to 100 %", () => {
    expect(Object.values(QUALITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("shows insufficient data rather than inventing a score", () => {
    const q = computeQuality(mkPark("empty", g));
    expect(q.status).toBe("insufficient");
    expect(q.overall).toBeNull();
    expect(q.improvements.length).toBeGreaterThan(0);
  });

  it("unverified amenities are not treated as absent", () => {
    const a = computeQuality(mkPark("a", g, { amenities: { lighting: "available", security: "available", benches: "available", drinking_water: "available", walking_track: "available", outdoor_gym: "available", accessible_paths: "available" } }));
    const b = computeQuality(mkPark("b", g, { amenities: { lighting: "available", security: "available", benches: "available", drinking_water: "available", walking_track: "available", outdoor_gym: "available", accessible_paths: "available", toilets: "unverified", swings: "unverified" } }));
    expect(b.overall).toBe(a.overall);
  });

  it("confirmed absence does lower the score", () => {
    const base = { lighting: "available", security: "available", benches: "available", drinking_water: "available", accessible_paths: "available", walking_track: "available" } as const;
    const good = computeQuality(mkPark("g", g, { amenities: base }));
    const bad = computeQuality(mkPark("x", g, { amenities: { ...base, lighting: "unavailable", security: "unavailable" } }));
    expect(bad.overall!).toBeLessThan(good.overall!);
  });

  it("renormalises over evidence and reports completeness", () => {
    const q = computeQuality(
      mkPark("c", g, {
        amenities: { lighting: "available", security: "available", benches: "available", drinking_water: "available", walking_track: "available", running_track: "available", outdoor_gym: "available", yoga: "available", playground: "available", football: "available", accessible_paths: "available" },
        vegetation: { ndviMean: 0.65, canopyPct: 40, ndviSeasonMin: 0.5, observedAt: "2026-01-01", source: "t" },
      }),
    );
    expect(q.status).toBe("scored");
    expect(q.completeness).toBeCloseTo(0.75, 5); // maintenance (25 %) has no evidence
    expect(q.overall).toBe(100);
    expect(q.confidence).not.toBe("high"); // high needs ≥85 % evidence + an official inspection
  });

  it("is never labelled an official inspection", () => {
    expect(computeQuality(mkPark("d", g)).disclaimer).toMatch(/not an official municipal inspection/);
  });
});

describe("Ecological score", () => {
  it("is separate from the visitor score and needs vegetation evidence", () => {
    expect(computeEcologicalScore(mkPark("e", g)).status).toBe("insufficient");
    const e = computeEcologicalScore(mkPark("f", g, { vegetation: { ndviMean: 0.65, canopyPct: 40, ndviSeasonMin: 0.5, observedAt: null, source: "t" } }));
    expect(e.status).toBe("scored");
    expect(e.overall).toBeGreaterThan(80);
  });
});
