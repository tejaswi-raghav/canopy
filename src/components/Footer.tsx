import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-forest/10 bg-ivory text-sm text-charcoal/70">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-8 sm:px-6 md:flex-row md:justify-between">
        <p className="max-w-xl">
          canopy. is an early build. Demonstration areas use synthetic data and are always labelled. Live areas use map data © OpenStreetMap contributors (ODbL); weather from Open-Meteo.
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          <li><Link href="/methodology/" className="underline underline-offset-2">Methodology</Link></li>
          <li><Link href="/about/" className="underline underline-offset-2">About</Link></li>
          <li><Link href="/contribute/" className="underline underline-offset-2">Report a problem</Link></li>
        </ul>
      </div>
    </footer>
  );
}
