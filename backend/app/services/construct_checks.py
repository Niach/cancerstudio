"""Stage 7 — manufacturability checks on the assembled mRNA bytes.

Six of the seven checks run through DNAchisel's built-in pattern/constraint
engine; the furin-site check is a small protein-level regex; the 5' hairpin
check folds the cap-proximal 50 nt with ViennaRNA and flags structures with
MFE ≤ -25 kcal/mol (Kudla et al. 2009 — strong cap-proximal secondary
structure blocks ribosome loading).
"""
from __future__ import annotations

import re

import dnachisel as dc
import RNA

from app.models.schemas import ConstructManufacturingCheck


# Vet-facing copy. Keyed by the same `id` strings the frontend already renders.
_CHECK_COPY: dict[str, dict[str, str]] = {
    "bsai":   {"label": "No BsaI cut sites",               "why": "keeps cloning assembly clean"},
    "bsmbi":  {"label": "No BsmBI cut sites",              "why": "keeps cloning assembly clean"},
    "homop":  {"label": "No 7+ homopolymer runs",          "why": "synthesizers skip long A/T/G/C runs"},
    "gc":     {"label": "GC 30-70% in every 50-nt window", "why": "Twist/IDT synthesis requirement"},
    "hairp":  {"label": "No strong hairpins at 5' end",    "why": "lets ribosomes initiate — blocks cap-proximal folding"},
    "repeat": {"label": "No direct repeats >= 15 nt",      "why": "stops recombination during scale-up"},
    "furin":  {"label": "No accidental furin sites",       "why": "prevents protease clipping in the cell"},
}

# Cap-proximal MFE threshold for the hairpin check. More negative than this
# correlates with impaired initiation in mammalian systems (Kudla 2009).
_HAIRP_WINDOW_NT = 50
_HAIRP_FAIL_MFE = -25.0

_FURIN_MOTIF = re.compile(r"R[A-Z][RK]R")


def _check(
    check_id: str, status: str, *, extra_why: str | None = None
) -> ConstructManufacturingCheck:
    copy = _CHECK_COPY[check_id]
    why = copy["why"] if extra_why is None else f"{copy['why']} — {extra_why}"
    return ConstructManufacturingCheck(
        id=check_id, label=copy["label"], why=why, status=status
    )


def _avoid_pattern_passes(sequence: str, pattern) -> bool:
    if not sequence:
        return True
    problem = dc.DnaOptimizationProblem(
        sequence=sequence,
        constraints=[dc.AvoidPattern(pattern)],
        logger=None,
    )
    return problem.constraints[0].evaluate(problem).passes


def _gc_windowed_passes(sequence: str) -> bool:
    if len(sequence) < 50:
        return True
    problem = dc.DnaOptimizationProblem(
        sequence=sequence,
        constraints=[dc.EnforceGCContent(mini=0.30, maxi=0.70, window=50)],
        logger=None,
    )
    return problem.constraints[0].evaluate(problem).passes


def _translate(orf_nt: str) -> str:
    table = {
        "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L",
        "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L",
        "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M",
        "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V",
        "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S",
        "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
        "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T",
        "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A",
        "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*",
        "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q",
        "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K",
        "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
        "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W",
        "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
        "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R",
        "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
    }
    out: list[str] = []
    for i in range(0, len(orf_nt) - 2, 3):
        out.append(table.get(orf_nt[i : i + 3].upper(), "X"))
    return "".join(out)


def run_manufacturing_checks(
    full_nt: str,
    orf_nt: str,
    *,
    poly_a_len: int,
) -> list[ConstructManufacturingCheck]:
    """Evaluate the seven manufacturability checks against the assembled
    construct. ``full_nt`` is the complete mRNA string (5' UTR through
    poly-A tail). ``orf_nt`` is the coding region, used for the protein-level
    furin-site scan. ``poly_a_len`` lets us exclude the intentional A-tail
    from the homopolymer and GC-window scans."""

    full_nt = full_nt.upper()
    orf_nt = orf_nt.upper()
    scannable = full_nt[:-poly_a_len] if poly_a_len > 0 else full_nt

    results: list[ConstructManufacturingCheck] = []

    results.append(
        _check("bsai", "pass" if _avoid_pattern_passes(full_nt, "GGTCTC") else "fail")
    )
    results.append(
        _check("bsmbi", "pass" if _avoid_pattern_passes(full_nt, "CGTCTC") else "fail")
    )

    homop_pass = all(
        _avoid_pattern_passes(scannable, dc.HomopolymerPattern(nt, 7))
        for nt in "ATGC"
    )
    results.append(_check("homop", "pass" if homop_pass else "fail"))

    results.append(
        _check("gc", "pass" if _gc_windowed_passes(scannable) else "fail")
    )

    if len(full_nt) >= _HAIRP_WINDOW_NT:
        _, cap_mfe = RNA.fold(full_nt[:_HAIRP_WINDOW_NT])
        hairp_status = "fail" if cap_mfe <= _HAIRP_FAIL_MFE else "pass"
    else:
        hairp_status = "pass"
    results.append(_check("hairp", hairp_status))

    repeat_pass = _avoid_pattern_passes(
        scannable, dc.RepeatedKmerPattern(n_repeats=2, kmer_size=15)
    )
    results.append(_check("repeat", "pass" if repeat_pass else "fail"))

    protein = _translate(orf_nt)
    furin_hit = _FURIN_MOTIF.search(protein) is not None
    results.append(_check("furin", "fail" if furin_hit else "pass"))

    return results
