// Leitor de PDF e imagem (PDF.js): rolagem contínua, zoom por botões e pinça de dois dedos só dentro do leitor,
// texto selecionável, página atual. Só mexe no próprio DOM; quem usa recebe `aoMudarPagina(n, total)`.
import * as pref from '../preferencias.js';
import { ehToqueDuplo, prenderZoom, zoomPelaRoda, alternarZoomDuplo } from '../../nucleo/gestos.js';
let pdfjs = null;
async function carregarPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('../../vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/**
 * A capa de um arquivo: a 1ª página do PDF (ou a própria imagem) como endereço de imagem para `<img>`.
 * Devolve { url, paginas } ou null se não der para ler; quem chama deve soltar `url` com URL.revokeObjectURL.
 */
export async function capaDoArquivo(tipo, blob, largura = 720) {
  try {
    if (tipo === 'imagem') return { url: URL.createObjectURL(blob), paginas: 1 };
    const lib = await carregarPdfjs(), doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    try {
      const page = await doc.getPage(1), v0 = page.getViewport({ scale: 1 }), dpr = Math.min(2, devicePixelRatio || 1), vp = page.getViewport({ scale: (largura / v0.width) * dpr });
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const imagem = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
      return imagem ? { url: URL.createObjectURL(imagem), paginas: doc.numPages } : null;
    } finally { doc.destroy(); }
  } catch { return null; }
}

export function criarLeitor(raiz, { aoMudarPagina = () => {}, aoMudarZoom = () => {} } = {}) {
  let pdf = null, imagem = null, zoom = 1, baseW = 0, baseH = 0, pagina = 1, obs = null, geracao = 0, modo = 'pagina';
  if (pref.ler('ohara.leitor') === 'continuo') modo = 'continuo';
  let medido = [0, 0];
  const conteudo = document.createElement('div');
  raiz.appendChild(conteudo);

  const limita = prenderZoom;
  const larguraBase = () => Math.max(120, raiz.clientWidth - 20);
  const alturaBase = () => Math.max(120, raiz.clientHeight - 20);
  // modo 'pagina': o slide inteiro cabe na tela (largura e altura); 'continuo': ajusta só à largura e rola.
  const ajuste = () => (modo === 'pagina' && baseH ? Math.min(larguraBase() / baseW, alturaBase() / baseH) : larguraBase() / baseW);
  const escala = () => Math.min(3, Math.max(0.2, ajuste() * zoom));

  function limpar() { geracao++; conteudo.innerHTML = ''; if (obs) obs.disconnect(); obs = null; }

  async function desenharPagina(d, g) {
    if (d.dataset.feito || !pdf) return;
    d.dataset.feito = '1';
    const n = Number(d.dataset.n), page = await pdf.getPage(n), vp = page.getViewport({ scale: escala() }), dpr = Math.min(2, devicePixelRatio || 1);
    if (g !== geracao) return;
    d.style.width = vp.width + 'px'; d.style.height = vp.height + 'px';
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr); d.appendChild(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    if (g !== geracao) return;
    const t = document.createElement('div'); t.className = 'textLayer'; t.style.setProperty('--scale-factor', vp.scale); d.appendChild(t);
    try { await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: t, viewport: vp }).render(); } catch { /* PDF só de imagem */ }
  }
  function apagarPagina(d) { if (!d.dataset.feito) return; d.innerHTML = ''; delete d.dataset.feito; }

  async function montarPdf() {
    limpar(); if (!pdf) return;
    conteudo.style.cssText = modo === 'pagina' ? 'display:flex;flex-direction:column' : '';
    const g = geracao, p1 = await pdf.getPage(1), v1 = p1.getViewport({ scale: escala() });
    for (let i = 1; i <= pdf.numPages; i++) {
      const d = document.createElement('div'); d.className = 'pg'; d.dataset.n = i; d.style.width = v1.width + 'px'; d.style.height = v1.height + 'px'; if (modo === 'pagina') d.style.margin = `${Math.max(0, Math.floor((alturaBase() - v1.height) / 2)) + 5}px auto`; conteudo.appendChild(d);
    }
    obs = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? desenharPagina(e.target, g) : apagarPagina(e.target))), { root: raiz, rootMargin: '900px 0px' });
    conteudo.querySelectorAll('.pg').forEach((d) => obs.observe(d));
    raiz.classList.toggle('ajustado', modo === 'pagina' && zoom <= 1.001);
    medido = [raiz.clientWidth, raiz.clientHeight];
    atualizarPagina();
  }

  function montarImagem() {
    imagem.style.width = (modo === 'pagina' ? Math.min(larguraBase(), alturaBase() * (imagem.naturalWidth / (imagem.naturalHeight || 1) || 1)) * zoom : larguraBase() * zoom) + 'px';
    if (modo === 'pagina') imagem.style.maxHeight = 'none';
    atualizarPagina();
  }

  function atualizarPagina() {
    let n = 1, total = 1;
    if (pdf) {
      total = pdf.numPages;
      const topo = raiz.scrollTop + raiz.clientHeight / (modo === 'pagina' ? 2 : 3);
      for (const d of conteudo.children) { if (d.offsetTop - conteudo.offsetTop <= topo) n = Number(d.dataset.n); else break; }
    }
    pagina = n;
    aoMudarPagina(pagina, total);
  }
  raiz.addEventListener('scroll', () => atualizarPagina(), { passive: true });

  async function definirZoom(novo, foco) {
    const antigo = zoom; zoom = limita(novo); aoMudarZoom(zoom);
    const k = zoom / antigo, r = raiz.getBoundingClientRect();
    const cx = foco ? foco.cx - r.left : raiz.clientWidth / 2, cy = foco ? foco.cy - r.top : raiz.clientHeight / 2;
    const ox = raiz.scrollLeft + cx, oy = raiz.scrollTop + cy;
    if (pdf) await montarPdf(); else if (imagem) montarImagem();
    raiz.scrollLeft = ox * k - cx; raiz.scrollTop = oy * k - cy;
  }

  // Ao mudar o tamanho do painel (divisória, giro do tablet), o slide é redesenhado para continuar inteiro na tela.
  let refaz = null;
  new ResizeObserver(() => {
    if (!pdf || !raiz.clientWidth || Math.abs(raiz.clientWidth - medido[0]) < 24 && Math.abs(raiz.clientHeight - medido[1]) < 24) return;   // bloco escondido (largura 0): não redesenha
    clearTimeout(refaz); refaz = setTimeout(async () => { const n = pagina; await montarPdf(); const d = conteudo.querySelector(`.pg[data-n="${n}"]`); if (d) raiz.scrollTop = d.offsetTop - conteudo.offsetTop - 8; }, 150);
  }).observe(raiz);
  // Deslizar com um dedo para o lado passa de slide (só com o slide inteiro à vista).
  let dedo = null;
  raiz.addEventListener('touchstart', (e) => { dedo = e.touches.length === 1 && raiz.classList.contains('ajustado') ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null; }, { passive: true });
  raiz.addEventListener('touchend', (e) => {
    if (!dedo || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - dedo.x, dy = e.changedTouches[0].clientY - dedo.y, rapido = Date.now() - dedo.t < 600; dedo = null;
    if (rapido && Math.abs(dx) > 70 && Math.abs(dy) < 45) (dx < 0 ? api.proximo() : api.anterior());
  });

  // Pinça: enquanto os dois dedos estão na tela só escala o conteúdo; ao soltar, redesenha no zoom novo.
  let pinca = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  raiz.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2 || (!pdf && !imagem)) return;
    const t = e.touches, r = raiz.getBoundingClientRect();
    pinca = { d0: dist(t), z0: zoom, f: 1, cx: (t[0].clientX + t[1].clientX) / 2, cy: (t[0].clientY + t[1].clientY) / 2 };
    conteudo.style.transformOrigin = `${raiz.scrollLeft + pinca.cx - r.left}px ${raiz.scrollTop + pinca.cy - r.top}px`;
  }, { passive: true });
  raiz.addEventListener('touchmove', (e) => {
    if (!pinca || e.touches.length !== 2) return;
    pinca.f = Math.min(3 / pinca.z0, Math.max(0.5 / pinca.z0, dist(e.touches) / pinca.d0));
    conteudo.style.transform = `scale(${pinca.f})`; e.preventDefault();
  }, { passive: false });
  const fimPinca = (e) => {
    if (!pinca || e.touches.length >= 2) return;
    const p = pinca; pinca = null; conteudo.style.transform = ''; conteudo.style.transformOrigin = '';
    if (Math.abs(p.f - 1) > 0.02) definirZoom(p.z0 * p.f, p);
  };
  raiz.addEventListener('touchend', fimPinca); raiz.addEventListener('touchcancel', fimPinca);

  // Dois toques seguidos alternam 100% e 200% no ponto tocado (se não estiver selecionando texto); Ctrl + roda dá zoom no ponto do mouse.
  let toqueIni = null, ultimoToque = null;
  raiz.addEventListener('touchstart', (e) => { toqueIni = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; if (e.touches.length > 1) ultimoToque = null; }, { passive: true });
  raiz.addEventListener('touchend', (e) => {
    if (!toqueIni || e.touches.length || e.changedTouches.length !== 1 || (!pdf && !imagem)) return;
    const t = e.changedTouches[0], moveu = Math.hypot(t.clientX - toqueIni.x, t.clientY - toqueIni.y) > 10; toqueIni = null;
    if (moveu) { ultimoToque = null; return; }
    const agora = { t: performance.now(), x: t.clientX, y: t.clientY };
    if (ehToqueDuplo(ultimoToque, agora) && !String(getSelection?.() ?? '')) { ultimoToque = null; definirZoom(alternarZoomDuplo(zoom), { cx: agora.x, cy: agora.y }); } else ultimoToque = agora;
  });
  raiz.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || (!pdf && !imagem)) return;
    e.preventDefault(); definirZoom(zoomPelaRoda(zoom, e.deltaY), { cx: e.clientX, cy: e.clientY });
  }, { passive: false });

  const api = {
    /** Abre um arquivo anexado. `tipo` é 'pdf' ou 'imagem'; `blob` o conteúdo. Lança Error com mensagem para o usuário. */
    async abrir(tipo, blob, paginaInicial = 1) {
      limpar(); pdf = null; imagem = null; pagina = 1; zoom = 1; aoMudarZoom(zoom);
      if (tipo === 'pdf') {
        const lib = await carregarPdfjs();
        try { pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; }
        catch { throw new Error('Não consegui abrir este PDF. Ele pode estar danificado ou protegido por senha.'); }
        { const v = (await pdf.getPage(1)).getViewport({ scale: 1 }); baseW = v.width; baseH = v.height; }
        await montarPdf();
        if (paginaInicial > 1) api.irPara(paginaInicial);
      } else {
        const url = URL.createObjectURL(blob);
        imagem = document.createElement('img'); imagem.className = 'imagem'; imagem.alt = ''; imagem.src = url;
        imagem.onload = () => { URL.revokeObjectURL(url); montarImagem(); };
        conteudo.appendChild(imagem); montarImagem();
      }
    },
    irPara(n) {
      if (!pdf) return;
      const d = conteudo.querySelector(`.pg[data-n="${Math.min(Math.max(1, n), pdf.numPages)}"]`);
      if (d) { raiz.scrollTop = d.offsetTop - conteudo.offsetTop - 8; pagina = Number(d.dataset.n); aoMudarPagina(pagina, pdf.numPages); }
    },
    proximo() { return api.irPara(pagina + 1); },
    anterior() { return api.irPara(pagina - 1); },
    get modo() { return modo; },
    async definirModo(m) { modo = m === 'continuo' ? 'continuo' : 'pagina'; pref.gravar('ohara.leitor', modo); const n = pagina; zoom = 1; aoMudarZoom(1); if (pdf) { await montarPdf(); api.irPara(n); } else if (imagem) montarImagem(); },
    mais() { return definirZoom(zoom + 0.25); },
    menos() { return definirZoom(zoom - 0.25); },
    normal() { return definirZoom(1); },
    get pagina() { return pagina; },
    get total() { return pdf ? pdf.numPages : imagem ? 1 : 0; },
    get zoom() { return zoom; },
    fechar() { limpar(); pdf = null; imagem = null; },
  };
  return api;
}
