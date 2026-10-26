// Tela Hoje: responde "o que faço agora?" (aula em andamento, bloco de foco ou começar um bloco), mostra o que vem
// depois hoje, os minutos e a sequência do dia, o calendário e o lembrete de backup. Vermelho só na cobrança.
import { escaparHtml } from '../../nucleo/texto.js';
import { situacaoBackup } from '../../nucleo/backup.js';
import { ativas, corCss } from '../../nucleo/materias.js';
import { emAulaAgora, descreverHorario } from '../../nucleo/aulas.js';
import { diaComSemana, diasEntre, dataPorExtenso, inicioDaSemana, somarDias } from '../../nucleo/datas.js';
import { aulasDoDia, faixaDeHoras, situacaoDaAula, posicao, diasDaSemana } from '../../nucleo/linhadia.js';
import { tarefasDoDia, provasFuturas } from '../../nucleo/planejador.js';
import { sequencia, cobrancaDeOntem, horasMinutos, minutosPorDia } from '../../nucleo/estudo.js';
import { formatarRelogio, restanteMs } from '../../nucleo/foco.js';
import { diaDe } from '../foco_servico.js';
import { htmlCalendario, mudarMes } from '../calendario.js';

const dois = (n) => String(n).padStart(2, '0');
const horaLocal = (ms) => { const d = new Date(ms); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; };
const agoraLocal = (ms) => { const d = new Date(ms); return `${diaDe(ms)}T${dois(d.getHours())}:${dois(d.getMinutes())}`; };

/** `ctx.agora()` devolve o instante atual em ms (nos testes dá para simular outro). */
export function desenharHoje(raiz, ctx) {
  const { sessao, foco } = ctx;
  let { ano, mes } = (() => { const [a, m] = diaDe(ctx.agora()).split('-'); return { ano: Number(a), mes: Number(m) }; })();

  function desenhar() {
    const agora = ctx.agora(), hoje = diaDe(agora);
    sessao.sincronizarPlano(hoje, new Date(agora).toISOString());
    const estado = sessao.estado(), cfg = foco.config(), plano = tarefasDoDia(estado, hoje), proxima = provasFuturas(estado, hoje)[0];
    const inicioUso = sessao.lerConfig('inicio_uso'), mats = ativas(estado.disciplinas), porId = new Map(mats.map((m) => [m.id, m]));
    const sq = sequencia(estado.blocos, hoje, cfg.meta_diaria_min), cobr = cobrancaDeOntem(estado.blocos, hoje, cfg.meta_diaria_min, inicioUso);
    const bk = situacaoBackup(sessao.lerConfig('ultimo_backup'), new Date(agora).toISOString(), mats.length > 0);
    const aulasAgora = emAulaAgora(estado, agoraLocal(agora)), sessaoFoco = foco.ativa();
    const aulasHoje = ativas(estado.aulas).filter((a) => a.inicio && a.inicio.slice(0, 10) === hoje && porId.has(a.disciplina_id));
    const depois = aulasHoje.filter((a) => a.inicio > agoraLocal(agora) && !aulasAgora.includes(a)).sort((x, y) => x.inicio.localeCompare(y.inicio));

    let hero;
    if (sessaoFoco) {
      const m = porId.get(sessaoFoco.disciplina_id), pausa = sessaoFoco.fase === 'pausa';
      hero = { cor: m ? corCss(m.cor) : null, rotulo: pausa ? 'Pausa' : 'Bloco em andamento', titulo: `<span id="rel-hoje">${formatarRelogio(restanteMs(sessaoFoco, agora))}</span>`, sub: pausa ? 'Respire. O próximo bloco espera por você.' : escaparHtml(sessaoFoco.tarefa || m?.nome || 'Foco'), href: '#foco', botao: 'Abrir Sala de Foco' };
    } else if (aulasAgora.length) {
      const a = aulasAgora[0], m = porId.get(a.disciplina_id), ini = Date.parse(a.inicio), fim = Date.parse(a.fim), pct = Math.round(Math.min(1, Math.max(0, (Date.parse(agoraLocal(agora)) - ini) / (fim - ini))) * 100);
      hero = { cor: m ? corCss(m.cor) : null, rotulo: `Em aula · ${descreverHorario(a).split(' ').slice(1).join(' ')}`, titulo: escaparHtml(m?.nome ?? a.titulo), sub: `${escaparHtml(a.titulo)} · faltam ${Math.max(0, Math.round((fim - Date.parse(agoraLocal(agora))) / 60000))} min`, pct, href: `#aula/${a.id}`, botao: 'Abrir aula' };
    } else if (plano.pendentes.length) {
      const t = plano.pendentes[0], m = porId.get(t.disciplina_id), atrasada = t.dia_original < hoje;
      hero = { cor: m ? corCss(m.cor) : null, rotulo: `Próximo estudo${atrasada ? ' · atrasado' : ''}`, titulo: escaparHtml(t.titulo), sub: `${escaparHtml(m?.nome ?? '')} · bloco de ${t.minutos} min`, href: `#foco/${t.id}`, botao: 'Começar bloco' };
    } else {
      hero = { cor: null, rotulo: sq.minutosHoje ? 'Continue' : 'Hora de estudar', titulo: 'Começar um bloco', sub: `Hoje: ${horasMinutos(sq.minutosHoje)} de ${horasMinutos(cfg.meta_diaria_min)}`, href: '#foco', botao: 'Ir para a Sala de Foco' };
    }

    const agoraMin = Number(agoraLocal(agora).slice(11, 13)) * 60 + Number(agoraLocal(agora).slice(14, 16));
    const aulasDia = aulasDoDia(estado, hoje), faixa = faixaDeHoras(aulasDia), PX = 44, altura = (faixa.ate - faixa.de) * PX;
    const hhmm = (m) => `${dois(Math.floor(m / 60))}:${dois(m % 60)}`, topo = (m) => (m - faixa.de * 60) / 60 * PX;
    const minDia = minutosPorDia(estado.blocos), semana = diasDaSemana(inicioDaSemana(hoje), hoje, somarDias);
    const horas = []; for (let h = faixa.de; h <= faixa.ate; h += 2) horas.push(h);
    const linhaDoDia = aulasDia.length
      ? `<div class="eixo" style="height:${altura}px">${horas.map((h) => `<span class="hr" style="top:${(h - faixa.de) * PX}px">${dois(h)}h</span>`).join('')}` +
        aulasDia.map((a) => { const m = porId.get(a.disciplina_id), sit = situacaoDaAula(a, agoraMin); return `<a class="ev ${sit}" href="#aula/${a.id}" style="--c:${corCss(m.cor)};top:${topo(a.ini)}px;height:${Math.max(26, (a.fim - a.ini) / 60 * PX - 3)}px"><b>${escaparHtml(m.nome)}</b><small>${hhmm(a.ini)} a ${hhmm(a.fim)} · ${escaparHtml(a.titulo)}</small></a>`; }).join('') +
        (posicao(agoraMin, faixa) != null ? `<div class="agora" style="top:${topo(agoraMin)}px"><span>${hhmm(agoraMin)}</span></div>` : '') + '</div>'
      : '<p class="vazio" style="margin:6px 0 0">Nenhuma aula hoje.</p>';
    const pendentes = plano.pendentes.slice(sessaoFoco || aulasAgora.length ? 0 : 1);

    raiz.innerHTML = `<div class="hoje2">` +
      (cobr ? `<div class="ban"><div><b>${cobr.tipo === 'nao' ? 'Ontem você não estudou.' : `Ontem você estudou só ${horasMinutos(cobr.minutos)}.`}</b><span>${cobr.tipo === 'nao' ? 'A sequência zerou. Recomece com um bloco curto.' : `A meta é ${horasMinutos(cfg.meta_diaria_min)} por dia. A sequência recomeça hoje.`}</span></div><a class="bt" href="#foco">Começar agora</a></div>` : '') +
      `<div class="faixa"><div><h1>Hoje</h1><div class="dt"><span class="dia">${escaparHtml(diaComSemana(hoje))}</span><span class="sep"> · </span><span class="hora">${horaLocal(agora)}</span></div></div><div class="semana">${semana.map((d) => `<div class="${d.hoje ? 'h' : ''}">${d.nome}<b>${d.n}</b>${(minDia.get(d.dia) ?? 0) > 0 ? '<i></i>' : ''}</div>`).join('')}</div></div>` +
      `<div class="h2g"><div class="card dia"><h2>Seu dia</h2>${linhaDoDia}</div><div class="col">` +
      `<div class="hero ${hero.cor ? '' : 'ne'}" style="${hero.cor ? '--c:' + hero.cor : ''}"><div><div class="ov">${escaparHtml(hero.rotulo)}</div><h1>${hero.titulo}</h1><div class="sb">${hero.sub}</div>${hero.pct != null ? `<div class="pr"><span style="width:${hero.pct}%"></span></div>` : ''}</div><div class="ac"><a class="bt" href="${hero.href}">${hero.botao}</a></div></div>` +
      `<div class="dois"><div class="cd"><div class="sec">Hoje</div><div class="big">${sq.minutosHoje}<small>min de ${horasMinutos(cfg.meta_diaria_min)}</small></div><div class="bar"><span style="width:${Math.min(100, Math.round(sq.minutosHoje / cfg.meta_diaria_min * 100))}%"></span></div></div>` +
      `<div class="cd"><div class="sec">Sequência</div><div class="big" style="${sq.emRisco || sq.dias === 0 && cobr ? 'color:var(--ur)' : ''}">${sq.dias}<small>${sq.dias === 1 ? 'dia' : 'dias'}</small></div>${sq.emRisco ? '<div class="sub" style="margin:8px 0 0;color:var(--ur)">em risco</div>' : ''}</div></div>` +
      (mats.length ? `<div class="out">Abrir aula de outra matéria: ${mats.map((m) => `<a href="#materias/${m.id}"><b style="--c:${corCss(m.cor)}"><i></i>${escaparHtml(m.nome)}</b></a>`).join('')}</div>` : '<div class="out">Crie sua primeira matéria em <a href="#materias"><b>Matérias</b></a>.</div>') +
      (pendentes.length ? `<div class="card"><h2>Estudo de hoje</h2><div class="lst">${pendentes.map((t) => { const m = porId.get(t.disciplina_id); return `<a class="r" href="#foco/${t.id}" style="--c:${m ? corCss(m.cor) : 'var(--tx2)'}"><span class="h">${t.minutos} min</span><i class="d"></i><div class="t">${escaparHtml(t.titulo)}<small>${escaparHtml(m?.nome ?? '')}${t.dia_original < hoje ? ' · <span class="tag-ur">atrasada</span>' : ''}</small></div></a>`; }).join('')}</div>${plano.feitas.length ? `<div class="feito">Feito hoje: ${plano.feitas.map((t) => escaparHtml(t.titulo)).join('; ')}</div>` : ''}</div>` : (plano.feitas.length ? `<div class="feito">Feito hoje do plano: ${plano.feitas.map((t) => escaparHtml(t.titulo)).join('; ')}</div>` : '')) +
      `<div class="card" id="cal">${htmlCalendario({ ano, mes, estado, hoje, metaMin: cfg.meta_diaria_min, inicioUso })}${proxima ? `<div class="prova-linha"><i style="background:${porId.get(proxima.disciplina_id) ? corCss(porId.get(proxima.disciplina_id).cor) : 'var(--ur)'}"></i>${escaparHtml(proxima.titulo)} · ${escaparHtml(porId.get(proxima.disciplina_id)?.nome ?? '')}<span>${escaparHtml(dataPorExtenso(proxima.data))} · ${diasEntre(hoje, proxima.data) === 0 ? 'hoje' : `em ${diasEntre(hoje, proxima.data)} dias`}</span></div>` : ''}</div>` +
      (bk.estado === 'nada' ? '' : `<div class="bk${bk.estado === 'ok' ? '' : ' ur'}" id="aviso-backup">${escaparHtml(bk.texto)} <a href="#ajustes">Fazer backup</a></div>`) + `</div></div>` +
      `<a class="fab" href="#foco" title="Novo bloco de foco" aria-label="Novo bloco de foco">+</a></div>`;
    document.title = 'Hoje · Ohara';
  }

  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-mes]'); if (!b) return;
    ({ ano, mes } = mudarMes({ ano, mes }, Number(b.dataset.mes))); desenhar();
  };
  desenhar();
  let ultima = foco.ativa()?.fase + '|' + foco.ativa()?.inicio_ms;
  return foco.ouvir(() => {
    const s = foco.ativa(), chave = s?.fase + '|' + s?.inicio_ms;
    if (chave !== ultima) { ultima = chave; desenhar(); return; }
    const r = document.getElementById('rel-hoje'); if (r && s) r.textContent = formatarRelogio(restanteMs(s, ctx.agora()));
  });
}
