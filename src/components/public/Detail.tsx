"use client";

import Link from "next/link";
import { useState } from "react";

import { ago, fmt, gb, type CatalogGenome } from "@/lib/public-catalog";
import DownloadDialog from "./DownloadDialog";

export default function Detail({ genome }: { genome: CatalogGenome }) {
  const [open, setOpen] = useState(false);
  const files = [
    { name: `${genome.id}_R1.fastq.gz`, ext: "FASTQ", size: (genome.sizeGb * 12).toFixed(1) + " GB" },
    { name: `${genome.id}_R2.fastq.gz`, ext: "FASTQ", size: (genome.sizeGb * 12).toFixed(1) + " GB" },
    { name: `${genome.id}.bam`, ext: "BAM", size: (genome.sizeGb * 7).toFixed(1) + " GB" },
    { name: `${genome.id}.bam.bai`, ext: "BAI", size: "6.8 MB" },
    { name: `${genome.id}.vcf.gz`, ext: "VCF", size: (genome.sizeGb * 0.14).toFixed(2) + " GB" },
    { name: `${genome.id}.vcf.gz.tbi`, ext: "TBI", size: "1.9 MB" },
    { name: `${genome.id}.manifest.json`, ext: "JSON", size: "2 KB" },
  ];
  return (
    <>
      <div className="detail-wrap">
        <Link className="back" href="/archive">← back to archive</Link>
        <div className="detail-head">
          <div>
            <div className="eyebrow">
              <span className={"species-chip " + genome.species}>
                <span className="dot" />
                {genome.species === "dog" ? "Canis lupus familiaris" : "Felis catus"}
              </span>
              <span>{genome.id}</span>
              <span>· added {ago(genome.addedDays)} · {genome.country}</span>
            </div>
            <h1>{genome.name}</h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn-dark primary" onClick={() => setOpen(true)}>
              Download genome
            </button>
          </div>
        </div>

        <div className="kv-grid">
          <div className="kv">
            <h3>Specimen</h3>
            <dl>
              <dt>Breed</dt><dd>{genome.breed}</dd>
              <dt>Breed group</dt><dd>{genome.breedGroup}</dd>
              <dt>Age</dt><dd>{genome.age} years</dd>
              <dt>Sex</dt><dd>{genome.sex}</dd>
              <dt>Weight</dt><dd>{genome.weightKg} kg</dd>
              <dt>Coat</dt><dd>{genome.coat}</dd>
              <dt>Flags</dt><dd>{genome.flags.length ? genome.flags.join(", ") : "None"}</dd>
            </dl>
          </div>
          <div className="kv">
            <h3>Sequencing</h3>
            <dl>
              <dt>Instrument</dt><dd>{genome.method.name}</dd>
              <dt>Read type</dt><dd>{genome.method.type}</dd>
              <dt>Coverage</dt><dd className="mono">{genome.coverage}× mean</dd>
              <dt>Reference</dt><dd className="mono">{genome.assembly}</dd>
              <dt>Contributor</dt><dd>{genome.lab.name}</dd>
              <dt>License</dt><dd>{genome.license.name} — {genome.license.desc}</dd>
              <dt>Raw size</dt><dd className="mono">~{gb(genome.sizeGb * 12 * 2 + genome.sizeGb * 7 + genome.sizeGb * 0.14)}</dd>
            </dl>
          </div>
        </div>

        <div className="variants">
          <div className="var-cell a">
            <div className="num">{(genome.snvs / 1e6).toFixed(2)}M</div>
            <div className="k">SNVs</div>
          </div>
          <div className="var-cell c">
            <div className="num">{fmt(genome.indels)}</div>
            <div className="k">Indels</div>
          </div>
          <div className="var-cell g">
            <div className="num">{fmt(genome.svs)}</div>
            <div className="k">Structural variants</div>
          </div>
        </div>

        <div className="files">
          <div className="h">
            <span className="t">Files · manifest</span>
            <span className="lic">Released under {genome.license.name}</span>
          </div>
          {files.map(f => (
            <div className="f-row" key={f.name}>
              <span className={"ext " + f.ext}>{f.ext}</span>
              <span className="f-name">{f.name}</span>
              <span className="f-size">{f.size}</span>
              <button type="button" className="f-get" onClick={() => setOpen(true)}>Download</button>
            </div>
          ))}
        </div>

        <div className="pon-cta">
          <div>
            <h3>Is your pet not in the archive yet?</h3>
            <p>
              Every healthy genome we add is another baseline a tumour can be read
              against. Book a sequencing slot with a partner lab — we cover the cost
              for most breeds.
            </p>
          </div>
          <a className="btn-dark primary" href="mailto:dennis@straehhuber.com?subject=cancerstudio%20sequencing%20partner">Contact to partner</a>
        </div>
      </div>
      {open && <DownloadDialog genome={genome} onClose={() => setOpen(false)} />}
    </>
  );
}
