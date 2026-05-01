"""Stage 4 validation — VEP annotation soundness on the real COLO829 run.

Reads the VEP-annotated VCF from the completed COLO829 workspace and
asserts that:

1. BRAF V600E (chr7:140753336 A>T) carries a ``missense_variant``
   consequence on the BRAF gene symbol with MODERATE impact. If VEP's
   cache ever drifts on this canonical variant, something is wrong
   with our annotation pipeline.
2. At least one cancer gene from our `data/cancer_genes.csv` list
   appears in the annotated call set. A melanoma cell line should
   surface multiple driver genes; zero would mean the CSQ/SYMBOL
   field is not being populated correctly.

This test is the "did VEP actually work end-to-end" sanity check that
a reviewer would demand before trusting any downstream stage.
"""
from __future__ import annotations

import gzip
import os
from pathlib import Path

import pytest


# The complete COLO829 workspace: alignment + full-genome VC + VEP
# annotation with offline cache. 825b9744 had a truncated variant-
# calling run so its annotation is incomplete — we use 10f68b1c here.
_WORKSPACE_ROOT = Path(
    os.environ.get(
        "MUTAVAX_COLO829_FULL_WORKSPACE_DIR",
        "/media/niach/5c5f06df-56ba-430c-a735-42e1205949f63/mutavax/"
        "workspaces/10f68b1c-a2fb-4cf9-8401-ad3d10a86a6c",
    )
)

_MISSING_REASON = (
    f"Complete COLO829 workspace not mounted at {_WORKSPACE_ROOT}; "
    "stage-4 VEP validation skipped."
)


def _latest_annotated_vcf() -> Path | None:
    root = _WORKSPACE_ROOT / "annotation"
    if not root.is_dir():
        return None
    runs = sorted(root.iterdir(), key=lambda p: p.stat().st_mtime)
    if not runs:
        return None
    vcf = runs[-1] / "annotated.vcf.gz"
    return vcf if vcf.is_file() else None


def _parse_csq_header(vcf: Path) -> list[str]:
    """Return the ordered field list VEP packs into its CSQ INFO blob.
    Format line looks like
    ``##INFO=<ID=CSQ,...Format: Allele|Consequence|IMPACT|SYMBOL|...``"""
    with gzip.open(vcf, "rt", encoding="utf-8") as handle:
        for raw in handle:
            if not raw.startswith("##INFO=<ID=CSQ"):
                continue
            _, _, fmt = raw.partition("Format: ")
            return fmt.rstrip('">\n').split("|")
    raise AssertionError(f"{vcf}: no CSQ header found — VEP did not run")


def _csq_values(info: str, key: str, fields: list[str]) -> list[str]:
    """Pull every occurrence of ``key`` from the CSQ blob of one row.
    A single variant can have multiple CSQ tuples (one per transcript)."""
    out: list[str] = []
    for kv in info.split(";"):
        if not kv.startswith("CSQ="):
            continue
        csq_blob = kv[len("CSQ="):]
        idx = fields.index(key)
        for tuple_ in csq_blob.split(","):
            parts = tuple_.split("|")
            if idx < len(parts) and parts[idx]:
                out.append(parts[idx])
    return out


def _scan_variants(vcf: Path, fields: list[str]) -> tuple[dict, set[str]]:
    """Return (braf_v600e_annotation, all_gene_symbols) from the VCF.
    ``braf_v600e_annotation`` maps CSQ field name → value for the
    canonical missense_variant transcript at chr7:140753336 A>T, or
    ``{}`` if the position / allele is absent."""
    braf: dict = {}
    symbols: set[str] = set()
    with gzip.open(vcf, "rt", encoding="utf-8") as handle:
        for raw in handle:
            if raw.startswith("#") or not raw.strip():
                continue
            cols = raw.rstrip("\n").split("\t")
            if len(cols) < 8:
                continue
            chrom, pos_s, _, ref, alt, _, _, info = cols[:8]
            for s in _csq_values(info, "SYMBOL", fields):
                symbols.add(s)
            if chrom == "7" and pos_s == "140753336" and ref == "A" and alt == "T":
                for kv in info.split(";"):
                    if not kv.startswith("CSQ="):
                        continue
                    for tuple_ in kv[len("CSQ="):].split(","):
                        parts = tuple_.split("|")
                        if (
                            len(parts) > fields.index("SYMBOL")
                            and parts[fields.index("SYMBOL")] == "BRAF"
                            and "missense_variant" in parts[fields.index("Consequence")]
                        ):
                            braf = dict(zip(fields, parts))
                            break
    return braf, symbols


@pytest.mark.skipif(
    _latest_annotated_vcf() is None,
    reason=_MISSING_REASON,
)
def test_vep_annotates_braf_v600e() -> None:
    vcf = _latest_annotated_vcf()
    assert vcf is not None
    fields = _parse_csq_header(vcf)
    braf, _ = _scan_variants(vcf, fields)
    assert braf, (
        "VEP did not emit a missense_variant on BRAF at chr7:140753336 — "
        "either the cache is stale or the CSQ annotation is mis-parsed."
    )
    assert braf.get("IMPACT") == "MODERATE"
    assert braf.get("BIOTYPE") == "protein_coding"


@pytest.mark.skipif(
    _latest_annotated_vcf() is None,
    reason=_MISSING_REASON,
)
def test_annotation_surfaces_known_cancer_genes() -> None:
    """At least one COLO829 driver gene must appear in the CSQ SYMBOL
    field. Zero cancer-gene hits would mean VEP's SYMBOL is not being
    written at all (blank CSQ → downstream cancer-gene cards render
    empty)."""
    vcf = _latest_annotated_vcf()
    assert vcf is not None
    fields = _parse_csq_header(vcf)
    _, symbols = _scan_variants(vcf, fields)
    # Canonical COLO829 drivers (published in Valle-Inclán 2022 and
    # Hartwig reports). Intersecting with a tight whitelist avoids the
    # "any SYMBOL" degenerate case.
    known_drivers = {"BRAF", "TP53", "CDKN2A", "PTEN", "MAP2K1", "NRAS"}
    found = known_drivers & symbols
    assert found, (
        f"No COLO829-expected driver genes in annotated VCF.\n"
        f"  expected any of: {sorted(known_drivers)}\n"
        f"  symbol count   : {len(symbols)}"
    )
