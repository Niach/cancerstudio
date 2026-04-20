"""Unit tests for the stage-7 manufacturability checks.

These exercise ``run_manufacturing_checks`` directly against crafted byte
strings — no workspace, no DB — so the tests are fast and pinpoint the
DNAchisel wiring rather than the orchestration around it.
"""
from __future__ import annotations

from app.services.construct_checks import run_manufacturing_checks
from app.services.construct_design import compute_metrics


def _by_id(results):
    return {c.id: c for c in results}


def _clean_utr5() -> str:
    # AT-rich, non-periodic — approximates a real 5' UTR for a clean baseline.
    return "GGGAAATAAGAGAGAAAAGAAGAGTAAGAAGAAATATAAGAGCTCAGCACC"


def _clean_utr3() -> str:
    # Distinct from utr5 so the whole construct has no 15-nt direct repeat;
    # ~53% GC keeps the 50-nt GC window in-range.
    return "CTGGCTAGCTTCCAGATGCCTTGCAAGCTTAGCTGGATCCTCGAGGTAATG"


def _clean_orf() -> str:
    # 30-aa MDAMKRGLTIENQHYVFCSPDAEGLTINHY encoded with alternating
    # opt/unopt codons so GC sits near 46% — inside the 30-70% window.
    # Contains no restriction sites, no 7+ homopolymer runs, and no R[X][RK]R
    # furin motif.
    return (
        "ATGGATGCCATGAAGAGGGGCTTAACCATAGAGAATCAGCATTACGTA"
        "TTCTGTAGCCCAGACGCAGAGGGACTGACAATCAATCACTAT"
    )


def test_clean_sequence_passes():
    orf = _clean_orf()
    utr5 = _clean_utr5()
    utr3 = _clean_utr3()
    poly_a_len = 120
    full_nt = utr5 + orf + "TAA" + utr3 + ("A" * poly_a_len)

    results = _by_id(run_manufacturing_checks(full_nt, orf, poly_a_len=poly_a_len))

    assert results["bsai"].status == "pass"
    assert results["bsmbi"].status == "pass"
    assert results["homop"].status == "pass"
    assert results["gc"].status == "pass"
    assert results["repeat"].status == "pass"
    assert results["furin"].status == "pass"
    # AT-rich utr5 has weak cap-proximal structure — well above the -25 threshold.
    assert results["hairp"].status == "pass"


def test_bsai_site_fails():
    orf = _clean_orf()
    utr5 = _clean_utr5()
    utr3 = _clean_utr3()
    poly_a_len = 120
    utr5_dirty = utr5[:20] + "GGTCTC" + utr5[20:]
    full_nt = utr5_dirty + orf + "TAA" + utr3 + ("A" * poly_a_len)

    results = _by_id(run_manufacturing_checks(full_nt, orf, poly_a_len=poly_a_len))

    assert results["bsai"].status == "fail"
    assert results["bsmbi"].status == "pass"


def test_poly_a_tail_does_not_fire_homopolymer_but_orf_run_does():
    utr5 = _clean_utr5()
    utr3 = _clean_utr3()
    clean_orf = _clean_orf()
    poly_a_len = 120

    # Case A: poly(A) tail of 120 A is intentional — must not fail homop.
    clean_full = utr5 + clean_orf + "TAA" + utr3 + ("A" * poly_a_len)
    clean_results = _by_id(
        run_manufacturing_checks(clean_full, clean_orf, poly_a_len=poly_a_len)
    )
    assert clean_results["homop"].status == "pass"

    # Case B: 9-A run inside the ORF must trip homop.
    dirty_orf = clean_orf[:30] + "AAAAAAAAA" + clean_orf[30:]
    dirty_full = utr5 + dirty_orf + "TAA" + utr3 + ("A" * poly_a_len)
    dirty_results = _by_id(
        run_manufacturing_checks(dirty_full, dirty_orf, poly_a_len=poly_a_len)
    )
    assert dirty_results["homop"].status == "fail"


def test_strong_cap_hairpin_fails():
    # Synthetic strong stem-loop in the cap-proximal 50 nt — MFE drops past -25.
    cap_hairpin = "GGGCCCGGGAAACCCGGGCCCTTTGGGCCCGGGAAACCCGGGCCCTTTGG"
    orf = _clean_orf()
    utr3 = _clean_utr3()
    poly_a_len = 120
    full_nt = cap_hairpin + orf + "TAA" + utr3 + ("A" * poly_a_len)

    results = _by_id(run_manufacturing_checks(full_nt, orf, poly_a_len=poly_a_len))

    assert results["hairp"].status == "fail"


def test_furin_motif_fails():
    utr5 = _clean_utr5()
    utr3 = _clean_utr3()
    poly_a_len = 120
    # Protein: MDRKRRG — the RKRR in the middle matches R[A-Z][RK]R.
    # Codons: ATG GAC AGA AAG AGA AGA GGC
    orf = "ATGGACAGAAAGAGAAGAGGC"
    full_nt = utr5 + orf + "TAA" + utr3 + ("A" * poly_a_len)

    results = _by_id(run_manufacturing_checks(full_nt, orf, poly_a_len=poly_a_len))

    assert results["furin"].status == "fail"


def test_compute_metrics_returns_real_mfe_and_gc():
    # Different amino-acid content should produce different MFE / GC — proving
    # these come from the folded bytes rather than a λ-only interpolation.
    # Lambda is fixed; only the peptide changes.
    m1 = compute_metrics("MDAMKRGLCCVLLLCGAVFVSPS", lambda_value=0.65)
    m2 = compute_metrics("FFFFFFFFFFFFFFFFFFFFFFF", lambda_value=0.65)
    assert m1.mfe != m2.mfe, "MFE must depend on the actual sequence, not λ alone"
    assert m1.gc != m2.gc, "GC must be counted from the real bytes"
    # Sanity: MFE is negative (every real folded mRNA has some structure).
    assert m1.mfe < 0
    # Old interpolation was between -620 and -900 kcal/mol. Real folds of a
    # ~20-aa ORF are much closer to 0. Guard against a regression to interpolation.
    assert m1.mfe > -200
