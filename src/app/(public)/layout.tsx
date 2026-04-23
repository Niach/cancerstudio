import type { Metadata } from "next";

import TopNav from "@/components/public/TopNav";
import SiteFooter from "@/components/public/SiteFooter";
import "./public.css";

export const metadata: Metadata = {
  title: "cancerstudio — cure your pet's cancer. today.",
  description:
    "Sequence the tumor. Compute the cure. An open archive of reference pet genomes, and a pipeline that turns a biopsy into a personalised mRNA vaccine.",
};

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="cs-public">
      <TopNav />
      {children}
      <SiteFooter />
    </div>
  );
}
