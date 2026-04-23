import Browse from "@/components/public/Browse";
import { buildCatalog } from "@/lib/public-catalog";

export const dynamic = "force-static";

export default function ArchivePage() {
  const catalog = buildCatalog(24, "balanced");
  return <Browse catalog={catalog} />;
}
