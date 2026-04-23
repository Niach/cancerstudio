"use client";

import { useState } from "react";

import type { CatalogGenome } from "@/lib/public-catalog";

export default function DownloadDialog({
  genome,
  onClose,
}: {
  genome: CatalogGenome;
  onClose: () => void;
}) {
  const [fmtChoice, setFmt] = useState<"fastq" | "bam" | "vcf" | "bundle">("bundle");
  const [ack, setAck] = useState(false);
  const opts = [
    { id: "fastq" as const, lbl: "FASTQ reads", desc: "Paired R1/R2 compressed FASTQ — for realignment.", sz: (genome.sizeGb * 24).toFixed(0) + " GB" },
    { id: "bam" as const, lbl: "BAM alignment", desc: "Aligned to " + genome.assembly + " with index.", sz: (genome.sizeGb * 7).toFixed(1) + " GB" },
    { id: "vcf" as const, lbl: "VCF variants only", desc: "SNV + indel + SV joint-called VCF, bgzipped.", sz: (genome.sizeGb * 0.14).toFixed(2) + " GB" },
    { id: "bundle" as const, lbl: "Full bundle", desc: "FASTQ + BAM + VCF + manifest + checksums.", sz: (genome.sizeGb * 31 + 0.14).toFixed(0) + " GB" },
  ];
  const chosen = opts.find(o => o.id === fmtChoice)!;
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="dlg" onClick={e => e.stopPropagation()}>
        <div className="h">
          <div>
            <div className="eyebrow">Download · {genome.id}</div>
            <h2>{genome.name} — {genome.breed}</h2>
          </div>
          <button type="button" className="x" onClick={onClose}>✕</button>
        </div>
        <div className="body">
          {opts.map(o => (
            <label key={o.id} className={"opt" + (fmtChoice === o.id ? " on" : "")}>
              <input type="radio" name="fmt" checked={fmtChoice === o.id} onChange={() => setFmt(o.id)} />
              <div>
                <div className="lbl">{o.lbl}</div>
                <div className="desc">{o.desc}</div>
              </div>
              <span className="sz">{o.sz}</span>
            </label>
          ))}
          <div className="license-note">
            <b>{genome.license.name}</b> — {genome.license.desc}. If you use this genome in a
            publication, cite contributor <b>{genome.lab.name}</b> and this archive.
            <label>
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
              I understand and will cite as required.
            </label>
          </div>
          <div className="code">
            <span className="c"># Direct download via CLI</span>{"\n"}
            <span className="k">cancerstudio</span> genome get <span className="n">{genome.id}</span> --format=<span className="s">{fmtChoice}</span> -o ./refs/
          </div>
        </div>
        <div className="f">
          <div className="total">
            Total transfer · <b>{chosen.sz}</b>
          </div>
          <div className="actions">
            <button type="button" className="btn-dark" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-dark primary" disabled={!ack}>Begin download</button>
          </div>
        </div>
      </div>
    </div>
  );
}
