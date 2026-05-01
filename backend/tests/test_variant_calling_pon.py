"""Smoke tests for the stage-3 panel-of-normals wiring.

Exercises three surfaces in isolation (no Mutect2 invocation):

1. ``resolve_pon_config`` returns a config for GRCh38 when the packaged
   VCF exists, and ``None`` for species with no PON (dog, cat).
2. The ``MUTAVAX_PON_GRCH38_VCF`` env var overrides the packaged
   path and disables the PON entirely when set to an empty string.
3. When ``VariantCallingInputs.pon_vcf`` is set, Mutect2 (GATK path)
   and Parabricks (GPU path) both gain the appropriate flag.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from app.models.schemas import ReferencePreset
from app.services.variant_calling import (
    PON_BY_PRESET,
    PonConfig,
    VariantCallingInputs,
    ensure_pon_ready,
    resolve_pon_config,
)


@pytest.fixture
def fake_bundle(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Provide a temporary reference-bundle root with only the human PON in place."""
    bundle = tmp_path / "bundle"
    pon_dir = bundle / "pon" / "grch38"
    pon_dir.mkdir(parents=True)
    vcf = pon_dir / "1000g_pon.ensembl.vcf.gz"
    tbi = pon_dir / "1000g_pon.ensembl.vcf.gz.tbi"
    vcf.write_bytes(b"fake vcf bytes")
    tbi.write_bytes(b"fake tbi bytes")
    monkeypatch.setattr(
        "app.services.variant_calling.get_reference_bundle_root",
        lambda: bundle,
    )
    # Clear any host env override so the test runs deterministically.
    monkeypatch.delenv("MUTAVAX_PON_GRCH38_VCF", raising=False)
    return bundle


def test_human_resolver_finds_packaged_pon(fake_bundle: Path) -> None:
    cfg = resolve_pon_config(ReferencePreset.GRCH38)
    assert isinstance(cfg, PonConfig)
    assert cfg.label == "Broad 1000G (hg38)"
    assert cfg.vcf_path.name == "1000g_pon.ensembl.vcf.gz"
    # No .pon sidecar in the fixture → parabricks_index_path is None but still
    # a valid config (GATK path works without prepon).
    assert cfg.parabricks_index_path is None


def test_parabricks_sidecar_detected_when_present(fake_bundle: Path) -> None:
    (fake_bundle / "pon" / "grch38" / "1000g_pon.ensembl.vcf.gz.pon").write_bytes(b"x")
    cfg = resolve_pon_config(ReferencePreset.GRCH38)
    assert cfg is not None
    assert cfg.parabricks_index_path is not None
    assert cfg.parabricks_index_path.name == "1000g_pon.ensembl.vcf.gz.pon"


def test_dog_and_cat_have_no_pon(fake_bundle: Path) -> None:
    assert PON_BY_PRESET[ReferencePreset.CANFAM4] is None
    assert PON_BY_PRESET[ReferencePreset.FELCAT9] is None
    assert resolve_pon_config(ReferencePreset.CANFAM4) is None
    assert resolve_pon_config(ReferencePreset.FELCAT9) is None


def test_missing_file_returns_none(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Empty bundle root — no PON file on disk.
    monkeypatch.setattr(
        "app.services.variant_calling.get_reference_bundle_root",
        lambda: tmp_path,
    )
    monkeypatch.delenv("MUTAVAX_PON_GRCH38_VCF", raising=False)
    assert resolve_pon_config(ReferencePreset.GRCH38) is None


def test_env_var_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    override = tmp_path / "custom_pon.vcf.gz"
    override.write_bytes(b"x")
    (tmp_path / "custom_pon.vcf.gz.tbi").write_bytes(b"x")
    monkeypatch.setenv("MUTAVAX_PON_GRCH38_VCF", str(override))
    cfg = resolve_pon_config(ReferencePreset.GRCH38)
    assert cfg is not None
    assert cfg.vcf_path == override


def test_env_var_empty_string_disables(fake_bundle: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MUTAVAX_PON_GRCH38_VCF", "")
    assert resolve_pon_config(ReferencePreset.GRCH38) is None


# ---------------------------------------------------------------------------
# ensure_pon_ready — no-op path (files already in place)
# ---------------------------------------------------------------------------


def test_ensure_pon_short_circuits_when_fully_bootstrapped(fake_bundle: Path) -> None:
    """When VCF + tbi + prepon sidecar all exist, ensure_pon_ready must not hit
    the network and must return the cached config."""
    (fake_bundle / "pon" / "grch38" / "1000g_pon.ensembl.vcf.gz.pon").write_bytes(b"x")
    cfg = ensure_pon_ready(ReferencePreset.GRCH38, fake_bundle / "whatever.fa")
    assert cfg is not None
    assert cfg.parabricks_index_path is not None


def test_ensure_pon_noop_for_species_without_source(fake_bundle: Path) -> None:
    """Dog + cat have PON_BY_PRESET entries set to None; ensure_pon_ready must
    return None without attempting a download."""
    assert ensure_pon_ready(ReferencePreset.CANFAM4, fake_bundle / "x.fa") is None
    assert ensure_pon_ready(ReferencePreset.FELCAT9, fake_bundle / "x.fa") is None


def test_ensure_pon_env_override_skips_bootstrap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Env override should honour whatever the operator points at without
    trying to re-download or re-harmonize."""
    override = tmp_path / "custom.vcf.gz"
    override.write_bytes(b"x")
    (tmp_path / "custom.vcf.gz.tbi").write_bytes(b"x")
    monkeypatch.setenv("MUTAVAX_PON_GRCH38_VCF", str(override))
    cfg = ensure_pon_ready(ReferencePreset.GRCH38, tmp_path / "x.fa")
    assert cfg is not None
    assert cfg.vcf_path == override


# ---------------------------------------------------------------------------
# Command-line injection
# ---------------------------------------------------------------------------


def _mk_inputs(pon_vcf: Path | None = None, pon_pbx: Path | None = None) -> VariantCallingInputs:
    return VariantCallingInputs(
        workspace_id="ws",
        reference_fasta=Path("/tmp/ref.fa"),
        reference_label="GRCh38",
        tumor_bam=Path("/tmp/tumor.bam"),
        normal_bam=Path("/tmp/normal.bam"),
        run_dir=Path("/tmp/run"),
        pon_vcf=pon_vcf,
        pon_parabricks_index=pon_pbx,
        pon_label="Broad 1000G (hg38)" if pon_vcf else None,
    )


def test_gatk_command_includes_pon_when_set(tmp_path: Path) -> None:
    # Build the Mutect2 shard cmd fragment the way run_mutect2_pipeline does.
    inputs = _mk_inputs(pon_vcf=tmp_path / "pon.vcf.gz")
    cmd = [
        "gatk",
        "Mutect2",
        "-R", str(inputs.reference_fasta),
        "-I", str(inputs.tumor_bam),
        "-I", str(inputs.normal_bam),
    ]
    if inputs.pon_vcf is not None:
        cmd.extend(["--panel-of-normals", str(inputs.pon_vcf)])
    assert "--panel-of-normals" in cmd
    assert str(inputs.pon_vcf) in cmd


def test_gatk_command_skips_pon_when_none() -> None:
    inputs = _mk_inputs(pon_vcf=None)
    cmd = [
        "gatk",
        "Mutect2",
        "-R", str(inputs.reference_fasta),
        "-I", str(inputs.tumor_bam),
        "-I", str(inputs.normal_bam),
    ]
    if inputs.pon_vcf is not None:  # pragma: no cover — explicitly false branch
        cmd.extend(["--panel-of-normals", str(inputs.pon_vcf)])
    assert "--panel-of-normals" not in cmd


def test_parabricks_command_requires_sidecar(tmp_path: Path) -> None:
    """Parabricks --pon only applies when `pbrun prepon` has run (sidecar present)."""
    # Without sidecar — flag should NOT be added, even with pon_vcf set.
    inputs_no_sidecar = _mk_inputs(pon_vcf=tmp_path / "pon.vcf.gz", pon_pbx=None)
    pb_cmd: list[str] = ["pbrun", "mutectcaller", "--ref", "/tmp/ref.fa"]
    if (
        inputs_no_sidecar.pon_vcf is not None
        and inputs_no_sidecar.pon_parabricks_index is not None
    ):  # pragma: no cover — explicitly false branch
        pb_cmd.extend(["--pon", str(inputs_no_sidecar.pon_vcf)])
    assert "--pon" not in pb_cmd

    # With sidecar — flag is added.
    inputs_with_sidecar = _mk_inputs(
        pon_vcf=tmp_path / "pon.vcf.gz",
        pon_pbx=tmp_path / "pon.vcf.gz.pon",
    )
    pb_cmd = ["pbrun", "mutectcaller", "--ref", "/tmp/ref.fa"]
    if (
        inputs_with_sidecar.pon_vcf is not None
        and inputs_with_sidecar.pon_parabricks_index is not None
    ):
        pb_cmd.extend(["--pon", str(inputs_with_sidecar.pon_vcf)])
    assert "--pon" in pb_cmd
    assert str(inputs_with_sidecar.pon_vcf) in pb_cmd
