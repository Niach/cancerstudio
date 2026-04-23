import Link from "next/link";

import Detail from "@/components/public/Detail";
import { buildCatalog } from "@/lib/public-catalog";

export const dynamic = "force-static";

export function generateStaticParams() {
  const catalog = buildCatalog(24, "balanced");
  return catalog.map(g => ({ id: g.id }));
}

export default async function DetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const catalog = buildCatalog(24, "balanced");
  const genome = catalog.find(g => g.id === id);
  if (!genome) {
    return (
      <div style={{ padding: "80px 6vw", textAlign: "center" }}>
        <p style={{ color: "var(--ink-2)" }}>Genome not found.</p>
        <Link className="btn-primary" href="/archive">Back to archive</Link>
      </div>
    );
  }
  return <Detail genome={genome} />;
}
