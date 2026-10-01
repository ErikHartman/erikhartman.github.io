import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const problems = [];
const documents = new Map();
const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
  const names = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
  const number = /^&#x/i.test(entity) ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
  return Number.isFinite(number) && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
});
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4])]));
}
async function walk(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isSymbolicLink()) problems.push(`${path.relative(root, file)}: symbolic links cannot be deployed to Pages`);
    else if (item.isDirectory()) result.push(...await walk(file));
    else result.push(file);
  }
  return result;
}
async function document(file) {
  if (!documents.has(file)) {
    const html = await readFile(file, 'utf8');
    const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '<$1></$1>');
    // Keep external script attributes while ignoring JavaScript strings that resemble tags.
    const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<(?:script|style)\b[^>]*>)[\s\S]*?<\/(script|style)>/gi, '$1</$2>');
    const tags = [...clean.matchAll(/<[a-z][^>]*>/gi)].map(match => ({ name: match[0].match(/^<([a-z][\w:-]*)/i)[1].toLowerCase(), attrs: attributes(match[0]) }));
    documents.set(file, { html, markup, tags, ids: new Set(tags.flatMap(({ name, attrs }) => [attrs.id, name === 'a' ? attrs.name : null].filter(Boolean))) });
  }
  return documents.get(file);
}
let files;
try { files = await walk(root); }
catch { console.error('No generated site found. Run npm run build first.'); process.exit(1); }
for (const required of ['index.html', '404.html', 'publications/index.html', 'blog/index.html', 'cv/index.html', 'flashcards/index.html', 'robots.txt', 'sitemap.xml', 'publications.bib']) {
  if (!files.includes(path.join(root, required))) problems.push(`Missing required output: ${required}`);
}
const htmlFiles = files.filter(file => file.endsWith('.html'));
const home = files.includes(path.join(root, 'index.html')) ? await document(path.join(root, 'index.html')) : null;
const canonical = home?.tags.find(tag => tag.name === 'link' && tag.attrs.rel === 'canonical')?.attrs.href;
const origin = new URL(canonical || 'https://erikhartman.github.io').origin;
let linkCount = 0;
for (const file of htmlFiles) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const { html, markup, tags } = await document(file);
  const report = message => problems.push(`${relative}: ${message}`);
  const rendered = markup.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  if (/{%[\s\S]*?%}|{{[\s\S]*?}}/.test(rendered)) report('unrendered Liquid template syntax');
  if (!relative.startsWith('flashcards/')) {
    if (!/<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title>/i.test(html)) report('missing page title');
    const headings = tags.filter(tag => tag.name === 'h1');
    if (headings.length !== 1) report(`expected one h1, found ${headings.length}`);
    for (const name of ['description', 'viewport']) {
      if (!tags.some(tag => tag.name === 'meta' && tag.attrs.name === name && tag.attrs.content?.trim())) report(`missing ${name} metadata`);
    }
  }
  const route = `/${relative.replace(/index\.html$/, '')}`;
  for (const { attrs } of tags) {
    for (const value of [attrs.href, attrs.src].filter(Boolean)) {
      if (/^(?:mailto:|tel:|data:|javascript:|blob:)/i.test(value)) continue;
      let target;
      try { target = new URL(value, `${origin}${route}`); } catch { report(`invalid URL: ${value}`); continue; }
      if (target.origin !== origin) continue;
      linkCount += 1;
      let pathname;
      try { pathname = decodeURIComponent(target.pathname); } catch { report(`invalid encoded path: ${value}`); continue; }
      let destination = path.resolve(root, `.${pathname}`);
      if (destination !== path.resolve(root) && !destination.startsWith(root)) { report(`path outside site: ${value}`); continue; }
      try {
        if ((await stat(destination)).isDirectory()) destination = path.join(destination, 'index.html');
        if (!(await stat(destination)).isFile()) throw new Error('not a file');
      } catch { report(`missing internal target: ${value}`); continue; }
      if (target.hash && /\.(html|svg)$/.test(destination) && !target.hash.startsWith('#:~:text=')) {
        let fragment;
        try { fragment = decodeURIComponent(target.hash.slice(1)); } catch { report(`invalid fragment: ${value}`); continue; }
        if (fragment && !(await document(destination)).ids.has(fragment)) report(`missing fragment: ${value}`);
      }
    }
  }
}
// Compare bibliography coverage with source data without relying on layout classes.
const source = fileURLToPath(new URL('../content/publications.json', import.meta.url));
try {
  const publications = JSON.parse(await readFile(source, 'utf8'));
  if (!Array.isArray(publications) || publications.length === 0) problems.push('Publication source is empty or invalid');
  else {
    const bibliography = await readFile(path.join(root, 'publications.bib'), 'utf8');
    const entries = bibliography.match(/^@\w+\s*\{/gm) || [];
    if (entries.length !== publications.length) problems.push(`Bibliography contains ${entries.length} entries for ${publications.length} publications`);
    const publicationPage = await document(path.join(root, 'publications/index.html'));
    const paperLinks = new Set(publicationPage.tags.map(tag => tag.attrs.href).filter(Boolean));
    for (const publication of publications) {
      const link = publication.url || (publication.doi && `https://doi.org/${publication.doi}`);
      if (link && !paperLinks.has(link)) problems.push(`Publication missing from listing: ${publication.title}`);
    }
  }
} catch (error) {
  if (error.code !== 'ENOENT') problems.push(`Cannot validate bibliography: ${error.message}`);
}
if (problems.length) {
  console.error(`Site validation failed (${problems.length} issue${problems.length === 1 ? '' : 's'}):\n${problems.map(problem => `  - ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log(`Checked ${htmlFiles.length} HTML pages and ${linkCount} internal links/assets. No broken paths, fragments, metadata, or template syntax found.`);
