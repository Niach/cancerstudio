import AboutProse from "@/components/public/AboutProse";
import { buildCatalog, catalogStats } from "@/lib/public-catalog";

export const dynamic = "force-static";

export default function MissionPage() {
  const stats = catalogStats(buildCatalog(24, "balanced"));
  return <AboutProse stats={stats} />;
}
