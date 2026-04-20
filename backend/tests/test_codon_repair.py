"""Unit tests for the DNAchisel codon-repair pass."""
from __future__ import annotations

from app.services.codon_repair import repair


def _translate(dna: str) -> str:
    table = {
        "ATG": "M", "GAC": "D", "GAT": "D", "CGT": "R", "CGC": "R", "CGA": "R",
        "CGG": "R", "AGA": "R", "AGG": "R", "CTC": "L", "CTA": "L", "CTG": "L",
        "TTA": "L", "TTG": "L", "GCC": "A", "GCA": "A", "GCG": "A", "GCT": "A",
        "AAG": "K", "AAA": "K", "TAA": "*", "TAG": "*", "TGA": "*",
    }
    return "".join(
        table.get(dna[i : i + 3].upper(), "X") for i in range(0, len(dna) - 2, 3)
    )


def test_bsmbi_site_is_removed_and_protein_preserved():
    # ATG GAC CGT CTC GCC ATG AAG → MDRLAMK with a CGTCTC BsmBI site spanning codons 3-4.
    dirty = "ATGGACCGTCTCGCCATGAAG"
    repaired = repair(dirty)
    assert "CGTCTC" not in repaired, f"BsmBI site still present in {repaired}"
    assert _translate(repaired) == _translate(dirty), "protein must be preserved"


def test_bsai_site_is_removed_and_protein_preserved():
    # MDALAMK with a GGTCTC BsaI site embedded.
    dirty = "ATGGACGCCGGTCTCGCCATGAAG"
    repaired = repair(dirty)
    assert "GGTCTC" not in repaired
    assert _translate(repaired) == _translate(dirty)


def test_empty_input_returns_empty():
    assert repair("") == ""


def test_already_clean_sequence_unchanged_or_equivalent():
    # Any 21-nt clean ORF — repair should return something translating identically.
    clean = "ATGGACGCCATGAAGCGGGGC"
    repaired = repair(clean)
    assert _translate(repaired) == _translate(clean)
