// Tela Agenda: provas, trabalhos, compromissos e lembretes, junto com as aulas da grade. Três visões (Semana, Mês, Lista); à esquerda um trilho
// (mini calendário, filtro por matéria e o que falta completar); o cadastro e a edição abrem numa gaveta à direita. Regras em nucleo/eventos.js
// (itens) e nucleo/grade.js (aulas da grade); aqui só se desenha e se liga cada clique à regra.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss, siglaDaMateria } from '../../nucleo/materias.js';
import { somarDias, inicioDaSemana, diaDaSemana, diasEntre, MESES, MESES_CURTOS, DIAS_SEMANA, dataPorExtenso } from '../../nucleo/datas.js';
import { itensDaAgenda, aCompletar, atrasados, salvarItem, excluirItem, restaurarItem } from '../../nucleo/eventos.js';
import { aulasEfetivas, ocorrenciasCanceladas, materializar, cancelarOcorrencia, restaurarOcorrencia, moverOcorrencia, aulaTemConteudo } from '../../nucleo/grade.js';
import { excluirAula, alterarAula } from '../../nucleo/aulas.js';
import { diaDe } from '../foco_servico.js';

const DS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const TIPOS = { prova: 'Prova', trabalho: 'Trabalho', compromisso: 'Compromisso', lembrete: 'Lembrete' };
const CLASSE = { prova: 'pr', trabalho: 'tr', compromisso: 'co', lembrete: 'le' };
const usaMateria = (t) => t === 'prova' || t === 'trabalho';
const min = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const rel = (n) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n < 0 ? `${-n}d atrás` : `em ${n}d`);
const primeiroDoMes = (d) => `${d.slice(0, 8)}01`;

export function desenharAgenda(raiz, ctx) {
  const { sessao } = ctx;
  const hoje = () => diaDe(ctx.agora()), agoraIso = () => new Date(ctx.agora()).toISOString();
  const horaAgora = () => { const d = new Date(ctx.agora()); return d.getHours() * 60 + d.getMinutes(); };
  let vista = 'semana', ancora = inicioDaSemana(hoje()), filtro = new Set(), sel = null, tipoNovo = 'prova', rasc = null, erro = '';

  const E = () => sessao.estado(), mats = () => ativas(E().disciplinas), porId = () => new Map(E().disciplinas.map((m) => [m.id, m]));
  const passa = (id) => id == null || !filtro.size || filtro.has(id);
  const cor = (id) => { const m = porId().get(id); return m ? corCss(m.cor) : 'var(--ac)'; };
  const sigla = (id) => { const m = porId().get(id); return m ? siglaDaMateria(m) : ''; };
  const nomeM = (id) => porId().get(id)?.nome ?? '';

  // ---------- dados do período ----------
  const periodo = () => (vista === 'semana' ? [ancora, somarDias(ancora, 6)] : vista === 'mes' ? [inicioDaSemana(ancora), somarDias(inicioDaSemana(ancora), 41)] : [hoje(), somarDias(hoje(), 180)]);
  const itens = (de, ate) => itensDaAgenda(E(), de, ate).filter((i) => passa(i.disciplina_id));
  const aulas = (de, ate) => {
    const e = E(), horarios = new Map((e.grade ?? []).map((h) => [h.id, h]));
    return [...aulasEfetivas(e, de, ate), ...ocorrenciasCanceladas(e, de, ate).map((o) => ({ ...o, id: null, virtual: true }))]
      .filter((a) => passa(a.disciplina_id)).map((a) => ({ ...a, dia: a.inicio.slice(0, 10), quinzenal: horarios.get(a.grade_id)?.repete === 'quinzenal' }))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  };

  // ---------- peças ----------
  const marcaDoItem = (i) => (i.tipo === 'prova' ? `pr` : i.tipo === 'trabalho' ? 'tr' : 'dot');
  function chip(i) {
    const s = sel?.k === 'item' && sel.origem === i.origem && sel.id === i.id ? ' s' : '';
    const nome = i.tipo === 'prova' ? `${sigla(i.disciplina_id)} · ${i.titulo}` : i.titulo;
    return `<button type="button" class="ag-ch ${CLASSE[i.tipo]}${i.feito ? ' f' : ''}${s}" data-sel="item" data-origem="${i.origem}" data-id="${i.id}" data-dia="${i.dia}" style="--c:${cor(i.disciplina_id)}">` +
      `${i.tipo === 'trabalho' ? `<i class="sg">${escaparHtml(sigla(i.disciplina_id))}</i>` : ''}${escaparHtml(nome)}${i.hora ? ` ${i.hora}` : ''}</button>`;
  }
  const blocoAula = (a, h0, total) => {
    const s = sel?.k === 'aula' && sel.grade_id === a.grade_id && sel.id === a.id && sel.inicio === a.inicio ? ' s' : '';
    const topo = (min(a.inicio.slice(11)) - h0 * 60) / total * 100, alt = Math.max(3, (min(a.fim.slice(11)) - min(a.inicio.slice(11))) / total * 100);
    return `<button type="button" class="ag-bl${a.quinzenal ? ' qz' : ''}${a.cancelada ? ' x' : ''}${s}" data-sel="aula" data-aid="${a.id ?? ''}" data-gid="${a.grade_id ?? ''}" data-gdia="${a.grade_dia ?? ''}" data-ini="${a.inicio}" style="--c:${cor(a.disciplina_id)};top:${topo}%;height:${alt}%">` +
      `<span class="l1"><i class="sg">${escaparHtml(sigla(a.disciplina_id))}</i>${a.rotulo ? `<b>${escaparHtml(a.rotulo)}</b>` : ''}</span><span class="l2">${a.inicio.slice(11)}</span></button>`;
  };

  // ---------- visão Semana ----------
  function semana() {
    const dias = Array.from({ length: 7 }, (_, i) => somarDias(ancora, i)), [de, ate] = [dias[0], dias[6]];
    const as = aulas(de, ate), is = itens(de, ate), tem = (i) => i.tipo === 'compromisso' && i.hora;
    const hs = [...as.map((a) => [min(a.inicio.slice(11)), min(a.fim.slice(11))]), ...is.filter(tem).map((i) => [min(i.hora), min(i.hora) + 60])];
    const h0 = Math.min(7, Math.floor(Math.min(...hs.map((x) => x[0]), 420) / 60)), h1 = Math.max(19, Math.ceil(Math.max(...hs.map((x) => x[1]), 1140) / 60)), total = (h1 - h0) * 60;
    const cab = dias.map((d) => `<button type="button" class="ag-dh${d === hoje() ? ' h' : ''}" data-novo="${d}"><span>${DS[diaDaSemana(d)]}</span><b>${+d.slice(8)}</b></button>`).join('');
    const faixa = dias.map((d) => { const l = is.filter((i) => i.dia === d && !tem(i)); return `<div>${l.slice(0, 3).map(chip).join('')}${l.length > 3 ? `<span class="mais">+${l.length - 3}</span>` : ''}</div>`; }).join('');
    const cols = dias.map((d) => `<div class="ag-col" data-col="${d}" data-h0="${h0}" data-total="${total}">${Array.from({ length: h1 - h0 }, (_, j) => `<i class="ln" style="top:${j * 60 / total * 100}%"></i>`).join('')}` +
      as.filter((a) => a.dia === d).map((a) => blocoAula(a, h0, total)).join('') +
      is.filter((i) => i.dia === d && tem(i)).map((i) => { const t = (min(i.hora) - h0 * 60) / total * 100, f = i.hora_fim ? min(i.hora_fim) : min(i.hora) + 60; return `<button type="button" class="ag-bl ev${sel?.k === 'item' && sel.id === i.id && sel.origem === i.origem ? ' s' : ''}" data-sel="item" data-origem="${i.origem}" data-id="${i.id}" data-dia="${i.dia}" style="top:${t}%;height:${(f - min(i.hora)) / total * 100}%"><span class="l1">${escaparHtml(i.titulo)}</span><span class="l2">${i.hora}</span></button>`; }).join('') +
      (d === hoje() ? `<i class="agora" style="top:${(horaAgora() - h0 * 60) / total * 100}%"></i>` : '') + '</div>').join('');
    return `<div class="ag-sem"><div class="ag-cab">${'<span></span>'}${cab}</div><div class="ag-faixa"><span></span>${faixa}</div>` +
      `<div class="ag-gr"><div class="ag-hr">${Array.from({ length: h1 - h0 + 1 }, (_, i) => `<span style="top:${i * 60 / total * 100}%">${h0 + i}h</span>`).join('')}</div>${cols}</div></div>`;
  }

  // ---------- visão Mês ----------
  function mes() {
    const ini = inicioDaSemana(ancora), dias = Array.from({ length: 42 }, (_, i) => somarDias(ini, i)), mesAtual = ancora.slice(5, 7);
    const is = itens(dias[0], dias[41]), as = aulas(dias[0], dias[41]);
    return `<div class="ag-mes"><div class="ag-ds">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}</div><div class="ag-ms">` +
      dias.map((d) => { const l = is.filter((i) => i.dia === d), pil = l.map((i) => (i.tipo === 'prova' ? `<i class="p" style="--c:${cor(i.disciplina_id)}"></i>` : i.tipo === 'trabalho' ? `<i class="t" style="--c:${cor(i.disciplina_id)}"></i>` : '<i class="d"></i>')).slice(0, 4).join('');
        return `<button type="button" class="ag-dia${d === hoje() ? ' h' : ''}${d.slice(5, 7) !== mesAtual ? ' o' : ''}${sel?.k === 'dia' && sel.dia === d ? ' s' : ''}" data-dia="${d}"><span class="n">${+d.slice(8)}</span><span class="mk">${pil}</span>${as.some((a) => a.dia === d && !a.cancelada) ? '<u></u>' : ''}</button>`; }).join('') +
      `</div><div class="ag-leg"><span><i class="p"></i> prova</span><span><i class="t"></i> trabalho</span><span><i class="d"></i> compromisso ou lembrete</span></div></div>`;
  }

  // ---------- visão Lista ----------
  function linha(i) {
    const n = diasEntre(hoje(), i.dia);
    return `<button type="button" class="ag-it${i.feito ? ' f' : ''}${sel?.k === 'item' && sel.id === i.id && sel.origem === i.origem ? ' s' : ''}" data-sel="item" data-origem="${i.origem}" data-id="${i.id}" data-dia="${i.dia}" style="--c:${cor(i.disciplina_id)}">` +
      `<span class="dt"><b>${i.dia.slice(8)}</b><small>${MESES_CURTOS[+i.dia.slice(5, 7) - 1]}</small></span><span class="tt">${escaparHtml(i.titulo)}<small><i class="tg">${TIPOS[i.tipo]}</i>${i.disciplina_id ? ` ${escaparHtml(sigla(i.disciplina_id))}` : ''}${i.hora ? ` · ${i.hora}` : ''}${i.local ? ` · ${escaparHtml(i.local)}` : ''}</small></span><span class="rel">${rel(n)}</span></button>`;
  }
  function lista() {
    const h = hoje(), todos = itens(h, somarDias(h, 180)), semGrupo = (a, b) => todos.filter((i) => diasEntre(h, i.dia) >= a && diasEntre(h, i.dia) <= b);
    const grupos = [['Esta semana', semGrupo(0, 6)], ['Semana que vem', semGrupo(7, 13)], ['Mais adiante', semGrupo(14, 180)]];
    const atr = atrasados(E(), h).filter((i) => passa(i.disciplina_id));
    return `<div class="ag-lista">` +
      (atr.length ? `<div class="gr">Atrasados</div>${atr.map((x) => linha({ origem: 'evento', id: x.id, tipo: 'trabalho', disciplina_id: x.disciplina_id, titulo: x.titulo, dia: x.data, hora: x.hora, local: x.local, feito: false })).join('')}` : '') +
      grupos.map(([n, l]) => (l.length ? `<div class="gr">${n}</div>${l.map(linha).join('')}` : '')).join('') +
      (!atr.length && !todos.length ? '<p class="vazio">Nada marcado. Use “+ Novo” para cadastrar uma prova, um trabalho, um compromisso ou um lembrete.</p>' : '') + '</div>';
  }

  // ---------- trilho ----------
  function trilho() {
    const ref = vista === 'mes' ? ancora : somarDias(ancora, 3), mesRef = ref.slice(0, 7), ini = inicioDaSemana(primeiroDoMes(ref));
    const dias = Array.from({ length: 42 }, (_, i) => somarDias(ini, i)), is = itensDaAgenda(E(), dias[0], dias[41]);
    const marca = (d) => { const l = is.filter((i) => i.dia === d); const p = l.find((i) => i.tipo === 'prova'); return p ? `p" style="--c:${cor(p.disciplina_id)}` : l.length ? 'd' : ''; };
    const semSel = (d) => (vista === 'semana' ? inicioDaSemana(d) === ancora : false);
    const comp = aCompletar(E()).filter((x) => passa(x.prova.disciplina_id)), atr = atrasados(E(), hoje()).filter((i) => passa(i.disciplina_id));
    return `<div class="ag-tr"><div class="card"><div class="cab"><h2>${MESES[+mesRef.slice(5) - 1]} ${mesRef.slice(0, 4)}</h2></div><div class="ag-mm">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x) => `<span class="dw">${x}</span>`).join('')}` +
      dias.map((d) => `<button type="button" class="${d.slice(0, 7) !== mesRef ? 'o ' : ''}${d === hoje() ? 'hj ' : ''}${semSel(d) ? 'sl ' : ''}${marca(d)}" data-ir="${d}">${+d.slice(8)}</button>`).join('') + '</div></div>' +
      `<div class="card"><div class="cab"><h2>Matérias</h2></div><div class="ag-fil">${mats().map((m) => `<button type="button" class="bol${filtro.size && !filtro.has(m.id) ? ' o' : ''}" data-fil="${m.id}" style="--c:${corCss(m.cor)}" title="${escaparHtml(m.nome)}" aria-label="${escaparHtml(m.nome)}"></button>`).join('')}</div></div>` +
      `<div class="card ag-pend"><div class="cab"><h2>A completar</h2><span class="esp"></span><span class="ac">${comp.length + atr.length}</span></div><div class="rol">` +
      atr.map((i) => `<button type="button" class="lin" data-sel="item" data-origem="evento" data-id="${i.id}" data-dia="${i.data}"><i class="sg" style="--c:${cor(i.disciplina_id)}">${escaparHtml(sigla(i.disciplina_id))}</i><span>${escaparHtml(i.titulo)}</span><small>atrasado</small></button>`).join('') +
      comp.map((x) => `<button type="button" class="lin" data-sel="item" data-origem="prova" data-id="${x.prova.id}" data-dia="${x.prova.data ?? ''}"><i class="sg" style="--c:${cor(x.prova.disciplina_id)}">${escaparHtml(sigla(x.prova.disciplina_id))}</i><span>${escaparHtml(x.prova.titulo)}</span><small>falta ${x.faltam.join(', ')}</small></button>`).join('') +
      (comp.length + atr.length ? '' : '<p class="vazio">Tudo em dia.</p>') + '</div></div></div>';
  }

  // ---------- gaveta ----------
  const campo = (rot, html) => `<label class="c">${rot}${html}</label>`;
  function formulario(v, tipo, novo, origem) {
    const trava = !novo && origem === 'prova';
    return (usaMateria(tipo) ? campo('Matéria', `<select class="in" name="mat"${trava ? ' disabled' : ''}>${mats().map((m) => `<option value="${m.id}"${m.id === v.disciplinaId ? ' selected' : ''}>${escaparHtml(m.nome)}</option>`).join('')}</select>`) : '') +
      campo(tipo === 'prova' ? 'Nome da prova' : 'Título', `<input class="in" name="titulo" maxlength="80" autocomplete="off" value="${escaparHtml(v.titulo ?? '')}" placeholder="${tipo === 'prova' ? 'Prova 1' : ''}">`) +
      `<div class="f2">${campo('Data', `<input class="in" type="date" name="data" value="${v.data ?? ''}">`)}${campo('Hora', `<input class="in" type="time" name="hora" value="${v.hora ?? ''}">`)}</div>` +
      (tipo === 'compromisso' ? `<div class="f2">${campo('Termina às', `<input class="in" type="time" name="horaFim" value="${v.horaFim ?? ''}">`)}${campo('Repete', `<select class="in" name="rep"><option value="">não repete</option><option value="semanal"${v.rep === 'semanal' ? ' selected' : ''}>toda semana</option><option value="mensal"${v.rep === 'mensal' ? ' selected' : ''}>todo mês</option></select>`)}</div>${v.rep ? campo('Repete até', `<input class="in" type="date" name="ate" value="${v.ate ?? ''}">`) : ''}` : '') +
      `<div class="f2">${campo('Local / sala', `<input class="in" name="local" maxlength="80" autocomplete="off" value="${escaparHtml(v.local ?? '')}">`)}${usaMateria(tipo) ? campo('Peso', `<input class="in" name="peso" inputmode="decimal" placeholder="opcional" value="${v.peso ?? ''}">`) : '<span></span>'}</div>` +
      campo('Observação', `<input class="in" name="observacao" maxlength="1000" autocomplete="off" value="${escaparHtml(v.observacao ?? '')}">`) + (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '');
  }
  const registroDe = (origem, id) => {
    const e = E(), r = origem === 'prova' ? e.provas.find((x) => x.id === id) : (e.eventos ?? []).find((x) => x.id === id);
    if (!r) return null;
    const rep = r.repete ? JSON.parse(r.repete) : null;
    return { tipo: origem === 'prova' ? 'prova' : r.tipo, disciplinaId: r.disciplina_id, titulo: r.titulo, data: r.data, hora: r.hora, horaFim: r.hora_fim, local: r.local, observacao: r.observacao, peso: r.peso, rep: rep?.freq ?? '', ate: rep?.ate ?? '', feito: !!r.feito_em };
  };
  function gaveta() {
    if (!sel) return '';
    if (sel.k === 'novo' || sel.k === 'item') {
      const novo = sel.k === 'novo', reg = novo ? null : registroDe(sel.origem, sel.id);
      if (!novo && !reg) { sel = null; return ''; }
      const tipo = novo ? tipoNovo : reg.tipo, v = novo ? { disciplinaId: mats()[0]?.id, data: sel.dia, hora: sel.hora ?? '', ...(rasc ?? {}) } : { ...reg, ...(rasc ?? {}) };
      return `<div class="cab"><h2>${novo ? 'Novo item' : TIPOS[tipo]}</h2><span class="esp"></span>${!novo && (tipo === 'trabalho' || tipo === 'lembrete') ? `<button type="button" class="pil ${reg.feito ? 'a' : ''}" data-a="feito">${tipo === 'trabalho' ? 'Entregue' : 'Feito'}</button>` : ''}</div>` +
        (novo ? `<div class="seg">${Object.keys(TIPOS).map((k) => `<button type="button" class="pil ${tipoNovo === k ? 'a' : ''}" data-tipo="${k}">${TIPOS[k]}</button>`).join('')}</div>` : '') +
        `<form id="fi" class="ag-form">${formulario(v, tipo, novo, sel.origem)}<div class="esp"></div><div class="acoes"><button class="btn peq" type="submit">Salvar</button>${novo ? '' : '<button class="btn peq sec" type="button" data-a="excluir">Excluir</button>'}<button class="btn peq sec" type="button" data-a="fechar">${novo ? 'Cancelar' : 'Fechar'}</button></div></form>`;
    }
    if (sel.k === 'dia') {
      const is = itens(sel.dia, sel.dia), as = aulas(sel.dia, sel.dia);
      return `<div class="cab"><h2>${DIAS_SEMANA[diaDaSemana(sel.dia)]}, ${dataPorExtenso(sel.dia)}</h2><span class="esp"></span><button type="button" class="pil a" data-novo="${sel.dia}">+ Novo</button></div><div class="rol">` +
        (is.map(linha).join('') + as.map((a) => `<button type="button" class="lin" data-sel="aula" data-aid="${a.id ?? ''}" data-gid="${a.grade_id ?? ''}" data-gdia="${a.grade_dia ?? ''}" data-ini="${a.inicio}"><i class="sg" style="--c:${cor(a.disciplina_id)}">${escaparHtml(sigla(a.disciplina_id))}</i><span>${escaparHtml(nomeM(a.disciplina_id))}${a.rotulo ? ` ${escaparHtml(a.rotulo)}` : ''}</span><small>${a.inicio.slice(11)}${a.cancelada ? ' · sem aula' : ''}</small></button>`).join('') || '<p class="vazio">Nada neste dia.</p>') + '</div>' +
        `<button type="button" class="btn peq sec" data-a="fechar">Fechar</button>`;
    }
    // aula
    const a = sel, m = porId().get(a.disciplina_id), dia = a.inicio.slice(0, 10), cancelada = !!a.cancelada;
    return `<div class="cab"><h2>Aula</h2><span class="esp"></span><span class="tg">${a.quinzenal ? 'quinzenal' : a.grade_id ? 'toda semana' : 'avulsa'}</span></div>` +
      `<div class="ag-quem"><i class="sg" style="--c:${corCss(m.cor)}">${escaparHtml(siglaDaMateria(m))}</i><b>${escaparHtml(m.nome)}${a.rotulo ? ` ${escaparHtml(a.rotulo)}` : ''}</b></div><p class="dica">${DIAS_SEMANA[diaDaSemana(dia)]}, ${dataPorExtenso(dia)} · ${a.inicio.slice(11)}–${a.fim.slice(11)}${a.local ? ` · ${escaparHtml(a.local)}` : ''}</p>` +
      (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '') +
      (cancelada ? `<p class="dica">Marcada como <b>sem aula</b> nesta data.</p><button type="button" class="btn peq sec" data-a="restaurar">Restaurar a aula</button>`
        : `<button type="button" class="btn peq" data-a="abrir">Abrir a aula</button><div class="cab" style="margin-top:10px"><h2>Só nesta data</h2></div><button type="button" class="btn peq sec" data-a="cancelar">Sem aula nesta data</button>` +
          `<form id="fm" class="ag-form"><div class="f2">${campo('Mover para', `<input class="in" type="date" name="nd" value="${dia}">`)}${campo('Hora', `<input class="in" type="time" name="ini" value="${a.inicio.slice(11)}">`)}</div><div class="acoes"><button class="btn peq sec" type="submit">Mover só esta aula</button></div></form>`) +
      `<div class="esp"></div><p class="dica">Para mudar o horário de todas as semanas, use a <a href="#planejar/grade">Grade</a>.</p><button type="button" class="btn peq sec" data-a="fechar">Fechar</button>`;
  }

  // ---------- tela ----------
  function rotuloPeriodo() {
    if (vista === 'semana') { const f = somarDias(ancora, 6); return `${+ancora.slice(8)} ${MESES_CURTOS[+ancora.slice(5, 7) - 1]} – ${+f.slice(8)} ${MESES_CURTOS[+f.slice(5, 7) - 1]}`; }
    if (vista === 'mes') return `${MESES[+ancora.slice(5, 7) - 1]} ${ancora.slice(0, 4)}`;
    return 'Próximos 6 meses';
  }
  function desenhar() {
    raiz.className = 'tgrade';
    raiz.innerHTML = `<div class="gd"><div class="ag-topo"><h1>Agenda</h1>${['semana', 'mes', 'lista'].map((v) => `<button type="button" class="pil${vista === v ? ' a' : ''}" data-vista="${v}">${{ semana: 'Semana', mes: 'Mês', lista: 'Lista' }[v]}</button>`).join('')}<a class="pil" href="#planejar/grade">Grade</a><span class="esp"></span>` +
      (vista === 'lista' ? '' : `<button type="button" class="pil" data-nav="-1" aria-label="Anterior">‹</button><button type="button" class="pil" data-nav="0">Hoje</button><button type="button" class="pil" data-nav="1" aria-label="Próximo">›</button>`) +
      `<span class="ag-per">${rotuloPeriodo()}</span><button type="button" class="btn peq" data-novo="${vista === 'semana' ? (somarDias(ancora, 0) <= hoje() && hoje() <= somarDias(ancora, 6) ? hoje() : ancora) : hoje()}">+ Novo</button><a class="pil" href="#planejar/plano" title="Plano de estudo e importar/exportar .ics">⋯</a></div>` +
      `<div class="ag-corpo">${trilho()}<div class="card ag-main">${vista === 'semana' ? semana() : vista === 'mes' ? mes() : lista()}${sel ? `<div class="card ag-gav">${gaveta()}</div>` : ''}</div></div></div>`;
  }

  const aplicar = (mudar) => { try { sessao.aplicar(mudar); erro = ''; return true; } catch (e) { erro = e.message; return false; } };
  const irPara = (dia) => { if (vista === 'semana') ancora = inicioDaSemana(dia); else if (vista === 'mes') ancora = primeiroDoMes(dia); };
  const guardaForm = () => { const f = raiz.querySelector('#fi'); if (f) rasc = lerForm(f); };
  function lerForm(f) {
    const d = new FormData(f), o = Object.fromEntries(d.entries());
    return { disciplinaId: o.mat ? Number(o.mat) : (rasc?.disciplinaId ?? null), titulo: o.titulo ?? '', data: o.data ?? '', hora: o.hora ?? '', horaFim: o.horaFim ?? '', local: o.local ?? '', observacao: o.observacao ?? '', peso: o.peso ?? '', rep: o.rep ?? '', ate: o.ate ?? '' };
  }
  const selAula = (b) => {
    const a = aulas(b.dataset.ini.slice(0, 10), b.dataset.ini.slice(0, 10)).find((x) => x.inicio === b.dataset.ini && String(x.grade_id ?? '') === b.dataset.gid && String(x.id ?? '') === b.dataset.aid);
    return a ? { k: 'aula', ...a } : null;
  };

  raiz.onclick = (ev) => {
    const t = ev.target.closest('[data-vista],[data-nav],[data-novo],[data-ir],[data-fil],[data-sel],[data-dia],[data-tipo],[data-a]'), col = ev.target.closest('.ag-col');
    if (t) {
      const d = t.dataset;
      if (d.vista) { vista = d.vista; ancora = vista === 'semana' ? inicioDaSemana(hoje()) : vista === 'mes' ? primeiroDoMes(hoje()) : ancora; sel = null; rasc = null; }
      else if (d.nav !== undefined) {
        const n = Number(d.nav);
        ancora = n === 0 ? (vista === 'semana' ? inicioDaSemana(hoje()) : primeiroDoMes(hoje())) : vista === 'semana' ? somarDias(ancora, 7 * n) : primeiroDoMes(somarDias(ancora, n > 0 ? 32 : -1)); sel = null;
      } else if (d.novo) { guardaForm(); sel = { k: 'novo', dia: d.novo }; rasc = null; erro = ''; }
      else if (d.ir) { ancora = vista === 'mes' ? primeiroDoMes(d.ir) : inicioDaSemana(d.ir); if (vista === 'lista') vista = 'semana'; sel = null; }
      else if (d.fil) { const id = Number(d.fil); filtro.has(id) ? filtro.delete(id) : filtro.add(id); }
      else if (d.sel === 'item') { sel = { k: 'item', origem: d.origem, id: Number(d.id) }; if (d.dia && vista === 'semana' && d.dia.length === 10 && ev.target.closest('.lin')) irPara(d.dia); rasc = null; erro = ''; }
      else if (d.sel === 'aula') { sel = selAula(t); erro = ''; }
      else if (d.dia && vista === 'mes') { sel = { k: 'dia', dia: d.dia }; }
      else if (d.tipo) { guardaForm(); tipoNovo = d.tipo; }
      else if (d.a) acao(d.a);
      else return;
    } else if (col && !ev.target.closest('.ag-bl')) {
      const r = col.getBoundingClientRect(), total = Number(col.dataset.total), h0 = Number(col.dataset.h0);
      const m = Math.max(h0 * 60, Math.min(Math.round((h0 * 60 + (ev.clientY - r.top) / r.height * total) / 30) * 30, h0 * 60 + total - 60));
      sel = { k: 'novo', dia: col.dataset.col, hora: hhmm(m) }; rasc = null; erro = '';
    } else return;
    desenhar();
  };

  function acao(a) {
    if (a === 'fechar') { sel = null; rasc = null; erro = ''; return; }
    if (a === 'feito') { const reg = registroDe(sel.origem, sel.id), antes = sessao.estadoCompleto(); aplicar((e) => ({ ...e, eventos: e.eventos.map((x) => (x.id === sel.id ? { ...x, feito_em: reg.feito ? null : agoraIso() } : x)) })); void antes; return; }
    if (a === 'excluir') {
      const { origem, id } = sel, nome = registroDe(origem, id)?.titulo ?? 'Item';
      if (aplicar((e) => excluirItem(e, origem, id, agoraIso()))) { sel = null; ctx.aviso(`"${nome}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => { sessao.aplicar((e) => restaurarItem(e, origem, id)); desenhar(); } }); }
      return;
    }
    const antes = sessao.estadoCompleto(), desfazer = (texto) => ctx.aviso(texto, { texto: 'Desfazer', fazer: () => { sessao.aplicar(() => antes); sel = null; desenhar(); } });
    if (a === 'abrir') {
      if (sel.id) { location.hash = `#aula/${sel.id}`; return; }
      let novoId = null;
      if (aplicar((e) => { const r = materializar(e, sel.grade_id, sel.grade_dia, agoraIso()); novoId = r.aula.id; return r.estado; })) location.hash = `#aula/${novoId}`;
      return;
    }
    if (a === 'cancelar') {
      const ok = sel.grade_id ? aplicar((e) => cancelarOcorrencia(e, sel.grade_id, sel.grade_dia, agoraIso()))
        : aplicar((e) => { const au = e.aulas.find((x) => x.id === sel.id); if (aulaTemConteudo(e, au)) throw new Error('Essa aula já tem anotações, arquivos ou cartões; exclua-a pela Mesa se for mesmo apagar.'); return excluirAula(e, sel.id, agoraIso()); });
      if (ok) { sel = null; desfazer('Aula marcada como "sem aula".'); }
      return;
    }
    if (a === 'restaurar') { if (aplicar((e) => restaurarOcorrencia(e, sel.grade_id, sel.grade_dia))) sel = null; }
  }

  raiz.onchange = (ev) => { if (ev.target.name === 'rep' && raiz.querySelector('#fi')) { guardaForm(); desenhar(); } };
  raiz.onsubmit = (ev) => {
    ev.preventDefault();
    if (ev.target.id === 'fm') {
      const f = new FormData(ev.target), nd = f.get('nd'), ini = f.get('ini'), dur = min(sel.fim.slice(11)) - min(sel.inicio.slice(11)), antes = sessao.estadoCompleto();
      if (!nd || !ini) { erro = 'Informe a data e a hora.'; desenhar(); return; }
      const fim = hhmm(min(ini) + dur);
      const ok = sel.grade_id ? aplicar((e) => moverOcorrencia(e, sel.grade_id, sel.grade_dia, { novoDia: nd, inicio: ini, fim }, agoraIso())) : aplicar((e) => alterarAula(e, sel.id, { inicio: `${nd}T${ini}`, fim: `${nd}T${fim}` }));
      if (ok) { sel = null; ctx.aviso('Aula movida só nesta data.', { texto: 'Desfazer', fazer: () => { sessao.aplicar(() => antes); desenhar(); } }); }
      desenhar(); return;
    }
    const v = lerForm(ev.target), novo = sel.k === 'novo', reg = novo ? null : registroDe(sel.origem, sel.id), tipo = novo ? tipoNovo : reg.tipo;
    rasc = v;
    const dados = { tipo, titulo: v.titulo, data: v.data, hora: v.hora, local: v.local, observacao: v.observacao, peso: v.peso };
    if (usaMateria(tipo) && (novo || tipo === 'trabalho')) dados.disciplinaId = v.disciplinaId;
    if (tipo === 'compromisso') { dados.horaFim = v.horaFim; dados.repete = v.rep ? { freq: v.rep, ate: v.ate || null } : ''; }
    if (!novo) dados.id = sel.id;
    let res = null;
    if (aplicar((e) => { res = salvarItem(e, dados, agoraIso()); return res.estado; })) {
      if (v.data && ((vista === 'semana' && inicioDaSemana(v.data) !== ancora) || (vista === 'mes' && primeiroDoMes(v.data) !== ancora))) irPara(v.data);
      sel = null; rasc = null; ctx.aviso('Salvo.');
    }
    desenhar();
  };
  // teclado (fora de campos de texto): N novo item · T hoje · ← → período anterior/seguinte · Esc fecha a gaveta
  const aoTecla = (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest?.('input,select,textarea,[contenteditable="true"]') || document.querySelector('.novo-item-fundo')) return;
    const clicar = (seletor) => { const b = raiz.querySelector(seletor); if (b) { ev.preventDefault(); b.click(); } };
    if (ev.key === 'n' || ev.key === 'N') clicar('.ag-topo [data-novo]');
    else if (ev.key === 't' || ev.key === 'T') clicar('[data-nav="0"]');
    else if (ev.key === 'ArrowLeft') clicar('[data-nav="-1"]');
    else if (ev.key === 'ArrowRight') clicar('[data-nav="1"]');
    else if (ev.key === 'Escape' && sel) { sel = null; rasc = null; erro = ''; desenhar(); }
  };
  document.addEventListener('keydown', aoTecla);
  desenhar();
  const reajustar = () => { if (raiz.querySelector('.gd')) { guardaForm(); desenhar(); } };
  const aoVoltar = () => { if (!document.hidden) reajustar(); };
  addEventListener('resize', reajustar); document.addEventListener('visibilitychange', aoVoltar);
  return () => { removeEventListener('resize', reajustar); document.removeEventListener('visibilitychange', aoVoltar); document.removeEventListener('keydown', aoTecla); raiz.className = ''; };
}
