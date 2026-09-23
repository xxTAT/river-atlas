# Structure catalogs

The results explorer reads `index.json` first and then fetches only the selected structure type.

- `global-representative.json`: Global representative
- `local-feature.json`: Local feature
- `well-folded.json`: Well-folded
- `alternative.json`: Alternative

Each file is a JSON array containing lightweight index records. Add one structure record to exactly one category file and keep `scope` consistent with the category. The site addresses a structure using `heatmapDataset + id`, so the same local ID can occur in different datasets; keeping IDs globally unique is still recommended when practical. Put the larger structure files in a dataset-specific directory:

```text
data/structures/datasets/{heatmapDataset}/{structureId}/
├── structure.json
├── structure.ct
├── structure.dbn
├── structure.bpseq
├── structure.svg
└── base-pairs.bedpe
```

The catalog record's `detailFile` points to `structure.json`; its `files` object provides the available download paths. `base-pairs.bedpe` uses 0-based half-open one-nucleotide intervals and is drawn as point pairs on the interaction heatmap. Run `node scripts/generate-base-pairs.mjs` from the site root after adding or replacing CT files to regenerate these files and refresh their catalog links.

`structure.json` may contain either `pairs` or `basePairs` as an array of coordinate pairs, for example `[[139, 426], [140, 425]]`. The detail page displays the pair count and a coordinate preview, and the heatmap uses the same pairs when a separate BEDPE file is unavailable.

Local structure coordinates and `mapRegions` are 1-based inclusive; the heatmap viewer converts them to 0-based intervals only while drawing overlays. Global representatives omit `mapRegions` and use the dataset's full `genomeLength`.

To add another category, create its JSON file and add its `id`, `label`, `scope`, and relative `file` path to `index.json`. The `defaultType` value controls which category opens first on the results page.
