const BARS = Array.from({ length: 40 }, (_, i) => 30 + (((i * 31 + 17) % 100) % 60));

export default function AlignPanel() {
  return (
    <div className="align-panel">
      <div className="align-header">
        <div>
          <div className="mini-eye">Coverage distribution · canFam4</div>
          <div className="mini-title">Depth across chr13 · q21.1–q31.3</div>
        </div>
        <div className="align-legend">
          <span /> <i>tumor</i> &nbsp; <span className="c" /> <i>normal</i>
        </div>
      </div>
      <div className="align-bars">
        {BARS.map((h, i) => (
          <div className="align-stack" key={i}>
            <div className="ab ab-t" style={{ height: h + "%" }} />
            <div className="ab ab-n" style={{ height: h * 0.88 + "%" }} />
          </div>
        ))}
      </div>
      <div className="align-ticks">
        <span>q21.1</span><span>q21.2</span><span>q22</span><span>q23</span>
        <span>q24</span><span>q25</span><span>q26</span><span>q31</span>
      </div>
    </div>
  );
}
