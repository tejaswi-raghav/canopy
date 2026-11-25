import { Suspense } from "react";
import ContributeForm from "@/components/ContributeForm";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <ContributeForm />
    </Suspense>
  );
}
