import { describe, expect, it } from "vitest";
import { aggregateAttendance, findDuplicate, jaccard, nextStatus, rateLimitAllows, sanitiseText, validateReport, MIN_OBSERVATIONS, type CheckIn, type Report } from "@/lib/community";

const now = new Date("2026-03-02T10:00:00Z");
const ok = { parkId: "p1", category: "litter", description: "Lots of litter near the east gate by the benches" };

describe("report validation", () => {
  it("accepts a good report and marks it unofficial", () => {
    const v = validateReport(ok, now);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.report.official).toBe(false);
  });
  it("rejects honeypot, bad category, short text, future and stale dates", () => {
    expect(validateReport({ ...ok, website: "http://spam" }, now).ok).toBe(false);
    expect(validateReport({ ...ok, category: "hack" }, now).ok).toBe(false);
    expect(validateReport({ ...ok, description: "bad" }, now).ok).toBe(false);
    expect(validateReport({ ...ok, observedAt: "2026-04-01" }, now).ok).toBe(false);
    expect(validateReport({ ...ok, observedAt: "2025-01-01" }, now).ok).toBe(false);
    expect(validateReport({ ...ok, description: "aaaaaaaaaaaaaaaaaaaa" }, now).ok).toBe(false);
  });
  it("strips markup and personal identifiers", () => {
    const s = sanitiseText("<b>Call</b> me on +91 98765 43210 or mail raj@example.com, see https://x.co/y");
    expect(s).not.toMatch(/<|9876|@example|https/);
  });
});

describe("spam, duplicates, moderation", () => {
  it("rate limits to 5 per hour", () => {
    const t = Array.from({ length: 5 }, (_, i) => 1000 + i);
    expect(rateLimitAllows(t, 2000)).toBe(false);
    expect(rateLimitAllows(t, 1000 + 3_700_000)).toBe(true);
  });
  it("detects near-duplicate reports for the same park and category", () => {
    const existing: Report[] = [{ id: "1", parkId: "p1", category: "litter", description: "Lots of litter near the east gate by the benches", observedAt: now.toISOString(), submittedAt: now.toISOString(), status: "pending", official: false }];
    expect(findDuplicate({ parkId: "p1", category: "litter", description: "litter near east gate benches, lots of it", observedAt: now.toISOString() }, existing)).not.toBeNull();
    expect(findDuplicate({ parkId: "p2", category: "litter", description: "litter near east gate benches", observedAt: now.toISOString() }, existing)).toBeNull();
    expect(jaccard("a b c", "x y z")).toBe(0);
  });
  it("needs three independent reports to corroborate; only moderators verify", () => {
    expect(nextStatus(2, "pending")).toBe("pending");
    expect(nextStatus(3, "pending")).toBe("corroborated");
    expect(nextStatus(9, "pending")).not.toBe("verified");
    expect(nextStatus(1, "verified")).toBe("verified");
  });
});

describe("attendance k-anonymity", () => {
  const mk = (n: number, hour: number): CheckIn[] => Array.from({ length: n }, (_, i) => ({ parkId: "p1", ageGroup: i % 2 ? "26-45" : "60+", hour, weekend: false }));
  it("releases nothing below the threshold", () => {
    const r = aggregateAttendance(mk(MIN_OBSERVATIONS - 1, 7), "p1");
    expect(r.released).toHaveLength(0);
    expect(r.suppressedCells).toBe(1);
  });
  it("releases shares only for sufficiently observed hours", () => {
    const r = aggregateAttendance([...mk(MIN_OBSERVATIONS, 7), ...mk(3, 18)], "p1");
    expect(r.released.every((c) => c.hour === 7)).toBe(true);
    expect(r.released.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 6);
    expect(r.suppressedCells).toBe(1);
  });
});
