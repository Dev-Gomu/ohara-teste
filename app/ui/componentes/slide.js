// Componente: o slide de uma aula (arquivo anexado + leitor + página). Desenha o próprio miolo dentro de `el` e usa o mesmo
// leitor da tela Aula. A página em que você parou é a mesma nas duas telas (mesma chave de configuração).
import { escaparHtml } from '../../nucleo/texto.js';
import { arquivosDaAula, ehPdf } from '../../nucleo/arquivos.js';
import { criarLeitor } from './leitor.js';

/**
 * `el`: onde desenhar (um bloco). `sessao`: a sessão do app. `aoFechar`: chamado pelo ✕.
 * Devolve { carregar(aulaId), proxima, anterior, destruir }.
 */
export function criarBlocoSlide(el, { sessao, aoFechar = () => {} }) {
  let leitor = null, arquivo = null, aulaId = 0;
  el.setAttribute('aria-label', 'Slide (setas passam de página)');
  el.innerHTML = `<header><b>SLIDE</b><select class="in" data-sl="arq" aria-label="Arquivo do slide" hidden></select><span class="esp"></span>` +
    `<button type="button" class="ib" data-sl="ant" aria-label="Página anterior" title="Página anterior (Alt [)">◀</button><span class="pg" data-sl="pg" aria-live="polite"></span><button type="button" class="ib" data-sl="prox" aria-label="Próxima página" title="Próxima página (Alt ])">▶</button>` +
    `<button type="button" class="ib" data-sl="fechar" aria-label="Fechar o slide" title="Fechar (Alt Q)">✕</button></header>` +
    `<p class="erro" data-sl="erro" hidden></p><div id="leitor" tabindex="0" aria-label="Slide"></div><p class="fc-sem-slide" data-sl="vazio" hidden>Esta aula ainda não tem slide. Anexe um PDF ou imagem na tela da Aula.</p>`;
  const $ = (k) => el.querySelector(`[data-sl="${k}"]`), leitorEl = el.querySelector('#leitor');
  const erro = (m) => { $('erro').textContent = m || ''; $('erro').hidden = !m; };

  leitor = criarLeitor(leitorEl, {
    aoMudarPagina: (n, total) => { $('pg').textContent = `${n} / ${total}`; $('ant').disabled = n <= 1; $('prox').disabled = n >= total; if (arquivo && leitor.total > 1) sessao.gravarConfig(`pagina_${arquivo.id}`, String(n)); },
    aoMudarZoom: () => {},
  });
  async function abrirArquivo(f) {
    arquivo = f; erro('');
    const blob = await sessao.lerArquivo(f.id);
    if (!blob) { erro('O conteúdo deste arquivo não está neste aparelho (restaure um backup completo).'); return; }
    try { await leitor.abrir(ehPdf(f) ? 'pdf' : 'imagem', blob, Number(sessao.lerConfig(`pagina_${f.id}`)) || 1); } catch (e) { erro(e.message); }
  }
  async function carregar(id) {
    aulaId = Number(id) || 0;
    const lista = aulaId ? arquivosDaAula(sessao.estado(), aulaId) : [], sel = $('arq');
    sel.innerHTML = lista.map((f) => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join(''); sel.hidden = lista.length < 2;
    $('vazio').hidden = lista.length > 0; leitorEl.hidden = !lista.length; erro('');
    for (const k of ['ant', 'prox']) $(k).disabled = !lista.length;
    if (!lista.length) { leitor.fechar(); arquivo = null; $('pg').textContent = ''; return; }
    const f = lista.find((x) => x.id === arquivo?.id) ?? lista[0]; sel.value = String(f.id); await abrirArquivo(f);
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sl]'); if (!b) return;
    if (b.dataset.sl === 'ant') leitor.anterior(); else if (b.dataset.sl === 'prox') leitor.proximo(); else if (b.dataset.sl === 'fechar') aoFechar();
  });
  el.addEventListener('change', (e) => { if (e.target.dataset?.sl === 'arq') { const f = arquivosDaAula(sessao.estado(), aulaId).find((x) => String(x.id) === e.target.value); if (f) abrirArquivo(f); } });
  el.addEventListener('keydown', (e) => {                       // setas e Page Down/Up passam de página; J K rolam; + − 0 dão zoom
    if (e.ctrlKey || e.altKey || e.metaKey || e.target.closest?.('select,button,input')) return;
    const k = e.key;
    if (k === 'PageDown' || k === 'ArrowRight' || k === ' ') { leitor.proximo(); e.preventDefault(); } else if (k === 'PageUp' || k === 'ArrowLeft') { leitor.anterior(); e.preventDefault(); }
    else if (k === 'j') { leitorEl.scrollBy({ top: 90 }); e.preventDefault(); } else if (k === 'k') { leitorEl.scrollBy({ top: -90 }); e.preventDefault(); }
    else if (k === '+' || k === '=') { leitor.mais(); e.preventDefault(); } else if (k === '-') { leitor.menos(); e.preventDefault(); } else if (k === '0') { leitor.normal(); e.preventDefault(); }
  });
  return { carregar, proxima: () => leitor.proximo(), anterior: () => leitor.anterior(), destruir: () => leitor.fechar() };
}
