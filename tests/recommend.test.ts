import { describe, expect, it } from "vitest";
import { recommend, weatherSuitability, explain, type UserPrefs } from "@/lib/recommend";
import { istDate, uniformHours } from "@/lib/hours";
import { hourlyPlan } from "@/lib/planner";
import type { HourWeather } from "@/lib/types";
import { box, mkPark } from "./helpers";

const origin: [number, number] = [78.4, 17.4];
const evening = istDate("2026-03-02", 18, 0);
const prefs: UserPrefs = { origin, activities: ["walking", "outdoor_gym"], maxDistanceM: 3000, ambience: "any", preferShade: true };
const mild: Record<number, HourWeather> = Object.fromEntries(
  Array.from({ length: 24 }, (_, h) => [h, { hour: h, tempC: 26, rainProb: 5, aqi: 60, uv: h > 9 && h < 16 ? 9 : 1, isDaylight: h >= 6 && h < 19 }]),
);

const good = mkPark("good", box(78.401, 17.401, 0.002, 0.002), {
  hours: uniformHours("05:00", "21:00", "t"),
  amenities: { walking_track: "available", outdoor_gym: "available", shaded_seating: "available", lighting: "available", benches: "available", accessible_paths: "available" },
});
const closed = mkPark("closed", box(78.4015, 17.4015, 0.002, 0.002), { hours: uniformHours("05:00", "10:00", "t"), amenities: { walking_track: "available", outdoor_gym: "available" } });
const far = mkPark("far", box(78.6, 17.6, 0.002, 0.002), { hours: uniformHours("05:00", "21:00", "t") });
const priv = mkPark("priv", box(78.402, 17.402, 0.002, 0.002), { access: "private" });
const noTrack = mkPark("noTrack", box(78.403, 17.403, 0.002, 0.002), { hours: uniformHours("05:00", "21:00", "t"), amenities: { walking_track: "unavailable", outdoor_gym: "unavailable" } });
const unknownHours = mkPark("unk", box(78.404, 17.404, 0.002, 0.002), { amenities: { walking_track: "available" } });

describe("recommendations", () => {
  const r = recommend([good, closed, far, priv, noTrack, unknownHours], prefs, evening, mild);

  it("rejects confirmed-closed, out-of-range and private parks, with reasons", () => {
    const why = Object.fromEntries(r.rejected.map((x) => [x.park.id, x.reason]));
    expect(why.closed).toMatch(/Closed/);
    expect(why.far).toMatch(/Beyond/);
    expect(why.priv).toMatch(/Private/);
  });

  it("ranks the park with confirmed facilities first and explains why", () => {
    expect(r.recommendations[0].park.id).toBe("good");
    const text = explain(r.recommendations[0]);
    expect(text).toMatch(/^Recommended because/);
    expect(text).toMatch(/walking/);
  });

  it("keeps parks with unknown hours but flags them", () => {
    const u = r.recommendations.find((x) => x.park.id === "unk")!;
    expect(u).toBeTruthy();
    expect(u.caveats.join(" ")).toMatch(/hours not verified/);
  });

  it("offers alternatives when there are more candidates than the limit", () => {
    const r2 = recommend([good, noTrack, unknownHours], prefs, evening, mild, { limit: 1 });
    expect(r2.recommendations).toHaveLength(1);
    expect(r2.alternatives.length).toBe(2);
  });

  it("drops components with no data instead of scoring them as zero", () => {
    expect(r.missing).toContain("crowd"); // no verified crowd data exists
    expect(Object.values(r.weightsUsed).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(r.weightsUsed.crowd).toBe(0);
  });

  it("rejects parks with confirmed-no accessible paths for wheelchair users", () => {
    const p = mkPark("noacc", box(78.401, 17.4, 0.001, 0.001), { hours: uniformHours("05:00", "21:00", "t"), amenities: { accessible_paths: "unavailable" } });
    const res = recommend([p, good], { ...prefs, wheelchair: true }, evening, mild);
    expect(res.rejected.map((x) => x.park.id)).toContain("noacc");
  });
});

describe("weather suitability", () => {
  it("penalises heat harder for seniors and intense activity", () => {
    const hot: HourWeather = { hour: 13, tempC: 38, rainProb: 0, aqi: 50, uv: 5, isDaylight: true };
    const senior = weatherSuitability(hot, 2, "60+").score!;
    const adult = weatherSuitability(hot, 0, "26-45").score!;
    expect(senior).toBeLessThan(adult);
  });
  it("returns null with no weather rather than a made-up value", () => expect(weatherSuitability(undefined, 1).score).toBeNull());
});

describe("hourly planner", () => {
  it("recommends only open, suitable hours and never fabricates crowd data", () => {
    const { slots, windows } = hourlyPlan(good, "2026-03-02", mild, ["walking"]);
    expect(slots.every((s) => s.crowdPct === null)).toBe(true);
    expect(slots[3].status).toBe("closed");
    expect(slots[3].recommended).toBe(false);
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) for (let h = w.from; h < w.to; h++) expect(slots[h].status).toBe("open");
  });
});
