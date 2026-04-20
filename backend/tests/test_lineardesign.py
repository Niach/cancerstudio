"""Unit tests for the LinearDesign subprocess adapter.

Most tests skip automatically when the binary is not present locally (CI
without the full bioinformatics image). The fallback test runs unconditionally
by pointing the adapter at a nonexistent path.
"""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from app.services import lineardesign


def _binary_present() -> bool:
    return lineardesign.is_available()


@pytest.mark.skipif(not _binary_present(), reason="LinearDesign binary not installed")
def test_optimize_returns_parseable_output():
    result = lineardesign.optimize("MDAMKRGL", lambda_value=0.5)
    assert len(result.dna) == 8 * 3
    assert set(result.dna) <= set("ATGC")
    assert 0.0 <= result.cai <= 1.0
    # LinearDesign's own MFE is usually negative but a trivial 8-aa seq could
    # round to 0; tolerate either.
    assert result.mfe <= 0.0
    # Same input must be deterministic (cached).
    assert lineardesign.optimize("MDAMKRGL", lambda_value=0.5) == result


@pytest.mark.skipif(not _binary_present(), reason="LinearDesign binary not installed")
def test_lambda_affects_codon_choice():
    # λ=0 favours MFE only, λ=10 heavily favours CAI — the picks should differ.
    low = lineardesign.optimize("MDAMKRGLTIEN", lambda_value=0.0)
    high = lineardesign.optimize("MDAMKRGLTIEN", lambda_value=10.0)
    assert low.dna != high.dna, "λ must influence the codon picks"
    assert high.cai >= low.cai, "higher λ must prefer higher-CAI codons"


def test_missing_binary_raises_unavailable():
    with patch.object(lineardesign, "LINEARDESIGN_BIN", "/nonexistent/path"):
        assert not lineardesign.is_available()
        with pytest.raises(lineardesign.LinearDesignUnavailable):
            # Bypass cache on this specific input.
            lineardesign.optimize.cache_clear()
            lineardesign.optimize("MDAM", lambda_value=0.5)
        # Restore cache state for downstream tests.
        lineardesign.optimize.cache_clear()


def test_empty_peptide_returns_empty_result():
    result = lineardesign.optimize("", lambda_value=0.5)
    assert result.dna == ""
    assert result.cai == 0.0


def test_species_codon_tables_resolve():
    # Clear the species cache so the test sees a fresh resolve path.
    lineardesign._codon_table_for.cache_clear()
    human = lineardesign._codon_table_for("human")
    dog = lineardesign._codon_table_for("dog")
    cat = lineardesign._codon_table_for("cat")
    # Dog and cat share the mouse proxy; human has its own table.
    assert dog == cat, "dog and cat should share the mouse proxy table"
    assert human != dog, "human and dog tables must be distinct"
    # All three resolve to existing files.
    from pathlib import Path
    assert Path(human).exists()
    assert Path(dog).exists()


@pytest.mark.skipif(not _binary_present(), reason="LinearDesign binary not installed")
def test_species_affects_cai():
    # Same peptide, same λ, different species → different CAI scores.
    lineardesign.optimize.cache_clear()
    peptide = "MDAMKRGLTIENQHYVFCSPDAEGL"
    human = lineardesign.optimize(peptide, lambda_value=0.5, species="human")
    dog = lineardesign.optimize(peptide, lambda_value=0.5, species="dog")
    assert human.cai != dog.cai, (
        f"CAI must be species-dependent; got human={human.cai}, dog={dog.cai}"
    )
