const LANES = [
  { lane: "tumor",  name: "biscuit_tumor_R1.fastq.gz",  sz: "24.1 GB", color: "var(--a)" },
  { lane: "tumor",  name: "biscuit_tumor_R2.fastq.gz",  sz: "24.0 GB", color: "var(--a)" },
  { lane: "normal", name: "biscuit_normal_R1.fastq.gz", sz: "22.8 GB", color: "var(--c)" },
  { lane: "normal", name: "biscuit_normal_R2.fastq.gz", sz: "22.7 GB", color: "var(--c)" },
];

export default function IngestPanel() {
  return (
    <div className="ingest-panel">
      {LANES.map((l, i) => (
        <div className="ingest-row" key={i}>
          <div className="ingest-dot" style={{ background: l.color }} />
          <div>
            <div className="ingest-lane">{l.lane}</div>
            <div className="ingest-name">{l.name}</div>
          </div>
          <div className="ingest-bar"><span style={{ width: "100%", background: l.color }} /></div>
          <div className="ingest-size">{l.sz}</div>
          <div className="ingest-ok">✓</div>
        </div>
      ))}
    </div>
  );
}
