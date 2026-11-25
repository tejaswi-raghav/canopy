import Link from "next/link";

export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 prose-canopy">
      <h1 className="font-display text-5xl font-extrabold leading-tight text-forest">Knowing your city’s green space is the first step to improving it</h1>
      <p className="mt-6 text-lg">Most people can’t say how much park there is near them, whether it’s open, or what it offers. City planners often can’t say it either, at neighbourhood level. canopy. is a start at changing that for Indian cities.</p>
      <h2>What it does</h2>
      <ul>
        <li><strong>Discover.</strong> Parks, their facilities, opening hours and the best times to visit.</li>
        <li><strong>Understand.</strong> Park area per resident, vegetation, walking access and where residents are left out.</li>
        <li><strong>Personalise.</strong> Recommendations from age group, activities, distance, accessibility and weather, each with a stated reason.</li>
      </ul>
      <h2>What it will not do</h2>
      <ul>
        <li>Invent numbers. If data does not exist, the page says so.</li>
        <li>Treat missing facilities data as proof that a facility doesn’t exist.</li>
        <li>Present community observations or its own scores as official inspections.</li>
        <li>Identify or estimate the age of any visitor from cameras or faces.</li>
      </ul>
      <h2>Where it stands</h2>
      <p>This is an early build. Hyderabad pages run on a clearly labelled synthetic dataset so every feature can be tried. Any locality in India can be explored live from OpenStreetMap. Population and satellite vegetation need the processing pipeline in the repository. <Link href="/methodology/">The methodology page</Link> lists sources, formulas and limitations.</p>
    </div>
  );
}
