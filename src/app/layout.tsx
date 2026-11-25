import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/inter";
import "./globals.css";
import { AreaProvider } from "@/lib/store";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "canopy. — green-space intelligence for Indian cities",
  description:
    "Find parks, understand how green your neighbourhood is, and get personalised outdoor recommendations. Demonstration build with live OpenStreetMap exploration.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-forest focus:text-ivory focus:p-3">
          Skip to content
        </a>
        <AreaProvider>
          <Nav />
          <main id="main">{children}</main>
          <Footer />
        </AreaProvider>
      </body>
    </html>
  );
}
