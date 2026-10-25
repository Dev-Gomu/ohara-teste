import * as pdfjs from './vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
const $ = s => document.querySelector(s), MB = b => (b / 1048576).toFixed(1) + ' MB', hora = () => new Date().toLocaleTimeString('pt-BR');
/* ---------- armazenamento simples (IndexedDB) ---------- */
const abreIdb = () => new Promise((res, rej) => { const r = indexedDB.open('ohara-lab', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kv = async (modo, k, v) => { const d = await abreIdb(); return new Promise((res, rej) => { const s = d.transaction('kv', modo === 'get' ? 'readonly' : 'readwrite').objectStore('kv'); const q = modo === 'get' ? s.get(k) : modo === 'set' ? s.put(v, k) : s.delete(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
/* ---------- 0.5 leitor de PDF ---------- */
let pdf = null, zoom = 1, baseW = 0, paginaAtual = 1, arquivoAtual = null, obs = null;
const leitor = $('#leitor');
function limpa() { leitor.innerHTML = ''; if (obs) obs.disconnect(); }
async function abrePdf(bytes, nome, tamanho) {
  const t0 = performance.now(); limpa(); $('#infoPdf').textContent = 'Abrindo…';
  try { pdf = await pdfjs.getDocument({ data: bytes }).promise; } catch (e) { $('#infoPdf').innerHTML = '<span class="ruim">Erro ao abrir: ' + e.message + '</span>'; return; }
  const p1 = await pdf.getPage(1), v1 = p1.getViewport({ scale: 1 }); baseW = v1.width;
  monta(); const dt = Math.round(performance.now() - t0);
  $('#infoPdf').textContent = `${nome} · ${MB(tamanho)} · ${pdf.numPages} páginas · aberto em ${dt} ms (a primeira página já aparece)`;
}
function escala() { return Math.min(3, Math.max(.4, (leitor.clientWidth - 20) / baseW * zoom)); }
async function monta() {
  limpa(); if (!pdf) return; const esc = escala(), p1 = await pdf.getPage(1), v1 = p1.getViewport({ scale: esc });
  for (let i = 1; i <= pdf.numPages; i++) { const d = document.createElement('div'); d.className = 'pg'; d.dataset.n = i; d.style.width = v1.width + 'px'; d.style.height = v1.height + 'px'; leitor.appendChild(d); }
  obs = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? desenha(e.target) : apaga(e.target)), { root: leitor, rootMargin: '900px 0px' });
  leitor.querySelectorAll('.pg').forEach(d => obs.observe(d)); atualizaPagina();
}
async function desenha(d) {
  if (d.dataset.feito) return; d.dataset.feito = '1'; const n = +d.dataset.n, page = await pdf.getPage(n), vp = page.getViewport({ scale: escala() }), dpr = Math.min(2, devicePixelRatio || 1);
  d.style.width = vp.width + 'px'; d.style.height = vp.height + 'px';
  const c = document.createElement('canvas'); c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr); d.appendChild(c);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
  const t = document.createElement('div'); t.className = 'textLayer'; t.style.setProperty('--scale-factor', vp.scale); d.appendChild(t);
  try { await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: t, viewport: vp }).render(); } catch (e) { /* PDF só de imagem */ }
}
function apaga(d) { if (!d.dataset.feito) return; d.innerHTML = ''; delete d.dataset.feito; }
function atualizaPagina() {
  const topo = leitor.scrollTop + leitor.clientHeight / 3; let n = 1;
  for (const d of leitor.children) { if (d.offsetTop <= topo) n = +d.dataset.n; else break; }
  paginaAtual = n; $('#pagina').textContent = pdf ? `Página ${n} de ${pdf.numPages}` : '—';
}
leitor.addEventListener('scroll', atualizaPagina, { passive: true });
$('#arq').onchange = async e => { const f = e.target.files[0]; if (!f) return; arquivoAtual = f; abrePdf(new Uint8Array(await f.arrayBuffer()), f.name, f.size); };
const muda = d => { zoom = Math.min(3, Math.max(.5, zoom + d)); $('#zoom').textContent = Math.round(zoom * 100) + '%'; const frac = leitor.scrollTop / Math.max(1, leitor.scrollHeight); monta().then(() => { leitor.scrollTop = frac * leitor.scrollHeight; }); };
$('#mais').onclick = () => muda(.25); $('#menos').onclick = () => muda(-.25);
/* ---------- 0.6 armazenamento ---------- */
async function estado() {
  let t = ''; try { const g = await kv('get', 'pdf'); t = g ? `PDF guardado: ${g.name} (${MB(g.size)})` : 'Nenhum PDF guardado.'; const e = await navigator.storage.estimate(); t += `\nEspaço usado: ${MB(e.usage)} de ${MB(e.quota)} · persistente: ${(await navigator.storage.persisted()) ? 'sim' : 'não'}`; } catch (e) { t = 'Erro: ' + e.message; }
  $('#infoIdb').textContent = t;
}
$('#guardaPdf').onclick = async () => { if (!arquivoAtual) { $('#infoIdb').textContent = 'Abra um PDF primeiro.'; return; } const t0 = performance.now(); try { await kv('set', 'pdf', arquivoAtual); $('#infoIdb').innerHTML = `<span class="ok">Guardado em ${Math.round(performance.now() - t0)} ms.</span>`; setTimeout(estado, 1500); } catch (e) { $('#infoIdb').innerHTML = '<span class="ruim">Falhou: ' + e.name + ' - ' + e.message + '</span>'; } };
$('#abreGuardado').onclick = async () => { const g = await kv('get', 'pdf'); if (!g) { $('#infoIdb').textContent = 'Nada guardado ainda.'; return; } arquivoAtual = g; abrePdf(new Uint8Array(await g.arrayBuffer()), g.name + ' (do aparelho)', g.size); };
$('#apagaPdf').onclick = async () => { await kv('del', 'pdf'); estado(); };
let db = null;
async function bancoPronto() {
  if (db) return db; const SQL = await initSqlJs({ locateFile: f => './vendor/' + f }); const bytes = await kv('get', 'sqlite');
  db = bytes ? new SQL.Database(bytes) : new SQL.Database(); db.run('CREATE TABLE IF NOT EXISTS notas(id INTEGER PRIMARY KEY, texto TEXT, criada TEXT)'); return db;
}
const salvaBanco = () => kv('set', 'sqlite', db.export());
$('#salvaNota').onclick = async () => { const tx = $('#nota').value.trim(); if (!tx) return; const b = await bancoPronto(); b.run('INSERT INTO notas(texto,criada) VALUES(?,?)', [tx, new Date().toISOString()]); await salvaBanco(); $('#nota').value = ''; $('#infoDb').innerHTML = '<span class="ok">Salvo no banco e gravado no aparelho às ' + hora() + '.</span>'; };
$('#listaNotas').onclick = async () => { const b = await bancoPronto(); const r = b.exec('SELECT id,texto,criada FROM notas ORDER BY id DESC LIMIT 20'); const v = b.exec('select sqlite_version()')[0].values[0][0]; $('#infoDb').textContent = `SQLite ${v} · ${r.length ? r[0].values.length : 0} anotação(ões):\n` + (r.length ? r[0].values.map(x => `#${x[0]} (${x[2].slice(11, 19)}) ${x[1]}`).join('\n') : '(nenhuma)'); };
/* ---------- 0.7 editor e atalhos ---------- */
const quill = new Quill('#editor', { theme: 'snow', modules: { toolbar: [['bold', 'italic'], [{ list: 'ordered' }, { list: 'bullet' }], [{ header: [1, 2, false] }]] } });
try { const s = localStorage.getItem('ohara-lab-nota'); if (s) quill.setContents(JSON.parse(s)); } catch (e) { }
quill.on('text-change', () => { try { localStorage.setItem('ohara-lab-nota', JSON.stringify(quill.getContents())); $('#infoEd').textContent = 'Anotação guardada neste aparelho às ' + hora(); } catch (e) { } });
const marcados = [], log = [];
function chegou(id, nome) {
  $(id).innerHTML = '<span class="ok">SIM</span>'; const sel = quill.getSelection(true) || { index: quill.getLength() - 1 }, [linha] = quill.getLine(sel.index), tx = (linha.domNode.textContent || '').trim().slice(0, 50);
  quill.insertText(sel.index, `◆ p.${paginaAtual} `, { bold: true }); marcados.push(`p.${paginaAtual} · ${nome} · "${tx}"`); $('#marcados').textContent = 'Marcados: ' + marcados.join(' | ');
}
document.addEventListener('keydown', e => {
  const k = (e.key || '').toLowerCase(), m = (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.metaKey ? 'Meta+' : '') + e.key;
  log.unshift(`${hora()}  ${m}  (code ${e.code})`); log.length = Math.min(log.length, 12); $('#log').textContent = log.join('\n');
  if (k === 'm' && !e.metaKey) { const noEditor = quill.hasFocus(); if (e.ctrlKey && e.shiftKey && !e.altKey) { e.preventDefault(); chegou('#k3', 'Ctrl+Shift+M'); } else if (e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); chegou('#k1', 'Ctrl+M'); } else if (e.altKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); chegou('#k2', 'Alt+M'); } }
}, true);
estado();
