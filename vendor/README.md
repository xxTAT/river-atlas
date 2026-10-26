# Third-party libraries (vendored)

These files are committed to the repository so the site does not depend on a CDN at run time.
Only `viewer.html` (secondary-structure viewer) uses them. The heatmap page (`heatmap.html`)
is drawn with the native Canvas API in `app.js` and has no third-party dependency.

| Library | Version | Files | Source | License |
|---|---|---|---|---|
| d3 | 3.5.17 | `d3-3.5.17/d3.min.js` | https://cdn.jsdelivr.net/npm/d3@3.5.17/d3.min.js | BSD-3-Clause (`d3-3.5.17/LICENSE`) |
| fornac | 1.2.0 | `fornac-1.2.0/fornac.js`, `fornac-1.2.0/fornac.css` | https://cdn.jsdelivr.net/gh/ViennaRNA/fornac@1.2.0/dist/ | Apache-2.0 (`fornac-1.2.0/LICENSE`) |

fornac requires d3 v3, so d3 must be loaded before `fornac.js`. The fornac bundle also contains
the `uuid` package (MIT, https://github.com/uuidjs/uuid).

Downloaded: 2026-10-26

SHA-256:

```
76c39718d1c0a3fb321676b3b7e29306c0907919a5716d5728bd1b08ae0169e7  d3-3.5.17/d3.min.js
44d4b293e83679984b3718579df28349fa1c631105d0664b9c1ab02447ca2020  fornac-1.2.0/fornac.js
8ef8add9eb4bad1db81809994c65ccfc670c3fa060333a1c0ee72152e5bfef97  fornac-1.2.0/fornac.css
```

Upgrade: download the new version into a new `<library>-<version>/` folder, update the paths in
`viewer.html`, update this table, then remove the old folder.
