import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const json = async name => JSON.parse(await readFile(path.join(root, 'content', `${name}.json`), 'utf8'));
const [site, publications, writing, software] = await Promise.all(['site', 'publications', 'writing', 'software'].map(json));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const date = value => new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
const routes = [];
const redirectRoutes = new Set();
publications.sort((a, b) => b.year - a.year || (b.month || 0) - (a.month || 0));
writing.sort((a, b) => b.date.localeCompare(a.date));

function page({ title, description = site.description, route = '/', active = '', body, kind = '' }) {
  const nav = [['/', 'About', 'about'], ['/#research', 'Research', 'research'], ['/publications/', 'Publications', 'publications'], ['/blog/', 'Writing', 'writing'], ['/cv/', 'CV', 'cv']];
  const canonical = `${site.url}${route}`;
  const person = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', name: site.name, url: site.url, image: `${site.url}/assets/img/prof_pic.jpg`, jobTitle: 'Computational biology PhD student and visiting research scholar', affiliation: [{ '@type': 'Organization', name: 'Lund University' }, { '@type': 'Organization', name: 'University of Pennsylvania' }], sameAs: [site.scholar, site.github, site.orcid, site.linkedin] }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title ? `${title} — ${site.name}` : `${site.name} — Computational biology`)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#ffffff">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="${kind === 'article' ? 'article' : 'website'}">
  <meta property="og:title" content="${esc(title || `${site.name} — Computational biology`)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${site.url}/assets/img/prof_pic.jpg">
  <meta property="og:image:alt" content="Portrait of Erik Hartman">
  <meta name="twitter:card" content="summary">
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="/style.css">
  <link rel="alternate" type="application/atom+xml" title="Erik Hartman — Writing" href="/feed.xml">
  <script type="application/ld+json">${person}</script>
  <script src="/site.js" defer></script>
</head>
<body class="${esc(kind)}">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header wrap">
    <nav aria-label="Main navigation">${nav.map(([href, label, key]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
  </header>
  <main id="main" class="wrap">${body}</main>
  <footer class="site-footer wrap" id="contact">
    <div class="footer-intro"><h2>Contact</h2><a class="text-link" href="mailto:${esc(site.email)}">${esc(site.email)}</a></div>
    <div class="footer-links"><a href="${esc(site.scholar)}">Google Scholar</a><a href="${site.github}">GitHub</a><a href="${site.orcid}">ORCID</a><a href="${site.linkedin}">LinkedIn</a></div>
    <div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} Erik Hartman</span><a href="/feed.xml">RSS / Atom</a></div>
  </footer>
</body>
</html>`;
}

async function emit(route, html) {
  const file = route.endsWith('/') ? `${route}index.html` : route;
  const target = path.join(out, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html);
  routes.push(route);
}

function authorMarkup(authors) {
  return esc(authors).replace(/Erik Hartman/g, '<strong>Erik Hartman</strong>');
}

function bibtex(item) {
  const authors = item.authors.split(/, (?=[A-ZÀ-Ž])/).join(' and ');
  return `@${item.status === 'Preprint' ? 'misc' : 'article'}{${item.id},\n  title = {${item.title}},\n  author = {${authors}},\n  year = {${item.year}},\n  ${item.status === 'Preprint' ? 'howpublished' : 'journal'} = {${item.venue}},\n  doi = {${item.doi}}\n}`;
}

function pubRow(item, compact = false) {
  return `<article class="publication${compact ? ' compact' : ''}"${compact ? '' : ` data-publication data-type="${esc(item.status)}" data-search="${esc(`${item.title} ${item.authors} ${item.venue} ${item.year} ${item.status}`.toLocaleLowerCase())}"`}>
    <div class="pub-meta"><span>${esc(item.venue)}</span><span>${item.year}</span>${item.status !== 'Article' ? `<span class="status">${esc(item.status)}</span>` : ''}</div>
    <h3><a href="${esc(item.url || `https://doi.org/${item.doi}`)}">${esc(item.title)}</a></h3>
    <p class="authors">${authorMarkup(item.authors)}</p>
    ${compact ? '' : `<div class="pub-actions"><a href="https://doi.org/${esc(item.doi)}">${item.status === 'Preprint' ? 'Read preprint' : 'Read paper'}</a><details class="citation"><summary>BibTeX</summary><div class="citation-content"><pre><code>${esc(bibtex(item))}</code></pre><button type="button" data-copy hidden>Copy BibTeX</button></div></details></div>`}
  </article>`;
}

function writingRow(post, level = 3) {
  return `<a class="writing-row" href="${esc(post.route)}"><time datetime="${esc(post.date.slice(0, 10))}">${date(post.date)}</time><div><h${level}>${esc(post.title)}</h${level}><p>${esc(post.description)}</p></div></a>`;
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of await readdir(path.join(root, 'site'))) await cp(path.join(root, 'site', name), path.join(out, name), { recursive: true });
await mkdir(path.join(out, 'assets/img'), { recursive: true });
await mkdir(path.join(out, 'assets/pdf'), { recursive: true });
for (const name of ['prof_pic.jpg', 'phd_background.png', 'md_pdf.png', 'md_word.png', 'running_man.jpg', 'utopia_dystopia.jpg', 'MPE.png']) {
  await cp(path.join(root, 'assets/img', name), path.join(out, 'assets/img', name));
}
for (const name of ['cv.pdf', 'sb_for_beginners.pdf']) await cp(path.join(root, 'assets/pdf', name), path.join(out, 'assets/pdf', name));
await mkdir(path.join(out, 'flashcards'), { recursive: true });
for (const name of ['index.html', 'styles.css', 'quiz-parser.js', 'flashcards.js', 'all_quizzes.md']) {
  await cp(path.join(root, 'flashcards', name), path.join(out, 'flashcards', name));
}

const selectedDois = ['10.48550/ARXIV.2511.09216', '10.1101/2025.01.20.633551', '10.1371/journal.pcbi.1013972', '10.1038/s41467-024-51589-y'];
const selected = selectedDois.map(doi => publications.find(p => p.doi.toLowerCase() === doi.toLowerCase())).filter(Boolean);
await emit('/', page({ active: 'about', body: `
  <section class="hero" aria-labelledby="intro-title">
    <div class="hero-copy"><h1 id="intro-title">Erik Hartman</h1><p class="hero-bio">I’m a PhD student in computational biology at <a href="https://www.lunduniversity.lu.se/">Lund University</a>, currently a visiting research scholar in <a href="https://delafuentelab.seas.upenn.edu/">César de la Fuente’s Machine Biology Group</a> at the University of Pennsylvania.</p><p class="hero-statement">${esc(site.focus)}</p></div>
    <figure class="portrait"><img src="/assets/img/prof_pic.jpg" width="1023" height="1355" alt="Erik Hartman" fetchpriority="high"></figure>
  </section>
  <section class="research-section section" id="research" aria-labelledby="research-title">
    <h2 id="research-title">Research</h2>
    <div class="research-intro"><p>${esc(site.introduction)}</p></div>
    <div class="research-topics">${site.research.map(item => `<article class="research-topic"><div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div>${item.figure ? `<figure class="research-figure"><img src="${esc(item.figure.src)}" width="440" height="200" alt="${esc(item.figure.alt)}"><figcaption>${esc(item.figure.caption)}</figcaption></figure>` : ''}</article>`).join('')}</div>
  </section>
  <section class="section" aria-labelledby="work-title"><div class="section-heading"><h2 id="work-title">Selected publications</h2><a href="/publications/">All publications</a></div><div class="selected-publications">${selected.map(p => pubRow(p, true)).join('')}</div></section>
  <section class="section" id="software" aria-labelledby="software-title"><div class="section-heading"><h2 id="software-title">Software</h2><a href="${site.github}">GitHub</a></div><div class="software-grid">${software.map(item => `<a class="software-item" href="${item.url}"><div><h3>${esc(item.name)}</h3></div><p>${esc(item.description)}</p><span class="software-category">${esc(item.category)}</span></a>`).join('')}</div></section>
  <section class="section" aria-labelledby="writing-title"><div class="section-heading"><h2 id="writing-title">Writing</h2><a href="/blog/">All writing</a></div><div class="writing-list">${writing.slice(0, 3).map(post => writingRow(post)).join('')}</div></section>
  <aside class="a-little-more"><h2>Background</h2><p>During my PhD, I spent time at <a href="https://www.a-star.edu.sg/">A*STAR in Singapore</a> working with Peter J. Bond. Before my PhD, I worked in research and machine learning at Lund and Qlucore. I have also participated in Unga Forskare, ISEF, and iGEM.</p><a class="text-link" href="/cv/">CV</a></aside>
` }));

const years = [...new Set(publications.map(p => p.year))];
await emit('/publications/', page({ title: 'Publications', route: '/publications/', active: 'publications', description: 'Research papers and preprints by Erik Hartman on peptidomics, protein design, and computational biology.', body: `
  <header class="page-intro"><h1>Publications</h1><p>Articles, preprints, and editorials.</p><a class="text-link" href="${esc(site.scholar)}">Google Scholar</a></header>
  <div class="publication-filters" data-publication-filters hidden><label class="search-label" for="publication-search">Search publications<input id="publication-search" type="search" placeholder="Title, author, topic, or year…" autocomplete="off"></label><div class="filter-controls"><div class="filter-buttons" role="group" aria-label="Publication type">${['All', 'Article', 'Preprint', 'Editorial'].map((type, i) => `<button type="button" data-filter="${type}" aria-pressed="${i === 0}">${type === 'All' ? 'All' : `${type}s`}</button>`).join('')}</div><span class="result-count" data-result-count aria-live="polite"></span></div></div>
  <div class="publication-list">${years.map(year => `<section class="year-group" data-year-group aria-labelledby="year-${year}"><h2 id="year-${year}">${year}</h2><div>${publications.filter(p => p.year === year).map(p => pubRow(p)).join('')}</div></section>`).join('')}</div>
  <div class="empty-state" data-empty hidden><h2>No matching publications.</h2><p>Try a different term or publication type.</p><button type="button" data-reset>Clear filters</button></div>
  <p class="page-note">Preprints are labeled separately from published articles. Publication details checked October 2026. <a href="/publications.bib" download>Download bibliography</a></p>
` }));

await emit('/blog/', page({ title: 'Writing', route: '/blog/', active: 'writing', description: 'Essays and notes by Erik Hartman on research, computational biology, and the scientific process.', body: `<header class="page-intro"><h1>Writing</h1><p>Essays and notes on biology and research.</p></header><div class="writing-list all-writing">${writing.map(post => writingRow(post, 2)).join('')}</div><aside class="archive-note"><p>These essays are kept as originally written, with their original dates.</p><a href="/flashcards/">Research methodology flashcards</a></aside>` }));

for (const post of writing) {
  const source = await readFile(path.join(root, 'content/posts', post.file), 'utf8');
  const body = marked.parse(source, { gfm: true });
  await emit(post.route, page({ title: post.title, description: post.description, route: post.route, active: 'writing', kind: 'article', body: `<article class="article-wrap"><header class="article-header"><a class="back-link" href="/blog/">All writing</a><p class="eyebrow"><time datetime="${esc(post.date.slice(0, 10))}">${date(post.date)}</time> <span aria-hidden="true">/</span> Erik Hartman</p><h1>${esc(post.title)}</h1><p class="article-description">${esc(post.description)}</p></header><div class="prose">${body}</div><div class="article-end"><span>Erik Hartman</span><a href="/blog/">More writing</a></div></article>` }));
}

await emit('/cv/', page({ title: 'Background & CV', route: '/cv/', active: 'cv', description: 'Erik Hartman’s research background, experience, selected honors, and downloadable CV.', body: `
  <header class="page-intro"><h1>CV</h1><a class="text-link" href="/assets/pdf/cv.pdf">Download CV <span class="link-note">PDF · 2025 version</span></a></header>
  <section class="cv-section"><h2>Current positions</h2><div><article><h3>Visiting research scholar</h3><p>Machine Biology Group, University of Pennsylvania</p><p class="muted">Working with César de la Fuente on encrypted peptide discovery and computational protein and peptide design.</p></article><article><h3>PhD in computational biology</h3><p>Infection Medicine Proteomics, Lund University · since 2024</p><p class="muted">Computational methods for understanding protein degradation and discovering and designing bioactive peptides.</p></article></div></section>
  <section class="cv-section"><h2>Previous experience</h2><div><article><h3>Research visit · A*STAR, Singapore</h3><p>Research student with Peter J. Bond during my PhD.</p></article><article><h3>Research engineer · Lund University</h3><p>Machine learning and computation in omics, Infection Medicine Proteomics.</p></article><article><h3>Machine learning developer · Qlucore</h3><p>Machine learning, cancer diagnostics, and transcriptomics.</p></article><article><h3>MSc · Lund University</h3><p>Faculty of Engineering.</p></article></div></section>
  <section class="cv-section"><h2>Selected honors</h2><div><div class="honor"><span>2024</span><p>Anders Wall Scholarship for Young Scientists</p></div><div class="honor"><span>2024</span><p>EMBO Fellowship Grant</p></div><div class="honor"><span>2024</span><p>Engineering Promise of the Year, Swedish Chamber of Commerce</p></div><div class="honor"><span>2022</span><p>Best bachelor thesis</p></div><div class="honor"><span>2019</span><p>iGEM gold medal</p></div><div class="honor"><span>2018</span><p>National science competition, first place · Intel ISEF, third place</p></div></div></section>
  <p class="page-note">For publications and research software, see <a href="/publications/">my papers</a> and <a href="/#software">open-source tools</a>. The downloadable CV is retained from the previous site and was last updated in 2025.</p>
` }));

await emit('/404.html', page({ title: 'Page not found', route: '/404.html', body: `<section class="page-intro not-found"><h1>Page not found</h1><p>The link may have changed, or the page may have moved.</p><a class="text-link" href="/">Back to the homepage</a><a class="text-link" href="/blog/">Browse the writing archive</a></section>` }));
// Preserve archive links emitted by the previous site. Article URLs stay unchanged.
const legacyArchives = [
  ...[...new Set(writing.map(post => post.date.slice(0, 4)))].map(year => `/blog/${year}/`),
  '/blog/page/1/', '/blog/page/2/',
  ...['synthetic', 'biology', 'ethics', 'risks', 'markdown', 'game', 'theory', 'academia', 'publishing', 'bioterrorism', 'philosophy'].map(tag => `/blog/tag/${tag}/`)
];
for (const route of legacyArchives) {
  redirectRoutes.add(route);
  const html = page({ title: 'Writing archive', route: '/blog/', active: 'writing', body: `<section class="page-intro"><h1>Writing archive</h1><p>All essays are now collected in one place.</p><a class="text-link" href="/blog/">Continue to writing</a></section>` });
  await emit(route, html.replace('</head>', '<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=/blog/"></head>'));
}
await writeFile(path.join(out, 'publications.bib'), `${publications.map(bibtex).join('\n\n')}\n`);
await writeFile(path.join(out, '.nojekyll'), '');
await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.filter(route => route !== '/404.html' && !redirectRoutes.has(route)).map(route => `<url><loc>${esc(site.url + route)}</loc></url>`).join('')}</urlset>\n`);
await writeFile(path.join(out, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Erik Hartman — Writing</title><id>${site.url}/blog/</id><link href="${site.url}/feed.xml" rel="self"/><link href="${site.url}/blog/"/><updated>${site.updated}T00:00:00Z</updated><author><name>Erik Hartman</name></author>${writing.map(post => `<entry><title>${esc(post.title)}</title><id>${site.url}${post.route}</id><link href="${site.url}${post.route}"/><updated>${post.date.slice(0,10)}T00:00:00Z</updated><summary>${esc(post.description)}</summary></entry>`).join('')}</feed>\n`);
console.log(`Built ${routes.length} pages, ${publications.length} publications, and ${writing.length} essays in dist/.`);
