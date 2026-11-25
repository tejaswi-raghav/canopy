"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { REPORTS_ENDPOINT } from "@/lib/base";
import { aggregateAttendance, findDuplicate, MIN_OBSERVATIONS, nextStatus, rateLimitAllows, REPORT_CATEGORIES, REPORT_LABELS, validateReport, type CheckIn, type Report } from "@/lib/community";
import { istParts } from "@/lib/hours";
import { useArea } from "@/lib/store";
import { AGE_GROUPS, type AgeGroup } from "@/lib/types";

const load = <T,>(k: string, d: T): T => {
  try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota or privacy mode */ } };

/** Re-encode through a canvas: strips EXIF/GPS metadata and caps size. */
async function cleanPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPEG, PNG or WebP image.");
  if (file.size > 8_000_000) throw new Error("Image is larger than 8 MB.");
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

export default function ContributeForm() {
  const { dataset } = useArea();
  const sp = useSearchParams();
  const [parkId, setParkId] = useState(sp.get("park") ?? "");
  const [category, setCategory] = useState<string>("litter");
  const [desc, setDesc] = useState("");
  const [observed, setObserved] = useState(() => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16));
  const [website, setWebsite] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [ciPark, setCiPark] = useState("");
  const [ciAge, setCiAge] = useState<AgeGroup>("26-45");

  useEffect(() => { setReports(load<Report[]>("canopy.reports", [])); setCheckins(load<CheckIn[]>("canopy.checkins", [])); }, []);
  const parks = useMemo(() => [...(dataset?.parks ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [dataset]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const now = new Date();
    const v = validateReport({ parkId, category, description: desc, observedAt: observed ? new Date(`${observed}:00+05:30`).toISOString() : undefined, website }, now);
    if (!v.ok) return setMsg({ ok: false, text: v.error });
    const stamps = load<number[]>("canopy.rl", []);
    if (!rateLimitAllows(stamps, now.getTime())) return setMsg({ ok: false, text: "You have submitted 5 reports in the last hour. Please try again later." });
    const existing = load<Report[]>("canopy.reports", []);
    const dup = findDuplicate(v.report, existing);
    const report: Report = { ...v.report, id: crypto.randomUUID(), submittedAt: now.toISOString(), status: dup ? "duplicate" : "pending", duplicateOf: dup?.id, photo };
    let next = [report, ...existing];
    if (dup) {
      const independent = next.filter((r) => (r.id === dup.id || r.duplicateOf === dup.id)).length;
      next = next.map((r) => (r.id === dup.id ? { ...r, status: nextStatus(independent, r.status) } : r));
    }
    save("canopy.reports", next);
    save("canopy.rl", [...stamps.filter((t) => now.getTime() - t < 3_600_000), now.getTime()]);
    setReports(next);
    let text = dup ? "This matches an earlier report, so it was linked to it as corroboration." : "Observation saved on this device.";
    if (REPORTS_ENDPOINT) {
      try {
        const r = await fetch(REPORTS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
        text += r.ok ? " Sent for moderation." : " The server did not accept it, so it stays on this device.";
      } catch {
        text += " Could not reach the server, so it stays on this device.";
      }
    } else text += " No reports server is configured in this build, so it has not been shared with anyone.";
    setMsg({ ok: true, text });
    setDesc("");
    setPhoto(undefined);
  }

  function checkIn() {
    if (!ciPark) return;
    const c: CheckIn = { parkId: ciPark, ageGroup: ciAge, hour: istParts(new Date()).hour, weekend: [0, 6].includes(istParts(new Date()).day) };
    const next = [...checkins, c];
    save("canopy.checkins", next);
    setCheckins(next);
  }
  const agg = ciPark ? aggregateAttendance(checkins, ciPark) : null;
  const input = "w-full border border-forest/30 bg-ivory px-2 py-2";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold text-forest">Contribute</h1>
      <p className="mt-2 max-w-prose text-charcoal/80">Tell us what you saw at a park. Community observations feed the evidence behind park quality scores, and are always shown as community observations — never as official records. Do not include names, phone numbers or faces.</p>

      <form onSubmit={submit} className="mt-8 space-y-5" aria-label="Report a problem or a missing facility">
        <label className="block text-sm font-semibold">Park
          <select required className={`mt-1 ${input} font-normal`} value={parkId} onChange={(e) => setParkId(e.target.value)}>
            <option value="">Choose a park…</option>
            <option value="unlisted">A park that is not on the map</option>
            {parks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!dataset && <span className="text-xs font-normal">Loading parks…</span>}
        </label>
        <label className="block text-sm font-semibold">What did you see?
          <select className={`mt-1 ${input} font-normal`} value={category} onChange={(e) => setCategory(e.target.value)}>
            {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{REPORT_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">Details
          <textarea required minLength={10} maxLength={500} rows={4} className={`mt-1 ${input} font-normal`} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Where in the park, and what exactly is wrong or missing." />
          <span className="text-xs font-normal text-charcoal/65">{desc.length}/500. Links, emails and phone numbers are removed automatically.</span>
        </label>
        <label className="block text-sm font-semibold">When did you see it? <span className="font-normal text-charcoal/70">(India time)</span>
          <input type="datetime-local" className={`mt-1 ${input} font-normal`} value={observed} onChange={(e) => setObserved(e.target.value)} />
        </label>
        <label className="block text-sm font-semibold">Photo <span className="font-normal text-charcoal/70">(optional)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block text-sm font-normal" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return setPhoto(undefined); try { setPhoto(await cleanPhoto(f)); } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not read that image." }); e.target.value = ""; } }} />
          <span className="text-xs font-normal text-charcoal/65">Location data and other metadata are removed and the image is shrunk before it is saved. Avoid photographing people.</span>
        </label>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="Preview of your photo" className="max-h-40" />}
        <div aria-hidden className="absolute -left-[9999px]"><label>Leave blank<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label></div>
        <button className="bg-forest px-5 py-2.5 font-semibold text-ivory">Save observation</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-forest" : "text-[#7E2A1C]"}`}>{msg.text}</p>}
      </form>

      <section className="mt-14" aria-labelledby="mine">
        <h2 id="mine" className="font-display text-2xl font-bold">Observations on this device</h2>
        {reports.length === 0 ? <p className="mt-2 text-charcoal/70">None yet.</p> : (
          <ul className="mt-2 divide-y divide-forest/10">
            {reports.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <strong>{REPORT_LABELS[r.category]}</strong> · {parks.find((p) => p.id === r.parkId)?.name ?? r.parkId} · {r.observedAt.slice(0, 10)} · <span className="font-semibold">{r.status}</span>
                <span className="block text-charcoal/80">{r.description}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.photo && <img src={r.photo} alt="" className="mt-1 max-h-20" />}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 max-w-prose text-xs text-charcoal/65">Workflow: pending → corroborated once three independent, similar reports agree → verified only by a moderator. Near-identical reports are merged as corroboration. Community observations never replace municipal records.</p>
      </section>

      <section className="mt-14" aria-labelledby="ci">
        <h2 id="ci" className="font-display text-2xl font-bold">Anonymous check-in (optional)</h2>
        <p className="mt-2 max-w-prose text-sm text-charcoal/80">If you opt in, a check-in records only the park, your age group and the hour — no account, name or exact time. Age-group patterns are shown for a park only after at least {MIN_OBSERVATIONS} check-ins for that hour. Canopy never uses cameras or facial recognition to estimate visitors’ ages.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label>Park<select className={`mt-1 block ${input}`} value={ciPark} onChange={(e) => setCiPark(e.target.value)}><option value="">Choose…</option>{parks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Age group<select className={`mt-1 block ${input}`} value={ciAge} onChange={(e) => setCiAge(e.target.value as AgeGroup)}>{AGE_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
          <button type="button" onClick={checkIn} disabled={!ciPark} className="border border-forest px-4 py-2 font-semibold text-forest disabled:opacity-50">Check in now</button>
        </div>
        {agg && (
          <p className="mt-3 text-sm" aria-live="polite">
            {agg.released.length ? `Showing ${agg.released.length} age-group shares from enough check-ins.` : `Age-group attendance is not shown: this device holds ${agg.total} check-ins for this park, and ${MIN_OBSERVATIONS} are needed for any hour. Suggested activity timings are shown on park pages instead; they are recommendations, not observed visitor patterns.`}
          </p>
        )}
      </section>
    </div>
  );
}
