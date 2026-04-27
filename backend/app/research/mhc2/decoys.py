"""Length-matched decoy generation for eluted-ligand MHC-II training."""

from __future__ import annotations

import random
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from app.research.mhc2.constants import AMINO_ACIDS, MAX_PEPTIDE_LENGTH, MIN_PEPTIDE_LENGTH
from app.research.mhc2.data import MHC2Record, clean_peptide, peptide_9mers


@dataclass(frozen=True)
class DecoyStats:
    requested: int
    generated: int
    rejected_overlap: int
    rejected_invalid: int


def read_fasta_sequences(path: Path) -> list[str]:
    sequences: list[str] = []
    current: list[str] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            if line.startswith(">"):
                if current:
                    sequences.append("".join(current).upper())
                    current = []
                continue
            current.append(line)
    if current:
        sequences.append("".join(current).upper())
    return [seq for seq in sequences if seq]


def positive_9mer_index(records: Iterable[MHC2Record]) -> set[str]:
    return {core for record in records for core in peptide_9mers(record.peptide)}


def sample_frank_candidates(
    peptide_length: int,
    proteome_sequences: Sequence[str],
    *,
    n_candidates: int = 1000,
    seed: int = 0,
    forbidden_9mers: set[str] | None = None,
    max_attempts_per_candidate: int = 200,
) -> list[str]:
    """Sample ``n_candidates`` length-matched human-proteome windows for
    use as the FRANK candidate set against a true epitope of
    ``peptide_length``. Optionally rejects candidates whose 9-mer cores
    overlap any 9-mer in ``forbidden_9mers`` (typically the true epitope's
    own cores) to avoid trivial self-matches."""
    if peptide_length < MIN_PEPTIDE_LENGTH or peptide_length > MAX_PEPTIDE_LENGTH:
        return []
    rng = random.Random(seed)
    eligible_indices = [
        i for i, seq in enumerate(proteome_sequences) if len(seq) >= peptide_length
    ]
    if not eligible_indices:
        return []
    forbidden = forbidden_9mers or set()
    out: list[str] = []
    for _ in range(n_candidates):
        for _attempt in range(max_attempts_per_candidate):
            idx = rng.choice(eligible_indices)
            seq = proteome_sequences[idx]
            start = rng.randrange(0, len(seq) - peptide_length + 1)
            cand = seq[start : start + peptide_length].upper()
            if any(c not in AMINO_ACIDS for c in cand):
                continue
            try:
                cand = clean_peptide(cand)
            except ValueError:
                continue
            if forbidden and (set(peptide_9mers(cand)) & forbidden):
                continue
            out.append(cand)
            break
    return out


def sample_length_matched_decoys(
    positives: Sequence[MHC2Record],
    proteome_sequences: Sequence[str],
    positive_9mers: set[str] | None = None,
    per_positive: int = 1,
    seed: int = 13,
    max_attempts_per_decoy: int = 200,
) -> tuple[list[MHC2Record], DecoyStats]:
    """Generate proteome windows matched to positive peptide lengths.

    Decoys inherit the allele set of their matched positive record, but are
    rejected if any candidate 9-mer overlaps a positive peptide core. Each
    decoy records the source ``protein_id`` (a stable ``"p<index>"`` key
    into ``proteome_sequences``) and ``peptide_offset`` so downstream code
    can look up cached protein-level features and slice cores.
    """
    if per_positive < 1:
        raise ValueError("per_positive must be at least 1")
    if not proteome_sequences:
        raise ValueError("proteome_sequences cannot be empty")

    rng = random.Random(seed)
    positives_9 = positive_9mers if positive_9mers is not None else positive_9mer_index(positives)
    generated: list[MHC2Record] = []
    rejected_overlap = 0
    rejected_invalid = 0
    proteome_indices = list(range(len(proteome_sequences)))

    for positive in positives:
        for _ in range(per_positive):
            decoy = None
            for _attempt in range(max_attempts_per_decoy):
                protein_idx = rng.choice(proteome_indices)
                sequence = proteome_sequences[protein_idx]
                if len(sequence) < len(positive.peptide):
                    rejected_invalid += 1
                    continue
                start = rng.randrange(0, len(sequence) - len(positive.peptide) + 1)
                candidate = sequence[start : start + len(positive.peptide)].upper()
                if any(char not in AMINO_ACIDS for char in candidate):
                    rejected_invalid += 1
                    continue
                try:
                    candidate = clean_peptide(candidate)
                except ValueError:
                    rejected_invalid += 1
                    continue
                if set(peptide_9mers(candidate)) & positives_9:
                    rejected_overlap += 1
                    continue
                decoy = MHC2Record(
                    peptide=candidate,
                    alleles=positive.alleles,
                    target=0.0,
                    source="human_proteome_decoy",
                    split=positive.split,
                    sample_id=positive.sample_id,
                    protein_id=f"p{protein_idx}",
                    weight=positive.weight,
                    peptide_offset=start,
                    # Inherit the matched positive's cluster identity so the
                    # cluster-weighted loss doesn't down-weight the positive
                    # while leaving the matched negative at 1.0 (HLAIIPred
                    # protocol: matched pairs share weight).
                    cluster_id=positive.cluster_id,
                    cluster_weight=positive.cluster_weight,
                    sample_allele_set=positive.sample_allele_set,
                )
                break
            if decoy is not None:
                generated.append(decoy)

    return generated, DecoyStats(
        requested=len(positives) * per_positive,
        generated=len(generated),
        rejected_overlap=rejected_overlap,
        rejected_invalid=rejected_invalid,
    )

