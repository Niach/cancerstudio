import AppShowcase from "@/components/public/AppShowcase";
import ContributeCTA from "@/components/public/ContributeCTA";
import Hero from "@/components/public/Hero";
import Triptych from "@/components/public/Triptych";
import { buildCatalog, catalogStats } from "@/lib/public-catalog";

export const dynamic = "force-static";

export default function PublicHomePage() {
  const stats = catalogStats(buildCatalog(24, "balanced"));
  return (
    <>
      <Hero />
      <AppShowcase />
      <Triptych />
      <ContributeCTA stats={stats} />
    </>
  );
}
