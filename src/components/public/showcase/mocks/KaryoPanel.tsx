const CHROMOSOMES = Array.from({ length: 20 }, (_, i) => ({
  len: 38 + ((i * 13) % 40) + 20,
  pips: [
    { pos: (i * 17) % 100, col: "#34d399" },
    ...(i % 3 === 0 ? [{ pos: (i * 31) % 100, col: "#f59e0b" }] : []),
    ...(i % 5 === 0 ? [{ pos: (i * 47) % 100, col: "#38bdf8" }] : []),
  ],
}));

export default function KaryoPanel() {
  return (
    <div className="karyo-panel">
      <div className="karyo-head">
        <div>
          <div className="karyo-eye">Karyogram · biscuit_20240812</div>
          <div className="karyo-title">Somatic variants per chromosome</div>
        </div>
        <div className="karyo-legend">
          <span><i style={{ background: "#34d399" }} />SNV</span>
          <span><i style={{ background: "#f59e0b" }} />Indel</span>
          <span><i style={{ background: "#38bdf8" }} />SV</span>
        </div>
      </div>
      <div className="karyo-tracks">
        {CHROMOSOMES.map((c, i) => (
          <div className="karyo-row" key={i}>
            <div className="karyo-lbl">chr{i + 1}</div>
            <div className="karyo-bar" style={{ flexBasis: c.len + "%" }}>
              {c.pips.map((p, j) => (
                <span
                  key={j}
                  className="karyo-pip"
                  style={{ left: p.pos + "%", background: p.col, boxShadow: "0 0 8px " + p.col }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
