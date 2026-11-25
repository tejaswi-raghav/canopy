"use client";
import { easeInOut, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AreaSearch from "./AreaSearch";

/* ---------------------------------------------------------------- isometric city (an illustration, not data) */

const N = 14, W = 56, H = 28, OX = 620, OY = 118;
const iso = (i: number, j: number, z = 0): [number, number] => [OX + ((i - j) * W) / 2, OY + ((i + j) * H) / 2 - z];
const pt = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const poly = (ps: [number, number][]) => ps.map(pt).join(" ");

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BIG_PARK = new Set(["2,2", "2,3", "3,2", "3,3"]);
const SMALL_PARKS = new Set(["7,2", "3,7", "7,6", "1,11"]);
const isPark = (i: number, j: number) => BIG_PARK.has(`${i},${j}`) || SMALL_PARKS.has(`${i},${j}`);
const isRoad = (i: number, j: number) => i % 5 === 0 || j % 5 === 0;
const isDense = (i: number, j: number) => i >= 9 && j >= 9;

function buildScene() {
  const r = mulberry(20260101);
  const buildings: { i: number; j: number; z: number }[] = [];
  const dots: { x: number; y: number }[] = [];
  const trees: { x: number; y: number; r: number; dark: boolean }[] = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if (isRoad(i, j)) continue;
      if (isPark(i, j)) {
        const n = BIG_PARK.has(`${i},${j}`) ? 7 : 4;
        for (let k = 0; k < n; k++) {
          const [x, y] = iso(i + 0.15 + r() * 0.7, j + 0.15 + r() * 0.7);
          trees.push({ x, y: y - 3, r: 3.2 + r() * 2.6, dark: r() > 0.45 });
        }
        continue;
      }
      const d = Math.hypot(i - 11.5, j - 11.5);
      const z = isDense(i, j) ? 38 + r() * 52 : d < 6 ? 18 + r() * 22 : 8 + r() * 16;
      buildings.push({ i, j, z });
      const count = Math.round(z / (isDense(i, j) ? 5 : 11));
      for (let k = 0; k < count; k++) {
        const [x, y] = iso(i + 0.1 + r() * 0.8, j + 0.1 + r() * 0.8);
        dots.push({ x, y });
      }
    }
  buildings.sort((a, b) => a.i + a.j - (b.i + b.j));
  return { buildings, dots, trees };
}

function CityScene({ p }: { p: MotionValue<number> }) {
  const { buildings, dots, trees } = useMemo(buildScene, []);

  // camera: city → neighbourhood → park
  const T1 = iso(3.4, 3.8), T2 = iso(3, 3);
  const keys = [0, 0.62, 0.78, 0.9, 1];
  const scale = useTransform(p, keys, [1, 1, 2.6, 7.5, 7.5], { ease: easeInOut });
  const tx = useTransform(p, keys, [550, 550, T1[0], T2[0], T2[0]], { ease: easeInOut });
  const ty = useTransform(p, keys, [300, 300, T1[1], T2[1], T2[1]], { ease: easeInOut });
  // Applied as an SVG attribute (not CSS) so the origin is the viewBox origin, not the element's bounding box.
  const camRef = useRef<SVGGElement>(null);
  const applyCamera = () => {
    const s = scale.get();
    camRef.current?.setAttribute("transform", `translate(${(550 - tx.get() * s).toFixed(2)} ${(300 - ty.get() * s).toFixed(2)}) scale(${s.toFixed(4)})`);
  };
  useMotionValueEvent(p, "change", applyCamera);


  const bOp = useTransform(p, [0, 0.14, 0.2, 0.3, 0.62, 0.78], [0.35, 1, 1, 0.45, 0.45, 0.85]);
  const bY = useTransform(p, [0, 0.14], [14, 0]);
  const greenOp = useTransform(p, [0.18, 0.3], [0, 1]);
  const popOp = useTransform(p, [0.38, 0.5, 0.66, 0.74], [0, 1, 1, 0]);
  const ringOp = useTransform(p, [0.52, 0.62, 0.7, 0.76], [0, 1, 1, 0]);
  const detailOp = useTransform(p, [0.8, 0.88], [0, 1]);

  const parkTiles: [number, number][] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (isPark(i, j)) parkTiles.push([i, j]);
  const tile = (i: number, j: number) => poly([iso(i, j), iso(i + 1, j), iso(i + 1, j + 1), iso(i, j + 1)]);

  const track = (rx: number, ry: number) => {
    const ps: [number, number][] = [];
    for (let k = 0; k < 48; k++) {
      const t = (k / 48) * Math.PI * 2;
      ps.push(iso(3 + rx * Math.cos(t), 3 + ry * Math.sin(t)));
    }
    return poly(ps);
  };

  return (
    <svg viewBox="0 0 1100 600" className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Illustration: an aerial view of a city that gradually highlights parks and population, then zooms into one neighbourhood and one park">
      <g ref={camRef}>
        <polygon points={poly([iso(0, 0), iso(N, 0), iso(N, N), iso(0, N)])} fill="#E3E5D7" />
        {/* roads and open ground */}
        {Array.from({ length: N * N }, (_, k) => [Math.floor(k / N), k % N] as const)
          .filter(([i, j]) => isRoad(i, j))
          .map(([i, j]) => <polygon key={`r${i}-${j}`} points={tile(i, j)} fill="#EEEEE3" />)}
        {/* park ground: neutral first, then green */}
        {parkTiles.map(([i, j]) => <polygon key={`pd${i}-${j}`} points={tile(i, j)} fill="#D5D9C6" />)}
        <motion.g style={{ opacity: greenOp }}>
          {parkTiles.map(([i, j]) => <polygon key={`pg${i}-${j}`} points={tile(i, j)} fill="#8EAD82" />)}
          {trees.map((t, k) => <circle key={k} cx={t.x} cy={t.y} r={t.r} fill={t.dark ? "#173F35" : "#5E7F55"} />)}
        </motion.g>

        <motion.g style={{ opacity: bOp, y: bY }}>
          {buildings.map(({ i, j, z }) => {
            const a = 0.16;
            const A: [number, number] = iso(i + a, j + a, z), B = iso(i + 1 - a, j + a, z), C = iso(i + 1 - a, j + 1 - a, z), D = iso(i + a, j + 1 - a, z);
            const Cb = iso(i + 1 - a, j + 1 - a), Db = iso(i + a, j + 1 - a), Bb = iso(i + 1 - a, j + a);
            return (
              <g key={`${i}-${j}`}>
                <polygon points={poly([D, C, Cb, Db])} fill="#B9BDAE" />
                <polygon points={poly([C, B, Bb, Cb])} fill="#A3A898" />
                <polygon points={poly([A, B, C, D])} fill={isDense(i, j) ? "#D3D5C8" : "#DCDED1"} />
              </g>
            );
          })}
        </motion.g>

        <motion.g style={{ opacity: popOp }}>
          {dots.map((d, k) => <circle key={k} cx={d.x} cy={d.y} r={1.5} fill="#C46B3A" />)}
        </motion.g>

        <motion.g style={{ opacity: ringOp }}>
          <polygon points={poly([iso(9, 9), iso(N, 9), iso(N, N), iso(9, N)])} fill="rgba(196,107,58,0.08)" stroke="#7E2A1C" strokeWidth={2} strokeDasharray="7 5" />
          <text x={iso(11.5, 8.4)[0] + 8} y={iso(11.5, 8.4)[1] - 6} fontSize={15} fontWeight={700} fill="#7E2A1C" fontFamily="var(--font-manrope)">Dense, with almost no park</text>
        </motion.g>

        {/* the park, close up */}
        <motion.g style={{ opacity: detailOp }}>
          <polygon points={poly([iso(2, 2), iso(4, 2), iso(4, 4), iso(2, 4)])} fill="#8EAD82" />
          <polygon points={track(0.82, 0.68)} fill="none" stroke="#F5F5ED" strokeWidth={0.9} />
          <polygon points={track(0.6, 0.46)} fill="none" stroke="#F5F5ED" strokeWidth={0.9} />
          <polygon points={track(0.52, 0.38)} fill="#A9C39D" />
          {[[2.35, 2.3], [3.7, 2.4], [2.3, 3.7], [3.75, 3.65], [3.05, 2.2], [2.2, 3.0]].map(([a, b], k) => {
            const [x, y] = iso(a, b);
            return <circle key={k} cx={x} cy={y - 2} r={2.6} fill="#173F35" />;
          })}
          {[[3.0, 2.6], [3.0, 3.4]].map(([a, b], k) => {
            const [x, y] = iso(a, b);
            return <rect key={k} x={x - 1.6} y={y - 0.6} width={3.2} height={1} fill="#202620" />;
          })}
          {([["Walking track", 3.7, 3.0, 4.8, -9], ["Shaded seating", 3.0, 2.6, 0.8, -12], ["Outdoor gym", 2.3, 3.7, -22, 8]] as [string, number, number, number, number][]).map(([label, a, b, dx, dy]) => {
            const [x, y] = iso(a, b);
            return (
              <g key={label}>
                <line x1={x} y1={y} x2={x + dx} y2={y + dy} stroke="#202620" strokeWidth={0.3} />
                <text x={x + dx + (dx < 0 ? -1 : 1)} y={y + dy + 1} fontSize={3} fill="#202620" textAnchor={dx < 0 ? "end" : "start"} fontFamily="var(--font-inter)">{label}</text>
              </g>
            );
          })}
        </motion.g>
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- narration */

const CAPTIONS: { range: [number, number]; text: string }[] = [
  { range: [0.14, 0.28], text: "A city from above: blocks, roads and towers." },
  { range: [0.28, 0.4], text: "Parks, gardens and tree cover are where it breathes. Canopy maps them." },
  { range: [0.4, 0.54], text: "Each orange dot is a group of residents. They don’t live where the green space is." },
  { range: [0.54, 0.69], text: "The densest blocks here have the fewest parks. Canopy measures that gap for real neighbourhoods and calls it the Green Divide." },
  { range: [0.7, 0.82], text: "Zoom into any neighbourhood to see how much park each person has." },
  { range: [0.82, 0.92], text: "Open a park for its hours, facilities, quality evidence and the best time to go." },
];

function Caption({ p, range, text }: { p: MotionValue<number>; range: [number, number]; text: string }) {
  const [a, b] = range;
  const opacity = useTransform(p, [a - 0.03, a, b, b + 0.03], [0, 1, 1, 0]);
  return (
    <motion.p style={{ opacity }} className="absolute inset-x-0 bottom-0 font-display text-2xl font-bold leading-snug text-forest sm:text-3xl md:max-w-[28rem]">
      {text}
    </motion.p>
  );
}

function Intro({ p }: { p: MotionValue<number> }) {
  const opacity = useTransform(p, [0, 0.07, 0.13], [1, 1, 0]);
  const y = useTransform(p, [0, 0.13], [0, -24]);
  return (
    <motion.div style={{ opacity, y }} className="absolute inset-x-0 top-20 md:top-28">
      <h1 className="max-w-[16ch] font-display text-[2.6rem] font-extrabold leading-[1.03] text-forest sm:text-6xl md:text-7xl">A greener city begins with knowing yours.</h1>
      <p className="mt-5 max-w-md text-lg leading-relaxed text-charcoal/85">Discover the green spaces around you. Understand your neighbourhood. Find your perfect place outdoors.</p>
    </motion.div>
  );
}

function SearchReveal({ p }: { p: MotionValue<number> }) {
  const [on, setOn] = useState(false);
  const router = useRouter();
  useMotionValueEvent(p, "change", (v) => setOn(v > 0.94));
  const opacity = useTransform(p, [0.92, 0.97], [0, 1]);
  return (
    <motion.div style={{ opacity }} aria-hidden={!on} {...(!on ? { inert: true } : {})} className={`absolute inset-x-0 bottom-0 ${on ? "" : "pointer-events-none"}`}>
      <div className="max-w-xl bg-ivory/95 p-4 sm:p-5">
        <h2 className="font-display text-2xl font-extrabold text-forest sm:text-3xl">Where would you like to explore?</h2>
        <div className="mt-3"><AreaSearch onDone={() => router.push("/explore/")} /></div>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------- page section */

export default function ScrollCity() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const still = useMotionValue(0.56);
  const router = useRouter();

  if (reduce) {
    return (
      <section aria-label="Introduction" className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
        <h1 className="max-w-[18ch] font-display text-5xl font-extrabold leading-[1.05] text-forest md:text-6xl">A greener city begins with knowing yours.</h1>
        <p className="mt-5 max-w-xl text-lg">Discover the green spaces around you. Understand your neighbourhood. Find your perfect place outdoors.</p>
        <div className="mt-8 aspect-[11/6] w-full"><CityScene p={still} /></div>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">{CAPTIONS.map((c) => <li key={c.text} className="max-w-md text-lg text-forest">{c.text}</li>)}</ul>
        <div className="mt-10 max-w-xl"><h2 className="font-display text-3xl font-extrabold text-forest">Where would you like to explore?</h2><div className="mt-3"><AreaSearch onDone={() => router.push("/explore/")} /></div></div>
      </section>
    );
  }

  return (
    <section ref={ref} aria-label="Scroll through a city" className="relative h-[620vh]">
      <div className="sticky top-0 h-dvh overflow-hidden">
        <div className="absolute inset-0 pt-10 md:pt-6"><CityScene p={scrollYProgress} /></div>
        <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-full max-w-[1400px] px-4 sm:px-6">
          <Intro p={scrollYProgress} />
          <div className="absolute inset-x-4 bottom-8 h-40 sm:inset-x-6 md:bottom-12">
            {CAPTIONS.map((c) => <Caption key={c.text} p={scrollYProgress} {...c} />)}
            <div className="pointer-events-auto"><SearchReveal p={scrollYProgress} /></div>
          </div>
          <p className="absolute right-4 top-16 text-xs text-charcoal/70 sm:right-6">Illustration, not real data</p>
        </div>
        <ScrollHint p={scrollYProgress} />
      </div>
    </section>
  );
}

function ScrollHint({ p }: { p: MotionValue<number> }) {
  const opacity = useTransform(p, [0, 0.04], [1, 0]);
  return (
    <motion.div style={{ opacity }} className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-sm text-forest/70">
      Scroll to explore
    </motion.div>
  );
}

export function LandingAfter() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
      <h2 className="max-w-[20ch] font-display text-4xl font-extrabold leading-tight text-forest">Three questions, answered for your neighbourhood</h2>
      <div className="mt-10 grid gap-10 md:grid-cols-3">
        <div>
          <h3 className="font-display text-xl font-bold">How green is it?</h3>
          <p className="mt-2 text-charcoal/80">Public park area per resident, vegetation cover and how many people live within a 5, 10 or 15 minute walk of a park. Every figure shows its source and how it was calculated.</p>
          <Link href="/explore/" className="mt-3 inline-block font-semibold text-forest underline underline-offset-4">Open the map</Link>
        </div>
        <div>
          <h3 className="font-display text-xl font-bold">Which park suits me?</h3>
          <p className="mt-2 text-charcoal/80">Pick an age group, activities and how far you will travel. Canopy ranks parks by confirmed facilities, opening hours and the weather, and tells you why.</p>
          <Link href="/for-you/" className="mt-3 inline-block font-semibold text-forest underline underline-offset-4">Get recommendations</Link>
        </div>
        <div>
          <h3 className="font-display text-xl font-bold">Who is missing out?</h3>
          <p className="mt-2 text-charcoal/80">Green Divide finds dense neighbourhoods with little reachable park, for residents, planners and civic groups to act on.</p>
          <Link href="/green-divide/" className="mt-3 inline-block font-semibold text-forest underline underline-offset-4">See the divide</Link>
        </div>
      </div>
      <p className="mt-14 max-w-2xl border-l-2 border-forest pl-4 text-charcoal/85">
        This build is a working product with an honest scope: the Hyderabad pages run on clearly labelled demonstration data, and any Indian locality can be explored live from OpenStreetMap. Where a number can’t be supported by data, Canopy says so instead of guessing.
      </p>
    </section>
  );
}
