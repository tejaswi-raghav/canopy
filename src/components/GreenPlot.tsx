/** A scaled plot of land next to a 1.7 m person. 1 metre has the same length in both. */
export default function GreenPlot({ m2, label }: { m2: number | null; label?: string }) {
  const H = 150;
  if (m2 === null) {
    return <div className="flex h-[150px] items-center text-sm text-charcoal/70">Needs a population estimate.</div>;
  }
  const side = Math.sqrt(m2);
  const bench = 3; // 9 m² benchmark → 3 m side
  const px = Math.min(22, 110 / Math.max(1.7, side, bench));
  const plot = side * px;
  const bPlot = bench * px;
  const person = 1.7 * px;
  const base = H - 14;
  return (
    <svg viewBox="0 0 260 150" className="w-full max-w-[260px]" role="img" aria-label={`${m2.toFixed(1)} square metres of public park per resident, drawn to scale beside a person 1.7 metres tall`}>
      <line x1="4" x2="256" y1={base} y2={base} stroke="#202620" strokeOpacity="0.25" />
      <g transform={`translate(26 ${base})`} fill="#173F35">
        <circle cx="0" cy={-person + px * 0.17} r={px * 0.17} />
        <path d={`M${-px * 0.2} ${-person + px * 0.4} h${px * 0.4} l${px * 0.08} ${px * 0.7} h${-px * 0.1} v${px * 0.7} h${-px * 0.11} v${-px * 0.4} h${-px * 0.04} v${px * 0.4} h${-px * 0.11} v${-px * 0.7} h${-px * 0.1} z`} />
      </g>
      <rect x="62" y={base - bPlot} width={bPlot} height={bPlot} fill="none" stroke="#202620" strokeOpacity="0.5" strokeDasharray="3 3" />
      <rect x="62" y={base - plot} width={plot} height={plot} fill="#8EAD82" fillOpacity="0.75" stroke="#173F35" />
      <text x="62" y={base + 11} fontSize="9.5" fill="#202620">{label ?? `${m2.toFixed(1)} m² per resident`}</text>
      <text x={62 + Math.max(plot, bPlot) + 6} y={base - bPlot + 8} fontSize="8.5" fill="#202620" fillOpacity="0.7">dashed: 9 m²</text>
    </svg>
  );
}
