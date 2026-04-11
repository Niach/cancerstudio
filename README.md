# cancerstudio

cancerstudio is a desktop-first studio for designing personalized mRNA cancer vaccines. You pick local tumor and matched-normal sequencing files, the app normalizes them into canonical FASTQ, aligns them, and prepares the workflow for somatic variant calling and downstream neoantigen work.

The current live slice is:

`Ingestion -> Alignment -> Variant Calling -> Annotation -> Neoantigen Prediction -> Epitope Selection -> Construct Design -> Construct Output`

Only ingestion and alignment are live today. The later stages are staged in the UI but not implemented yet.

## What changed

- Desktop-first runtime: Electron shell + local Next.js renderer + local FastAPI pipeline engine
- Disk-backed workflow: no MinIO, no object-storage uploads, no remote file transfer step
- Reference-in-place intake: source FASTQ/BAM/CRAM files stay where they already live
- Managed local outputs: canonical FASTQ, BAM/BAI, QC artifacts, reference bundles, and SQLite live under the app data directory
- Species presets: human `GRCh38`, dog `CanFam4`, cat `felCat9`
- First-run reference bootstrap: missing preset references are downloaded and indexed automatically during alignment

## Stack

- Frontend: Next.js 15.5, React 19, TypeScript, Tailwind CSS
- Desktop shell: Electron
- Backend: FastAPI, SQLAlchemy, samtools, bwa-mem2
- Storage: local filesystem + SQLite

## Local development

Install dependencies once:

```bash
npm install
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Run the desktop app in development:

```bash
npm run desktop:dev
```

This starts:

- Next.js on `127.0.0.1:3000`
- FastAPI on `127.0.0.1:8000`
- Electron once both services are healthy

If you want the processes split out manually:

```bash
npm run desktop:frontend
npm run desktop:backend
npm run desktop:electron
```

JetBrains users can run the shared `Cancerstudio Electron App` config from `.run/`.

## Environment

Copy `.env.example` to `.env` for local overrides. The most important settings are:

- `CANCERSTUDIO_APP_DATA_DIR`: managed app-data root for local outputs and cached references
- `LOCAL_SQLITE_PATH`: optional explicit SQLite location
- `SAMTOOLS_REFERENCE_FASTA`: local FASTA used when CRAM normalization needs a reference
- `REFERENCE_*_FASTA`: optional manual override for human/dog/cat references

If you do not set `REFERENCE_*_FASTA`, cancerstudio caches preset references under the app-data directory and prepares them on first alignment.

## Tests

```bash
npm run lint
npm run test:backend:fast
```

Real-data smoke fixtures:

```bash
npm run sample-data:smoke
```

Browser smoke:

```bash
npx playwright install chromium
npm run test:browser:real-data
```

## Sample data

The repo includes helpers for public smoke fixtures:

- SEQC2 human tumor/normal FASTQ smoke data for ingestion
- a small BAM/CRAM smoke dataset for local normalization checks

The BAM/CRAM helper expects a local `samtools` binary.

Download them with:

```bash
npm run sample-data:smoke
npm run sample-data:alignment
```
