// Gera um arquivo .apkg (pacote do Anki) no navegador, sem Python: um banco SQLite no formato de coleção do Anki (esquema 11,
// o mesmo que o genanki escreve e o Anki 26 importa) dentro de um .zip, mais as imagens. Reenviar o mesmo cartão atualiza em vez de
// duplicar porque o `guid` e o tipo de nota são estáveis. Estrutura conferida contra os .apkg de teste da Etapa 0.
import { zipSync, strToU8 } from '../vendor/fflate.mjs';

export const ID_TIPO_NOTA = 1607392319;           // "Ohara básico" (o mesmo dos .apkg de teste da Etapa 0)
const SEP = '\x1f';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
const semHtml = (h) => h.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

function crc32(texto) {
  let c, crc = 0xFFFFFFFF;
  for (const b of new TextEncoder().encode(texto)) { c = (crc ^ b) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
/** Número estável do baralho a partir do nome (nunca 1, que é o "Default"). */
export const idDoBaralho = (nome) => (crc32(nome) % 2000000000) + 10;

async function csum(texto) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto)));
  return parseInt([...h.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(''), 16);
}

const SQL_ESQUEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn); CREATE INDEX ix_cards_usn on cards (usn); CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid); CREATE INDEX ix_cards_sched on cards (did, queue, due); CREATE INDEX ix_revlog_cid on revlog (cid); CREATE INDEX ix_notes_csum on notes (csum);`;

const CONF = '{"activeDecks":[1],"addToCur":true,"collapseTime":1200,"curDeck":1,"curModel":"1425279151691","dueCounts":true,"estTimes":true,"newBury":true,"newSpread":0,"nextPos":1,"sortBackwards":false,"sortType":"noteFld","timeLim":0}';
const DCONF = '{"1":{"autoplay":true,"id":1,"lapse":{"delays":[10],"leechAction":0,"leechFails":8,"minInt":1,"mult":0},"maxTaken":60,"mod":0,"name":"Default","new":{"bury":true,"delays":[1,10],"initialFactor":2500,"ints":[1,4,7],"order":1,"perDay":20,"separate":true},"replayq":true,"rev":{"bury":true,"ease4":1.3,"fuzz":0.05,"ivlFct":1,"maxIvl":36500,"minSpace":1,"perDay":100},"timer":0,"usn":0}}';
const baralho = (id, nome, mod) => ({ collapsed: false, conf: 1, desc: '', dyn: 0, extendNew: 10, extendRev: 50, id, lrnToday: [0, 0], mod, name: nome, newToday: [0, 0], revToday: [0, 0], timeToday: [0, 0], usn: -1 });
const campo = (name, ord) => ({ name, ord, font: 'Liberation Sans', media: [], rtl: false, size: 20, sticky: false });
const modelo = (did, mod) => ({
  css: '.card{font-family:sans-serif;font-size:20px;text-align:center}', did, id: String(ID_TIPO_NOTA), mod, name: 'Ohara básico', sortf: 0, type: 0, usn: -1, vers: [], tags: [], req: [[0, 'all', [0]]],
  flds: [campo('Frente', 0), campo('Verso', 1), campo('Origem', 2)],
  latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n', latexPost: '\\end{document}', latexsvg: false,
  tmpls: [{ name: 'Cartão 1', qfmt: '{{Frente}}', afmt: '{{FrontSide}}<hr id="answer">{{Verso}}<div style="font-size:11px;color:#888;margin-top:14px">{{Origem}}</div>', ord: 0, bafmt: '', bqfmt: '', bfont: '', bsize: 0, did: null }],
});

/**
 * `itens`: [{ cartao, aula, disciplina }] (de `cartoesParaExportar`). `imagens`: Map id do cartão → { bytes, extensao }.
 * `SQL`: o módulo do sql.js. Devolve { bytes, nome, total }.
 */
export async function gerarApkg(SQL, itens, imagens = new Map(), agoraMs = Date.now()) {
  const db = new SQL.Database(), seg = Math.floor(agoraMs / 1000), baralhos = new Map(), media = {}, arquivos = {};
  db.run(SQL_ESQUEMA);
  const usados = new Set();
  const stmtN = db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)'), stmtC = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  let n = 0;
  for (const { cartao: c, aula, disciplina } of itens) {
    const nome = `${disciplina.nome.replaceAll('::', ':')}::${aula.titulo.replaceAll('::', ':')}`, did = idDoBaralho(nome);
    baralhos.set(did, nome);
    let frente = esc(c.frente);
    const img = imagens.get(c.id);
    if (c.tem_imagem && img) { const arq = `ohara-cartao-${c.id}.${img.extensao}`, i = Object.keys(media).length; media[i] = arq; arquivos[String(i)] = img.bytes; frente += `<br><img src="${arq}">`; }
    const origem = esc(`${disciplina.nome} · ${aula.titulo}${c.pagina ? ` · slide ${c.pagina}` : ''}`);
    let nid = Math.floor(Date.parse(c.criado_em) / 1000) * 1000 + (c.id % 500) * 2; while (usados.has(nid)) nid += 2; usados.add(nid);
    const sfld = semHtml(frente);
    stmtN.run([nid, c.guid, ID_TIPO_NOTA, Math.floor(Date.parse(c.atualizado_em) / 1000), -1, c.etiquetas ? ` ${c.etiquetas} ` : '', [frente, esc(c.verso), origem].join(SEP), sfld, await csum(sfld), 0, '']);
    stmtC.run([nid + 1, nid, did, 0, seg, -1, 0, 0, ++n, 0, 0, 0, 0, 0, 0, 0, 0, '']);
  }
  stmtN.free(); stmtC.free();
  const decks = { 1: { ...baralho(1, 'Default', seg), usn: 0 } };
  for (const [id, nome] of baralhos) decks[id] = baralho(id, nome, seg);
  const primeiro = [...baralhos.keys()][0] ?? 1;
  db.run('INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)', [1411124400, agoraMs, agoraMs, CONF, JSON.stringify({ [ID_TIPO_NOTA]: modelo(primeiro, seg) }), JSON.stringify(decks), DCONF, '{}']);
  const colecao = db.export(); db.close();
  const bytes = zipSync({ 'collection.anki2': colecao, media: strToU8(JSON.stringify(media)), ...arquivos }, { level: 6 });
  return { bytes, nome: `ohara-cartoes-${new Date(agoraMs).toISOString().slice(0, 10)}.apkg`, total: itens.length };
}
