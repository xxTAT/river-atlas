# RIVER Atlas

**An online atlas of interaction-supported RNA secondary structures, well-folded structures and alternative conformations inferred by RIVER from RNA–RNA proximity-ligation maps**\
[![Website](https://img.shields.io/badge/website-RIVER%20Atlas-blue)](https://xxtat.github.io/river-atlas/)
[![Zenodo](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.23658285-blue)](https://doi.org/10.5281/zenodo.23658285)
[![Code](https://img.shields.io/badge/code-RIVER-blue)](https://github.com/xxTAT/RIVER)
[![software](https://img.shields.io/badge/software-river_rna-blue)](https://github.com/xxTAT/riveer_rna)

**Browse the atlas:** <https://xxtat.github.io/river-atlas/>

---

## Overview

RIVER Atlas is the companion data resource for the study

> **RIVER: duplex-morphology-guided inference of RNA secondary structures and their alternatives from RNA–RNA interaction maps**
> Yingxiang Deng, Zhaoxiang Liu, Lei Chen, Dengguo Wei\* and Zi Wen\*

This repository hosts a **static website** (served by GitHub Pages) that contains **all structures generated in the study and their structural attributes**. With it you can:

- **download** the structure files and per-structure attribute tables;
- **rank and filter** structures by interaction support, pairing ambiguity or evolutionary conservation;
- **view** each structure as a secondary-structure diagram, or as an overlay on the matching RNA–RNA interaction heatmap.

> This repository holds the **results** (structures, attributes and the browser). The RIVER **software** is in separate repositories; see [Related resources](#related-resources).

---

## Contents of the atlas

### Datasets

The atlas covers the nine published coronavirus proximity-ligation datasets analysed in the study. All of them come from three genera and were obtained through the Coronavirus Omics Data Explorer ([CODE](https://webofgroup.cn/dgwei/hngene/#/index)).

| Virus (genus) | Reference genome | Method | Strain | Cell type | Time post-infection | Original study (DOI) |
|---|---|---|---|---|---|---|
| PEDV (*Alphacoronavirus*) | MK584552.1 | RIC-seq | AJ1102 | Vero | 12 h | [10.1038/s44320-026-00239-0](https://doi.org/10.1038/s44320-026-00239-0) |
| SARS-CoV-2 (*Betacoronavirus*) | NC_045512.2 | vRIC-seq | IPBCAMSYL01/2020 | Vero | virion | [10.1038/s41467-021-22785-x](https://doi.org/10.1038/s41467-021-22785-x) |
| SARS-CoV-2 | NC_045512.2 | RIC-seq | nCoV-2019BetaCoV/Wuhan/WIV04/2019 | Vero | 24 h | [10.1016/j.molcel.2023.11.032](https://doi.org/10.1016/j.molcel.2023.11.032) |
| SARS-CoV-2 | NC_045512.2 | RIC-seq | nCoV-2019BetaCoV/Wuhan/WIV04/2019 | A549-ACE2 | 24 h | [10.1016/j.molcel.2023.11.032](https://doi.org/10.1016/j.molcel.2023.11.032) |
| SARS-CoV-2 | NC_045512.2 | SPLASH | hCoV-19/Singapore/2/2020 (WT) | Vero E6 | 48 h | [10.1038/s41467-021-25357-1](https://doi.org/10.1038/s41467-021-25357-1) |
| SARS-CoV-2 | NC_045512.2 | COMRADES | München-1.2/2020/984 | Vero E6 | 20 h | [10.1016/j.molcel.2020.11.004](https://doi.org/10.1016/j.molcel.2020.11.004) |
| SARS-CoV-2 | NC_045512.2 | Simplified-SPLASH | Wuhan-Hu-1 | Vero E6 | 24 h | [10.1038/s41467-021-25999-1](https://doi.org/10.1038/s41467-021-25999-1) |
| PDCoV (*Deltacoronavirus*) | KT336560.1 | vRIC-seq | CHN-HN-2014 | LLC-PK1 | virion | [10.1038/s41597-024-03975-w](https://doi.org/10.1038/s41597-024-03975-w) |
| PDCoV | KT336560.1 | RIC-seq | CHN-HN-2014 | LLC-PK1 | 10 h | [10.1038/s44320-026-00239-0](https://doi.org/10.1038/s44320-026-00239-0) |

### Structure categories

| Category | Description |
|---|---|
| **Genome-wide representative structures** | Full-length secondary-structure models assembled from high-scoring, non-conflicting stems. Unconstrained regions are completed by MFE folding. |
| **Feature-level structures** | Representative structures reconstructed separately for each duplex-associated structural feature found in the interaction map. |
| **Local (feature-derived) well-folded structures** | Feature-level structures with summed interaction support above the background mean **and** mean pairing ambiguity below the background mean. Short-range and long-range structures are evaluated separately. |
| **Global (unit-based) well-folded structures** | Structural units cut from the genome-wide representative models. Units are clustered on interaction support, pairing ambiguity and length (Ward's method), and the clusters that pass the support–ambiguity criteria are kept. |
| **Alternative structures** | Groups of mutually exclusive structural features in high-entropy regions with sufficient interaction support (≥ 50th percentile), reconstructed as alternative secondary structures and classified into four topological types (see below). |

### Structural attributes

Each base pair, and each structure as a summary over its base pairs, is annotated with three interaction- or sequence-derived attributes:

| Attribute | Definition | Interpretation |
|---|---|---|
| **Interaction support** | Normalized interaction signal between the two paired nucleotides. Summed or averaged at the structure level. | Higher = stronger experimental evidence that the pairing forms. |
| **Pairing ambiguity** | PA(*i*,*j*) = *H*<sub>*i*</sub> × *H*<sub>*j*</sub>, where *H* is the interaction-derived Shannon entropy of each nucleotide, computed from balanced maps. | Lower = more specific pairing partners. Higher = the nucleotides interact with many partners. |
| **Evolutionary conservation** | Mean over non-redundant homologous genomes (CD-HIT 99 %, MAFFT alignment): 1 = base pair fully conserved, 0.5 = partially conserved (a different pair forms at the same position), 0 = absent. | Higher = more conserved across strains. |

**Short- and long-range structural spaces.** Interaction frequency decays with genomic distance, so attributes are computed and compared separately for structures spanning **< 3,000 nt (short-range)** and **> 3,000 nt (long-range)**. This 3,000-nt cutoff sits near the knee of the cumulative chimeric-read distance profile in all examined datasets. 

### Topological types of alternative structures

| Type | Name | Arrangement of the shared formation region |
|---|---|---|
| **I** | Crossing mutual exclusion | The shared region lies on opposite arms of the two duplexes. |
| **II** | Same-side competition | Two duplexes compete for a shared region on the same arm. |
| **III** | Nested inclusion | A smaller structure lies inside one arm of a larger duplex. |
| **IV** | Local–distal competition | Compact local duplexes compete with a distal long-range interaction. |

---

## Using the website

1. **Select a dataset**: choose a virus and a proximity-ligation dataset.
2. **Select a structure category**: representative, feature-level, well-folded (local/global) or alternative structures.
3. **Rank and filter**: sort structures by interaction support, pairing ambiguity or conservation; filter by genomic position, span (short- vs long-range) or alternative-structure type.
4. **Visualize**:
   - *Secondary-structure*
   - *Heatmap*
   - *Structural feature*
5. **Download**: get individual structures, attribute tables or complete per-dataset bundles.

---

## File formats

| Content | Format | Notes |
|---|---|---|
| Secondary structures | Dot-bracket (`.dbn`) / connectivity table (`.ct`)/BED-like (`.bed` / `.bedpe`) | Readable by VARNA, RNAstructure, ViennaRNA, forna, etc. |
| Structure and base-pair attributes | Key-value pair (`.json`) | Columns include coordinates, span, range class, interaction support, pairing ambiguity, conservation and category labels. |
| Structural features | BED-like (`.bed` / `.bedpe`) | Coordinates of the two arms of each duplex-associated feature. |
| Interaction heatmaps | matrix files (`.hic` / `.matrix`)                 | Maps used for structural analysis and reconstruction. |

---

## Related resources

| Resource | Content |
|---|---|
| [xxTAT/RIVER](https://github.com/xxTAT/RIVER) | RIVER source code and the Jupyter notebooks that reproduce the analyses in the manuscript |
| [xxTAT/river_rna](https://github.com/xxTAT/river_rna) | Integrated, maintained implementation of RIVER |
| [CODE](https://webofgroup.cn/dgwei/hngene/#/index) | Source of the processed coronavirus RNA–RNA interaction datasets |

---

## Data sources and notes

- No new sequencing data were generated in this study. All interaction and chemical-probing datasets come from published studies (see the dataset table above and the Supplementary Material of the manuscript). Please also cite the original studies when you use structures derived from their data.
- Interaction maps were built with the vRIC-seq analysis pipeline ([RIC2Structure](https://github.com/caochch/RIC2Structure)) and normalized with Juicer tools (KR balancing or observed/expected).
- Conservation scores for SARS-CoV-2 were computed from genomes obtained from GISAID. Under the GISAID terms of use, **the atlas does not redistribute these sequences**; only the derived scores are provided. Accession lists are in Supplementary Material 1 of the manuscript.
- Structures are computational inferences from ensemble-averaged interaction data. Well-folded and alternative structures are **candidates** to guide hypotheses and experimental validation; they are not experimentally confirmed conformations.

---

## Citation

If you use RIVER Atlas, please cite:

> Deng Y., Liu Z., Chen L.,  RIVER: duplex-morphology-guided inference of RNA secondary structures and their alternatives from RNA–RNA interaction maps.

---

## License

Data in this repository are released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Website source code is released under the MIT License.

## Contact

- Dengguo Wei: dgwei@mail.hzau.edu.cn
- Zi Wen: wenzi@yzwlab.cn

Questions and bug reports are welcome through [GitHub Issues](https://github.com/xxTAT/river-atlas/issues).
