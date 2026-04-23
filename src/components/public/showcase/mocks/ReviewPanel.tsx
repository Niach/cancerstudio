const CHECKS = [
  "Ingest manifest matches checksums",
  "Coverage above 30× for both samples",
  "No contamination in normal sample",
  "VCF PASS filter applied consistently",
  "All 12 epitopes present in construct",
  "Codon-optimisation targets correct species",
  "2° structure ΔG within safe range",
  "No off-target homology to self-proteome",
  "Manifest cryptographically signed",
  "Audit trail complete · 42 pages",
  "Provenance chain intact",
  "Ready for GMP manufacturing handoff",
];

export default function ReviewPanel() {
  return (
    <div className="review-panel">
      <div className="rp-head">
        <div className="rp-eye">Claude Sonnet 4.5 · end-to-end audit</div>
        <div className="rp-verdict">
          <span className="rp-check">✓</span> Ship
        </div>
      </div>
      <div className="rp-grid">
        {CHECKS.map((c, i) => (
          <div key={i} className="rp-check-row">
            <span className="rp-tick">✓</span>
            <span>{c}</span>
          </div>
        ))}
      </div>
      <div className="rp-sig">
        <span className="rp-conf">Confidence <b>0.94</b></span>
        <span className="mono">—</span>
        <span className="rp-ok">Signed at 05:16:04 · ed25519:7e4a…c13f</span>
      </div>
    </div>
  );
}
