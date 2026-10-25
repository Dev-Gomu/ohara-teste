// Tela Painel: sequência, semana (meta semanal), horas por matéria e calendário estudou / não estudou.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss } from '../../nucleo/materias.js';
import { sequencia, resumoDaSemana, horasMinutos } from '../../nucleo/estudo.js';
import { diaDe } from '../foco_servico.js';
import { htmlCalendario, mudarMes } from '../calendario.js';

export function desenharPainel(raiz, ctx) {
  const { sessao, foco } = ctx;
  let { ano, mes } = (() => { const [a, m] = diaDe(ctx.agora()).split('-'); return { ano: Number(a), mes: Number(m) }; })();

  function desenhar() {
    const hoje = diaDe(ctx.agora()), estado = sessao.estado(), cfg = foco.config(), inicioUso = sessao.lerConfig('inicio_uso');
    const sq = sequencia(estado.blocos, hoje, cfg.meta_diaria_min), sem = resumoDaSemana(estado.blocos, hoje), mats = new Map(estado.disciplinas.map((d) => [d.id, d]));
    const faltam = Math.max(0, cfg.meta_diaria_min - sq.minutosHoje), maior = Math.max(1, ...sem.porMateria.map((x) => x.minutos));
    raiz.innerHTML = `<h1>Painel</h1><p class="sub">Meta de ${horasMinutos(cfg.meta_diaria_min)} por dia e ${horasMinutos(cfg.meta_semanal_min)} por semana (mude em Ajustes).</p>` +
      `<div class="tres"><div class="card"><h2>Sequência</h2><div class="big" style="${sq.emRisco ? 'color:var(--ur)' : ''}">${sq.dias}<small>${sq.dias === 1 ? 'dia' : 'dias'}</small></div><p class="sub" style="margin:10px 0 0;${sq.emRisco ? 'color:var(--ur)' : ''}">${sq.hojeAtingido ? 'Meta de hoje atingida.' : sq.emRisco ? `Em risco: faltam ${horasMinutos(faltam)} hoje.` : `Hoje: ${horasMinutos(sq.minutosHoje)} de ${horasMinutos(cfg.meta_diaria_min)}.`}</p></div>` +
      `<div class="card"><h2>Esta semana</h2><div class="big">${horasMinutos(sem.total)}</div><div class="bar"><span style="width:${Math.min(100, Math.round(sem.total / cfg.meta_semanal_min * 100))}%"></span></div><p class="sub" style="margin:0">Meta: ${horasMinutos(cfg.meta_semanal_min)} (${Math.min(100, Math.round(sem.total / cfg.meta_semanal_min * 100))}%)</p></div>` +
      `<div class="card"><h2>Por matéria, na semana</h2>${sem.porMateria.length ? sem.porMateria.map((x) => { const m = mats.get(x.id); return `<div class="barra"><span>${escaparHtml(m && !m.excluido_em ? m.nome : x.id == null ? 'Sem matéria' : 'Matéria apagada')}</span><div class="fino" style="max-width:none"><span style="width:${Math.round(x.minutos / maior * 100)}%;background:${m ? corCss(m.cor) : 'var(--tx2)'}"></span></div><b>${horasMinutos(x.minutos)}</b></div>`; }).join('') : '<p class="sub" style="margin:0">Nenhum bloco nesta semana ainda.</p>'}</div></div>` +
      `<div class="card cal-card" id="cal"><h2>Calendário</h2>${htmlCalendario({ ano, mes, estado, hoje, metaMin: cfg.meta_diaria_min, inicioUso })}<div class="leg"><span><i class="lg e"></i>meta atingida</span><span><i class="lg pa"></i>abaixo da meta</span><span><i class="lg n"></i>não estudou</span></div></div>`;
    document.title = 'Painel · Ohara';
  }
  raiz.onclick = (ev) => { const b = ev.target.closest('[data-mes]'); if (!b) return; ({ ano, mes } = mudarMes({ ano, mes }, Number(b.dataset.mes))); desenhar(); };
  desenhar();
  return () => {};
}
