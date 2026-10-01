# Erik Hartman

A custom, static scientific website for [erikhartman.github.io](https://erikhartman.github.io). Plain HTML, CSS, and a small amount of browser JavaScript. A Node build script renders the pages; `marked` is the only production dependency. No Jekyll, Ruby, client framework, tracking, or external font service is needed.

## Develop

Use Node.js 24 or newer.

```sh
npm ci
npm run build
npm run check
npm run dev
```

Open `http://localhost:4321`. Rebuild after changing a source file, then refresh the browser. The local server serves the generated `dist/` directory and returns the custom 404 page for missing routes.

## Edit content

| File | What it controls |
| --- | --- |
| `content/site.json` | Introduction, current research focus, contact links, and research themes |
| `content/publications.json` | Publications, authors, venues, DOI links, and publication status |
| `content/software.json` | Open-source research tools |
| `content/writing.json` | Essay titles, descriptions, dates, filenames, and permanent URLs |
| `content/posts/*.md` | Essay text in Markdown |
| `scripts/build.mjs` | Page structure, biographical background, CV, and home-page paper selection |
| `site/style.css` | Typography, color, layout, mobile styles, and print styles |
| `site/site.js` | Publication search, filters, and citation copying |
| `site/figures/*.svg` | Scientific schematics paired with the research topics in `content/site.json` |
| `assets/img/` and `assets/pdf/` | Existing photographs, essay images, and downloadable PDFs |

To add an essay, create a Markdown file in `content/posts/` and add its metadata to `content/writing.json`. Keep published `route` values stable so existing links continue to work. Dates are ISO `YYYY-MM-DD`. Only trusted, author-controlled Markdown belongs in this repository: embedded HTML is supported.

To add a paper, add a unique record to `content/publications.json`, using `Article`, `Preprint`, or `Editorial` for its status. Authors use full names separated by commas. Set the DOI without a URL prefix. Update the home-page `selectedDois` array in `scripts/build.mjs` to change the four highlighted papers. Search, the year groups, and the downloadable BibTeX bibliography are generated automatically.

## Publish with GitHub Actions

The workflow in `.github/workflows/deploy.yml` builds and validates pull requests. Pushes to the repository’s default branch build and deploy `dist/` with the official GitHub Pages actions. Manual workflow dispatch is also available on the default branch.

In the repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. No custom token or publishing credentials are needed: the deployment job receives scoped `pages: write` and `id-token: write` permissions. The existing `github-pages` environment may require approval if the repository has protection rules.

The canonical site address is configured in `content/site.json`. This build targets the root user site `https://erikhartman.github.io/`; it is not configured for a project site under a subpath.

Official workflow reference: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Migration and provenance

- The biography and current research focus were confirmed by Erik on 1 October 2026.
- The existing bibliography was migrated, duplicate identifiers were fixed, and the superseded wound-healing preprint was merged into its published article. Its DOI remains in the `supersededDoi` field.
- The Feynman–Kac steering title was updated from its [arXiv record](https://arxiv.org/abs/2511.09216). Two publications were added from their publishers: the [porcine wound peptidomics dataset](https://www.nature.com/articles/s41597-025-05842-8) and the [editorial on LLM use in reviews](https://link.springer.com/article/10.1007/s00210-025-04102-1).
- Preprints remain explicitly labeled. Google Scholar is linked directly; the build does not scrape Scholar or automatically change publication records.
- All seven essays keep their established URLs and historical prose. Previous year, tag, and pagination archive URLs redirect to the writing index. Two already-missing images in the SynthEthics essay were omitted; see `migrationNotes` in the writing data. The historical bioterrorism essay retains the previous site’s 2019 date, which should be corrected by the author because its text refers to events in 2020.
- `/flashcards/`, the CV PDF, and the synthetic-biology PDF remain available. The CV PDF is explicitly labeled as the 2025 version.
- The old Jekyll source and unused original assets remain as migration references. They are not read by the new build or copied into the published site. `content/` is now the source of truth. Do not use the old template’s build or deployment scripts.

The generated site includes canonical links, social metadata, a sitemap, an Atom feed, a custom 404 page, keyboard focus styles, a skip link, and responsive layouts. Core pages and citation text work without JavaScript; search and citation copying progressively enhance the publications page.
