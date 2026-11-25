"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/explore/", label: "Explore" },
  { href: "/for-you/", label: "For you" },
  { href: "/compare/", label: "Compare" },
  { href: "/green-divide/", label: "Green Divide" },
  { href: "/contribute/", label: "Contribute" },
  { href: "/methodology/", label: "Methodology" },
];

export default function Nav() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const onHome = path === "/" || path === "";
  return (
    <header className={`${onHome ? "absolute inset-x-0 top-0" : "sticky top-0 bg-ivory/95 backdrop-blur-sm border-b border-forest/10"} z-40`}>
      <nav className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="font-display text-xl font-extrabold tracking-tight text-forest" aria-label="canopy. home">
          canopy.
        </Link>
        <ul className="hidden items-center gap-6 text-sm md:flex">
          {LINKS.map((l) => {
            const active = path.startsWith(l.href.slice(0, -1));
            return (
              <li key={l.href}>
                <Link href={l.href} aria-current={active ? "page" : undefined} className={`py-1 ${active ? "border-b-2 border-forest font-semibold text-forest" : "text-charcoal/75 hover:text-forest"}`}>
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <button className="rounded px-2 py-1 text-sm font-medium text-forest md:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Menu"}
        </button>
      </nav>
      {open && (
        <ul id="mobile-nav" className="border-t border-forest/10 bg-ivory px-4 py-2 md:hidden">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={() => setOpen(false)} className="block py-2.5 text-forest">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
