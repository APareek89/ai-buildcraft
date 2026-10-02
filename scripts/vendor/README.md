# Offline reader dependencies

These files are pinned build inputs for the consolidated learning guide. Builds never fetch them. `manifest.json` records exact upstream URLs and SHA-256 hashes; the bundler verifies every file before use.

- **MathJax 3.2.2**, `tex-svg-full.js`, Apache-2.0. The full TeX/SVG component contains the TeX extensions and SVG font paths so lessons can render mathematics without downloading fonts or extensions. Its context menu is disabled. [Upstream](https://github.com/mathjax/MathJax/tree/3.2.2), [component documentation](https://docs.mathjax.org/en/v3.2/web/components/combined.html#tex-svg-full).
- **highlight.js 11.9.0**, JavaScript bundle and GitHub Dark stylesheet, BSD-3-Clause. [Upstream](https://github.com/highlightjs/highlight.js/tree/11.9.0).

Files are copied without modifications. Their license texts are included in this directory and embedded in the standalone guide's notices. Optional Google Fonts requests from source lessons are removed; each page uses its existing system-font fallbacks.
