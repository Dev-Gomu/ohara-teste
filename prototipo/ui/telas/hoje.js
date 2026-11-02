// Tela Hoje (layout "calendário grande"): calendário de seis semanas com as provas, as próximas provas por data e a agenda compacta do dia
// (cada aula é um bloco; a duração só no horário). Sem chips nem botão de ação no topo (decisão de 1/11); o plano de estudo continua rodando por trás.
// Sem avisos de cobrança na tela. O desenho é estático: sem animação e sem blocos que mudam de lugar.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss, siglaDaMateria } from '../../nucleo/materias.js';
import { diaComSemana, MESES_CURTOS } from '../../nucleo/datas.js';
import { janelaDeSemanas, proximasProvasPorData, agendaCompacta, posicaoDoMarcador, proximoDiaComAula } from '../../nucleo/hoje.js';
import { diaDe } from '../foco_servico.js';
import { provasSemData, itensDoDia, itensDaAgenda, marcarFeito } from '../../nucleo/eventos.js';
import { materializar } from '../../nucleo/grade.js';
import { abrirNovoItem } from '../blocos/novo_item.js';

const dois = (n) => String(n).padStart(2, '0');
const horaLocal = (ms) => { const d = new Date(ms); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; };
const agoraLocal = (ms) => { const d = new Date(ms); return `${diaDe(ms)}T${dois(d.getHours())}:${dois(d.getMinutes())}`; };
const hhmm = (m) => `${dois(Math.floor(m / 60))}:${dois(m % 60)}`;
const cap = (t) => t[0].toUpperCase() + t.slice(1);

/** `ctx.agora()` devolve o instante atual em ms (nos testes dá para simular outro). */
export function desenharHoje(raiz, ctx) {
  const { sessao } = ctx;
  // escala proporcional ao desenho do tablet (1280×800): cresce com a tela até 1,5x e nunca encolhe
  // escala: metade do zoom, igual às outras telas do PC (estilos/pc.css)
  const ajustarEscala = () => { const hj = raiz.querySelector('.hj'); if (hj) hj.style.setProperty('--z', (1 + (Math.max(1, Math.min(innerWidth / 1280, innerHeight / 800, 1.5)) - 1) / 2).toFixed(3)); };
  window.addEventListener('resize', ajustarEscala);
  let deslocamento = 0;   // semanas que o calendário andou para a frente (ou para trás) em relação à semana de hoje

  function desenhar() {
    const agora = ctx.agora(), hoje = diaDe(agora);
    sessao.sincronizarPlano(hoje, new Date(agora).toISOString());
    const estado = sessao.estado();
    const mats = ativas(estado.disciplinas), porId = new Map(mats.map((m) => [m.id, m]));
    const agoraMin = Number(agoraLocal(agora).slice(11, 13)) * 60 + Number(agoraLocal(agora).slice(14, 16));

    // calendário: seis semanas, número no meio da linha, uma pílula colorida por prova
    const janela = janelaDeSemanas(estado, hoje, { deslocamento }), primeiro = janela[0].dias[0], ultimo = janela[janela.length - 1].dias[6];
    const mesmoAno = primeiro.dia.slice(0, 4) === ultimo.dia.slice(0, 4), ano = ultimo.dia.slice(0, 4);
    const tituloCal = primeiro.mes === ultimo.mes && mesmoAno ? cap(MESES_CURTOS[primeiro.mes - 1])
      : mesmoAno ? `${cap(MESES_CURTOS[primeiro.mes - 1])} – ${cap(MESES_CURTOS[ultimo.mes - 1])}`
      : `${cap(MESES_CURTOS[primeiro.mes - 1])} ${primeiro.dia.slice(0, 4)} – ${cap(MESES_CURTOS[ultimo.mes - 1])} ${ano}`;
    const corpoCal = janela.map((s) => `<div class="hsem${s.atual ? ' at' : ''}">` + s.dias.map((d) => {
      const cor = (id) => (porId.get(id) ? corCss(porId.get(id).cor) : 'var(--tx2)');
      const pils = d.provas.map((id) => `<i style="background:${cor(id)}"></i>`).join('') + d.entregas.map((id) => `<i class="e" style="color:${cor(id)}"></i>`).join('');   // prova = pílula cheia; entrega de trabalho = pílula vazada
      const nomes = [...d.provas.map((id) => porId.get(id)?.nome), ...d.entregas.map((id) => porId.get(id)?.nome && `${porId.get(id).nome} (entrega)`)].filter(Boolean).join(', ');
      return `<div class="hdia${d.hoje ? ' h' : ''}${d.provas.length ? ' p' : ''}"${nomes ? ` title="${escaparHtml(`${d.n} de ${MESES_CURTOS[d.mes - 1]}: ${nomes}`)}"` : ''}>${d.primeiroDoMes ? `<small class="mm">${MESES_CURTOS[d.mes - 1]}</small>` : ''}<span class="n">${d.n}</span>${pils ? `<span class="pils">${pils}</span>` : ''}</div>`;
    }).join('') + '</div>').join('');
    const calendario = `<div class="card hcal" id="cal"><div class="hcab"><h2 class="mes">${escaparHtml(tituloCal)}</h2>${mesmoAno ? `<span class="ano">${ano}</span>` : ''}<span class="esp"></span>${deslocamento ? '<button type="button" class="btn peq sec" data-sem="0">Hoje</button>' : ''}<button type="button" class="seta" data-sem="-1" aria-label="Semana anterior">‹</button><button type="button" class="seta" data-sem="1" aria-label="Próxima semana">›</button></div>` +
      `<div class="hds">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}</div><div class="hsems" style="--sem:${janela.length}">${corpoCal}</div></div>`;

    // próximas provas em faixa, no alto: um bloco por data (até 5), com a data, o tempo que falta em chip e as siglas com a pílula da cor
    const { datas, total } = proximasProvasPorData(estado, hoje, 5), semData = provasSemData(estado);
    const bloco = (d, k) => `<div class="hbl${k === 0 ? ' px' : ''}" aria-label="${d.n} de ${MESES_CURTOS[d.mes - 1]}, ${d.texto}"><div class="hl1"><span class="hd"><b>${dois(d.n)}</b><small>${MESES_CURTOS[d.mes - 1]}</small></span><span class="hr" title="${d.texto}">${d.em === 0 ? 'hoje' : `${d.em}d`}</span></div><div class="hsg">${d.disciplinas.map((id) => { const m = porId.get(id); return `<span class="sg"><i style="background:${m ? corCss(m.cor) : 'var(--tx2)'}"></i>${escaparHtml(m ? siglaDaMateria(m) : '?')}</span>`; }).join('')}</div></div>`;
    const provas = `<div class="card hprov"><div class="hph"><h2>Próximas provas${total ? ` <span class="cont">${total}</span>` : ''}</h2><span class="esp"></span>${semData ? `<a class="mais" href="#planejar" title="Provas cadastradas sem data: complete na Agenda">${semData} sem data</a>` : ''}${total > datas.length ? `<a class="mais" href="#planejar">Ver todas · ${total} dias ›</a>` : ''}<button type="button" class="seta" data-add aria-label="Anotar uma data" title="Anotar uma data na Agenda">+</button></div>` + (datas.length
      ? `<div class="htiles">${datas.map(bloco).join('')}</div>`
      : '<div class="hvazio">Nenhuma prova marcada. Cadastre em&nbsp;<a href="#planejar"><b>Agenda</b></a>.</div>') + '</div>';

    // agenda compacta
    let diaAg = hoje, ag = agendaCompacta(estado, hoje, agoraMin);
    if (!ag.itens.length) { const prox = proximoDiaComAula(estado, hoje); if (prox) { diaAg = prox; ag = agendaCompacta(estado, prox, -1); } }   // hoje sem aula: mostra o próximo dia com aula (sem marcador de agora)
    const futuro = diaAg !== hoje, nAulas = ag.itens.filter((x) => x.tipo === 'aula').length;
    const itens = ag.itens.map((it) => {
      if (it.tipo === 'livre') return `<div class="hlivre">${hhmm(it.ini)} – ${hhmm(it.fim)} · livre</div>`;
      const m = porId.get(it.disciplina_id);
      return `<a class="hev ${it.situacao}" href="${it.virtual ? '#planejar' : `#aula/${it.id}`}"${it.virtual ? ` data-virt="${it.grade_id}|${it.grade_dia}"` : ''} style="--c:${m ? corCss(m.cor) : 'var(--tx2)'}" title="${escaparHtml(it.titulo)}"><span class="eh">${it.situacao === 'agora' ? '' : `${dois(Math.floor(it.ini / 60))}h`}</span><span class="evb"><b>${escaparHtml(m?.nome ?? it.titulo)}</b><span>${hhmm(it.ini)} – ${hhmm(it.fim)}</span></span></a>`;
    }).join('');
    // além das aulas: provas, entregas, compromissos e lembretes do mesmo dia (a Agenda é a fonte); sem aviso nem cobrança
    const ROT = { prova: 'Prova', trabalho: 'Entrega', compromisso: '', lembrete: '' };
    const chip = (x, pre = '') => { const m = porId.get(x.disciplina_id); return { html: `<a class="hit" href="#planejar" style="--c:${m ? corCss(m.cor) : 'var(--tx2)'}" title="${escaparHtml(x.titulo)}"><i></i>${pre}${x.hora ? `${x.hora.slice(0, 5)} ` : ''}${ROT[x.tipo] ? `${ROT[x.tipo]}: ` : ''}${escaparHtml(x.titulo)}</a>` }; };
    const extras = [...itensDoDia(estado, hoje).filter((x) => x.tipo !== 'lembrete').map((x) => chip(x)), ...(futuro ? itensDoDia(estado, diaAg).map((x) => chip(x, `${diaComSemana(diaAg).slice(0, 3).toLowerCase()} · `)) : [])];   // hoje primeiro; se a agenda mostra outro dia, os itens dele vêm depois
    const mais = extras.slice(0, 4).map((x) => x.html).join('') + (extras.length > 4 ? `<a class="hit" href="#planejar">+${extras.length - 4}</a>` : '');
    const agenda = `<div class="card hag"><div class="hcab"><h2>Agenda</h2><span class="esp"></span><span class="sub">${nAulas ? `${futuro ? 'próxima · ' : ''}${diaComSemana(diaAg).split(',')[0].toLowerCase()} · ${nAulas} ${nAulas === 1 ? 'aula' : 'aulas'}` : ''}</span></div>` +
      (ag.itens.length ? `<div class="hscroll"><div class="hlista">${itens}${futuro ? '' : `<div class="hagora" style="top:${posicaoDoMarcador(ag, agoraMin).toFixed(1)}px"><span>${hhmm(agoraMin)}</span></div>`}</div></div>`
        : `<p class="vazio">${mats.length ? 'Nada marcado para hoje.' : 'Crie sua primeira matéria em <a href="#materias"><b>Acervo</b></a>.'}</p>`) + (mais ? `<div class="hmais">${mais}</div>` : '') + '</div>';


    // lembretes de hoje: lista para marcar (círculo = estado); os feitos descem e ficam riscados
    const lems = itensDaAgenda(estado, hoje, hoje).filter((x) => x.tipo === 'lembrete').sort((a, b) => Number(a.feito) - Number(b.feito) || (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99') || a.titulo.localeCompare(b.titulo));
    const pend = lems.filter((x) => !x.feito).length;
    const lembretes = `<div class="card hlem"><div class="hcab"><h2>Lembretes de hoje</h2><span class="esp"></span><button type="button" class="seta" data-add-lem aria-label="Novo lembrete" title="Novo lembrete">+</button></div>` +
      (lems.length ? `<div class="hlems">${lems.map((x) => `<div class="hlm${x.feito ? ' f' : ''}" role="checkbox" aria-checked="${x.feito ? 'true' : 'false'}" tabindex="0" data-lem="${x.id}"><i class="ck"></i><span>${escaparHtml(x.titulo)}</span>${x.hora ? `<small>${x.hora.slice(0, 5)}</small>` : ''}</div>`).join('')}</div><div class="hlrod">${pend ? `${pend} ${pend === 1 ? 'pendente' : 'pendentes'}` : 'Tudo feito'}</div>`
        : '<p class="vazio">Nada para lembrar hoje. Use o + para anotar.</p>') + '</div>';

    raiz.className = 'tcheia';
    raiz.innerHTML = `<div class="hoje2 hj">` +
      `<div class="hgrade">${provas}${calendario}<div class="hdir">${agenda}</div>${lembretes}</div>` +
      `</div>`;
    document.title = 'Hub · Ohara';
    ajustarEscala();
    const rolo = raiz.querySelector('.hscroll'), marc = raiz.querySelector('.hagora');
    if (rolo && marc && rolo.scrollHeight > rolo.clientHeight) rolo.scrollTop = Math.max(0, marc.offsetTop - rolo.clientHeight / 3);   // agenda mais alta que o espaço: mostra o agora
  }

  raiz.onclick = (ev) => {
    if (ev.target.closest('[data-add]')) { abrirNovoItem({ sessao, agora: () => new Date(ctx.agora()).toISOString(), dia: diaDe(ctx.agora()), aviso: ctx.aviso, aoSalvar: desenhar }); return; }
    if (ev.target.closest('[data-add-lem]')) { abrirNovoItem({ sessao, agora: () => new Date(ctx.agora()).toISOString(), dia: diaDe(ctx.agora()), aviso: ctx.aviso, aoSalvar: desenhar, tipo: 'lembrete' }); return; }
    const lm = ev.target.closest('[data-lem]');
    if (lm) { alternarLembrete(lm); return; }
    const v = ev.target.closest('[data-virt]');
    if (v) {   // aula que a grade ainda vai criar: vira aula de verdade ao abrir
      ev.preventDefault(); const [g, dia] = v.dataset.virt.split('|'); let id = null;
      try { sessao.aplicar((e) => { const r = materializar(e, Number(g), dia, new Date().toISOString()); id = r.aula.id; return r.estado; }); location.hash = `#aula/${id}`; } catch (e) { ctx.aviso(e.message); }
      return;
    }
    const b = ev.target.closest('[data-sem]'); if (!b) return;
    const d = Number(b.dataset.sem); deslocamento = d === 0 ? 0 : deslocamento + d; desenhar();
  };
  function alternarLembrete(el) {
    const id = Number(el.dataset.lem), feito = el.getAttribute('aria-checked') === 'true';
    try { sessao.aplicar((e) => marcarFeito(e, id, new Date(ctx.agora()).toISOString(), !feito)); } catch (e) { ctx.aviso(e.message); return; }
    desenhar(); raiz.querySelector(`[data-lem="${id}"]`)?.focus();
  }
  raiz.onkeydown = (ev) => { const lm = ev.target.closest?.('[data-lem]'); if (lm && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); alternarLembrete(lm); } };
  desenhar();
  return () => { window.removeEventListener('resize', ajustarEscala); };
}
