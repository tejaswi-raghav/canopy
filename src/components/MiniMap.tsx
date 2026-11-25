import { isPublicPark } from "@/lib/metrics";
import type { AreaDataset } from "@/lib/types";

function rings(g: AreaDataset["boundary"]["geometry"]): number[][][] {
  return g.type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
}

export default function MiniMap({ ds, w = 240, h = 170 }: { ds: AreaDataset; w?: number; h?: number }) {
  const rs = rings(ds.boundary.geometry);
  const all = rs.flat();
  const lat0 = all.reduce((a, p) => a + p[1], 0) / all.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = all.map((p) => p[0] * k), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = Math.min((w - 10) / (x1 - x0 || 1), (h - 10) / (y1 - y0 || 1));
  const ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  const P = (p: number[]) => `${(ox + (p[0] * k - x0) * s).toFixed(1)},${(oy + (y1 - p[1]) * s).toFixed(1)}`;
  const path = (r: number[][]) => `M${r.map(P).join("L")}Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`Outline of ${ds.label} with parks`}>
      {rs.map((r, i) => <path key={i} d={path(r)} fill="#EDEEE3" stroke="#202620" strokeOpacity="0.55" strokeDasharray="3 2" />)}
      {ds.parks.map((p) => {
        const geo = p.geometry.geometry;
        return rings(geo).map((r, i) => <path key={p.id + i} d={path(r)} fill={isPublicPark(p) ? "#8EAD82" : "#B7B5A2"} stroke="#173F35" strokeWidth="0.6" />);
      })}
    </svg>
  );
}
