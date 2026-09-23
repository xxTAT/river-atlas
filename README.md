# RIVER RNA Structure Atlas — static framework

This folder is a static-site prototype for GitHub Pages. The core pages are zero-build HTML/CSS/JS; the online viewer page additionally loads d3 and Fornac from a CDN.

## Open locally

Serve this folder with a local static server and open its `http://localhost/...` address. The browser cannot load the JSON catalogs and matrix files when `index.html` is opened directly with `file://`.

## Replace the demo release

- Add structure records to the matching category file under `data/structures/catalog/`: `global-representative.json`, `local-feature.json`, `well-folded.json`, or `alternative.json`. Keep the file mapping and default category in `data/structures/catalog/index.json`.
- Each category file is an independent JSON array. The results page loads only the selected category; `Global representative` is the default.
- Put canonical CT, DBN, BPSEQ and FASTA files under `data/files/`.
- Replace the SVG placeholders under `data/rendered/` with CI-generated VARNA SVGs.
- `viewer.html` embeds `fornac.FornaContainer` and passes each record's sequence and dot-bracket string to the browser viewer. Pin and vendor the CDN dependencies before a production release.
- `heatmap.html` first lists datasets from `data/heatmaps/catalog.json`, then loads the selected manifest and sparse three-column matrix. Each matrix declares its own resolution and normalization status. Upper-triangle 0-based matrices are mirrored in the browser, while 1-based structure intervals are converted only when drawn as overlays.
- `results.html` exposes `left start`, `left end`, `right start` and `right end` as separate columns. The optional `left` / `right` position inputs use strict interval matching, so a record is returned only when each entered coordinate falls inside its corresponding arm.
- Update `data/manifest.json`, citation metadata and the repository links in `code.html`, `data.html` and `contact.html`.

## Suggested production checks

1. Validate CT / DBN length and symmetric pair indices.
2. Validate coordinates against reference accession lengths.
3. Generate VARNA SVGs in GitHub Actions.
4. Run link, accessibility and mobile checks before deploying GitHub Pages.
