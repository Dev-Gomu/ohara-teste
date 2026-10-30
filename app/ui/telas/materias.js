// Tela Matérias: cards "Editorial" (cor cheia, sigla grande, nome em caixa-alta e rodapé com o dia da semana e o horário da próxima aula).
// Criar (com cor), renomear no próprio card, mudar sigla e cor e excluir (vai para a lixeira, com "Desfazer"). Mouse, toque e teclado:
// o ⋯ abre as opções (clique direito e toque longo também); setas andam pelos cards; Enter abre; F2 renomeia; Delete exclui; M abre as opções; N cria.
import { abrirMenu, fecharMenu } from '../menu.js';
import { escaparHtml } from '../../nucleo/texto.js';
import { siglaDaMateria, ativas, criarMateria, alterarMateria, excluirMateria, restaurarMateria, PALETA, corCss, proximaCor } from '../../nucleo/materias.js';
import { rotuloDoCard } from '../../nucleo/aulas.js';
import { diaDaSemana } from '../../nucleo/datas.js';
import { diaDe } from '../foco_servico.js';

const dois = (n) => String(n).padStart(2, '0');
const agoraLocal = (ms) => { const d = new Date(ms); return `${diaDe(ms)}T${dois(d.getHours())}:${dois(d.getMinutes())}`; };

export function desenharMaterias(raiz, ctx) {
  let criando = false, renomeando = null, corEscolhida = null, erro = '', foco = null;
  const excluidas = [];   // ids excluídos nesta tela (Ctrl+Z desfaz o último)
  const lista = () => ativas(ctx.sessao.estado().disciplinas);

  const bolas = (sel) => PALETA.map((c) => `<button type="button" class="cor ${c === sel ? 'on' : ''}" data-cor="${c}" aria-label="Cor ${c}" style="background:${corCss(c)}"></button>`).join('');

  function desenhar() {
    const l = lista();
    raiz.innerHTML = `<h1>Matérias</h1><p class="sub">${l.length ? `${l.length} ${l.length === 1 ? 'matéria' : 'matérias'}` : 'Nenhuma matéria ainda.'}</p>` +
      (criando ? `<form class="card form" id="nova"><label class="c">Nome da matéria<input class="in" name="nome" maxlength="80" autocomplete="off" required></label><label class="c">Sigla na capa (opcional, até 4 letras)<input class="in curto" name="sigla" maxlength="4" autocomplete="off" placeholder="3 primeiras letras"></label>` +
        `<div class="cores" role="group" aria-label="Cor">${bolas(corEscolhida)}</div>${erro ? `<p class="erro">${escaparHtml(erro)}</p>` : ''}` +
        `<div class="acoes"><button class="btn" type="submit">Criar</button><button class="btn sec" type="button" data-a="cancelar">Cancelar</button></div></form>`
        : `<p><button class="btn" type="button" data-a="nova">Nova matéria</button></p>`) +
      (l.length ? `<div class="mcs" role="list">${l.map((d) => card(d)).join('')}</div>` : '');
    const campo = raiz.querySelector('input[name="nome"]');
    if (campo) { campo.focus(); if (campo.classList.contains('nm-in')) campo.select(); }
    else if (foco != null) { raiz.querySelector(`.mc[data-id="${foco}"] .mc-abrir`)?.focus({ preventScroll: true }); }
  }

  function card(d) {
    const sigla = siglaDaMateria(d), r = rotuloDoCard(ctx.sessao.estado(), d.id, agoraLocal(ctx.agora()), diaDaSemana);
    const nome = renomeando === d.id
      ? `<input class="nm-in" name="nome" maxlength="80" value="${escaparHtml(d.nome)}" autocomplete="off" aria-label="Nome da matéria">`
      : `<span class="nm">${escaparHtml(d.nome)}</span>`;
    return `<div class="mc${r.agora ? ' ag' : ''}" role="listitem" data-id="${d.id}" style="--c:${corCss(d.cor)}">` +
      `<a class="mc-abrir" href="#materias/${d.id}" aria-label="Abrir ${escaparHtml(d.nome)}${r.texto ? `. Próxima aula: ${escaparHtml(r.texto)}` : ''}"></a>` +
      `<div class="mc-topo"><span class="gg">${escaparHtml(sigla)}</span>${nome}</div>` +
      `<div class="mc-pe"><span class="rt">${escaparHtml(r.texto)}</span><button class="mais" type="button" tabindex="-1" data-a="menu" data-id="${d.id}" aria-label="Mais opções de ${escaparHtml(d.nome)}" aria-haspopup="menu">⋯</button></div></div>`;
  }

  function tentar(acao) {
    try { acao(); erro = ''; return true; } catch (e) { erro = e.message; ctx.aviso(erro); return false; }
  }

  // ----- ações -----
  function comecarRenomear(id) { fecharMenu(); renomeando = id; criando = false; foco = id; desenhar(); }
  function terminarRenomear(salvar) {
    const campo = raiz.querySelector('.nm-in'); if (!campo || renomeando == null) return;
    const id = renomeando;
    if (salvar && campo.value.trim() !== (lista().find((d) => d.id === id)?.nome ?? '')) {
      if (!tentar(() => ctx.sessao.aplicar((e) => alterarMateria(e, id, { nome: campo.value })))) { campo.focus(); return; }
    }
    renomeando = null; foco = id; desenhar();
  }
  function excluirDaLista(id) {
    const nome = lista().find((d) => d.id === id)?.nome, ids = lista().map((d) => d.id), i = ids.indexOf(id);
    if (tentar(() => ctx.sessao.aplicar((e) => excluirMateria(e, id, new Date().toISOString())))) {
      excluidas.push(id); foco = ids[i + 1] ?? ids[i - 1] ?? null; desenhar();
      ctx.aviso(`"${nome}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => desfazer(id) });
    }
  }
  function desfazer(id = excluidas.pop()) {
    if (id == null) return; const i = excluidas.indexOf(id); if (i >= 0) excluidas.splice(i, 1);
    ctx.sessao.aplicar((e) => restaurarMateria(e, id)); foco = id; desenhar();
  }
  function painelAparencia(ancora, id) {
    const d = lista().find((x) => x.id === id); if (!d) return; fecharMenu();
    const p = document.createElement('div'); p.className = 'menu-pop mc-painel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Sigla e cor');
    let cor = d.cor;
    p.innerHTML = `<div class="tit">Sigla e cor</div><label class="c">Sigla na capa (até 4 letras)<input class="in curto" name="sigla" maxlength="4" value="${escaparHtml(d.sigla ?? '')}" placeholder="${escaparHtml(siglaDaMateria({ nome: d.nome }))}" autocomplete="off"></label>` +
      `<div class="cores" role="radiogroup" aria-label="Cor">${PALETA.map((c) => `<button type="button" role="radio" aria-checked="${c === d.cor}" class="cor${c === d.cor ? ' on' : ''}" data-cor="${c}" style="background:${corCss(c)}" aria-label="Cor ${c}"></button>`).join('')}</div>` +
      `<div class="acoes"><button class="btn peq sec" type="button" data-p="cancelar">Cancelar</button><button class="btn peq" type="button" data-p="salvar">Salvar</button></div>`;
    document.body.appendChild(p);
    const r = ancora.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    p.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    const fechar = () => { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', tecla, true); p.remove(); foco = id; raiz.querySelector(`.mc[data-id="${id}"] .mc-abrir`)?.focus({ preventScroll: true }); };
    const salvar = () => { if (tentar(() => ctx.sessao.aplicar((e) => alterarMateria(e, id, { cor, sigla: p.querySelector('input').value })))) { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', tecla, true); p.remove(); foco = id; desenhar(); } };
    const fora = (e) => { if (!p.contains(e.target)) fechar(); };
    const tecla = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); fechar(); return; }
      const cs = [...p.querySelectorAll('.cor')], i = cs.indexOf(document.activeElement);
      if (i >= 0 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); cs[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? cs.length - 1 : 1)) % cs.length].click(); cs.find((x) => x.classList.contains('on')).focus(); }
      else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); salvar(); }
    };
    p.onclick = (e) => {
      const b = e.target.closest('[data-cor], [data-p]'); if (!b) return;
      if (b.dataset.cor) { cor = b.dataset.cor; p.querySelectorAll('.cor').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); }
      else if (b.dataset.p === 'salvar') salvar(); else fechar();
    };
    setTimeout(() => document.addEventListener('pointerdown', fora, true)); document.addEventListener('keydown', tecla, true);
    p.querySelector('input').focus();
  }
  function abrirOpcoes(id) {
    const ancora = raiz.querySelector(`.mc[data-id="${id}"] .mais`); if (!ancora) return; foco = id;
    abrirMenu(ancora, [
      { rotulo: 'Renomear (F2)', fazer: () => comecarRenomear(id) },
      { rotulo: 'Mudar sigla e cor', fazer: () => painelAparencia(ancora, id) },
      { sep: true }, { rotulo: 'Excluir (vai para a lixeira)', perigo: true, fazer: () => excluirDaLista(id) }]);
  }

  // ----- mouse e toque -----
  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-a], [data-cor]'); if (!b) return;
    if (b.dataset.cor) { corEscolhida = b.dataset.cor; raiz.querySelectorAll('.cor').forEach((x) => x.classList.toggle('on', x === b)); return; }
    switch (b.dataset.a) {
      case 'nova': criando = true; renomeando = null; erro = ''; corEscolhida = proximaCor(ctx.sessao.estado()); desenhar(); break;
      case 'cancelar': criando = false; erro = ''; desenhar(); break;
      case 'menu': abrirOpcoes(Number(b.dataset.id)); break;
    }
  };
  raiz.oncontextmenu = (ev) => { const c = ev.target.closest('.mc'); if (!c || ev.target.closest('.nm-in')) return; ev.preventDefault(); abrirOpcoes(Number(c.dataset.id)); };   // clique direito e toque longo
  raiz.onsubmit = (ev) => {
    ev.preventDefault();
    if (ev.target.id === 'nova') {
      const f = new FormData(ev.target);
      if (tentar(() => ctx.sessao.aplicar((e) => criarMateria(e, { nome: f.get('nome'), cor: corEscolhida, sigla: f.get('sigla') }, new Date().toISOString()).estado))) { criando = false; desenhar(); }
    }
  };
  raiz.onfocusout = (ev) => { if (ev.target.classList?.contains('nm-in')) setTimeout(() => { if (renomeando != null && !raiz.querySelector('.nm-in:focus')) terminarRenomear(true); }); };

  // ----- teclado -----
  raiz.onkeydown = (ev) => {
    const alvo = ev.target;
    if (alvo.classList?.contains('nm-in')) {
      if (ev.key === 'Enter') { ev.preventDefault(); terminarRenomear(true); } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); renomeando = null; desenhar(); }
      return;
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || ev.altKey) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); desfazer(); return; }
    if (ev.ctrlKey || ev.metaKey) return;
    if (ev.key.toLowerCase() === 'n' && !ev.shiftKey && !alvo.closest?.('form')) { ev.preventDefault(); raiz.querySelector('[data-a="nova"]')?.click(); return; }
    const c = alvo.closest?.('.mc'); if (!c || !alvo.classList.contains('mc-abrir')) return;
    const id = Number(c.dataset.id), cs = [...raiz.querySelectorAll('.mc')], i = cs.indexOf(c);
    const cols = Math.max(1, new Set(cs.map((x) => Math.round(x.getBoundingClientRect().left))).size);
    const ir = (j) => { if (cs[j]) { ev.preventDefault(); foco = Number(cs[j].dataset.id); cs[j].querySelector('.mc-abrir').focus(); } };
    if (ev.key === 'ArrowRight') ir(i + 1); else if (ev.key === 'ArrowLeft') ir(i - 1); else if (ev.key === 'ArrowDown') ir(i + cols); else if (ev.key === 'ArrowUp') ir(i - cols);
    else if (ev.key === 'Home') ir(0); else if (ev.key === 'End') ir(cs.length - 1);
    else if (ev.key === 'F2') { ev.preventDefault(); comecarRenomear(id); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); excluirDaLista(id); }
    else if (ev.key.toLowerCase() === 'm' || ev.key === 'ContextMenu' || (ev.shiftKey && ev.key === 'F10')) { ev.preventDefault(); abrirOpcoes(id); }
  };
  desenhar();
  return () => { fecharMenu(); raiz.onkeydown = raiz.oncontextmenu = raiz.onfocusout = null; };
}
