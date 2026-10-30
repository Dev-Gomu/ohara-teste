// Tela Hoje (layout "calendário grande"): calendário de seis semanas com as provas, as próximas provas por data e a agenda compacta do dia
// (cada aula é um bloco; a duração só no horário). No topo: o que fazer agora (bloco de foco ou próximo estudo), minutos e sequência.
// Vermelho só na cobrança. O desenho é estático: sem animação e sem blocos que mudam de lugar.
import { escaparHtml } from '../../nucleo/texto.js';
import { situacaoBackup } from '../../nucleo/backup.js';
import { ativas, corCss, siglaDaMateria } from '../../nucleo/materias.js';
import { diaComSemana, MESES_CURTOS } from '../../nucleo/datas.js';
import { tarefasDoDia } from '../../nucleo/planejador.js';
import { sequencia, cobrancaDeOntem, horasMinutos } from '../../nucleo/estudo.js';
import { formatarRelogio, restanteMs } from '../../nucleo/foco.js';
import { janelaDeSemanas, proximasProvasPorData, agendaCompacta, posicaoDoMarcador } from '../../nucleo/hoje.js';
import { diaDe } from '../foco_servico.js';

const dois = (n) => String(n).padStart(2, '0');
const horaLocal = (ms) => { const d = new Date(ms); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; };
const agoraLocal = (ms) => { const d = new Date(ms); return `${diaDe(ms)}T${dois(d.getHours())}:${dois(d.getMinutes())}`; };
const hhmm = (m) => `${dois(Math.floor(m / 60))}:${dois(m % 60)}`;
const cap = (t) => t[0].toUpperCase() + t.slice(1);

/** `ctx.agora()` devolve o instante atual em ms (nos testes dá para simular outro). */
export function desenharHoje(raiz, ctx) {
  const { sessao, foco } = ctx;
  let observador = null;
  let deslocamento = 0;   // semanas que o calendário andou para a frente (ou para trás) em relação à semana de hoje

  function desenhar() {
    const agora = ctx.agora(), hoje = diaDe(agora);
    sessao.sincronizarPlano(hoje, new Date(agora).toISOString());
    const estado = sessao.estado(), cfg = foco.config(), plano = tarefasDoDia(estado, hoje);
    const inicioUso = sessao.lerConfig('inicio_uso'), mats = ativas(estado.disciplinas), porId = new Map(mats.map((m) => [m.id, m]));
    const sq = sequencia(estado.blocos, hoje, cfg.meta_diaria_min), cobr = cobrancaDeOntem(estado.blocos, hoje, cfg.meta_diaria_min, inicioUso);
    const bk = situacaoBackup(sessao.lerConfig('ultimo_backup'), new Date(agora).toISOString(), mats.length > 0);
    const sessaoFoco = foco.ativa();
    const agoraMin = Number(agoraLocal(agora).slice(11, 13)) * 60 + Number(agoraLocal(agora).slice(14, 16));

    // o que fazer agora: bloco em andamento, próximo estudo do plano ou começar um bloco
    let acao;
    if (sessaoFoco) {
      const pausa = sessaoFoco.fase === 'pausa';
      acao = { texto: `${pausa ? 'Pausa' : 'Bloco em andamento'} · <span id="rel-hoje">${formatarRelogio(restanteMs(sessaoFoco, agora))}</span>`, href: '#foco' };
    } else if (plano.pendentes.length) {
      const t = plano.pendentes[0]; acao = { texto: `Próximo estudo · ${escaparHtml(t.titulo)}`, href: `#foco/${t.id}` };
    } else acao = { texto: 'Começar um bloco', href: '#foco' };

    // calendário: seis semanas, número no meio da linha, uma pílula colorida por prova
    const janela = janelaDeSemanas(estado, hoje, { deslocamento }), primeiro = janela[0].dias[0], ultimo = janela[janela.length - 1].dias[6];
    const tituloCal = primeiro.mes === ultimo.mes ? `${cap(MESES_CURTOS[primeiro.mes - 1])} ${primeiro.dia.slice(0, 4)}`
      : primeiro.dia.slice(0, 4) === ultimo.dia.slice(0, 4) ? `${cap(MESES_CURTOS[primeiro.mes - 1])} – ${cap(MESES_CURTOS[ultimo.mes - 1])} ${ultimo.dia.slice(0, 4)}`
      : `${cap(MESES_CURTOS[primeiro.mes - 1])} ${primeiro.dia.slice(0, 4)} – ${cap(MESES_CURTOS[ultimo.mes - 1])} ${ultimo.dia.slice(0, 4)}`;
    const corpoCal = janela.map((s) => `<div class="hsem${s.atual ? ' at' : ''}">` + s.dias.map((d) => {
      const pils = d.provas.map((id) => `<i style="background:${porId.get(id) ? corCss(porId.get(id).cor) : 'var(--tx2)'}"></i>`).join('');
      const nomes = d.provas.map((id) => porId.get(id)?.nome).filter(Boolean).join(', ');
      return `<div class="hdia${d.hoje ? ' h' : ''}${d.provas.length ? ' p' : ''}"${nomes ? ` title="${escaparHtml(`${d.n} de ${MESES_CURTOS[d.mes - 1]}: ${nomes}`)}"` : ''}>${d.primeiroDoMes ? `<small class="mm">${MESES_CURTOS[d.mes - 1]}</small>` : ''}<span class="n">${d.n}</span>${pils ? `<span class="pils">${pils}</span>` : ''}</div>`;
    }).join('') + '</div>').join('');
    const calendario = `<div class="card hcal" id="cal"><div class="hcab"><h2>Calendário</h2><b class="mes">${escaparHtml(tituloCal)}</b><span class="esp"></span>${deslocamento ? '<button type="button" class="btn peq sec" data-sem="0">Hoje</button>' : ''}<button type="button" class="seta" data-sem="-1" aria-label="Semana anterior">‹</button><button type="button" class="seta" data-sem="1" aria-label="Próxima semana">›</button></div>` +
      `<div class="hds">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}</div><div class="hsems" style="--sem:${janela.length}">${corpoCal}</div></div>`;

    // próximas provas por data: dia e mês, siglas com a pílula da cor e o tempo que falta
    const { datas, total } = proximasProvasPorData(estado, hoje, 8);
    const provas = `<div class="card hprov"><div class="hph"><h2>Próximas provas${total ? ` <span class="cont">${total}</span>` : ''}</h2>${total > 0 ? `<a class="mais" href="#planejar" data-total="${total}" hidden>Ver todas · ${total} dias ›</a>` : ''}</div>` + (datas.length
      ? '<div class="hlinhas">' + datas.map((d, k) => `<div class="hlin${k === 0 ? ' px' : ''}" aria-label="${d.n} de ${MESES_CURTOS[d.mes - 1]}"><span class="hd"><b>${dois(d.n)}</b><small>${MESES_CURTOS[d.mes - 1]}</small></span><span class="hsg">${d.disciplinas.map((id) => { const m = porId.get(id); return `<span class="sg"><i style="background:${m ? corCss(m.cor) : 'var(--tx2)'}"></i>${escaparHtml(m ? siglaDaMateria(m) : '?')}</span>`; }).join('')}</span><span class="hr" title="${d.texto}">${d.em === 0 ? 'hoje' : `${d.em}d`}</span></div>`).join('') + '</div>'
      : '<p class="vazio">Nenhuma prova marcada. Cadastre em <a href="#planejar"><b>Planejar</b></a>.</p>') + '</div>';

    // agenda compacta
    const ag = agendaCompacta(estado, hoje, agoraMin), nAulas = ag.itens.filter((x) => x.tipo === 'aula').length;
    const itens = ag.itens.map((it) => {
      if (it.tipo === 'livre') return `<div class="hlivre">${hhmm(it.ini)} – ${hhmm(it.fim)} · livre</div>`;
      const m = porId.get(it.disciplina_id);
      return `<a class="hev ${it.situacao}" href="#aula/${it.id}" style="--c:${m ? corCss(m.cor) : 'var(--tx2)'}" title="${escaparHtml(it.titulo)}"><span class="eh">${it.situacao === 'agora' ? '' : `${dois(Math.floor(it.ini / 60))}h`}</span><span class="evb"><b>${escaparHtml(m?.nome ?? it.titulo)}</b><span>${hhmm(it.ini)} – ${hhmm(it.fim)}</span></span></a>`;
    }).join('');
    const agenda = `<div class="card hag"><div class="hcab"><h2>Agenda</h2><span class="esp"></span><span class="sub">${nAulas ? `${diaComSemana(hoje).split(',')[0].toLowerCase()} · ${nAulas} ${nAulas === 1 ? 'aula' : 'aulas'}` : ''}</span></div>` +
      (ag.itens.length ? `<div class="hscroll"><div class="hlista">${itens}<div class="hagora" style="top:${posicaoDoMarcador(ag, agoraMin).toFixed(1)}px"><span>${hhmm(agoraMin)}</span></div></div></div>`
        : `<p class="vazio">${mats.length ? 'Nada marcado para hoje.' : 'Crie sua primeira matéria em <a href="#materias"><b>Matérias</b></a>.'}</p>`) + '</div>';

    raiz.className = 'tcheia'; observador?.disconnect();
    raiz.innerHTML = `<div class="hoje2 hj">` +
      (cobr ? `<div class="ban"><div><b>${cobr.tipo === 'nao' ? 'Ontem você não estudou.' : `Ontem você estudou só ${horasMinutos(cobr.minutos)}.`}</b><span>${cobr.tipo === 'nao' ? 'A sequência zerou. Recomece com um bloco curto.' : `A meta é ${horasMinutos(cfg.meta_diaria_min)} por dia. A sequência recomeça hoje.`}</span></div><a class="bt" href="#foco">Começar agora</a></div>` : '') +
      `<div class="hchips"><span class="chip"><b>${sq.minutosHoje}</b>/${cfg.meta_diaria_min} min</span><span class="chip${sq.emRisco ? ' risco' : ''}"><b>${sq.dias}</b>&nbsp;${sq.dias === 1 ? 'dia' : 'dias'}${sq.emRisco ? '&nbsp;· em risco' : ''}</span>` +
      `<a class="bt hacao" href="${acao.href}">${acao.texto}</a></div>` +
      `<div class="hgrade">${calendario}<div class="hdir">${provas}${agenda}</div></div>` +
      (bk.estado === 'nada' ? '' : `<div class="bk${bk.estado === 'ok' ? '' : ' ur'}" id="aviso-backup">${escaparHtml(bk.texto)} <a href="#ajustes">Fazer backup</a></div>`) +
      `</div>`;
    document.title = 'Hoje · Ohara';
    const rolo = raiz.querySelector('.hscroll'), marc = raiz.querySelector('.hagora');
    if (rolo && marc && rolo.scrollHeight > rolo.clientHeight) rolo.scrollTop = Math.max(0, marc.offsetTop - rolo.clientHeight / 3);   // agenda mais alta que o espaço: mostra o agora
    const cartao = raiz.querySelector('.hprov');
    if (cartao && typeof ResizeObserver !== 'undefined') { observador = new ResizeObserver(() => ajustarProvas(cartao)); observador.observe(cartao); }
  }

  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-sem]'); if (!b) return;
    const d = Number(b.dataset.sem); deslocamento = d === 0 ? 0 : deslocamento + d; desenhar();
  };
  desenhar();
  let ultima = foco.ativa()?.fase + '|' + foco.ativa()?.inicio_ms;
  const parar = foco.ouvir(() => {
    const s = foco.ativa(), chave = s?.fase + '|' + s?.inicio_ms;
    if (chave !== ultima) { ultima = chave; desenhar(); return; }
    const r = document.getElementById('rel-hoje'); if (r && s) r.textContent = formatarRelogio(restanteMs(s, ctx.agora()));
  });
  return () => { observador?.disconnect(); parar?.(); };
}

/** Mostra tantas datas quantas cabem no cartão (no mínimo 2); o "Ver todas" aparece se alguma ficou de fora. */
function ajustarProvas(cartao) {
  const linhas = [...cartao.querySelectorAll('.hlin')], mais = cartao.querySelector('.mais'), cab = cartao.querySelector('.hph'); if (!linhas.length) return;
  linhas.forEach((l) => { l.hidden = false; }); if (mais) mais.hidden = false;
  if (getComputedStyle(cartao).flexGrow === '0') { if (mais) mais.hidden = true; return; }   // layout empilhado (altura livre): mostra todas
  const cs = getComputedStyle(cartao), uteis = cartao.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - cab.offsetHeight - 10;
  const n = Math.max(2, Math.min(linhas.length, Math.floor(uteis / 40)));
  linhas.forEach((l, i) => { l.hidden = i >= n; });
  if (mais) mais.hidden = n >= Number(mais.dataset.total);
}
