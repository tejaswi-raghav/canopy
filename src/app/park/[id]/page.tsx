import { DEMO_SEEDS, demoDataset } from "@/data/demo";
import ParkView from "@/components/ParkView";
import { Suspense } from "react";

export function generateStaticParams() {
  const ids = DEMO_SEEDS.flatMap((s) => demoDataset(s.id)!.parks.map((p) => ({ id: p.id })));
  return [...ids, { id: "live" }];
}
export const dynamicParams = false;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="p-6">Loading park…</p>}>
      <ParkView routeId={id} />
    </Suspense>
  );
}
