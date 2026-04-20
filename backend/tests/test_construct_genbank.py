"""Verify stage-8 GenBank output is a valid Biopython record."""
from __future__ import annotations

import io

from Bio import SeqIO

from app.models.schemas import ConstructOutputRun
from app.services.construct_output import _build_genbank


class _Stub:
    pass


def _summary_with_runs() -> tuple[object, list[ConstructOutputRun]]:
    summary = _Stub()
    summary.flanks = _Stub()
    summary.flanks.utr5 = "GCCACCAAA"
    summary.flanks.utr3 = "CTGGAGCCT"
    summary.flanks.poly_a = 30
    summary.aa_seq = "MDAMKRGL"
    summary.segments = []
    runs = [
        ConstructOutputRun(kind="utr5", label="5' UTR", nt="GCCACCAAAAAA"),
        ConstructOutputRun(
            kind="signal", label="SP", nt="ATGGATGCCATGAAGCGGGGCCTG"
        ),
        ConstructOutputRun(kind="classI", label="KIT", nt="AACATCATCCAGCTGCTG"),
        ConstructOutputRun(kind="stop", label="stop", nt="TAA"),
        ConstructOutputRun(kind="utr3", label="3' UTR", nt="CTGGAGCCTCGG"),
        ConstructOutputRun(kind="polyA", label="poly(A)30", nt="A" * 30),
    ]
    return summary, runs


def test_genbank_round_trips_through_biopython():
    summary, runs = _summary_with_runs()
    gb = _build_genbank(summary, runs, "CS-TEST-001", "Canis familiaris")
    rec = SeqIO.read(io.StringIO(gb), "genbank")
    assert str(rec.seq) == "".join(r.nt for r in runs)
    assert rec.id.startswith("CS-TEST-001") or rec.name.startswith("CS-TEST-001")


def test_genbank_has_cds_with_translation():
    summary, runs = _summary_with_runs()
    gb = _build_genbank(summary, runs, "CS-TEST-002", "Canis familiaris")
    rec = SeqIO.read(io.StringIO(gb), "genbank")
    cds = [f for f in rec.features if f.type == "CDS"]
    assert len(cds) == 1, f"expected exactly one CDS, got {len(cds)}"
    translation = cds[0].qualifiers["translation"][0]
    assert translation.startswith("M"), translation
    # Signal+linker+peptide translated, then stop — no trailing stop in
    # /translation (Biopython strips it when ``to_stop`` is honoured).
    assert "*" not in translation


def test_genbank_utr_and_polya_features_present():
    summary, runs = _summary_with_runs()
    gb = _build_genbank(summary, runs, "CS-TEST-003", "Canis familiaris")
    rec = SeqIO.read(io.StringIO(gb), "genbank")
    types = {f.type for f in rec.features}
    assert "5'UTR" in types
    assert "3'UTR" in types
    assert "polyA_signal" in types
