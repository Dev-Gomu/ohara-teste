// Flashcards › Criar: o editor já mostra o cartão pronto; o slide da aula e o cartão pronto abrem ao lado (metade e metade).
// Só liga peças: editor (componentes/editor_cartoes), blocos, slide e cartão pronto. Texto guardado: nucleo/flashcards_editor.
import { escaparHtml } from '../../../nucleo/texto.js';
import { ativas } from '../../../nucleo/materias.js';
import { descreverHorario } from '../../../nucleo/aulas.js';
import { MODELOS_PADRAO, conferir } from '../../../nucleo/flashcards_texto.js';
import { paraGuardado, paraDigitado } from '../../../nucleo/flashcards_editor.js';
import { criarEditorCartoes } from '../../componentes/editor_cartoes.js';
import { criarBlocos } from '../../componentes/blocos.js';
import { criarBlocoSlide } from '../../componentes/slide.js';
import { cartaoProntoHtml } from '../../componentes/cartao_pronto.js';
import * as pref from '../../preferencias.js';
import { registrar } from '../../atalhos.js';

/** Devolve `desenharCriar(corpo)`, que desenha a tela e devolve a função de limpeza. `rascunho` é compartilhado com as outras abas. */
export function criarTelaCriar({ sessao, ctx, raiz, rascunho }) {
  const $ = (s, r = raiz) => r.querySelector(s);
  const modelos = () => { let meus = []; try { meus = JSON.parse(sessao.lerConfig('fc_modelos') || '[]'); } catch { meus = []; } return { padrao: MODELOS_PADRAO, meus: Array.isArray(meus) ? meus : [] }; };
  const salvarModelos = (meus) => sessao.gravarConfig('fc_modelos', JSON.stringify(meus));
  const aulasParaEscolher = () => {
    const e = sessao.estado(), mats = ativas(e.disciplinas);
    return mats.map((m) => ({ m, aulas: ativas(e.aulas).filter((a) => a.disciplina_id === m.id).sort((x, y) => (y.inicio ?? '').localeCompare(x.inicio ?? '')) })).filter((g) => g.aulas.length);
  };
  const BARRA = [['frente', 'Frente', 'Frente do cartão (@ e espaço)'], ['secao', 'Seção', 'Seção do verso (# e espaço)'], ['item', '•', 'Lista (- e espaço)'], ['num', '1.', 'Lista numerada (1. e espaço)'], ['mais', '+', 'A favor (+ e espaço)'], ['menos', '−', 'Contra (-- e espaço)'], ['duvida', '?', 'Dúvida (? e espaço)'], ['negrito', 'B', 'Negrito (Ctrl B)'], ['destaque', '▮', 'Destaque (Ctrl E)']];

  function desenharCriar(corpo) {
    const grupos = aulasParaEscolher(), { padrao, meus } = modelos();
    if (!grupos.some((g) => g.aulas.some((a) => String(a.id) === rascunho.aula))) rascunho.aula = grupos[0] ? String(grupos[0].aulas[0].id) : '';
    let modoCodigo = false, barraOn = false, atrasoPrevia = null;
    corpo.innerHTML =
      `<div class="fc-grade" id="fc-grade">` +
      `<section class="fc-tile" id="t-ed" aria-label="Editor"><header class="fc-topo-ed"><select class="in" id="sel-aula" aria-label="Aula do cartão">${grupos.map((g) => `<optgroup label="${escaparHtml(g.m.nome)}">${g.aulas.map((a) => `<option value="${a.id}" ${String(a.id) === rascunho.aula ? 'selected' : ''}>${escaparHtml(a.titulo)}${descreverHorario(a) ? ' · ' + escaparHtml(descreverHorario(a)) : ''}</option>`).join('')}</optgroup>`).join('')}</select><span class="esp"></span>` +
      `<button type="button" class="ib" id="bt-opcoes" aria-expanded="false" aria-controls="fc-opcoes" title="Opções: etiquetas, modelos, formatar, slide, limpar (Alt O)">⋯</button></header>` +
      `<div class="fc-opcoes" id="fc-opcoes" hidden>` +
      `<div class="fc-op-linha"><label class="c">Etiquetas<input class="in" id="etq" value="${escaparHtml(rascunho.etiquetas)}" autocomplete="off" placeholder="opcional"></label><span class="esp"></span>` +
      `<button type="button" class="chip" id="bt-fmt" aria-pressed="false" title="Mostrar ou ocultar a barra de formatação">Formatar</button>` +
      `<div class="fc-modo" role="group" aria-label="Modo" title="Código mostra as marcas (@ # - **) como texto"><button type="button" data-modo="normal">Normal</button><button type="button" data-modo="codigo">Código</button></div></div>` +
      `<div class="fc-op-linha fc-modelos" aria-label="Modelos"><span class="rot">Modelos</span>${padrao.map((m, i) => `<button type="button" class="chip" data-mod="p${i}">${escaparHtml(m.nome)}</button>`).join('')}` +
      `${meus.map((m, i) => `<span class="chip dupla"><button type="button" data-mod="u${i}">${escaparHtml(m.nome)}</button><button type="button" class="x" data-excl-mod="${i}" aria-label="Excluir o modelo ${escaparHtml(m.nome)}">×</button></span>`).join('')}` +
      `<button type="button" class="chip novo" id="bt-novo-mod">+ Novo modelo</button></div>` +
      `<div class="fc-modelo-novo" id="novo-mod" hidden><input class="in" id="nome-mod" maxlength="30" placeholder="Nome do modelo" aria-label="Nome do modelo"><button type="button" class="btn peq" id="ok-mod">Guardar o texto atual</button><button type="button" class="btn peq sec" id="no-mod">Cancelar</button></div>` +
      `<div class="fc-op-linha"><button type="button" class="btn peq sec" id="bt-novo-cartao" title="Começar um cartão novo (Alt N)">+ Novo cartão<kbd>Alt N</kbd></button>` +
      `<button type="button" class="btn peq sec" id="bt-slide" aria-pressed="false" title="Abrir o slide ao lado (Alt S)">Slide<kbd>Alt S</kbd></button>` +
      `<button type="button" class="btn peq sec" id="bt-cartao" aria-pressed="false" title="Ver o cartão pronto (Tab)">Cartão pronto<kbd>Tab</kbd></button>` +
      `<button type="button" class="btn peq sec" id="bt-limpar">Limpar</button></div></div>` +
      `<div class="fc-barra" id="fc-barra" role="toolbar" aria-label="Formatar a linha" hidden>${BARRA.map(([k, rot, t]) => `<button type="button" class="${k === 'negrito' ? 'b' : ''}" data-ins="${k}" title="${t}" aria-label="${t}">${rot}</button>`).join('')}</div>` +
      `<div class="fc-ed" id="fc-ed" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Editor do cartão" spellcheck="true"></div>` +
      `<textarea class="fc-codigo" id="fc-txt" hidden spellcheck="false" aria-label="Texto do flashcard com as marcas"></textarea>` +
      `<p class="erro" id="fc-erro" hidden role="alert"></p>` +
      `<footer><span class="dica el" id="fc-dica"></span><span class="esp"></span><button type="button" class="btn" id="bt-salvar">Salvar<kbd>Ctrl Enter</kbd></button></footer></section>` +
      `<section class="fc-tile" id="t-sl" hidden></section>` +
      `<section class="fc-tile" id="t-pre" aria-label="Cartão pronto" hidden><header><b>CARTÃO PRONTO</b><span class="esp"></span><span class="fc-pager" id="pager" hidden><button type="button" id="ant" aria-label="Cartão anterior">◀</button><span id="pg"></span><button type="button" id="prox" aria-label="Próximo cartão">▶</button></span>` +
      `<button type="button" class="ib" id="pv-fechar" aria-label="Fechar o cartão pronto" title="Fechar (Alt Q)">✕</button></header><div class="fc-previa" id="previa"></div></section></div>`;

    const grade = $('#fc-grade'), edEl = $('#fc-ed'), txt = $('#fc-txt');
    const fonteAtual = () => (modoCodigo ? paraGuardado(txt.value) : ed.fonte());
    const erro = (m) => { const e = $('#fc-erro'); e.textContent = m || ''; e.hidden = !m; };
    const mudou = () => { clearTimeout(atrasoPrevia); atrasoPrevia = setTimeout(previa, 120); };

    const ed = criarEditorCartoes(edEl, {
      aoMudar: (src) => { rascunho.texto = src; pref.gravar('ohara.fc.texto', src); mudou(); },
      aoCartao: (n) => { rascunho.atual = n; mudou(); },
      aoTab: () => blocos.alternar('pv') && previa(),
      aoSalvar: () => salvar(),
    });
    const slide = criarBlocoSlide($('#t-sl'), { sessao, aoFechar: () => fecharBloco('sl') });
    const blocos = criarBlocos(grade, { blocos: { ed: $('#t-ed'), sl: $('#t-sl'), pv: $('#t-pre') }, aoMudar: (ab) => { $('#bt-slide').setAttribute('aria-pressed', String(ab.includes('sl'))); $('#bt-cartao').setAttribute('aria-pressed', String(ab.includes('pv'))); } });
    const fecharBloco = (k) => { if (k === 'ed') ctx.aviso('O editor não fecha.'); else { blocos.fechar(k); ed.foco(); } };
    function abrirSlide() { if (blocos.alternar('sl')) { slide.carregar(rascunho.aula); blocos.focar('sl'); } else ed.foco(); }
    function definirTexto(src) { rascunho.atual = 0; ed.definir(src); if (modoCodigo) txt.value = paraDigitado(src); }
    function previa() {
      const { cartoes, problemas } = conferir(rascunho.texto), n = cartoes.length;
      rascunho.atual = Math.min(rascunho.atual, Math.max(0, n - 1));
      $('#fc-dica').textContent = n ? `${n} ${n === 1 ? 'cartão' : 'cartões'} neste texto` : 'Comece com @ e um espaço para a frente do cartão';
      if (!blocos.aberto('pv')) return;
      $('#pager').hidden = n < 2; if (n > 1) $('#pg').textContent = `${rascunho.atual + 1} / ${n}`;
      $('#previa').innerHTML = cartaoProntoHtml(cartoes[rascunho.atual] ?? {}) + (problemas.length && rascunho.texto.trim() ? `<p class="fc-aviso">${escaparHtml(problemas[0])}</p>` : '');
    }

    // ---- salvar / limpar / modelos (apagar texto sempre oferece Desfazer)
    async function salvar() {
      erro('');
      const { cartoes, problemas } = conferir(fonteAtual());
      if (!cartoes.length) { erro('Escreva o cartão: comece uma linha com @ e um espaço para a frente.'); return; }
      if (problemas.length) { const n = Number(/Cartão (\d+)/.exec(problemas[0])?.[1] ?? 1); ed.irParaCartao(n - 1); previa(); erro(problemas.join(' ')); return; }
      if (!rascunho.aula) { erro('Crie uma matéria e uma aula antes de salvar cartões.'); return; }
      const etiquetas = $('#etq').value; let feitos = 0;
      try { for (const c of cartoes) { await sessao.criarCartao(Number(rascunho.aula), { frente: c.frente, verso: c.verso, etiquetas }); feitos++; } }
      catch (e) { erro(`${feitos ? `${feitos} salvo(s). ` : ''}${e.message}`); return; }
      ctx.aviso(`${feitos} ${feitos === 1 ? 'cartão salvo' : 'cartões salvos'}.`);
      definirTexto(''); pref.gravar('ohara.fc.texto', ''); ed.foco();
    }
    function limpar() { const antes = fonteAtual(); if (!antes.trim()) return; definirTexto(''); ed.foco(); ctx.aviso('Texto limpo.', { texto: 'Desfazer', fazer: () => definirTexto(antes) }); }
    function aplicarModelo(texto) {
      const antes = fonteAtual(); definirTexto(texto); (modoCodigo ? txt : edEl).focus();
      if (antes.trim() && antes !== texto) ctx.aviso('Modelo aplicado.', { texto: 'Desfazer', fazer: () => definirTexto(antes) });
    }
    function alternarOpcoes(on) {
      const painel = $('#fc-opcoes'), abrir = on ?? painel.hidden; painel.hidden = !abrir; $('#bt-opcoes').setAttribute('aria-expanded', String(abrir)); pref.gravar('ohara.fc.opcoes', abrir ? '1' : '0');
      if (abrir) painel.querySelector('input,button')?.focus(); else (modoCodigo ? txt : edEl).focus();
    }
    function modo(codigo) {
      if (codigo === modoCodigo) return;
      if (codigo) txt.value = ed.digitado(); else definirTexto(paraGuardado(txt.value));
      modoCodigo = codigo; txt.hidden = !codigo; edEl.hidden = codigo; $('#fc-barra').hidden = codigo || !barraOn;
      corpo.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('on', b.dataset.modo === (codigo ? 'codigo' : 'normal'))); (codigo ? txt : edEl).focus();
    }
    txt.oninput = () => { rascunho.texto = paraGuardado(txt.value); pref.gravar('ohara.fc.texto', rascunho.texto); mudou(); };
    txt.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); } };
    const novoCartao = () => { if (!modoCodigo) { ed.novoCartao(); return; } txt.focus(); txt.setRangeText(`${txt.value && !txt.value.endsWith('\n') ? '\n' : ''}@ `, txt.selectionStart, txt.selectionEnd, 'end'); txt.dispatchEvent(new Event('input')); };

    corpo.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.modo) modo(b.dataset.modo === 'codigo');
      else if (b.dataset.ins) { const k = b.dataset.ins; if (k === 'negrito') ed.negrito(); else if (k === 'destaque') ed.destaque(); else ed.tipo(k); }
      else if (b.dataset.mod) { const i = Number(b.dataset.mod.slice(1)); aplicarModelo((b.dataset.mod[0] === 'p' ? padrao[i] : modelos().meus[i]).texto); }
      else if (b.dataset.exclMod != null) { const lista = modelos().meus, i = Number(b.dataset.exclMod), m = lista[i]; salvarModelos(lista.filter((_, j) => j !== i)); desenharCriar(corpo); ctx.aviso(`Modelo "${m.nome}" excluído.`, { texto: 'Desfazer', fazer: () => { salvarModelos([...modelos().meus, m]); desenharCriar(corpo); } }); }
      else if (b.id === 'bt-novo-mod') { $('#novo-mod').hidden = false; $('#nome-mod').focus(); }
      else if (b.id === 'no-mod') $('#novo-mod').hidden = true;
      else if (b.id === 'ok-mod') {
        const nome = $('#nome-mod').value.trim(); if (!nome) { $('#nome-mod').focus(); return; }
        if (!fonteAtual().trim()) { erro('Escreva o cartão modelo no editor antes de guardá-lo.'); return; }
        const t = fonteAtual(); salvarModelos([...modelos().meus.filter((m) => m.nome !== nome), { nome, texto: t }]); desenharCriar(corpo); definirTexto(t); ctx.aviso(`Modelo "${nome}" guardado.`);
      }
      else if (b.id === 'bt-salvar') salvar();
      else if (b.id === 'bt-limpar') limpar();
      else if (b.id === 'bt-novo-cartao') novoCartao();
      else if (b.id === 'bt-opcoes') alternarOpcoes();
      else if (b.id === 'bt-slide') abrirSlide();
      else if (b.id === 'bt-cartao') { if (blocos.alternar('pv')) previa(); else ed.foco(); }
      else if (b.id === 'bt-fmt') { barraOn = !barraOn; b.setAttribute('aria-pressed', String(barraOn)); $('#fc-barra').hidden = modoCodigo || !barraOn; (modoCodigo ? txt : edEl).focus(); }
      else if (b.id === 'pv-fechar') fecharBloco('pv');
      else if (b.id === 'ant') ed.irParaCartao(Math.max(0, rascunho.atual - 1)); else if (b.id === 'prox') ed.irParaCartao(Math.min(ed.total() - 1, rascunho.atual + 1));
    };
    $('#fc-barra').onmousedown = (e) => e.preventDefault();
    corpo.onchange = (e) => {
      if (e.target.id === 'sel-aula') { rascunho.aula = e.target.value; pref.gravar('ohara.fc.aula', rascunho.aula); previa(); if (blocos.aberto('sl')) slide.carregar(rascunho.aula); }
      else if (e.target.id === 'etq') { rascunho.etiquetas = e.target.value; pref.gravar('ohara.fc.etiquetas', rascunho.etiquetas); }
    };
    corpo.onkeydown = (e) => {
      if (e.target.id === 'nome-mod' && e.key === 'Enter') { e.preventDefault(); $('#ok-mod').click(); }
      else if (e.target.id === 'nome-mod' && e.key === 'Escape') { e.stopPropagation(); $('#novo-mod').hidden = true; ed.foco(); }
      else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); salvar(); }
      else if (e.target.closest?.('#t-pre') && !e.altKey && !e.ctrlKey) {
        if (e.key === 'j') $('#previa').scrollBy({ top: 80 }); else if (e.key === 'k') $('#previa').scrollBy({ top: -80 });
        else if (e.key === 'ArrowRight' || e.key === 'n') ed.irParaCartao(Math.min(ed.total() - 1, rascunho.atual + 1)); else if (e.key === 'ArrowLeft' || e.key === 'p') ed.irParaCartao(Math.max(0, rascunho.atual - 1));
      }
    };
    // teclas do sistema de blocos (registro central): Alt S slide, Alt N cartão novo, Alt F ampliar, Alt Q fechar, Alt X trocar o lado, Alt [ e ] passam o slide
    const desregistrar = registrar({
      'Alt+KeyO': () => alternarOpcoes(), 'Alt+KeyS': abrirSlide, 'Alt+KeyN': novoCartao, 'Alt+KeyF': () => blocos.ampliar(), 'Alt+KeyQ': () => fecharBloco(blocos.comFoco()), 'Alt+KeyX': () => blocos.trocarLado(),
      'Alt+BracketRight': () => { if (blocos.aberto('sl')) slide.proxima(); }, 'Alt+BracketLeft': () => { if (blocos.aberto('sl')) slide.anterior(); },
    });
    const aoMover = (e) => { if (blocos.abertos().length > 1 && blocos.moverFoco(e.detail.direcao)) e.preventDefault(); };   // Alt H J K L entre blocos
    raiz.addEventListener('ohara-mover', aoMover);

    if (pref.ler('ohara.fc.opcoes') === '1') { $('#fc-opcoes').hidden = false; $('#bt-opcoes').setAttribute('aria-expanded', 'true'); }
    modo(false); definirTexto(rascunho.texto); previa(); setTimeout(() => ed.foco(), 0);
    return () => { clearTimeout(atrasoPrevia); ed.destruir(); slide.destruir(); desregistrar(); raiz.removeEventListener('ohara-mover', aoMover); };
  }
  return desenharCriar;
}
