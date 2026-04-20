#!/usr/bin/env python3
"""Recompute a neoantigen run's metrics from its on-disk TSVs and update the DB.

Handy when we've changed metrics-computation logic in compute_neoantigen_metrics
and don't want to spend 55 minutes re-running pvacseq to verify the fix.

Usage (inside the backend container):
    python /app/scripts/recompute-neoantigen-metrics.py <workspace_id> <run_id>
"""
import sys
from pathlib import Path

sys.path.insert(0, "/app")

from app.db import session_scope
from app.services.neoantigen import (
    NeoantigenInputs,
    _detect_tumor_sample_name,
    _find_tsv,
    _normalize_alleles_for_pvacseq,
    _patient_alleles_from_config,
    compute_neoantigen_metrics,
    load_workspace_neoantigen_config,
    persist_neoantigen_success,
)
from app.services.workspace_store import get_workspace_record
from app.services.neoantigen import (
    get_latest_annotation_run,
    _locate_annotated_vcf,
)
from app.runtime import get_neoantigen_run_root


def main() -> None:
    workspace_id, run_id = sys.argv[1], sys.argv[2]

    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        annotation_run = get_latest_annotation_run(session, workspace_id)
        annotated_vcf = _locate_annotated_vcf(annotation_run)
        if annotated_vcf is None:
            raise RuntimeError("annotated VCF missing on disk")

        config = load_workspace_neoantigen_config(workspace)
        alleles = _patient_alleles_from_config(config)
        ci_raw = [a for a in alleles if a.mhc_class == "I"]
        cii_raw = [a for a in alleles if a.mhc_class == "II"]
        ci, ci_rej = _normalize_alleles_for_pvacseq(
            ci_raw, species=workspace.species, algorithm="NetMHCpan"
        )
        cii, cii_rej = _normalize_alleles_for_pvacseq(
            cii_raw, species=workspace.species, algorithm="NetMHCIIpan"
        )
        species = workspace.species

    run_dir = get_neoantigen_run_root(workspace_id, run_id)
    inputs = NeoantigenInputs(
        workspace_id=workspace_id,
        run_id=run_id,
        species=species,
        species_label=None,
        assembly=None,
        annotated_vcf=annotated_vcf,
        tumor_sample_name=_detect_tumor_sample_name(annotated_vcf),
        run_dir=run_dir,
        class_i_alleles=ci,
        class_ii_alleles=cii,
        patient_alleles=alleles,
        rejected_alleles=ci_rej + cii_rej,
    )

    class_i_dir = run_dir / "class-i"
    class_ii_dir = run_dir / "class-ii"

    class_i_all = _find_tsv(class_i_dir, "*.all_epitopes.tsv")
    class_i_filtered = _find_tsv(class_i_dir, "*.filtered.tsv")
    class_ii_all = _find_tsv(class_ii_dir, "*.all_epitopes.tsv")
    class_ii_filtered = _find_tsv(class_ii_dir, "*.filtered.tsv")

    print(f"class I:  all={class_i_all}  filtered={class_i_filtered}")
    print(f"class II: all={class_ii_all}  filtered={class_ii_filtered}")

    metrics = compute_neoantigen_metrics(
        inputs,
        class_i_all_path=class_i_all,
        class_ii_all_path=class_ii_all,
        class_i_filtered_path=class_i_filtered,
        class_ii_filtered_path=class_ii_filtered,
    )

    # Re-persisting via persist_neoantigen_success would re-insert artifact
    # rows and hit UNIQUE constraints. We only need the metrics payload to
    # reflect the updated compute logic, so patch the run record in place.
    import json
    from app.services.neoantigen import (
        _parse_payload,
        get_neoantigen_run_record,
    )
    from app.services.workspace_store import utc_now

    with session_scope() as session:
        run = get_neoantigen_run_record(session, workspace_id, run_id)
        payload = _parse_payload(run.result_payload)
        payload["metrics"] = metrics.model_dump(mode="json", by_alias=True)
        run.result_payload = json.dumps(payload)
        run.updated_at = utc_now()
        session.add(run)

    print("metrics recomputed + patched into run.result_payload")
    print("  buckets: " + ", ".join(f"{b.label}={b.count}" for b in metrics.buckets))
    hm = metrics.heatmap
    print(f"  heatmap alleles: {hm.alleles}")
    if hm.peptides:
        first = hm.peptides[0]
        print(f"  first row: {first.seq}  ic50={first.ic50}")


if __name__ == "__main__":
    main()
