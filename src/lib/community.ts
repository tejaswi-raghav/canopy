import { AGE_GROUPS, type AgeGroup } from "./types";

/* ---------------------------------------------------------------- reports */

export const REPORT_CATEGORIES = [
  "broken_equipment",
  "poor_maintenance",
  "litter",
  "damaged_track",
  "insufficient_lighting",
  "toilet_not_working",
  "accessibility_issue",
  "incorrect_hours",
  "missing_facility",
  "new_park",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_LABELS: Record<ReportCategory, string> = {
  broken_equipment: "Broken equipment",
  poor_maintenance: "Poor maintenance",
  litter: "Litter",
  damaged_track: "Damaged walking track",
  insufficient_lighting: "Insufficient lighting",
  toilet_not_working: "Public toilet not working",
  accessibility_issue: "Accessibility issue",
  incorrect_hours: "Incorrect opening hours",
  missing_facility: "Missing facility",
  new_park: "Newly opened park",
};

export type ReportStatus = "pending" | "corroborated" | "verified" | "rejected" | "duplicate";

export interface ReportInput {
  parkId: string;
  category: string;
  description: string;
  observedAt?: string;
  /** honeypot: real users never fill this */
  website?: string;
}
export interface Report {
  id: string;
  parkId: string;
  category: ReportCategory;
  description: string;
  observedAt: string;
  submittedAt: string;
  status: ReportStatus;
  duplicateOf?: string;
  /** community observations are never official records */
  official: false;
  /** optional re-encoded, EXIF-free thumbnail (data URL) */
  photo?: string;
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(?:\+?\d[\s-]?){9,}/g;
const URLS = /\bhttps?:\/\/\S+/gi;

/** Remove markup and obvious personal identifiers before storing or showing text. */
export function sanitiseText(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(EMAIL, "[removed]")
    .replace(PHONE, "[removed]")
    .replace(URLS, "[link removed]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export type ValidationResult = { ok: true; report: Omit<Report, "id" | "status" | "submittedAt"> } | { ok: false; error: string };

export function validateReport(input: ReportInput, now = new Date()): ValidationResult {
  if (input.website) return { ok: false, error: "Rejected as spam." };
  if (!input.parkId || typeof input.parkId !== "string" || input.parkId.length > 80) return { ok: false, error: "Choose a park." };
  if (!(REPORT_CATEGORIES as readonly string[]).includes(input.category)) return { ok: false, error: "Choose a valid category." };
  const description = sanitiseText(input.description ?? "");
  if (description.length < 10) return { ok: false, error: "Please describe what you saw (at least 10 characters)." };
  if (/(.)\1{9,}/.test(description)) return { ok: false, error: "Description looks like spam." };
  const observed = input.observedAt ? new Date(input.observedAt) : now;
  if (Number.isNaN(observed.getTime())) return { ok: false, error: "Invalid date." };
  if (observed.getTime() > now.getTime() + 5 * 60_000) return { ok: false, error: "Observation date cannot be in the future." };
  if (now.getTime() - observed.getTime() > 90 * 86_400_000) return { ok: false, error: "Observations older than 90 days cannot be submitted." };
  return {
    ok: true,
    report: { parkId: input.parkId, category: input.category as ReportCategory, description, observedAt: observed.toISOString(), official: false },
  };
}

/** Sliding-window limiter: returns whether another submission is allowed. */
export function rateLimitAllows(timestamps: number[], now: number, max = 5, windowMs = 3_600_000): boolean {
  return timestamps.filter((t) => now - t < windowMs).length < max;
}

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2));
export function jaccard(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
}

/** Same park + category within 14 days with similar wording → duplicate (counts as corroboration). */
export function findDuplicate(candidate: Pick<Report, "parkId" | "category" | "description" | "observedAt">, existing: Report[]): Report | null {
  for (const r of existing) {
    if (r.parkId !== candidate.parkId || r.category !== candidate.category || r.duplicateOf) continue;
    const dt = Math.abs(new Date(r.observedAt).getTime() - new Date(candidate.observedAt).getTime());
    if (dt > 14 * 86_400_000) continue;
    if (jaccard(r.description, candidate.description) >= 0.5) return r;
  }
  return null;
}

/** pending → corroborated once 3 independent reports agree; only a moderator may mark verified. */
export function nextStatus(independentReports: number, current: ReportStatus): ReportStatus {
  if (current === "verified" || current === "rejected") return current;
  return independentReports >= 3 ? "corroborated" : "pending";
}

/* ---------------------------------------------------------------- attendance */

export interface CheckIn {
  parkId: string;
  ageGroup: AgeGroup;
  /** hour of day IST; no timestamps, no identifiers */
  hour: number;
  weekend: boolean;
}

export const MIN_OBSERVATIONS = 20;

export interface AttendanceCell {
  ageGroup: AgeGroup;
  hour: number;
  weekend: boolean;
  share: number;
  n: number;
}

/**
 * Aggregate opt-in check-ins. A (park, hour, daytype) cell is only released when it holds at least
 * `k` observations; otherwise nothing is shown, so small counts cannot single anyone out.
 */
export function aggregateAttendance(obs: CheckIn[], parkId: string, k = MIN_OBSERVATIONS): { released: AttendanceCell[]; suppressedCells: number; total: number } {
  const mine = obs.filter((o) => o.parkId === parkId);
  const bins = new Map<string, CheckIn[]>();
  for (const o of mine) {
    const key = `${o.hour}|${o.weekend}`;
    bins.set(key, [...(bins.get(key) ?? []), o]);
  }
  const released: AttendanceCell[] = [];
  let suppressed = 0;
  for (const [key, list] of bins) {
    if (list.length < k) {
      suppressed++;
      continue;
    }
    const [hour, weekend] = key.split("|");
    for (const g of AGE_GROUPS) {
      const n = list.filter((o) => o.ageGroup === g.id).length;
      if (n > 0) released.push({ ageGroup: g.id, hour: Number(hour), weekend: weekend === "true", share: n / list.length, n });
    }
  }
  return { released, suppressedCells: suppressed, total: mine.length };
}
