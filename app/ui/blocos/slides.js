// Bloco Slides da Área de trabalho: o arquivo da aula (PDF ou imagem) no leitor, com página, zoom e o menu ⋮.
// Segue o contrato dos blocos de ui/componentes/mosaico.js. A página em que você parou fica guardada por arquivo.
import { escaparHtml, formatarBytes } from '../../nucleo/texto.js';
import { arquivosDaAula, excluirArquivo, restaurarArquivo, ehPdf } from '../../nucleo/arquivos.js';
import { zoomEmPorcento } from '../../nucleo/gestos.js';
import { criarLeitor } from '../componentes/leitor.js';
import { abrirMenu } from '../menu.js';

export function criarBlocoSlides({ sessao, ctx, aulaId }) {
  const el = document.createElement('section'), cabecalho = document.createElement('header');
  el.className = 'at-bloco at-slides'; cabecalho.className = 'at-cab';
  cabecalho.innerHTML = `<b class="mo-tit">Slide</b><span class="at-arq" data-k="arq"></span><span class="mo-esp"></span>` +
    `<span class="at-cap" aria-label="Página"><button type="button" data-k="ant" aria-label="Página anterior" title="Página anterior (Alt [)">◀</button><span data-k="pg" aria-live="polite">—</span><button type="button" data-k="prox" aria-label="Próxima página" title="Próxima página (Alt ])">▶</button></span>` +
    `<span class="at-cap at-cap-zoom" aria-label="Zoom"><button type="button" data-k="menos" aria-label="Diminuir o zoom" title="Diminuir (−)">−</button><span data-k="zoom">100%</span><button type="button" data-k="mais" aria-label="Aumentar o zoom" title="Aumentar (+)">+</button></span>` +
    `<button type="button" class="mo-ib" data-k="menu" aria-label="Mais opções do slide" aria-haspopup="menu" title="Opções do slide"><svg class="at-s" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="3.8" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="14.2" r="1.4" fill="currentColor" stroke="none"/></svg></button>`;
  el.append(cabecalho);
  el.insertAdjacentHTML('beforeend', `<p class="erro at-erro" data-k="erro" hidden></p><div class="at-lamina"><div id="leitor" class="at-leitor" tabindex="0" aria-label="Slide (setas e Page Down passam de página; J e K rolam; + e − dão zoom)"></div>` +
    `<div class="at-vazio" data-k="vazio" hidden>Nenhum slide ainda.<button type="button" class="btn" data-k="anexar-vazio">Anexar PDF ou imagem</button></div></div>` +
    `<input type="file" data-k="anexar" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf" hidden>`);
  const $ = (k) => el.querySelector(`[data-k="${k}"]`), leitorEl = el.querySelector('.at-leitor');
  let arquivoAtual = null, carregado = false, destruido = false;
  const lista = () => arquivosDaAula(sessao.estado(), aulaId);

  const leitor = criarLeitor(leitorEl, {
    aoMudarPagina: (n, total) => {
      $('pg').textContent = `${n} / ${total}`; $('ant').disabled = n <= 1; $('prox').disabled = n >= total;
      if (arquivoAtual && leitor.total > 1) sessao.gravarConfig(`pagina_${arquivoAtual.id}`, n);
    },
    aoMudarZoom: (z) => { $('zoom').textContent = zoomEmPorcento(z); },
  });
  const erro = (m) => { $('erro').textContent = m || ''; $('erro').hidden = !m; };
  function desenharEstado() {
    const l = lista(), tem = l.length > 0;
    $('vazio').hidden = tem; leitorEl.hidden = !tem;
    for (const k of ['ant', 'prox', 'menos', 'mais']) $(k).disabled = !tem;
    $('arq').textContent = arquivoAtual?.nome ?? ''; $('arq').title = arquivoAtual?.nome ?? '';
    if (!tem) { $('pg').textContent = '—'; $('zoom').textContent = '100%'; }
  }
  async function abrirArquivo(f) {
    arquivoAtual = f; erro(''); desenharEstado();
    const blob = await sessao.lerArquivo(f.id);
    if (destruido) return;
    if (!blob) { erro('O conteúdo deste arquivo não está neste aparelho (restaure um backup completo).'); return; }
    try { await leitor.abrir(ehPdf(f) ? 'pdf' : 'imagem', blob, Number(sessao.lerConfig(`pagina_${f.id}`)) || 1); } catch (e) { erro(e.message); }
  }
  async function carregar() {
    carregado = true; const l = lista();
    desenharEstado();
    if (l.length) await abrirArquivo(l[l.length - 1]);
  }
  async function removerArquivo() {
    const f = arquivoAtual; if (!f) return;
    sessao.aplicar((e) => excluirArquivo(e, f.id, new Date().toISOString()));
    arquivoAtual = null; leitor.fechar(); erro('');
    const resto = lista(); desenharEstado();
    if (resto.length) await abrirArquivo(resto[resto.length - 1]);
    ctx.aviso(`"${f.nome}" foi para a lixeira.`, { texto: 'Desfazer', fazer: async () => { sessao.aplicar((e) => restaurarArquivo(e, f.id)); await abrirArquivo(f); } });
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b || !el.contains(b)) return;
    const k = b.dataset.k;
    if (k === 'ant') leitor.anterior(); else if (k === 'prox') leitor.proximo();
    else if (k === 'menos') leitor.menos(); else if (k === 'mais') leitor.mais();
    else if (k === 'anexar-vazio') $('anexar').click();
    else if (k === 'menu') abrirMenuSlide(b);
  });
  function abrirMenuSlide(ancora) {
    const l = lista(), cont = leitor.modo === 'continuo';
    abrirMenu(ancora, [
      { rotulo: 'Anexar slide ou imagem…', fazer: () => $('anexar').click() },
      ...(l.length > 1 ? l.map((f) => ({ rotulo: f.nome, marcado: f.id === arquivoAtual?.id, fazer: () => abrirArquivo(f) })) : []),
      ...(l.length ? [{ rotulo: cont ? 'Mostrar um slide por vez' : 'Rolar o arquivo contínuo', fazer: () => leitor.definirModo(cont ? 'pagina' : 'continuo') }, { rotulo: 'Tamanho que cabe na tela (0)', fazer: () => leitor.normal() }] : []),
      ...(arquivoAtual ? [{ sep: true }, { rotulo: `Remover “${arquivoAtual.nome}”`, perigo: true, fazer: removerArquivo }] : []),
    ]);
  }
  $('anexar').onchange = async (e) => {
    const arq = e.target.files[0]; e.target.value = ''; if (!arq) return;
    try { const reg = await sessao.anexar(aulaId, arq); await abrirArquivo(reg); ctx.aviso(`"${reg.nome}" anexado (${formatarBytes(reg.tamanho)}).`); }
    catch (err) { erro(err.message); }
  };
  leitorEl.addEventListener('keydown', (e) => {   // setas e Page Down/Up passam de página; J K rolam; + − 0 dão zoom
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key;
    if (k === 'PageDown' || k === 'ArrowRight' || k === ' ') { leitor.proximo(); e.preventDefault(); } else if (k === 'PageUp' || k === 'ArrowLeft') { leitor.anterior(); e.preventDefault(); }
    else if (k === 'j') { leitorEl.scrollBy({ top: 90 }); e.preventDefault(); } else if (k === 'k') { leitorEl.scrollBy({ top: -90 }); e.preventDefault(); }
    else if (k === '+' || k === '=') { leitor.mais(); e.preventDefault(); } else if (k === '-') { leitor.menos(); e.preventDefault(); } else if (k === '0') { leitor.normal(); e.preventDefault(); }
  });
  desenharEstado();

  return {
    nome: 'slides', titulo: 'Slide', el, cabecalho,
    mostrar() { if (!carregado) carregar(); },
    esconder() {},
    focar() { leitorEl.focus(); },
    aoRedimensionar() {},
    salvar() {},
    destruir() { destruido = true; leitor.fechar(); },
    pagina: () => (arquivoAtual && leitor.total > 1 ? leitor.pagina : null),
    arquivoId: () => arquivoAtual?.id ?? null,
    proxima: () => leitor.proximo(), anterior: () => leitor.anterior(), irPara: (n) => leitor.irPara(n),
    async abrirArquivoPorId(id) { const f = lista().find((x) => x.id === id); if (f && f.id !== arquivoAtual?.id) await abrirArquivo(f); },
    abrirMenu: () => abrirMenuSlide($('menu')),
  };
}
