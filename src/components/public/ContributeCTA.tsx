import Link from "next/link";

import { fmt, type CatalogStats } from "@/lib/public-catalog";

export default function ContributeCTA({ stats }: { stats: CatalogStats }) {
  return (
    <section className="block contribute">
      <div className="inner">
        <div className="contribute-grid">
          <div className="c-col">
            <div className="section-label">Partner with us</div>
            <h2 className="big">
              Become a sequencing <em className="acgt-G">partner</em>.
            </h2>
            <p>
              Running a veterinary genomics lab? We&apos;d love to list you as a
              sequencing partner for pet owners contributing healthy genomes to the
              archive. Drop us a line and we&apos;ll set you up.
            </p>
            <div className="c-cta">
              <a className="btn-primary dark" href="mailto:dennis@straehhuber.com?subject=cancerstudio%20sequencing%20partner">
                Contact to partner
                <span className="arrow">→</span>
              </a>
            </div>
          </div>
          <div className="c-col c-col-alt">
            <div className="section-label">Browse</div>
            <h2 className="big">
              Explore the <em className="acgt-C">archive</em>.
            </h2>
            <p>
              <b>{fmt(stats.total)} healthy reference genomes</b> — {fmt(stats.dogs)} dogs
              and {fmt(stats.cats)} cats from {stats.labs} partner labs. Free to
              browse, free to download, permissively licensed.
            </p>
            <div className="c-cta">
              <Link className="btn-ghost" href="/archive">
                Open the archive
                <span className="arrow-mono">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
