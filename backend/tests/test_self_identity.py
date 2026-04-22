"""Unit tests for the stage-6 self-identity check.

The service now uses a pure-Python substring + hamming scan against
the cached species proteome — no external binary. These tests cover:

1. Risk-tier boundaries (``_risk_for``)
2. Gene-label parsing from UniProt FASTA headers (``_gene_label``)
3. Best-hit scan over a synthetic proteome (exact + near matches)
4. ``run_self_identity_check`` end-to-end on a fake proteome supplied
   via ``resolve_proteome_config`` monkeypatch — exercises the flag
   emission shape the UI consumes.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.models.schemas import EpitopeSafetyFlagResponse, ReferencePreset
from app.services import self_identity


# ---------------------------------------------------------------------------
# _risk_for
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "pident,expected",
    [
        (100.0, "critical"),
        (99.999, "critical"),
        (95.0, "elevated"),
        (80.0, "elevated"),
        # Below the elevated floor we emit nothing — see the module
        # docstring on why the historical "mild" tier is retired for
        # short peptides.
        (79.999, None),
        (60.0, None),
        (0.0, None),
    ],
)
def test_risk_tier_boundaries(pident: float, expected: str | None) -> None:
    assert self_identity._risk_for(pident) == expected


# ---------------------------------------------------------------------------
# _gene_label
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "stitle,sseqid,expected",
    [
        (
            "sp|P35579|MYH9_HUMAN Myosin-9 OS=Homo sapiens OX=9606 GN=MYH9 PE=1 SV=4",
            "sp|P35579|MYH9_HUMAN",
            "MYH9",
        ),
        (
            "sp|Q7Z4V5|HDGR2_HUMAN Hepatoma-derived growth factor-related protein 2 OS=Homo sapiens",
            "sp|Q7Z4V5|HDGR2_HUMAN",
            "Hepatoma-derived growth factor-related protein 2",
        ),
        ("sp|P12345|FOO", "sp|P12345|FOO", "sp|P12345|FOO"),
    ],
)
def test_gene_label_parsing(stitle: str, sseqid: str, expected: str) -> None:
    assert self_identity._gene_label(stitle, sseqid) == expected


# ---------------------------------------------------------------------------
# _best_hit_for_peptide
# ---------------------------------------------------------------------------


_FAKE_PROTEOME: tuple[tuple[str, str], ...] = (
    ("MYH9", "MAQQAADKYLYVDKNFINNPLAQADWAAKKLVWVPSDKSGFEPASLKEEVGEEA"),
    ("TTN", "ACDEFGHIKLMNPQRSTVWYMFLQNDCKCLPQRSTACDHIKLMNOPQRSTVWYAC"),
    ("KRT5", "RKFLEQQNKVLETKWSLLQQQKTARSNMDNMFESYINNLRRQLETLGQEKLKLEAEL"),
)


def test_best_hit_finds_exact_substring() -> None:
    gene, matches = self_identity._best_hit_for_peptide("SLKEEVGEE", _FAKE_PROTEOME)
    assert gene == "MYH9"
    assert matches == 9  # full-length match


def test_best_hit_finds_one_mismatch_via_hamming() -> None:
    # "MNPQRSTVX" differs from TTN's "MNPQRSTVW" at position 8 only.
    gene, matches = self_identity._best_hit_for_peptide("MNPQRSTVX", _FAKE_PROTEOME)
    assert gene == "TTN"
    assert matches == 8  # 8/9 positions match


def test_best_hit_returns_none_on_random_peptide() -> None:
    # A 9-mer that shouldn't have a critical (exact) or elevated
    # (≤1-mismatch) match against any of the three fake proteins.
    assert self_identity._best_hit_for_peptide("WWWWWWWWW", _FAKE_PROTEOME) is None


def test_best_hit_empty_peptide_is_none() -> None:
    assert self_identity._best_hit_for_peptide("", _FAKE_PROTEOME) is None


def test_best_hit_peptide_longer_than_any_protein() -> None:
    # Proteome with a single 5-aa protein; peptide of length 9 can
    # never fit a window of size 9 inside it.
    short_proteome = (("TINY", "ACDEF"),)
    assert self_identity._best_hit_for_peptide("ACDEFGHIK", short_proteome) is None


# ---------------------------------------------------------------------------
# run_self_identity_check
# ---------------------------------------------------------------------------


def _stub_fake_proteome(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Patch resolve + ensure to return a tiny hand-crafted FASTA under
    ``tmp_path``. _load_proteome is LRU-cached on the path string, so
    clear it too."""
    fasta = tmp_path / "mini.fasta"
    fasta.write_text(
        ">sp|P35579|MYH9_HUMAN Myosin-9 GN=MYH9\n"
        "MAQQAADKYLYVDKNFINNPLAQADWAAKKLVWVPSDKSGFEPASLKEEVGEEA\n"
        ">sp|Q12345|TTN_HUMAN Titin GN=TTN\n"
        "ACDEFGHIKLMNPQRSTVWYMFLQNDCKCLPQRSTACDHIKLMNOPQRSTVWYAC\n"
    )
    config = self_identity.ProteomeConfig(fasta_path=fasta, label="fake")
    monkeypatch.setattr(
        self_identity, "resolve_proteome_config", lambda preset: config
    )
    monkeypatch.setattr(
        self_identity, "ensure_proteome_ready", lambda preset: config
    )
    self_identity._load_proteome.cache_clear()


def test_returns_empty_on_empty_input() -> None:
    # Short-circuit before any filesystem access.
    assert self_identity.run_self_identity_check([], ReferencePreset.GRCH38) == {}


def test_returns_empty_when_proteome_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(self_identity, "ensure_proteome_ready", lambda p: None)
    assert (
        self_identity.run_self_identity_check(
            [("ep1", "ACDEFGHIK")], ReferencePreset.GRCH38
        )
        == {}
    )


def test_returns_critical_flag_for_exact_self_peptide(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_fake_proteome(tmp_path, monkeypatch)
    result = self_identity.run_self_identity_check(
        [("ep30", "SLKEEVGEE")], ReferencePreset.GRCH38
    )
    assert set(result.keys()) == {"ep30"}
    flag = result["ep30"]
    assert isinstance(flag, EpitopeSafetyFlagResponse)
    assert flag.self_hit == "MYH9"
    assert flag.risk == "critical"
    assert flag.identity == 100
    assert "perfect 9-mer match" in flag.note


def test_returns_elevated_flag_for_single_mismatch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_fake_proteome(tmp_path, monkeypatch)
    # 8/9 match to TTN's "MNPQRSTVW" — last position differs.
    result = self_identity.run_self_identity_check(
        [("ep1", "MNPQRSTVX")], ReferencePreset.GRCH38
    )
    assert "ep1" in result
    assert result["ep1"].self_hit == "TTN"
    assert result["ep1"].risk == "elevated"
    assert result["ep1"].identity == 89  # round(8/9 * 100)


def test_drops_peptide_below_elevated_floor(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_fake_proteome(tmp_path, monkeypatch)
    # A peptide with ≥2 mismatches against any 9-window is below the
    # elevated floor → dropped.
    result = self_identity.run_self_identity_check(
        [("ep1", "WWWYYYWWW")], ReferencePreset.GRCH38
    )
    assert "ep1" not in result


def test_handles_mixed_cohort_of_peptides(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_fake_proteome(tmp_path, monkeypatch)
    result = self_identity.run_self_identity_check(
        [
            ("exact", "SLKEEVGEE"),         # critical (MYH9)
            ("near", "MNPQRSTVX"),          # elevated (TTN, d=1)
            ("random", "WWWYYYWWW"),        # below floor, omitted
        ],
        ReferencePreset.GRCH38,
    )
    assert set(result.keys()) == {"exact", "near"}
    assert result["exact"].risk == "critical"
    assert result["near"].risk == "elevated"


def test_skips_invalid_peptide_sequences(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_fake_proteome(tmp_path, monkeypatch)
    # Empty, whitespace, and non-alpha inputs should all pass through
    # without crashing and without being reported.
    result = self_identity.run_self_identity_check(
        [("empty", ""), ("space", "   "), ("digits", "ACDE1GHIK")],
        ReferencePreset.GRCH38,
    )
    assert result == {}
