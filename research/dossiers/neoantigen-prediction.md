# Neoantigen prediction

- Updated: 2026-04-19
- Stages: neoantigen-prediction
- Species focus: human, dog, cat, cross-species
- Priority: 5/5

Tracks peptide-MHC prediction, pVACtools, NetMHCpan, and benchmark data that affect how cancerstudio scores neoantigen candidates.

## Current pins
- **Class I:** NetMHCpan 4.2 (standalone binary, DTU-licensed). Was 4.1 in earlier copies of this dossier and matching Paul Conyngham's Rosie pipeline; pivoted to 4.2 on 2026-04-19 because DTU retired 4.1 data-file distribution (the 4.1 tarball is still downloadable but the separately-shipped data tables are no longer served, making 4.1 unrunnable). 4.2 retains DLA EL training data and is presented as 4.1's successor on the DTU services page.
- **Class II:** NetMHCIIpan 4.3 (standalone binary, DTU-licensed). Nilsson 2023 (doi:10.1126/sciadv.adj6367) closes the DR vs DQ/DP gap and adds inverted-binder modelling.
- **pvactools:** 5.4.0 pinned in backend/Dockerfile.

## Recent Findings
- 2026-04-19 — Three-species predictor survey completed. Key points: FLA (cat) is in *no* predictor's training data and is not in pvactools' species enum, so feline runs will need a custom-MHC-mode adapter. DLA class II has no species-trained predictor anywhere; NetMHCIIpan 4.3 run in pan mode on DLA-DRB1 is the honest default with a "low-confidence-species" caveat. MHCflurry 2.x (Apache-2.0) is the only widely-used predictor with unambiguous commercial-safe licensing — candidate for a secondary class I consensus predictor.

## Open Questions
- When should the Paul/Rosie reference case be retrospectively rescored under NetMHCpan 4.2 so we have a runnable validated canine baseline (as of 2026-04-19, the only published canine reference was originally run on 4.1)?
- Can we obtain or generate any experimental FLA class I binding data? Without it, cat runs will remain pseudosequence-based pan inference labelled as hypotheses.
- When does new binding or immunogenicity evidence justify reweighting candidate selection?

## Upstream tracking note
`research/config/taxonomy.json` points `netmhcpan-docs` at the NetMHCpan 4.2 DTU page (matches the current pin) and `netmhciipan-docs` at the NetMHCIIpan 4.1 DTU page — the 4.1 URL is a known drift; flip it to 4.3 next time the taxonomy is touched.
