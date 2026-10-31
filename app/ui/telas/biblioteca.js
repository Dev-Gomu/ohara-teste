// Acervo (a Biblioteca): tudo o que você guardou. Duas visões no mesmo lugar: as matérias (cards) e todos os cartões (o antigo Gerenciar).
// "Criar ›" (Alt C) abre a Área de trabalho, na aba de cartões, na aula certa. Em Matérias há também os anos: "Encerrar o ano" arquiva as
// matérias de hoje num grupo (pasta no alto, como as pastas da matéria) e os anos arquivados abrem só para consulta (nucleo/anos.js).
import { desenharMaterias } from './materias.js';
import { desenharCartoes } from './flashcards/gerenciar.js';
import { aulaParaCriar } from '../../nucleo/aulas.js';
import { encerrarAno, reabrirAno, anosEncerrados, materiasDoAno, materiasDoAnoAtual, resumoDoAno } from '../../nucleo/anos.js';
import { siglaDaMateria, corCss } from '../../nucleo/materias.js';
import { escaparHtml } from '../../nucleo/texto.js';
import { registrar } from '../atalhos.js';
import * as pref from '../preferencias.js';

const PASTA = '<svg class="mt-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const u = (n, um, vp) => `${n} ${n === 1 ? um : vp}`;

/** `modo`: 'materias' (cards das matérias) ou 'cartoes' (todos os cartões). Devolve a função de limpeza. */
export function desenharBiblioteca(raiz, ctx, modo = 'materias') {
  const cartoes = modo === 'cartoes', sessao = ctx.sessao;
  let anoSel = Number(pref.ler('ohara.ano.sel')) || null, limpezaCorpo = null, dialogo = null;
  const completo = () => sessao.estadoCompleto();

  raiz.innerHTML = `<div class="fc"><div class="fc-topo"><h1>Acervo</h1><div class="fc-abas" role="tablist" aria-label="Acervo">` +
    `<button type="button" role="tab" data-ir="#materias" aria-selected="${!cartoes}" class="${cartoes ? '' : 'on'}">Matérias</button>` +
    `<button type="button" role="tab" data-ir="#cartoes" aria-selected="${cartoes}" class="${cartoes ? 'on' : ''}">Todos os cartões</button>` +
    (cartoes ? '<button type="button" data-criar="1" title="Criar cartões na Área de trabalho (Alt C)">Criar ›<kbd>Alt C</kbd></button>' : '<button type="button" data-encerrar="1" title="Arquivar as matérias de hoje num ano">Encerrar o ano</button>') +
    `</div></div><div id="bib-anos"></div><div class="fc-corpo ${cartoes ? 'fc-gerenciar' : 'fc-materias'}" id="bib-corpo"></div></div>`;
  const corpo = raiz.querySelector('#bib-corpo'), faixa = raiz.querySelector('#bib-anos');

  function criar() {
    const d = new Date(ctx.agora()), p = (n) => String(n).padStart(2, '0');
    const aula = aulaParaCriar(sessao.estado(), pref.ler('ohara.at.ultima'), `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
    if (!aula) { ctx.aviso('Crie uma matéria e uma aula primeiro.'); return; }
    location.hash = `#aula/${aula.id}?cartoes`;
  }

  // ----- anos -----
  function montarAnos() {
    const e = completo(), anos = anosEncerrados(e);
    if (anoSel != null && !anos.some((a) => a.id === anoSel)) anoSel = null;
    const btn = raiz.querySelector('[data-encerrar]'); if (btn) btn.hidden = !materiasDoAnoAtual(e).length;
    if (cartoes || !anos.length) { faixa.innerHTML = ''; return; }
    const item = (id, nome, n, extra) => `<div class="mt-pasta${anoSel === id ? ' on' : ''}" role="button" tabindex="0" data-ano="${id ?? 'atual'}">${PASTA}<b>${escaparHtml(nome)}</b><small>${u(n, 'matéria', 'matérias')}${extra}</small></div>`;
    faixa.innerHTML = `<div class="mt-pastas an-pastas">${item(null, 'Ano atual', materiasDoAnoAtual(e).length, '')}${anos.map((a) => item(a.id, a.nome, materiasDoAno(e, a.id).length, ' · arquivado')).join('')}</div>`;
  }
  function montarCorpo() {
    limpezaCorpo?.(); limpezaCorpo = null; montarAnos();
    if (cartoes) { limpezaCorpo = desenharCartoes(corpo, ctx); return; }
    if (anoSel == null) { limpezaCorpo = desenharMaterias(corpo, ctx); return; }
    const e = completo(), ano = anosEncerrados(e).find((a) => a.id === anoSel), r = resumoDoAno(e, anoSel);
    corpo.innerHTML = `<div class="mt-so an-faixa"><span><b>${escaparHtml(ano.nome)}</b> · só consulta. ${u(r.aulas, 'aula', 'aulas')} e ${u(r.cartoes, 'cartão', 'cartões')} guardados.</span><button type="button" class="mt-btn mt-sec" data-reabrir="${ano.id}">Reabrir ano</button></div>` +
      `<div class="mcs" role="list">${materiasDoAno(e, anoSel).map((d) => { const x = resumoDoAno({ ...e, disciplinas: [d] }, anoSel);
        return `<div class="mc ar" role="listitem" data-id="${d.id}" style="--c:${corCss(d.cor)}"><a class="mc-abrir" href="#materias/${d.id}" aria-label="Abrir ${escaparHtml(d.nome)} (ano arquivado)"></a><div class="mc-topo"><span class="gg">${escaparHtml(siglaDaMateria(d))}</span><span class="nm">${escaparHtml(d.nome)}</span></div><div class="mc-pe"><span class="rt">${u(x.aulas, 'aula', 'aulas')} · ${u(x.cartoes, 'cartão', 'cartões')}</span></div></div>`; }).join('')}</div>`;
  }
  function escolherAno(id) { anoSel = id; pref.gravar('ohara.ano.sel', id == null ? '' : String(id)); montarCorpo(); }

  function abrirDialogo() {
    if (dialogo) return;
    const e = completo(), r = resumoDoAno(e, null);
    if (!r.materias) { ctx.aviso('Não há matérias no ano atual para encerrar.'); return; }
    const el = document.createElement('div'); el.className = 'an-veu'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Encerrar o ano');
    el.innerHTML = `<form class="an-dlg"><h2>Encerrar o ano</h2><p>As ${u(r.materias, 'matéria', 'matérias')} de hoje vão para um grupo arquivado. Nada é apagado.</p>` +
      `<label class="c">Nome do ano<input class="in" name="nome" maxlength="80" autocomplete="off" placeholder="Ex.: 2º ano de medicina" required></label>` +
      `<div class="an-nums"><div><b>${r.materias}</b><small>${r.materias === 1 ? 'matéria' : 'matérias'}</small></div><div><b>${r.aulas}</b><small>aulas</small></div><div><b>${r.cartoes}</b><small>cartões</small></div></div>` +
      `<ul class="an-lst"><li>Saem do Hub, da Agenda, do Treino e do planejamento de estudo.</li><li>Continuam no Acervo, em pastas no alto, só para consulta.</li><li>O histórico de estudo e a sequência de dias não mudam.</li><li>Dá para <b>reabrir o ano</b> depois, se encerrar sem querer.</li></ul>` +
      `<p class="erro" data-erro hidden></p><div class="an-acoes"><button type="button" class="mt-btn mt-sec" data-fechar>Cancelar</button><button type="submit" class="mt-btn">Encerrar o ano</button></div></form>`;
    document.body.appendChild(el); dialogo = el;
    const fechar = () => { document.removeEventListener('keydown', tecla, true); el.remove(); dialogo = null; };
    const tecla = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } };
    document.addEventListener('keydown', tecla, true);
    el.addEventListener('click', (ev) => { if (ev.target === el || ev.target.closest('[data-fechar]')) fechar(); });
    el.querySelector('form').onsubmit = (ev) => {
      ev.preventDefault();
      try {
        let id; sessao.aplicar((s) => { const x = encerrarAno(s, new FormData(ev.target).get('nome'), new Date().toISOString()); id = x.ano.id; return x.estado; });
        fechar(); anoSel = null; pref.gravar('ohara.ano.sel', ''); montarCorpo();
        ctx.aviso('Ano encerrado. As matérias foram para a pasta do ano.', { texto: 'Desfazer', fazer: () => { try { sessao.aplicar((s) => reabrirAno(s, id)); } catch (err) { ctx.aviso(err.message); } montarCorpo(); } });
      } catch (err) { const p = el.querySelector('[data-erro]'); p.textContent = err.message; p.hidden = false; }
    };
    el.querySelector('input').focus();
  }

  raiz.onclick = (e) => {
    const ir = e.target.closest('[data-ir]');
    if (ir) { location.hash = ir.dataset.ir; return; }
    if (e.target.closest('[data-criar]')) { criar(); return; }
    if (e.target.closest('[data-encerrar]')) { abrirDialogo(); return; }
    const re = e.target.closest('[data-reabrir]');
    if (re) { try { sessao.aplicar((s) => reabrirAno(s, Number(re.dataset.reabrir))); anoSel = null; pref.gravar('ohara.ano.sel', ''); montarCorpo(); ctx.aviso('Ano reaberto. As matérias voltaram para o ano atual.'); } catch (err) { ctx.aviso(err.message); } return; }
    const an = e.target.closest('[data-ano]');
    if (an) escolherAno(an.dataset.ano === 'atual' ? null : Number(an.dataset.ano));
  };
  raiz.onkeydown = (e) => { const an = e.target.closest?.('[data-ano]'); if (an && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); escolherAno(an.dataset.ano === 'atual' ? null : Number(an.dataset.ano)); } };
  const desregistrar = cartoes ? registrar({ 'Alt+KeyC': () => { criar(); } }) : () => {};
  montarCorpo();
  document.title = `${cartoes ? 'Todos os cartões' : 'Acervo'} · Ohara`;
  return () => { limpezaCorpo?.(); dialogo?.remove(); dialogo = null; desregistrar(); raiz.onclick = raiz.onkeydown = null; };
}
