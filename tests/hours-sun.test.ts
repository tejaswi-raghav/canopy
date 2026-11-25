import { describe, expect, it } from "vitest";
import { istDate, istParts, openStatus, parseOsmOpeningHours, uniformHours } from "@/lib/hours";
import { isDaylight, sunTimesIst } from "@/lib/sun";

describe("India Standard Time handling", () => {
  it("converts UTC instants to IST parts", () => {
    // 2026-03-01T23:30Z is 05:00 IST on 2 March (a Monday)
    const p = istParts(new Date("2026-03-01T23:30:00Z"));
    expect(p.dateKey).toBe("2026-03-02");
    expect(p.hour).toBe(5);
    expect(p.day).toBe(1);
  });
  it("round-trips istDate", () => {
    expect(istParts(istDate("2026-07-14", 6, 15)).minutes).toBe(6 * 60 + 15);
  });
  it("open / closed boundaries are [open, close)", () => {
    const h = uniformHours("05:00", "20:00", "t");
    expect(openStatus(h, istDate("2026-03-02", 5, 0))).toBe("open");
    expect(openStatus(h, istDate("2026-03-02", 4, 59))).toBe("closed");
    expect(openStatus(h, istDate("2026-03-02", 20, 0))).toBe("closed");
  });
  it("unknown hours are unknown, not closed", () => expect(openStatus(null, new Date())).toBe("unknown"));
});

describe("OSM opening_hours subset", () => {
  it("parses split days and ranges", () => {
    const h = parseOsmOpeningHours("Mo-Fr 06:00-09:00,16:00-20:00; Sa,Su 05:00-22:00")!;
    expect(h.ranges[1]).toEqual([[360, 540], [960, 1200]]);
    expect(h.ranges[0]).toEqual([[300, 1320]]);
    // Monday 2026-03-02 at 12:00 is between the two ranges
    expect(openStatus(h, istDate("2026-03-02", 12))).toBe("closed");
    expect(openStatus(h, istDate("2026-03-02", 17))).toBe("open");
  });
  it("supports 24/7", () => expect(openStatus(parseOsmOpeningHours("24/7"), istDate("2026-03-02", 3))).toBe("open"));
  it("returns null (unknown) for unsupported syntax", () => {
    expect(parseOsmOpeningHours("sunrise-sunset")).toBeNull();
    expect(parseOsmOpeningHours("Mo-Su 05:00-21:00 open \"by appointment\"")).toBeNull();
    expect(parseOsmOpeningHours(undefined)).toBeNull();
  });
});

describe("sun times", () => {
  it("Hyderabad at the March equinox: sunrise ~06:15, sunset ~18:20 IST", () => {
    const t = sunTimesIst("2026-03-20", 17.385, 78.4867)!;
    expect(t.sunrise / 60).toBeGreaterThan(6.0);
    expect(t.sunrise / 60).toBeLessThan(6.4);
    expect(t.sunset / 60).toBeGreaterThan(18.1);
    expect(t.sunset / 60).toBeLessThan(18.5);
  });
  it("daylight flag", () => {
    expect(isDaylight("2026-03-20", 12, 17.385, 78.4867)).toBe(true);
    expect(isDaylight("2026-03-20", 2, 17.385, 78.4867)).toBe(false);
  });
});
