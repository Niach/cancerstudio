const PEPTIDES = [
  { seq: "SLYNTVATLY", gene: "TP53",  vaf: 0.62, rank: 1 },
  { seq: "RMFPNAPYL",  gene: "KRAS",  vaf: 0.54, rank: 2 },
  { seq: "KLVVVGAGGV", gene: "KRAS",  vaf: 0.48, rank: 3 },
  { seq: "FLPSDFFPSV", gene: "BRAF",  vaf: 0.41, rank: 4 },
  { seq: "GLYDGREHT",  gene: "PTEN",  vaf: 0.33, rank: 5 },
];

export default function PeptidesPanel() {
  return (
    <div className="peptides-panel">
      <div className="mini-eye" style={{ marginBottom: 10 }}>Peptide shortlist · sorted by rank</div>
      <table className="peptide-table">
        <thead>
          <tr><th>#</th><th>Peptide</th><th>Gene</th><th>VAF</th><th>Rank</th></tr>
        </thead>
        <tbody>
          {PEPTIDES.map((p, i) => (
            <tr key={i}>
              <td className="mono">{(i + 1).toString().padStart(2, "0")}</td>
              <td className="mono pep-seq">{p.seq}</td>
              <td><span className="gene-chip">{p.gene}</span></td>
              <td className="mono">{p.vaf.toFixed(2)}</td>
              <td className="mono">#{p.rank}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
