"""Post-LinearDesign manufacturability repair via DNAchisel.

LinearDesign optimizes codon usage and mRNA folding but ignores cloning /
synthesis constraints (restriction sites, GC windows, direct repeats, long
homopolymer runs). This module takes LinearDesign's output and nudges
individual synonymous codons until the construct satisfies the same
manufacturability constraints that ``construct_checks`` evaluates — while
holding the translated protein byte-identical.

Constraints not repairable via synonymous-codon changes (furin motif, 5'
cap hairpin) stay with the original evaluator; those are protein-level or
folding-level problems that need different fixes (peptide reselection or
UTR redesign).
"""
from __future__ import annotations

import dnachisel as dc


def repair(
    orf_dna: str,
    *,
    gc_window: int = 50,
    gc_min: float = 0.30,
    gc_max: float = 0.70,
    repeat_kmer: int = 15,
    homopolymer_len: int = 7,
) -> str:
    """Return a synonymous-codon-corrected ORF that avoids BsaI/BsmBI sites,
    long homopolymer runs, 15-nt direct repeats, and out-of-window GC content.
    Falls back to the input unchanged if the constraint system is over-
    constrained (e.g. a repeated amino-acid run that no synonymous code path
    can satisfy)."""
    if not orf_dna:
        return orf_dna

    constraints = [
        dc.EnforceTranslation(),
        dc.AvoidPattern("GGTCTC"),  # BsaI, both strands
        dc.AvoidPattern("CGTCTC"),  # BsmBI, both strands
        dc.AvoidPattern(dc.RepeatedKmerPattern(n_repeats=2, kmer_size=repeat_kmer)),
    ]
    for nt in "ATGC":
        constraints.append(
            dc.AvoidPattern(dc.HomopolymerPattern(nt, homopolymer_len))
        )
    # Only apply the GC-window constraint when the sequence is long enough to
    # have windows at all — avoids DNAchisel errors on trivial test inputs.
    if len(orf_dna) >= gc_window:
        constraints.append(
            dc.EnforceGCContent(mini=gc_min, maxi=gc_max, window=gc_window)
        )

    problem = dc.DnaOptimizationProblem(
        sequence=orf_dna,
        constraints=constraints,
        logger=None,
    )
    try:
        problem.resolve_constraints()
    except Exception:
        # Over-constrained — return LinearDesign's output unchanged. The
        # checks will still report what's broken so the user sees the truth.
        return orf_dna
    return problem.sequence
