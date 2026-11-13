# My website

Build with `npm run build`, validate with `npm run check`, and preview with `npm run dev`.

## APEX2 research page

`site/apex2/` contains the standalone research page, manuscript snapshot, and paper figures. The existing build copies it to `dist/apex2/`, so its URL after deployment will be <https://erikhartman.github.io/apex2/>.

Topic-specific panels use pixel-coordinate crop metadata in `index.html`, leaving the source figure images intact. Update those bounds if a figure's layout changes. The header reuses the homepage's ASCII Fold renderer with only the p53 peptide (chain B of 1YCR).

For now, the page is unlisted: it has `noindex` metadata and is absent from site navigation, the publications listing, sitemap, and feed. Its assets are excluded from crawling in `robots.txt`. These are discovery controls, not access control; once deployed, anyone with the direct URL can read the page and its assets.

Before a public launch, refresh the manuscript and figures, confirm release links and publication details, add the planned news item, and intentionally update the indexing settings and corresponding checks in `scripts/check.mjs`. The page remains a standalone URL for that future announcement.
