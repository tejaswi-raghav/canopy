import { describe, expect, it } from "vitest";
import { dedupeParks } from "@/lib/dedupe";
import { assembleRings, buildOverpassQuery, parseOverpass, accessOf, type OverpassResponse } from "@/lib/adapters/osm";
import { parseNominatim } from "@/lib/adapters/geocode";
import { parseOpenMeteo } from "@/lib/adapters/weather";
import { computeGreenDivide, suggestInterventions, FEASIBILITY_CAVEAT } from "@/lib/greenDivide";
import { computeAreaMetrics } from "@/lib/metrics";
import { demoDataset, DEMO_SLUGS } from "@/data/demo";
import { areaM2 } from "@/lib/geo";
import { box, mkPark } from "./helpers";

const ring = (x: number, y: number, d: number) => [
  { lat: y, lon: x }, { lat: y, lon: x + d }, { lat: y + d, lon: x + d }, { lat: y + d, lon: x }, { lat: y, lon: x },
];

describe("deduplication", () => {
  it("merges fragments with the same name and overlapping polygons, counting area once", () => {
    const a = mkPark("a", box(78.4, 17.4, 0.004, 0.004), { name: "Sanjeevaiah Park", amenities: { benches: "available" } });
    const b = mkPark("b", box(78.402, 17.4, 0.004, 0.004), { name: "Sanjeevaiah Park", amenities: { yoga: "available", benches: "unavailable" } });
    const other = mkPark("c", box(78.5, 17.5, 0.004, 0.004), { name: "Elsewhere Garden" });
    const out = dedupeParks([a, b, other]);
    expect(out).toHaveLength(2);
    const merged = out.find((p) => p.name === "Sanjeevaiah Park")!;
    expect(merged.areaM2).toBeLessThan(a.areaM2 + b.areaM2);
    expect(merged.amenities.benches).toBe("available"); // presence evidence wins over a conflicting absence
    expect(merged.amenities.yoga).toBe("available");
  });
  it("keeps distinct parks that merely share a boundary-free neighbourhood", () => {
    const a = mkPark("a", box(78.4, 17.4, 0.002, 0.002), { name: "North Park" });
    const b = mkPark("b", box(78.41, 17.41, 0.002, 0.002), { name: "South Garden" });
    expect(dedupeParks([a, b])).toHaveLength(2);
  });
  it("drops invalid geometry instead of crashing", () => {
    const bad = mkPark("bad", { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 1]]] } });
    expect(dedupeParks([bad, mkPark("ok", box(78.4, 17.4, 0.002, 0.002))])).toHaveLength(1);
  });
});

describe("OpenStreetMap adapter (hand-written Overpass-format fixture)", () => {
  const resp: OverpassResponse = {
    osm3s: { timestamp_osm_base: "2026-02-01T00:00:00Z" },
    elements: [
      { type: "way", id: 1, tags: { leisure: "park", name: "Fixture Park", opening_hours: "Mo-Su 05:00-21:00", lit: "yes", wheelchair: "no" }, geometry: ring(78.4, 17.4, 0.004) },
      { type: "way", id: 2, tags: { leisure: "garden", name: "Fixture Garden" }, geometry: ring(78.41, 17.41, 0.002) },
      { type: "way", id: 3, tags: { leisure: "park", name: "Members Club Park", access: "members" }, geometry: ring(78.42, 17.42, 0.002) },
      { type: "way", id: 4, tags: { leisure: "park", name: "Open line" }, geometry: [{ lat: 17.5, lon: 78.5 }, { lat: 17.5, lon: 78.51 }, { lat: 17.51, lon: 78.51 }] },
      { type: "node", id: 10, lat: 17.402, lon: 78.402, tags: { amenity: "bench" } },
      { type: "node", id: 11, lat: 17.402, lon: 78.403, tags: { leisure: "fitness_station" } },
      { type: "way", id: 12, center: { lat: 17.401, lon: 78.401 }, tags: { leisure: "pitch", sport: "basketball" } },
      { type: "node", id: 13, lat: 17.9, lon: 78.9, tags: { amenity: "toilets" } }, // outside every park
    ],
  };
  const parks = parseOverpass(resp);

  it("builds query with a bbox in south,west,north,east order", () => {
    expect(buildOverpassQuery([78.3, 17.3, 78.5, 17.5])).toContain("(17.3,78.3,17.5,78.5)");
  });
  it("skips unclosed ways and keeps the rest", () => expect(parks.map((p) => p.osmRef).sort()).toEqual(["way/1", "way/2", "way/3"]));
  it("applies OSM public-access conventions", () => {
    const by = Object.fromEntries(parks.map((p) => [p.name, p]));
    expect(by["Fixture Park"].access).toBe("public");
    expect(by["Fixture Garden"].access).toBe("unknown"); // gardens are not assumed public
    expect(by["Members Club Park"].access).toBe("restricted");
    expect(accessOf({ access: "private" }, "park")).toBe("private");
  });
  it("assigns facilities by containment and leaves the rest unverified", () => {
    const p = parks.find((x) => x.name === "Fixture Park")!;
    expect(p.amenities.benches).toBe("available");
    expect(p.amenities.outdoor_gym).toBe("available");
    expect(p.amenities.basketball).toBe("available");
    expect(p.amenities.lighting).toBe("available");
    expect(p.amenities.accessible_paths).toBe("unavailable");
    expect(p.amenities.toilets).toBeUndefined(); // untagged → unverified, never "absent"
    expect(p.hours).not.toBeNull();
  });
  it("joins relation outer segments into one ring", () => {
    const a: [number, number][] = [[0, 0], [1, 0], [1, 1]];
    const b: [number, number][] = [[1, 1], [0, 1], [0, 0]];
    expect(assembleRings([a, b])).toHaveLength(1);
  });
});

describe("other adapters", () => {
  it("parses Nominatim results, boundingbox order and polygons", () => {
    const hits = parseNominatim([{ lat: "17.43", lon: "78.40", display_name: "Jubilee Hills, Hyderabad", boundingbox: ["17.41", "17.45", "78.38", "78.42"], geojson: { type: "Polygon", coordinates: [[[78.38, 17.41], [78.42, 17.41], [78.42, 17.45], [78.38, 17.45], [78.38, 17.41]]] } }, { lat: "x", lon: "y" }]);
    expect(hits).toHaveLength(1);
    expect(hits[0].bbox).toEqual([78.38, 17.41, 78.42, 17.45]);
    expect(hits[0].boundary).not.toBeNull();
  });
  it("maps Open-Meteo hourly arrays for the requested IST date only", () => {
    const f = { hourly: { time: ["2026-03-02T05:00", "2026-03-02T06:00", "2026-03-03T06:00"], temperature_2m: [22, 23, 24], precipitation_probability: [0, 10, 20], uv_index: [0, 1, 2], is_day: [0, 1, 1] } };
    const a = { hourly: { time: ["2026-03-02T06:00"], us_aqi: [88] } };
    const w = parseOpenMeteo(f, a, "2026-03-02");
    expect(Object.keys(w)).toEqual(["5", "6"]);
    expect(w[6]).toMatchObject({ tempC: 23, aqi: 88, isDaylight: true });
    expect(w[5].aqi).toBeNull();
  });
});

describe("demo dataset", () => {
  it("is deterministic, labelled as demo, and covers all neighbourhoods", () => {
    const a = demoDataset("hyderabad")!;
    expect(a.mode).toBe("demo");
    expect(a.warnings[0]).toMatch(/Demonstration data/);
    expect(a.parks.every((p) => p.provenance.demo)).toBe(true);
    expect(a.neighbourhoods).toHaveLength(8);
    expect(DEMO_SLUGS).toHaveLength(9);
    expect(demoDataset("jubilee-hills")!.parks.map((p) => p.id)).toEqual(demoDataset("jubilee-hills")!.parks.map((p) => p.id));
  });
  it("uses one boundary for parks and population (same-geography requirement)", () => {
    const d = demoDataset("old-city")!;
    const m = computeAreaMetrics(d);
    expect(m.byKey.population.value).toBe(d.population!.total);
    expect(m.publicParkAreaM2).toBeLessThanOrEqual(m.boundaryAreaM2);
    expect(areaM2(d.boundary)).toBeCloseTo(m.boundaryAreaM2, 3);
  });
  it("shows the intended inequality: leafy localities beat dense ones per resident", () => {
    const jh = computeAreaMetrics(demoDataset("jubilee-hills")!).byKey.public_park_per_resident.value!;
    const oc = computeAreaMetrics(demoDataset("old-city")!).byKey.public_park_per_resident.value!;
    expect(jh).toBeGreaterThan(oc);
  });
});

describe("Green Divide (2SFCA)", () => {
  const d = demoDataset("hyderabad")!;
  const res = computeGreenDivide(d.population!.cells!, d.parks);
  it("scores every cell in 0..100 and flags a minority of dense, under-served cells", () => {
    expect(res.cells.every((c) => c.index !== null && c.index >= 0 && c.index <= 100)).toBe(true);
    const flagged = res.cells.filter((c) => c.flagged);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.length).toBeLessThan(res.cells.length);
    expect(flagged.every((c) => c.densityPerKm2 >= res.medianDensity)).toBe(true);
  });
  it("gives lower need to a cell inside a park catchment than to a remote one", () => {
    const inPark = mkPark("big", box(78.4, 17.4, 0.004, 0.004));
    const cells = [
      { id: "near", center: [78.402, 17.402] as [number, number], population: 500, areaM2: 62500 },
      { id: "remote", center: [78.45, 17.45] as [number, number], population: 500, areaM2: 62500 },
    ];
    const r = computeGreenDivide(cells, [inPark]);
    expect(r.cells[0].index!).toBeLessThan(r.cells[1].index!);
    expect(r.cells[1].nearestParkM === null || r.cells[1].nearestParkM > 3000).toBe(true);
  });
  it("always attaches the feasibility caveat to new-park suggestions", () => {
    const s = suggestInterventions(res, d.parks, 20);
    const pocket = s.filter((x) => x.kind === "pocket_park_candidate");
    for (const p of pocket) expect(p.detail).toContain(FEASIBILITY_CAVEAT);
  });
});
