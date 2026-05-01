import type { Metadata } from "next";

import TopNav from "@/components/public/TopNav";
import SiteFooter from "@/components/public/SiteFooter";
import "./public.css";

export const metadata: Metadata = {
  title: "mutavax — design your own mRNA cancer vaccine",
  description:
    "An open studio for designing personalized mRNA cancer vaccines — for dogs, cats, and humans, on your own machine.",
};

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mvx-public">
      <TopNav />
      {children}
      <SiteFooter />
    </div>
  );
}
