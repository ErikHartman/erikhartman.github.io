// Minimal PDB / mmCIF readers. Only what the renderer needs: Cα and carbonyl O of the
// first chain of the first model, B-factor (pLDDT for AlphaFold models), and HELIX/SHEET
// records when a PDB file has them.
//
// Returns { rows: [{ num, CA, O, b }], chain, ss: string[] | null, isAF, title }

export function parsePDB(text) {
  const res = new Map(), order = [], helix = [], sheet = [];
  let chain = null, title = null;
  for (const l of text.split(/\r?\n/)) {
    const rec = l.slice(0, 6);
    if (rec === "ENDMDL") break;
    if (rec === "TITLE " && !title) title = l.slice(10).trim();
    if (rec === "HELIX ") { helix.push([l[19], parseInt(l.slice(21, 25)), parseInt(l.slice(33, 37))]); continue; }
    if (rec === "SHEET ") { sheet.push([l[21], parseInt(l.slice(22, 26)), parseInt(l.slice(33, 37))]); continue; }
    if (rec !== "ATOM  ") continue;
    const name = l.slice(12, 16).trim();
    if (name !== "CA" && name !== "O") continue;
    const alt = l[16]; if (alt !== " " && alt !== "A") continue;
    const ch = l[21]; if (chain === null) chain = ch; if (ch !== chain) continue;
    const key = l.slice(22, 27);
    let r = res.get(key);
    if (!r) { r = { num: parseInt(l.slice(22, 26)) }; res.set(key, r); order.push(key); }
    r[name] = [parseFloat(l.slice(30, 38)), parseFloat(l.slice(38, 46)), parseFloat(l.slice(46, 54))];
    if (name === "CA") r.b = parseFloat(l.slice(60, 66));
  }
  const rows = order.map(k => res.get(k)).filter(r => r.CA);
  let ss = null;
  const m = new Map();
  for (const [c, a, b] of helix) if (c === chain) for (let i = a; i <= b; i++) m.set(i, "H");
  for (const [c, a, b] of sheet) if (c === chain) for (let i = a; i <= b; i++) m.set(i, "E");
  if (m.size) ss = rows.map(r => m.get(r.num) || "C");
  return { rows, chain, ss, isAF: /ALPHAFOLD/i.test(text.slice(0, 5000)), title };
}

function cifTokens(line) {
  const out = [], re = /'((?:[^']|'(?!\s|$))*)'(?=\s|$)|"((?:[^"]|"(?!\s|$))*)"(?=\s|$)|(\S+)/g;
  let m; while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export function parseCIF(text) {
  const lines = text.split(/\r?\n/);
  let i = lines.findIndex(l => l.startsWith("_atom_site."));
  if (i < 0) throw new Error("No _atom_site block in this mmCIF file");
  const cols = [];
  while (i < lines.length && lines[i].startsWith("_atom_site.")) { cols.push(lines[i].trim().slice(11)); i++; }
  const c = n => cols.indexOf(n);
  const pick = (a, b) => c(a) >= 0 ? c(a) : c(b);
  const ix = { g: c("group_PDB"), atom: c("label_atom_id"), alt: c("label_alt_id"), chain: pick("auth_asym_id", "label_asym_id"),
               seq: pick("auth_seq_id", "label_seq_id"), ins: c("pdbx_PDB_ins_code"), x: c("Cartn_x"), y: c("Cartn_y"), z: c("Cartn_z"),
               b: c("B_iso_or_equiv"), model: c("pdbx_PDB_model_num") };
  const res = new Map(), order = [];
  let chain = null, model = null;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (l[0] === "#" || l[0] === "_" || l.startsWith("loop_")) break;
    const t = cifTokens(l); if (t.length < cols.length) continue;
    if (ix.g >= 0 && t[ix.g] !== "ATOM") continue;
    if (ix.model >= 0) { if (model === null) model = t[ix.model]; else if (t[ix.model] !== model) break; }
    const name = t[ix.atom]; if (name !== "CA" && name !== "O") continue;
    if (ix.alt >= 0 && !".?A".includes(t[ix.alt])) continue;
    const ch = t[ix.chain]; if (chain === null) chain = ch; if (ch !== chain) continue;
    const key = t[ix.seq] + (ix.ins >= 0 ? t[ix.ins] : "");
    let r = res.get(key);
    if (!r) { r = { num: parseInt(t[ix.seq]) }; res.set(key, r); order.push(key); }
    r[name] = [parseFloat(t[ix.x]), parseFloat(t[ix.y]), parseFloat(t[ix.z])];
    if (name === "CA") r.b = ix.b >= 0 ? parseFloat(t[ix.b]) : 0;
  }
  return { rows: order.map(k => res.get(k)).filter(r => r.CA), chain, ss: null,
           isAF: /_ma_qa_metric|alphafold/i.test(text.slice(0, 20000)), title: null };
}

export function parseStructure(text) {
  if (/^data_/m.test(text.slice(0, 2000)) || /_atom_site\./.test(text.slice(0, 200000))) return parseCIF(text);
  return parsePDB(text);
}

// Read a File/Blob (optionally .gz) into a parsed structure.
export async function readStructureFile(file) {
  let text;
  if (/\.gz$/i.test(file.name || "")) {
    if (typeof DecompressionStream === "undefined") throw new Error("this browser can't unzip .gz files; unzip it first");
    text = await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text();
  } else text = await file.text();
  const parsed = parseStructure(text);
  const m = (file.name || "").match(/AF-([A-Z0-9]+)-F(\d+)/i);
  if (m) parsed.isAF = true;
  return { parsed, afId: m ? { acc: m[1].toUpperCase(), frag: m[2] } : null };
}
