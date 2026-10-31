// Treino (revisor de flashcards): entrada calma com o número do dia e a escolha do que revisar (uma aula, o bimestre atual da matéria ou
// o ano inteiro dela), e a revisão em si: o cartão com a frente em faixa de cor sólida (como no editor), as 4 respostas com o intervalo
// de cada uma e o botão Editar, para corrigir um erro de digitação na hora. A agenda (SM-2) está em nucleo/revisao.js.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss, siglaDaMateria, imagensDoCartao } from '../../nucleo/materias.js';
import { alterarCartao } from '../../nucleo/cartoes.js';
import { renderizarFrente, renderizarVerso } from '../../nucleo/flashcards_texto.js';
import { pastasDaMateria, aulasDaPasta } from '../../nucleo/pastas.js';
import { cartoesDaAula } from '../../nucleo/cartoes.js';
import { RESPOSTAS, responder, filaDoTreino, contagemDoTreino, bimestreAtual, estatisticasDoTreino, rotulosDosBotoes } from '../../nucleo/revisao.js';
import { somarDias } from '../../nucleo/datas.js';
import { diaDe } from '../foco_servico.js';
import { registrar, foraDeCampos } from '../atalhos.js';
import * as pref from '../preferencias.js';

const NOMES = { errei: 'Errei', dificil: 'Difícil', bom: 'Bom', facil: 'Fácil' }, TECLAS = { Digit1: 'errei', Digit2: 'dificil', Digit3: 'bom', Digit4: 'facil' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const u = (n, um, vp) => `${n} ${n === 1 ? um : vp}`;

export function desenharRevisor(raiz, ctx) {
  const sessao = ctx.sessao;
  document.title = 'Treino · Ohara';
  let fila = [], pos = 0, revelado = false, editando = false, erro = '', resumo = null, urls = [], geracao = 0, desregistrar = () => {};

  const hoje = () => diaDe(ctx.agora());
  const agoraLocal = () => { const d = new Date(ctx.agora()), p = (n) => String(n).padStart(2, '0'); return `${hoje()}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const soltar = () => { urls.forEach((x) => URL.revokeObjectURL(x)); urls = []; };

  // ----- o que revisar -----
  const lerEscolha = () => ({ materia: Number(pref.ler('ohara.tr.materia')) || null, modo: ['aula', 'bimestre', 'ano'].includes(pref.ler('ohara.tr.modo')) ? pref.ler('ohara.tr.modo') : 'ano', aula: Number(pref.ler('ohara.tr.aula')) || null });
  function escopoDe(e, esc) {
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
    const escopo = escopoDe(e, esc), c = contagemDoTreino(e, escopo, hoje()), todos = filaDoTreino(e, escopo, hoje(), { todos: true }).length;
    const pastaAtual = esc.materia ? pastasDaMateria(e, esc.materia).find((p) => p.id === bimestreAtual(e, esc.materia, agoraLocal())) : null;
    const st = estatisticasDoTreino(e, hoje()), dsem = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
    const seg = (modo, rot, extra = '', off = false) => `<button type="button" class="${esc.modo === modo ? 'on' : ''}" data-modo="${modo}" ${off ? 'disabled' : ''} ${extra}>${rot}</button>`;
    raiz.className = 'tr';
    raiz.innerHTML = `<div class="tr-entrada"><div class="tr-ent"><div class="tr-cap">Treino de hoje</div><div class="tr-big">${c.total}</div>` +
      `<div class="tr-sub">${c.total ? `${u(c.total, 'cartão', 'cartões')} · cerca de ${u(c.minutos, 'minuto', 'minutos')}` : todos ? 'Tudo em dia por aqui. Nada vence hoje.' : 'Ainda não há cartões neste escopo.'}</div>` +
      `<div class="tr-chips"><span class="tr-chip">${u(c.novos, 'novo', 'novos')}</span><span class="tr-chip">${c.vencidos} de revisão</span></div>` +
      `<button type="button" class="tr-go" data-a="comecar" ${c.total ? '' : 'disabled'}>Começar<kbd>Enter</kbd></button>` +
      (!c.total && todos ? `<button type="button" class="tr-link" data-a="todos">Revisar mesmo assim (${u(todos, 'cartão', 'cartões')})</button>` : c.total && todos > c.total ? `<button type="button" class="tr-link" data-a="todos">Revisar todos, mesmo sem vencer (${todos})</button>` : '') +
      `<div class="tr-esc"><label>Matéria<select class="in" data-k="materia"><option value="">Todas as matérias</option>${mats.map((m) => `<option value="${m.id}" ${m.id === esc.materia ? 'selected' : ''}>${escaparHtml(m.nome)}</option>`).join('')}</select></label>` +
      (esc.materia ? `<div class="tr-seg" role="group" aria-label="O que revisar">${seg('aula', 'Uma aula')}${seg('bimestre', pastaAtual ? `Bimestre atual · ${escaparHtml(pastaAtual.nome)}` : 'Bimestre atual', pastaAtual ? '' : 'title="Crie pastas (bimestres) na matéria e ponha as aulas nelas"', !pastaAtual)}${seg('ano', 'Ano inteiro')}</div>` : '<div class="tr-sub tr-peq">Todas as matérias do ano atual.</div>') +
      (esc.materia && esc.modo === 'aula' ? `<label>Aula<select class="in" data-k="aula">${aulasMat.map((a) => { const d = a.inicio ? `${Number(a.inicio.slice(8, 10))} ${MESES[Number(a.inicio.slice(5, 7)) - 1]} · ` : ''; return `<option value="${a.id}" ${a.id === esc.aula ? 'selected' : ''}>${escaparHtml(d + a.titulo)} (${cartoesDaAula(e, a.id).length})</option>`; }).join('') || '<option value="">Sem aulas</option>'}</select></label>` : '') + '</div></div>' +
      `<div class="tr-sem" aria-label="Últimos 7 dias">${st.ultimos7.map((f, i) => `<span class="${f ? 'f' : ''}">${dsem[(new Date(`${somarDias(hoje(), i - 6)}T12:00:00`).getDay() + 6) % 7]}</span>`).join('')}</div>` +
      `<div class="tr-sub">${st.sequencia ? `Sequência de ${u(st.sequencia, 'dia', 'dias')}` : 'Sem sequência ainda'}${st.acertos7 != null ? ` · acertos ${st.acertos7}% (7 dias)` : ''}</div></div>`;
    desregistrar = registrar({ Enter: foraDeCampos(() => { if (!c.total) return false; comecar(escopo, false); }) });
    raiz.onchange = (ev) => {
      const k = ev.target.dataset.k; if (!k) return;
      if (k === 'materia') { pref.gravar('ohara.tr.materia', ev.target.value); pref.gravar('ohara.tr.aula', ''); } else pref.gravar('ohara.tr.aula', ev.target.value);
      entrada();
    };
    raiz.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.modo) { pref.gravar('ohara.tr.modo', b.dataset.modo); entrada(); }
      else if (b.dataset.a === 'comecar') comecar(escopo, false);
      else if (b.dataset.a === 'todos') comecar(escopo, true);
    };
  }

  // ----- a revisão -----
  function comecar(escopo, todos) {
    desregistrar();
    fila = filaDoTreino(sessao.estado(), escopo, hoje(), { todos }).map((c) => c.id); pos = 0; revelado = false; editando = false; erro = '';
    resumo = { errei: 0, dificil: 0, bom: 0, facil: 0, total: 0 };
    if (!fila.length) { entrada(); return; }
    desregistrar = registrar({
      Space: foraDeCampos(() => { if (editando) return false; if (!revelado) { revelado = true; cartao(); } else responderCom('bom'); }),
      KeyE: foraDeCampos(() => { if (!fila.length || resumo?.fim) return false; editar(); }),
      ...Object.fromEntries(Object.entries(TECLAS).map(([k, r]) => [k, foraDeCampos(() => { if (!revelado || editando) return false; responderCom(r); })])),
    });
    desregistrarEsc = registrar({ Escape: () => { if (editando) { editando = false; cartao(); return true; } if (resumo?.fim) return false; sair(); return true; } }, { captura: true });
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
      `<button type="button" class="tr-ed" data-a="editar" title="Corrigir este cartão (E)">Editar<kbd>E</kbd></button></div><div class="tr-prog"><i style="width:${Math.round(pos / fila.length * 100)}%"></i></div>`;
    if (editando) {
      raiz.innerHTML = `<div class="tr-rev" style="--mc:${corCss(mat?.cor)}">${topo}<form class="tr-card tr-edit" id="form-ed"><div class="tr-frente" data-rot="Editar o cartão"><label>Frente<textarea class="in" name="frente" rows="2">${escaparHtml(c.frente)}</textarea></label></div>` +
        `<div class="tr-corpo"><label>Verso<textarea class="in" name="verso" rows="6">${escaparHtml(c.verso)}</textarea></label><p class="tr-sub tr-peq">A mesma escrita do editor: <code>-</code> lista, <code>+</code> a favor, <code>--</code> contra, <code>?</code> dúvida, <code>**negrito**</code>. As imagens ficam como estão.</p>${erro ? `<p class="erro">${escaparHtml(erro)}</p>` : ''}` +
        `<div class="tr-acoes"><button type="button" class="tr-btn sec" data-a="cancelar-ed">Cancelar<kbd>Esc</kbd></button><button type="submit" class="tr-btn">Salvar<kbd>Ctrl Enter</kbd></button></div></div></form></div>`;
      const f = raiz.querySelector('#form-ed'); f.querySelector('textarea[name=frente]').focus();
      f.onkeydown = (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); f.requestSubmit(); } };
      f.onsubmit = (ev) => { ev.preventDefault(); const d = new FormData(f); try { sessao.aplicar((s) => alterarCartao(s, c.id, { frente: d.get('frente'), verso: d.get('verso') }, new Date().toISOString())); editando = false; erro = ''; ctx.aviso('Cartão corrigido.'); } catch (err) { erro = err.message; } cartao(); };
    } else {
      raiz.innerHTML = `<div class="tr-rev" style="--mc:${corCss(mat?.cor)}">${topo}<article class="tr-card"><div class="tr-frente" data-rot="Frente${mat ? ' · ' + escaparHtml(siglaDaMateria(mat)) : ''}${rev ? '' : ' · novo'}">${renderizarFrente(c.frente)}<div class="tr-imgs" data-lado="frente"></div></div>` +
        (revelado ? `<div class="tr-corpo fc-card"><div class="corpo verso">${renderizarVerso(c.verso)}</div><div class="tr-imgs" data-lado="verso"></div></div>` : `<button type="button" class="tr-mostrar" data-a="mostrar">Mostrar resposta<kbd>Espaço</kbd></button>`) + '</article>' +
        (revelado ? `<div class="tr-resp">${RESPOSTAS.map((r) => `<button type="button" class="${r === 'bom' ? 'bom' : ''}" data-r="${r}"><b>${NOMES[r]}</b><small>${rot[r]}</small><kbd>${RESPOSTAS.indexOf(r) + 1}</kbd></button>`).join('')}</div>` : '') +
        `<div class="tr-sub tr-dica">Espaço mostra a resposta · 1 Errei · 2 Difícil · 3 Bom · 4 Fácil · E edita · Esc sai</div></div>`;
      for (const lado of ['frente', 'verso']) {
        const dest = raiz.querySelector(`.tr-imgs[data-lado="${lado}"]`); if (!dest) continue;
        for (let j = 0; j < n[lado]; j++) sessao.lerImagemLado(c.id, lado, j).then((b) => { if (!b || geracao !== geracaoAtual) return; const url = URL.createObjectURL(b); urls.push(url); dest.insertAdjacentHTML('beforeend', `<img src="${url}" alt="Imagem do cartão">`); }).catch(() => {});
      }
    }
    raiz.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'sair') sair(); else if (b.dataset.a === 'mostrar') { revelado = true; cartao(); }
      else if (b.dataset.a === 'editar') editar(); else if (b.dataset.a === 'cancelar-ed') { editando = false; cartao(); }
      else if (b.dataset.r) responderCom(b.dataset.r);
    };
    raiz.onchange = null;
  }
  function editar() { if (!editando) { editando = true; erro = ''; cartao(); } }

  function responderCom(r) {
    const id = fila[pos];
    try { sessao.aplicar((e) => responder(e, id, r, hoje(), new Date(ctx.agora()).toISOString())); } catch (err) { ctx.aviso(err.message); return; }
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
      `<button type="button" class="tr-go" data-a="voltar">Voltar ao Treino<kbd>Enter</kbd></button></div></div>`;
    desregistrar = registrar({ Enter: foraDeCampos(() => { entrada(); }) });
    raiz.onclick = (ev) => { if (ev.target.closest('[data-a=voltar]')) entrada(); };
  }

  entrada();
  return () => { desregistrar(); desregistrarEsc(); soltar(); geracao++; raiz.className = ''; raiz.onclick = raiz.onchange = null; };
}
