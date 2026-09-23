# Heatmap data contract

The heatmap page reads `catalog.json`, then loads each dataset-level `manifest.json`. A matrix is loaded only after its dataset is selected. The viewer supports sparse three-column text matrices (`left<TAB>right<TAB>value`) and mirrors upper-triangle entries in the browser; source files do not need a duplicated lower triangle.

Each matrix file has its own `binSize`, `normalization`, and `matrixType`. This is required because some resolutions have a normalized matrix while another resolution may only have raw counts.

```json
{
  "id": "sars2-vero-ricseq",
  "genomeLength": 29903,
  "coordinateSystem": "0-based",
  "matrixFormat": {
    "delimiter": "tab",
    "columns": ["left", "right", "value"],
    "triangle": "upper"
  },
  "structureFeatures": {
    "file": "structure_features.bedpe",
    "format": "BEDPE",
    "coordinateSystem": "0-based",
    "columns": ["chrom1", "start1", "end1", "chrom2", "start2", "end2"]
  },
  "defaultMatrix": "10bp-kr",
  "matrices": [
    {
      "id": "1bp-raw",
      "binSize": 1,
      "normalization": "none",
      "matrixType": "raw",
      "file": "example_1_NONE.matrix"
    },
    {
      "id": "10bp-kr",
      "binSize": 10,
      "normalization": "KR",
      "matrixType": "normalized",
      "file": "example_10_KR.matrix"
    }
  ]
}
```

Matrix coordinates are interpreted as 0-based bin starts. For example, `20<TAB>30<TAB>5.2` at 10 nt resolution describes the interaction between `[20,30)` and `[30,40)`. `NaN`, non-positive, malformed, and out-of-reference rows are ignored. The displayed lower triangle is generated automatically.

The heatmap uses a white-to-dark-red logarithmic color scale. By default, `color max` is recalculated from the 99th percentile of non-zero values in the current viewport. Users can enter a positive number to fix the saturation limit; values at or above that limit use the darkest red. The value applies to the displayed, potentially aggregated heatmap cells, so changing the viewport or resolution can change the automatic value. The **Auto** button restores viewport-based scaling.

To add a dataset, create its folder and manifest, place its matrix files beside the manifest, and add one manifest path to `catalog.json`. `defaultMatrix` should normally reference a coarser file to keep the first download small.

## BEDPE structure features

`structureFeatures` is optional. Its file is stored beside the dataset manifest and uses six tab-separated BEDPE columns:

```text
chrom1<TAB>start1<TAB>end1<TAB>chrom2<TAB>start2<TAB>end2
HS1<TAB>0<TAB>10<TAB>HS1<TAB>20<TAB>30
```

BEDPE intervals are interpreted as 0-based half-open coordinates: `[start1,end1)` × `[start2,end2)`. The page ignores malformed, negative, reversed, or out-of-reference rows. Additional columns are preserved during export, so a seventh `name` column may optionally provide the displayed feature name. Structure features are hidden by default; users can enable their center points, highlight or isolate one selected feature, and export either all valid rows or only the selected row.

When a structure is selected, its own `base-pairs.bedpe` is loaded from the structure catalog and drawn as purple points. This base-pair layer is separate from the optional dataset-level `structureFeatures` layer.

If different matrix resolutions require different feature files, put the same `structureFeatures` object inside an individual matrix entry. A matrix-level declaration overrides the dataset-level declaration.

Each structure record should keep `genomeLength` and `mapRegions` as genomic coordinates. The page uses those coordinates to draw the selected local region or the two symmetric arm-to-arm rectangles on the map.

The results explorer uses the same ordering: `mapRegions[0]` is shown as `left start / left end`, and `mapRegions[1]` as `right start / right end`. A release may also provide an explicit `position` object with these four fields. Single-arm or local structures leave the right columns empty and cannot match a right-position query.

Structure records currently use 1-based inclusive genomic coordinates. The heatmap viewer converts a structure interval `[start,end]` to the 0-based half-open interval `[start-1,end)` only for overlay drawing; the stored structure coordinates and result-table search rules remain unchanged.
