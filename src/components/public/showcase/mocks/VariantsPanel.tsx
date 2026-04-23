const HEIGHTS = [12, 22, 36, 58, 78, 92, 96, 84, 70, 54, 42, 32, 24, 18, 14, 10, 8, 6, 5, 4];

export default function VariantsPanel() {
  return (
    <div className="vaf-panel">
      <div className="align-header">
        <div>
          <div className="mini-eye">VAF histogram · somatic SNVs</div>
          <div className="mini-title">Variant allele fraction distribution</div>
        </div>
        <div className="vaf-stats">
          <span>median VAF <b>0.41</b></span>
          <span>clonal <b>68%</b></span>
        </div>
      </div>
      <div className="vaf-bars">
        {HEIGHTS.map((h, i) => (
          <div className="vaf-bar" key={i} style={{ height: h + "%" }} />
        ))}
      </div>
      <div className="vaf-axis">
        <span>0.0</span><span>0.25</span><span>0.5</span><span>0.75</span><span>1.0</span>
      </div>
    </div>
  );
}
