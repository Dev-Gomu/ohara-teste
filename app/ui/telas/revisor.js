// Treino (revisor de flashcards): entrada calma com o número do dia e a escolha do que revisar (uma aula, o bimestre atual da matéria ou
// o ano inteiro dela), e a revisão em si: o cartão com a frente em faixa de cor sólida (como no editor), as 4 respostas com o intervalo
// de cada uma e o botão Editar, para corrigir um erro de digitação na hora. A agenda (SM-2) está em nucleo/revisao.js.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss, siglaDaMateria, imagensDoCartao } from '../../nucleo/materias.js';
import { alterarCartao, marcarCartao } from '../../nucleo/cartoes.js';
import { baralhosAtivos, criarBaralho, alterarBaralho, excluirBaralho, restaurarBaralho, resumoDoBaralho, lerIds } from '../../nucleo/baralhos.js';
import { provasFuturas } from '../../nucleo/planejador.js';
import { renderizarFrente, renderizarVerso } from '../../nucleo/flashcards_texto.js';
import { pastasDaMateria, aulasDaPasta } from '../../nucleo/pastas.js';
import { cartoesDaAula } from '../../nucleo/cartoes.js';
import { RESPOSTAS, responder, desfazerResposta, cartoesDoEscopo, filaDoTreino, contagemDoTreino, bimestreAtual, estatisticasDoTreino, rotulosDosBotoes } from '../../nucleo/revisao.js';
import { somarDias } from '../../nucleo/datas.js';
import { diaDe } from '../foco_servico.js';
import { registrar, foraDeCampos } from '../atalhos.js';
import * as pref from '../preferencias.js';

const NOMES = { errei: 'Errei', dificil: 'Difícil', bom: 'Bom', facil: 'Fácil' }, TECLAS = { Digit1: 'errei', Digit2: 'dificil', Digit3: 'bom', Digit4: 'facil' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ICO_ESTRELA = '<svg class="tr-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"/></svg>';
const ICO_DESFAZER = '<svg class="tr-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5L4 10l5 5"/><path d="M4 10h9a6 6 0 0 1 0 12h-3"/></svg>';
const u = (n, um, vp) => `${n} ${n === 1 ? um : vp}`;

export function desenharRevisor(raiz, ctx) {
  const sessao = ctx.sessao;
  document.title = 'Treino · Ohara';
  let fila = [], hist = [], dlg = null, pos = 0, revelado = false, editando = false, erro = '', resumo = null, urls = [], geracao = 0, desregistrar = () => {};

  const hoje = () => diaDe(ctx.agora());
  const agoraLocal = () => { const d = new Date(ctx.agora()), p = (n) => String(n).padStart(2, '0'); return `${hoje()}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const soltar = () => { urls.forEach((x) => URL.revokeObjectURL(x)); urls = []; };

  // ----- o que revisar -----
  const lerEscolha = () => ({ materia: Number(pref.ler('ohara.tr.materia')) || null, modo: ['aula', 'bimestre', 'ano'].includes(pref.ler('ohara.tr.modo')) ? pref.ler('ohara.tr.modo') : 'ano', aula: Number(pref.ler('ohara.tr.aula')) || null, origem: ['materia', 'baralho', 'marcados'].includes(pref.ler('ohara.tr.origem')) ? pref.ler('ohara.tr.origem') : 'materia', baralho: Number(pref.ler('ohara.tr.baralho')) || null });
  function escopoDe(e, esc) {
    if (esc.origem === 'marcados') return { tipo: 'marcados' };
    if (esc.origem === 'baralho') return { tipo: 'baralho', baralhoId: esc.baralho ?? -1 };
    if (!esc.materia) return { tipo: 'tudo' };
    if (esc.modo === 'aula') return esc.aula ? { tipo: 'aula', aulaId: esc.aula } : { tipo: 'aula', aulaId: -1 };
    if (esc.modo === 'bimestre') { const p = bimestreAtual(e, esc.materia, agoraLocal()); return p == null ? { tipo: 'aula', aulaId: -1 } : { tipo: 'bimestre', materiaId: esc.materia, pastaId: p }; }
    return { tipo: 'ano', materiaId: esc.materia };
  }

  function entrada() {
    desregistrar(); soltar(); fila = []; resumo = null;
    const e = sessao.estado(), mats = ativas(e.disciplinas);
    let esc = lerEscolha();
    if (esc.materia && !mats.some((m) => m.id === esc.materia)) esc.materia = null;
    const aulasMat = esc.materia ? ativas(e.aulas).filter((a) => a.disciplina_id === esc.materia).sort((x, y) => (y.inicio ?? '').localeCompare(x.inicio ?? '')) : [];
    if (esc.modo === 'aula' && esc.materia && !aulasMat.some((a) => a.id === esc.aula)) esc.aula = (aulasMat.find((a) => a.id === Number(pref.ler('ohara.at.ultima'))) ?? aulasMat.find((a) => cartoesDaAula(e, a.id).length) ?? aulasMat[0])?.id ?? null;
    const bars = baralhosAtivos(e), nMarcados = cartoesDoEscopo(e, { tipo: 'marcados' }).length;
    if (esc.origem === 'marcados' && !nMarcados) esc.origem = 'materia';
    if (esc.origem === 'baralho' && !bars.some((b) => b.id === esc.baralho)) esc.baralho = bars[0]?.id ?? null;
    const escopo = escopoDe(e, esc), c = contagemDoTreino(e, escopo, hoje()), todos = filaDoTreino(e, escopo, hoje(), { todos: true }).length;
    const pastaAtual = esc.materia ? pastasDaMateria(e, esc.materia).find((p) => p.id === bimestreAtual(e, esc.materia, agoraLocal())) : null;
    const st = estatisticasDoTreino(e, hoje()), dsem = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
    const seg = (modo, rot, extra = '', off = false) => `<button type="button" class="${esc.modo === modo ? 'on' : ''}" data-modo="${modo}" ${off ? 'disabled' : ''} ${extra}>${rot}</button>`;
    const segO = (o, rot, off = false) => `<button type="button" class="${esc.origem === o ? 'on' : ''}" data-origem="${o}" ${off ? 'disabled' : ''}>${rot}</button>`;
    const segOrigem = `<div class="tr-seg" role="group" aria-label="De onde vêm os cartões">${segO('materia', 'Por matéria')}${segO('baralho', `Baralhos${bars.length ? ` · ${bars.length}` : ''}`)}${segO('marcados', `Marcados${nMarcados ? ` · ${nMarcados}` : ''}`, !nMarcados)}</div>`;
    const dia = (d) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;
    const atual = bars.find((b) => b.id === esc.baralho), rb = atual ? resumoDoBaralho(e, atual) : null;
    const painelOrigem = esc.origem === 'marcados' ? '<div class="tr-sub tr-peq">Os cartões marcados com estrela (tecla M na revisão), de todas as matérias.</div>'
      : esc.origem !== 'baralho' ? '' : bars.length
        ? `<label>Baralho<select class="in" data-k="baralho">${bars.map((b) => `<option value="${b.id}" ${b.id === esc.baralho ? 'selected' : ''}>${escaparHtml(b.nome)}</option>`).join('')}</select></label>` +
          `<div class="tr-sub tr-peq">${u(rb.aulas, 'aula', 'aulas')}${rb.provas.length ? ' · ' + rb.provas.map((p) => `${escaparHtml(p.titulo)} (${dia(p.data)})`).join(', ') : ''}</div>` +
          '<div class="tr-linha"><button type="button" class="tr-link" data-a="baralho-novo">+ Novo baralho</button><button type="button" class="tr-link" data-a="baralho-editar">Editar</button><button type="button" class="tr-link" data-a="baralho-excluir">Excluir</button></div>'
        : '<div class="tr-sub tr-peq">Um baralho junta as aulas de uma ou mais provas (ou aulas que você escolher) num treino só: a semana de provas, uma prova específica.</div><div class="tr-linha"><button type="button" class="tr-link" data-a="baralho-novo">+ Criar o primeiro baralho</button></div>';
    raiz.className = 'tr';
    raiz.innerHTML = `<div class="tr-entrada"><div class="tr-ent"><div class="tr-cap">Treino de hoje</div><div class="tr-big">${c.total}</div>` +
      `<div class="tr-sub">${c.total ? `${u(c.total, 'cartão', 'cartões')} · cerca de ${u(c.minutos, 'minuto', 'minutos')}` : todos ? 'Tudo em dia por aqui. Nada vence hoje.' : 'Ainda não há cartões neste escopo.'}</div>` +
      `<div class="tr-chips"><span class="tr-chip">${u(c.novos, 'novo', 'novos')}</span><span class="tr-chip">${c.vencidos} de revisão</span></div>` +
      `<button type="button" class="tr-go" data-a="comecar" ${c.total ? '' : 'disabled'}>Começar<kbd>Enter</kbd></button>` +
      (!c.total && todos ? `<button type="button" class="tr-link" data-a="todos">Revisar mesmo assim (${u(todos, 'cartão', 'cartões')})</button>` : c.total && todos > c.total ? `<button type="button" class="tr-link" data-a="todos">Revisar todos, mesmo sem vencer (${todos})</button>` : '') +
      `<div class="tr-esc">${segOrigem}${painelOrigem}` + (esc.origem !== 'materia' ? '' : `<label>Matéria<select class="in" data-k="materia"><option value="">Todas as matérias</option>${mats.map((m) => `<option value="${m.id}" ${m.id === esc.materia ? 'selected' : ''}>${escaparHtml(m.nome)}</option>`).join('')}</select></label>`) +
      (esc.origem !== 'materia' ? '' : esc.materia ? `<div class="tr-seg" role="group" aria-label="O que revisar">${seg('aula', 'Uma aula')}${seg('bimestre', pastaAtual ? `Bimestre atual · ${escaparHtml(pastaAtual.nome)}` : 'Bimestre atual', pastaAtual ? '' : 'title="Crie pastas (bimestres) na matéria e ponha as aulas nelas"', !pastaAtual)}${seg('ano', 'Ano inteiro')}</div>` : '<div class="tr-sub tr-peq">Todas as matérias do ano atual.</div>') +
      (esc.origem === 'materia' && esc.materia && esc.modo === 'aula' ? `<label>Aula<select class="in" data-k="aula">${aulasMat.map((a) => { const d = a.inicio ? `${Number(a.inicio.slice(8, 10))} ${MESES[Number(a.inicio.slice(5, 7)) - 1]} · ` : ''; return `<option value="${a.id}" ${a.id === esc.aula ? 'selected' : ''}>${escaparHtml(d + a.titulo)} (${cartoesDaAula(e, a.id).length})</option>`; }).join('') || '<option value="">Sem aulas</option>'}</select></label>` : '') + '</div></div>' +
      `<div class="tr-sem" aria-label="Últimos 7 dias">${st.ultimos7.map((f, i) => `<span class="${f ? 'f' : ''}">${dsem[(new Date(`${somarDias(hoje(), i - 6)}T12:00:00`).getDay() + 6) % 7]}</span>`).join('')}</div>` +
      `<div class="tr-sub">${st.sequencia ? `Sequência de ${u(st.sequencia, 'dia', 'dias')}` : 'Sem sequência ainda'}${st.acertos7 != null ? ` · acertos ${st.acertos7}% (7 dias)` : ''}</div></div>`;
    desregistrar = registrar({ Enter: foraDeCampos(() => { if (!c.total) return false; comecar(escopo, false); }) });
    raiz.onchange = (ev) => {
      const k = ev.target.dataset.k; if (!k) return;
      if (k === 'materia') { pref.gravar('ohara.tr.materia', ev.target.value); pref.gravar('ohara.tr.aula', ''); } else if (k === 'baralho') pref.gravar('ohara.tr.baralho', ev.target.value); else pref.gravar('ohara.tr.aula', ev.target.value);
      entrada();
    };
    raiz.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.modo) { pref.gravar('ohara.tr.modo', b.dataset.modo); entrada(); }
      else if (b.dataset.origem) { pref.gravar('ohara.tr.origem', b.dataset.origem); entrada(); }
      else if (b.dataset.a === 'baralho-novo') abrirBaralho(null);
      else if (b.dataset.a === 'baralho-editar') abrirBaralho(atual);
      else if (b.dataset.a === 'baralho-excluir') excluirAtual(atual);
      else if (b.dataset.a === 'comecar') comecar(escopo, false);
      else if (b.dataset.a === 'todos') comecar(escopo, true);
    };
  }

  // ----- baralhos (estudo personalizado) -----
  function excluirAtual(b) {
    if (!b) return;
    sessao.aplicar((e) => excluirBaralho(e, b.id, new Date(ctx.agora()).toISOString()));
    ctx.aviso(`Baralho "${b.nome}" excluído. Os cartões continuam onde estavam.`, { texto: 'Desfazer', fazer: () => { try { sessao.aplicar((e) => restaurarBaralho(e, b.id)); } catch (err) { ctx.aviso(err.message); } entrada(); } });
    entrada();
  }

  /** Janela para criar ou editar um baralho: nome, as provas (cada uma traz as aulas dela) e aulas soltas. */
  function abrirBaralho(existente) {
    if (dlg) return;
    const e = sessao.estado(), sel = { provas: new Set(existente ? lerIds(existente.provas) : []), aulas: new Set(existente ? lerIds(existente.aulas) : []) };
    const nomeMat = new Map(ativas(e.disciplinas).map((d) => [d.id, d]));
    const provas = ativas(e.provas ?? []).filter((p) => nomeMat.has(p.disciplina_id) && (p.data >= somarDias(hoje(), -14) || sel.provas.has(p.id))).sort((a, b) => a.data.localeCompare(b.data));
    const dia = (d) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;
    const el = document.createElement('div'); el.className = 'an-veu'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', existente ? 'Editar baralho' : 'Novo baralho');
    el.innerHTML = `<form class="an-dlg tr-dlg"><h2>${existente ? 'Editar baralho' : 'Novo baralho'}</h2>` +
      `<label class="tr-dlg-c">Nome<input class="in" name="nome" maxlength="60" autocomplete="off" placeholder="Ex.: Semana de provas, Prova de Fisiologia" value="${escaparHtml(existente?.nome ?? '')}" required></label>` +
      `<div class="tr-dlg-corpo"><div class="tr-dlg-t">Provas <button type="button" class="tr-link" data-a="semana">Provas dos próximos 7 dias</button></div>` +
      (provas.length ? provas.map((p) => `<label class="tr-dlg-l"><input type="checkbox" name="prova" value="${p.id}" ${sel.provas.has(p.id) ? 'checked' : ''}><span><b>${escaparHtml(p.titulo)}</b> · ${escaparHtml(siglaDaMateria(nomeMat.get(p.disciplina_id)))} · ${dia(p.data)}</span></label>`).join('') : '<p class="tr-peq">Nenhuma prova cadastrada na Agenda. Você ainda pode escolher aulas abaixo.</p>') +
      `<div class="tr-dlg-t">Aulas avulsas</div>` +
      ativas(e.disciplinas).map((d) => { const as = ativas(e.aulas).filter((a) => a.disciplina_id === d.id).sort((x, y) => (x.inicio ?? '').localeCompare(y.inicio ?? '')); if (!as.length) return '';
        return `<details class="tr-dlg-d" ${as.some((a) => sel.aulas.has(a.id)) ? 'open' : ''}><summary>${escaparHtml(d.nome)} <em>${as.length}</em></summary>${as.map((a) => `<label class="tr-dlg-l"><input type="checkbox" name="aula" value="${a.id}" ${sel.aulas.has(a.id) ? 'checked' : ''}><span>${a.inicio ? dia(a.inicio.slice(0, 10)) + ' · ' : ''}${escaparHtml(a.titulo)} <small>(${cartoesDaAula(e, a.id).length})</small></span></label>`).join('')}</details>`; }).join('') +
      `</div><p class="erro" data-erro hidden></p><div class="an-acoes"><button type="button" class="tr-btn sec" data-fechar>Cancelar</button><button type="submit" class="tr-btn">${existente ? 'Salvar' : 'Criar baralho'}</button></div></form>`;
    document.body.appendChild(el); dlg = el;
    const fechar = () => { document.removeEventListener('keydown', tecla, true); el.remove(); dlg = null; };
    const tecla = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } };
    document.addEventListener('keydown', tecla, true);
    el.addEventListener('click', (ev) => {
      if (ev.target === el || ev.target.closest('[data-fechar]')) fechar();
      else if (ev.target.closest('[data-a=semana]')) {   // marca as provas dos próximos 7 dias
        const limite = somarDias(hoje(), 7);
        el.querySelectorAll('input[name=prova]').forEach((i) => { const p = provas.find((x) => x.id === Number(i.value)); i.checked = !!p && p.data >= hoje() && p.data <= limite; });
        const nome = el.querySelector('input[name=nome]'); if (!nome.value.trim()) nome.value = 'Semana de provas';
      }
    });
    el.querySelector('form').onsubmit = (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target), dados = { nome: f.get('nome'), provas: f.getAll('prova').map(Number), aulas: f.getAll('aula').map(Number) };
      try {
        let id = existente?.id; const agora = new Date(ctx.agora()).toISOString();
        if (existente) sessao.aplicar((s) => alterarBaralho(s, id, dados)); else sessao.aplicar((s) => { const x = criarBaralho(s, dados, agora); id = x.baralho.id; return x.estado; });
        pref.gravar('ohara.tr.origem', 'baralho'); pref.gravar('ohara.tr.baralho', String(id));
        fechar(); entrada();
      } catch (err) { const pe = el.querySelector('[data-erro]'); pe.textContent = err.message; pe.hidden = false; }
    };
    el.querySelector('input[name=nome]').focus();
  }

  // ----- a revisão -----
  function ligarTeclas() {
    desregistrarEsc = registrar({ Escape: () => { if (editando) { editando = false; cartao(); return true; } if (resumo?.fim) return false; sair(); return true; } }, { captura: true });
    desregistrar = registrar({
      Space: foraDeCampos(() => { if (editando) return false; if (!revelado) { revelado = true; cartao(); } else responderCom('bom'); }),
      KeyZ: foraDeCampos(() => { if (editando || !hist.length) return false; desfazer(); }),
      KeyM: foraDeCampos(() => { if (editando || resumo?.fim || !fila.length) return false; marcar(); }),
      KeyE: foraDeCampos(() => { if (!fila.length || resumo?.fim) return false; editar(); }),
      ...Object.fromEntries(Object.entries(TECLAS).map(([k, r]) => [k, foraDeCampos(() => { if (!revelado || editando) return false; responderCom(r); })])),
    });
  }
  function comecar(escopo, todos) {
    desregistrar();
    fila = filaDoTreino(sessao.estado(), escopo, hoje(), { todos }).map((c) => c.id); hist = []; pos = 0; revelado = false; editando = false; erro = '';
    resumo = { errei: 0, dificil: 0, bom: 0, facil: 0, total: 0 };
    if (!fila.length) { entrada(); return; }
    ligarTeclas();
    cartao();
  }
  let desregistrarEsc = () => {};
  const sair = () => { desregistrarEsc(); entrada(); };

  function cartao() {
    if (pos >= fila.length) { fim(); return; }
    soltar(); const geracaoAtual = ++geracao;
    const e = sessao.estado(), c = e.cartoes.find((x) => x.id === fila[pos]);
    if (!c) { pos++; cartao(); return; }
    const aula = e.aulas.find((a) => a.id === c.aula_id), mat = aula && e.disciplinas.find((d) => d.id === aula.disciplina_id);
    const rev = e.revisoes.find((r) => r.cartao_id === c.id) ?? null, rot = rotulosDosBotoes(rev), n = imagensDoCartao(c);
    raiz.className = 'tr';
    const topo = `<div class="tr-bar"><button type="button" class="tr-sair" data-a="sair">‹ Sair do treino</button><span class="tr-esp"></span><span class="tr-sub tr-pos"><b>${Math.min(pos + 1, fila.length)}</b> de ${fila.length} · ${escaparHtml(mat ? siglaDaMateria(mat) : '')} · ${escaparHtml(aula?.titulo ?? '')}</span>` +
      (hist.length ? `<button type="button" class="tr-ed" data-a="desfazer" title="Desfazer a última resposta (Z)">${ICO_DESFAZER}Desfazer<kbd>Z</kbd></button>` : '') + `<button type="button" class="tr-ed tr-marca${c.marcado ? ' on' : ''}" data-a="marcar" aria-pressed="${c.marcado ? 'true' : 'false'}" title="${c.marcado ? 'Tirar a estrela' : 'Marcar com estrela, para rever depois'} (M)">${ICO_ESTRELA}${c.marcado ? 'Marcado' : 'Marcar'}<kbd>M</kbd></button><button type="button" class="tr-ed" data-a="editar" title="Corrigir este cartão (E)">Editar<kbd>E</kbd></button></div><div class="tr-prog"><i style="width:${Math.round(pos / fila.length * 100)}%"></i></div>`;
    if (editando) {
      raiz.innerHTML = `<div class="tr-rev" style="--mc:${corCss(mat?.cor)}">${topo}<form class="tr-card tr-edit" id="form-ed"><div class="tr-frente" data-rot="Editar o cartão"><label>Frente<textarea class="in" name="frente" rows="2">${escaparHtml(c.frente)}</textarea></label></div>` +
        `<div class="tr-corpo"><label>Verso<textarea class="in" name="verso" rows="6">${escaparHtml(c.verso)}</textarea></label><p class="tr-sub tr-peq">A mesma escrita do editor: <code>-</code> lista, <code>+</code> a favor, <code>--</code> contra, <code>?</code> dúvida, <code>**negrito**</code>. As imagens ficam como estão.</p>${erro ? `<p class="erro">${escaparHtml(erro)}</p>` : ''}` +
        `<div class="tr-acoes"><button type="button" class="tr-btn sec" data-a="cancelar-ed">Cancelar<kbd>Esc</kbd></button><button type="submit" class="tr-btn">Salvar<kbd>Ctrl Enter</kbd></button></div></div></form></div>`;
      const f = raiz.querySelector('#form-ed'); f.querySelector('textarea[name=frente]').focus();
      f.onkeydown = (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); f.requestSubmit(); } };
      f.onsubmit = (ev) => { ev.preventDefault(); const d = new FormData(f); try { sessao.aplicar((s) => alterarCartao(s, c.id, { frente: d.get('frente'), verso: d.get('verso') }, new Date().toISOString())); editando = false; erro = ''; ctx.aviso('Cartão corrigido.'); } catch (err) { erro = err.message; } cartao(); };
    } else {
      const ind = (l, nome) => `<span class="tr-ind" role="img" aria-label="${nome}" title="${nome}">${l}</span>`;   // bolinha F/V na quina: diz de que lado do cartão você está
      const tamF = c.frente.length > 380 ? 'xs' : c.frente.length > 240 ? 's' : c.frente.length > 120 ? 'm' : 'g', tamV = c.verso.length > 1300 ? 'l' : c.verso.length > 700 ? 'm' : 'g';   // texto longo: letra menor (a carta tem tamanho fixo)
      const carta = revelado
        ? `<article class="tr-card tr-cv" data-tf="${tamF}" data-tv="${tamV}">${ind('V', 'Verso')}<div class="tr-topo"><div class="tr-t1">${renderizarFrente(c.frente)}</div></div><div class="tr-corpo fc-card"><div class="corpo verso">${renderizarVerso(c.verso)}</div><div class="tr-imgs" data-lado="verso"></div></div></article>`
        : `<article class="tr-card tr-cf" data-tf="${tamF}">${ind('F', 'Frente')}<div class="tr-fr">${renderizarFrente(c.frente)}<div class="tr-imgs" data-lado="frente"></div></div></article>` +
          `<button type="button" class="tr-mostrar" data-a="mostrar">Virar o cartão<kbd>Espaço</kbd></button>`;
      raiz.innerHTML = `<div class="tr-rev" style="--mc:${corCss(mat?.cor)}">${topo}${carta}` +
        (revelado ? `<div class="tr-resp">${RESPOSTAS.map((r) => `<button type="button" class="${r === 'bom' ? 'bom' : ''}" data-r="${r}"><b>${NOMES[r]}</b><small>${rot[r]}</small><kbd>${RESPOSTAS.indexOf(r) + 1}</kbd></button>`).join('')}</div>` : '') +
        `<div class="tr-sub tr-dica">Espaço vira o cartão · 1 Errei · 2 Difícil · 3 Bom · 4 Fácil · E edita · Esc sai</div></div>`;
      for (const lado of ['frente', 'verso']) {
        const dest = raiz.querySelector(`.tr-imgs[data-lado="${lado}"]`); if (!dest) continue;
        for (let j = 0; j < n[lado]; j++) sessao.lerImagemLado(c.id, lado, j).then((b) => { if (!b || geracao !== geracaoAtual) return; const url = URL.createObjectURL(b); urls.push(url); dest.insertAdjacentHTML('beforeend', `<img src="${url}" alt="Imagem do cartão">`); }).catch(() => {});
      }
    }
    raiz.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'sair') sair(); else if (b.dataset.a === 'mostrar') { revelado = true; cartao(); }
      else if (b.dataset.a === 'desfazer') desfazer();
      else if (b.dataset.a === 'marcar') marcar();
      else if (b.dataset.a === 'editar') editar(); else if (b.dataset.a === 'cancelar-ed') { editando = false; cartao(); }
      else if (b.dataset.r) responderCom(b.dataset.r);
    };
    raiz.onchange = null;
  }
  function editar() { if (!editando) { editando = true; erro = ''; cartao(); } }

  function marcar() {
    const id = fila[pos], c = sessao.estado().cartoes.find((x) => x.id === id); if (!c) return;
    try { sessao.aplicar((e) => marcarCartao(e, id, !c.marcado)); } catch (err) { ctx.aviso(err.message); return; }
    cartao();
  }

  /** Volta uma resposta (quantas vezes quiser, até o começo desta sessão): o cartão reaparece com o verso à mostra. */
  function desfazer() {
    const h = hist.pop(); if (!h) return;
    try { sessao.aplicar((e) => desfazerResposta(e, { cartaoId: h.id, antes: h.antes, logId: h.logId })); } catch (err) { ctx.aviso(err.message); hist.push(h); return; }
    resumo[h.resposta]--; resumo.total--;
    if (h.resposta === 'errei') fila.pop();      // o "errei" tinha posto o cartão de novo no fim da fila
    if (resumo.fim) { resumo.fim = false; ligarTeclas(); }
    pos--; revelado = true; editando = false; cartao();
  }

  function responderCom(r) {
    const id = fila[pos], antes = sessao.estado().revisoes?.find((x) => x.cartao_id === id) ?? null;
    try { sessao.aplicar((e) => responder(e, id, r, hoje(), new Date(ctx.agora()).toISOString())); } catch (err) { ctx.aviso(err.message); return; }
    hist.push({ id, antes: antes ? { ...antes } : null, logId: sessao.estado().revisoes_log.at(-1).id, resposta: r });
    resumo[r]++; resumo.total++;
    if (r === 'errei') fila.push(id);          // volta no fim da mesma sessão
    pos++; revelado = false; cartao();
  }

  function fim() {
    desregistrar(); desregistrarEsc(); soltar(); resumo.fim = true;
    const e = sessao.estado(), amanha = somarDias(hoje(), 1), certos = resumo.bom + resumo.facil, amanhaN = e.revisoes.filter((r) => r.vence_dia === amanha).length;
    raiz.className = 'tr';
    raiz.innerHTML = `<div class="tr-entrada"><div class="tr-ent"><div class="tr-cap">Treino concluído</div><div class="tr-big">${resumo.total}</div><div class="tr-sub">${u(resumo.total, 'resposta', 'respostas')} · ${resumo.total ? Math.round(certos / resumo.total * 100) : 0}% de acertos</div>` +
      `<div class="tr-chips">${RESPOSTAS.map((r) => `<span class="tr-chip">${resumo[r]} ${NOMES[r]}</span>`).join('')}</div><div class="tr-sub">${amanhaN ? `Amanhã vencem ${u(amanhaN, 'cartão', 'cartões')}.` : 'Nada vence amanhã.'}</div>` +
      `${hist.length ? '<button type="button" class="tr-link" data-a="desfazer">Desfazer a última resposta</button>' : ''}<button type="button" class="tr-go" data-a="voltar">Voltar ao Treino<kbd>Enter</kbd></button></div></div>`;
    desregistrar = registrar({ Enter: foraDeCampos(() => { entrada(); }) });
    raiz.onclick = (ev) => { if (ev.target.closest('[data-a=desfazer]')) desfazer(); else if (ev.target.closest('[data-a=voltar]')) entrada(); };
  }

  entrada();
  return () => { desregistrar(); desregistrarEsc(); soltar(); dlg?.remove(); dlg = null; geracao++; raiz.className = ''; raiz.onclick = raiz.onchange = null; };
}
