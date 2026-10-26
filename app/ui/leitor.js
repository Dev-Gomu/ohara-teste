// Leitor de PDF e imagem (PDF.js): rolagem contínua, zoom por botões e pinça de dois dedos só dentro do leitor,
// texto selecionável, página atual. Só mexe no próprio DOM; quem usa recebe `aoMudarPagina(n, total)`.
let pdfjs = null;
async function carregarPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

export function criarLeitor(raiz, { aoMudarPagina = () => {}, aoMudarZoom = () => {} } = {}) {
  let pdf = null, imagem = null, zoom = 1, baseW = 0, pagina = 1, obs = null, geracao = 0;
  const conteudo = document.createElement('div');
  raiz.appendChild(conteudo);

  const limita = (z) => Math.min(3, Math.max(0.5, z));
  const larguraBase = () => Math.max(120, raiz.clientWidth - 20);
  const escala = () => Math.min(3, Math.max(0.4, larguraBase() / baseW * zoom));

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
    const g = geracao, p1 = await pdf.getPage(1), v1 = p1.getViewport({ scale: escala() });
    for (let i = 1; i <= pdf.numPages; i++) {
      const d = document.createElement('div'); d.className = 'pg'; d.dataset.n = i; d.style.width = v1.width + 'px'; d.style.height = v1.height + 'px'; conteudo.appendChild(d);
    }
    obs = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? desenharPagina(e.target, g) : apagarPagina(e.target))), { root: raiz, rootMargin: '900px 0px' });
    conteudo.querySelectorAll('.pg').forEach((d) => obs.observe(d));
    atualizarPagina();
  }

  function montarImagem() {
    imagem.style.width = (larguraBase() * zoom) + 'px';
    atualizarPagina();
  }

  function atualizarPagina() {
    let n = 1, total = 1;
    if (pdf) {
      total = pdf.numPages;
      const topo = raiz.scrollTop + raiz.clientHeight / 3;
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

  return {
    /** Abre um arquivo anexado. `tipo` é 'pdf' ou 'imagem'; `blob` o conteúdo. Lança Error com mensagem para o usuário. */
    async abrir(tipo, blob, paginaInicial = 1) {
      limpar(); pdf = null; imagem = null; pagina = 1; zoom = 1; aoMudarZoom(zoom);
      if (tipo === 'pdf') {
        const lib = await carregarPdfjs();
        try { pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; }
        catch { throw new Error('Não consegui abrir este PDF. Ele pode estar danificado ou protegido por senha.'); }
        baseW = (await (await pdf.getPage(1)).getViewport({ scale: 1 })).width;
        await montarPdf();
        if (paginaInicial > 1) this.irPara(paginaInicial);
      } else {
        const url = URL.createObjectURL(blob);
        imagem = document.createElement('img'); imagem.className = 'imagem'; imagem.alt = ''; imagem.src = url;
        imagem.onload = () => URL.revokeObjectURL(url);
        conteudo.appendChild(imagem); montarImagem();
      }
    },
    irPara(n) {
      if (!pdf) return;
      const d = conteudo.querySelector(`.pg[data-n="${Math.min(Math.max(1, n), pdf.numPages)}"]`);
      if (d) raiz.scrollTop = d.offsetTop - conteudo.offsetTop - 8;
    },
    mais() { return definirZoom(zoom + 0.25); },
    menos() { return definirZoom(zoom - 0.25); },
    normal() { return definirZoom(1); },
    get pagina() { return pagina; },
    get total() { return pdf ? pdf.numPages : imagem ? 1 : 0; },
    get zoom() { return zoom; },
    fechar() { limpar(); pdf = null; imagem = null; },
  };
}
