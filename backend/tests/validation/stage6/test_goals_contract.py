"""Stage 6 validation — the ``_goals_pass`` safety contract.

`_goals_pass` is the single function that decides whether a workspace
is "ready for construct design". Every safety gate the product claims
to enforce lives here; a regression in any branch means the UI would
green-light an unsafe cassette. These tests formalise each gate so a
silent drift (e.g., someone removes the class-II check while tuning
goal weights) fails fast and loudly.

Written as pure-unit tests on crafted candidate fixtures — no DB, no
workspace, no pipeline.
"""
from __future__ import annotations

from app.models.schemas import (
    EpitopeCandidateResponse,
    EpitopeSafetyFlagResponse,
)
from app.services.epitope_selection import _goals_pass


def _cand(
    cid: str,
    *,
    gene: str,
    mhc_class: str = "I",
    allele_id: str = "a1",
    cancer_gene: bool = True,
) -> EpitopeCandidateResponse:
    """Build a stage-6 candidate with sensible defaults. Test fixtures
    override only what's relevant to the gate they're exercising."""
    return EpitopeCandidateResponse.model_validate(
        {
            "id": cid,
            "seq": "ACDEFGHIK",
            "gene": gene,
            "mut": "p.X1Y",
            "mutation": "p.X1Y",
            "length": 9,
            "class": mhc_class,
            "allele": "DLA-88*034:01" if mhc_class == "I" else "DLA-DRB1*015:01",
            "allele_id": allele_id,
            "ic50_nm": 50.0,
            "vaf": 0.3,
            "tpm": 40.0,
            "agretopicity": 0.5,
            "cancer_gene": cancer_gene,
            "tier": "strong",
            "self_similarity": None,
            "flags": [],
            "score": 0.8,
        }
    )


def _safety(pid: str, risk: str) -> EpitopeSafetyFlagResponse:
    return EpitopeSafetyFlagResponse(
        peptide_id=pid,
        self_hit="TTN",
        identity=100 if risk == "critical" else 85,
        risk=risk,
        note="test",
    )


# ---------------------------------------------------------------------------
# Positive control — a fully valid cassette must pass.
# ---------------------------------------------------------------------------


def _make_valid_pool() -> tuple[list[EpitopeCandidateResponse], list[str]]:
    """Six distinct cancer genes, five distinct alleles (a1..a5), one
    class-II pick. A realistic production scenario."""
    cands = [
        _cand("p1", gene="TP53", allele_id="a1"),
        _cand("p2", gene="KIT",  allele_id="a2"),
        _cand("p3", gene="BRAF", allele_id="a3"),
        _cand("p4", gene="NRAS", allele_id="a4"),
        _cand("p5", gene="PTEN", allele_id="a5"),
        _cand("p6", gene="CDKN2A", mhc_class="II", allele_id="a2"),
    ]
    selection = [c.id for c in cands]
    return cands, selection


def test_valid_cassette_passes_goals() -> None:
    cands, picks = _make_valid_pool()
    assert _goals_pass(picks, cands, safety={})


# ---------------------------------------------------------------------------
# Each safety gate: the cassette must be blocked.
# ---------------------------------------------------------------------------


def test_blocks_on_too_few_picks() -> None:
    cands, picks = _make_valid_pool()
    assert not _goals_pass(picks[:5], cands, safety={})


def test_blocks_on_too_many_picks() -> None:
    cands, picks = _make_valid_pool()
    # Clone the 6th candidate three more times to get 9 picks.
    extras = [
        _cand(f"p{7+i}", gene=f"EXTRA{i}", allele_id="a1")
        for i in range(3)
    ]
    all_cands = cands + extras
    too_many = picks + [e.id for e in extras]
    assert len(too_many) == 9
    assert not _goals_pass(too_many, all_cands, safety={})


def test_blocks_when_gene_diversity_below_five() -> None:
    """Cassette with only 4 unique genes should be rejected."""
    cands = [
        _cand("p1", gene="TP53", allele_id="a1"),
        _cand("p2", gene="TP53", allele_id="a2"),  # gene reuse
        _cand("p3", gene="KIT",  allele_id="a3"),
        _cand("p4", gene="BRAF", allele_id="a4"),
        _cand("p5", gene="NRAS", allele_id="a5"),
        _cand("p6", gene="TP53", mhc_class="II", allele_id="a2"),
    ]
    picks = [c.id for c in cands]
    # 4 unique genes (TP53, KIT, BRAF, NRAS) — below the floor of 5.
    assert not _goals_pass(picks, cands, safety={})


def test_blocks_on_missing_class_ii_when_pool_has_it() -> None:
    """Pool has class-II candidates; picks don't include one → block."""
    cands = [
        _cand("p1", gene="TP53", allele_id="a1"),
        _cand("p2", gene="KIT",  allele_id="a2"),
        _cand("p3", gene="BRAF", allele_id="a3"),
        _cand("p4", gene="NRAS", allele_id="a4"),
        _cand("p5", gene="PTEN", allele_id="a5"),
        _cand("p6", gene="CDKN2A", allele_id="a1"),
        # Pool also has class-II, but it's not in the selection:
        _cand("p7", gene="MAP2K1", mhc_class="II", allele_id="a2"),
    ]
    picks = [c.id for c in cands[:6]]  # only class-I picks
    assert not _goals_pass(picks, cands, safety={})


def test_passes_when_pool_has_no_class_ii() -> None:
    """If the pool doesn't have class-II (common on canine data), the
    class-II requirement should adapt away rather than hard-block."""
    cands, picks = _make_valid_pool()
    cands_no_class_ii = [
        _cand(c.id, gene=c.gene, mhc_class="I", allele_id=c.allele_id)
        for c in cands
    ]
    assert _goals_pass(picks, cands_no_class_ii, safety={})


def test_blocks_on_critical_self_identity_flag() -> None:
    """A picked peptide with critical self-identity risk must block,
    even if every other goal is met. This is the self-cross-reactivity
    guard surfaced through BLAST in stage-6."""
    cands, picks = _make_valid_pool()
    safety = {"p3": _safety("p3", "critical")}
    assert not _goals_pass(picks, cands, safety=safety)


def test_passes_with_elevated_but_not_critical_self_identity() -> None:
    """Elevated / mild self-identity flags are surfaced but do not
    block — they require curator acknowledgement, not auto-rejection."""
    cands, picks = _make_valid_pool()
    safety = {"p1": _safety("p1", "elevated"), "p2": _safety("p2", "mild")}
    assert _goals_pass(picks, cands, safety=safety)


def test_blocks_when_picks_have_no_driver_but_pool_has_them() -> None:
    """Driver-gene representation: if any cancer-gene peptide was
    in the pool, at least one must make it into the cassette."""
    cands = [
        _cand("p1", gene="PASS1", allele_id="a1", cancer_gene=False),
        _cand("p2", gene="PASS2", allele_id="a2", cancer_gene=False),
        _cand("p3", gene="PASS3", allele_id="a3", cancer_gene=False),
        _cand("p4", gene="PASS4", allele_id="a4", cancer_gene=False),
        _cand("p5", gene="PASS5", allele_id="a5", cancer_gene=False),
        _cand("p6", gene="PASS6", mhc_class="II", allele_id="a1", cancer_gene=False),
        # Driver exists but wasn't picked:
        _cand("pD", gene="TP53", allele_id="a2", cancer_gene=True),
    ]
    picks = [c.id for c in cands[:6]]  # all passenger
    assert not _goals_pass(picks, cands, safety={})


def test_allele_diversity_requirement_adapts_to_pool() -> None:
    """When the pool has fewer than 3 usable alleles, the goal softens
    rather than blocking completion outright — canine runs routinely
    see only 1-2 valid DLA alleles."""
    cands = [
        _cand("p1", gene="TP53", allele_id="only"),
        _cand("p2", gene="KIT",  allele_id="only"),
        _cand("p3", gene="BRAF", allele_id="only"),
        _cand("p4", gene="NRAS", allele_id="only"),
        _cand("p5", gene="PTEN", allele_id="only"),
        _cand("p6", gene="CDKN2A", mhc_class="II", allele_id="only"),
    ]
    picks = [c.id for c in cands]
    # Single allele; the rule requires min(3, pool_size) distinct
    # picks, so 1 pick ≥ 1 is enough.
    assert _goals_pass(picks, cands, safety={})
