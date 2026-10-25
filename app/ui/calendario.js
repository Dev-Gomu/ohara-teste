// Calendário do mês (usado em Hoje e Painel): células quadradas; meta atingida cheia, parcial pela metade,
// "não estudou" com contorno vermelho, hoje invertido; ponto da cor da matéria nos dias com aula.
import { MESES } from '../nucleo/datas.js';
import { calendarioDoMes } from '../nucleo/estudo.js';
import { corCss } from '../nucleo/materias.js';

const CLASSE = { meta: 'e', parcial: 'pa', nao: 'n', antes: 'ant', futuro: 'fut' };

export function htmlCalendario({ ano, mes, estado, hoje, metaMin, inicioUso }) {
  const cores = new Map(estado.disciplinas.map((d) => [d.id, corCss(d.cor)]));
  const celulas = calendarioDoMes(ano, mes, { blocos: estado.blocos, aulas: estado.aulas.filter((a) => !a.excluido_em), provas: estado.provas, hoje, metaMin, inicioUso });
  const dias = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x) => `<b>${x}</b>`).join('');
  const corpo = celulas.map((c) => c.vazio ? '<span class="v"></span>'
    : `<span class="${c.hoje ? 'h' : CLASSE[c.situacao]}" title="${c.dia}">${c.n}${c.prova ? '<u class="prova" title="Prova"></u>' : ''}${c.aulas.length ? `<i class="pts">${[...new Set(c.aulas)].slice(0, 3).map((id) => `<em style="background:${cores.get(id) ?? 'var(--tx2)'}"></em>`).join('')}</i>` : ''}</span>`).join('');
  return `<div class="calh"><button type="button" data-mes="-1" aria-label="Mês anterior">‹</button><b>${MESES[mes - 1][0].toUpperCase() + MESES[mes - 1].slice(1)} ${ano}</b><button type="button" data-mes="1" aria-label="Próximo mês">›</button></div><div class="cal">${dias}${corpo}</div>`;
}

/** Soma `delta` meses a { ano, mes }. */
export function mudarMes({ ano, mes }, delta) { const t = ano * 12 + (mes - 1) + delta; return { ano: Math.floor(t / 12), mes: (t % 12) + 1 }; }
