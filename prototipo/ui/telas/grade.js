// Editor da grade semanal (dentro da Agenda): a semana desenhada à esquerda e um painel fixo à direita. Tocar num bloco edita o
// horário; tocar num espaço vazio prepara um horário novo. Cada horário é uma REGRA que se repete (toda semana ou quinzenal);
// mudar vale "a partir de" uma data, e o que já aconteceu ou já tem conteúdo não muda (regras em nucleo/grade.js).
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss, siglaDaMateria } from '../../nucleo/materias.js';
import { criarHorario, alterarHorario, excluirHorario, inverterQuinzenal, sugerirGrade, aplicarGrade } from '../../nucleo/grade.js';
import { DIAS_SEMANA, dataPorExtenso } from '../../nucleo/datas.js';
import { diaDe } from '../foco_servico.js';
import { distribuirFaixas } from '../../nucleo/faixas.js';

const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const min = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const arredonda = (m) => Math.round(m / 30) * 30;

export function desenharGrade(raiz, ctx) {
  const { sessao } = ctx;
  const hoje = () => diaDe(ctx.agora()), agora = () => new Date(ctx.agora()).toISOString();
  let ref = hoje(), cur = null, erro = '';       // ref: a data em que a grade é mostrada; cur: { h?, rasc } (horário em edição ou rascunho novo)
  const mats = () => ativas(sessao.estado().disciplinas);

  const vigentes = () => {
    const vivas = new Set(mats().map((m) => m.id));
    return ativas(sessao.estado().grade ?? []).filter((h) => vivas.has(h.disciplina_id) && h.desde <= ref && (!h.ate || h.ate >= ref));
  };
  const proximaMudanca = () => ativas(sessao.estado().grade ?? []).map((h) => h.desde).filter((d) => d > ref).sort()[0] ?? null;

  function bloco(h, total, h0, porId, f = { faixa: 0, de: 1 }) {
    const m = porId.get(h.disciplina_id);
    const topo = (min(h.inicio) - h0 * 60) / total * 100, alt = (min(h.fim) - min(h.inicio)) / total * 100;   // respiro de 1,5 px em cima e embaixo; horários no mesmo horário dividem a largura
    return `<button type="button" class="gd-bl${h.repete === 'quinzenal' ? ' qz' : ''}${cur?.h?.id === h.id ? ' s' : ''}" data-id="${h.id}" style="--c:${corCss(m.cor)};top:calc(${topo}% + 1.5px);height:calc(${alt}% - 3px);left:calc(${f.faixa / f.de * 100}% + 4px);right:auto;width:calc(${100 / f.de}% - 8px)">` +
      `<span class="l1"><i class="sg">${escaparHtml(siglaDaMateria(m))}</i>${h.rotulo ? `<b>${escaparHtml(h.rotulo)}</b>` : ''}${h.repete === 'quinzenal' ? '<em>quinz.</em>' : ''}</span>` +
      `<span class="l2">${h.inicio}–${h.fim}${h.local ? ` · ${escaparHtml(h.local)}` : ''}</span></button>`;
  }

  function painel() {
    const sug = sugerirGrade(sessao.estadoCompleto());
    if (!cur) {
      return `<div class="cab"><h2>Horário</h2></div><p class="vazio">Toque num bloco para editar ou num espaço vazio para criar um horário.</p>` +
        (sug.length ? `<div class="gd-sug"><p>Achei <b>${sug.length}</b> ${sug.length === 1 ? 'horário' : 'horários'} nas aulas que você já tem (as importadas do Google Agenda).</p><button class="btn peq" type="button" data-a="montar">Montar a grade com eles</button></div>` : '') +
        `<div class="esp"></div><div class="leg"><span><i class="q1"></i> bloco cheio: toda semana</span><span><i class="q2"></i> bloco com contorno: quinzenal</span></div>`;
    }
    const r = cur.rasc, novo = !cur.h, q = r.repete === 'quinzenal';
    return `<div class="cab"><h2>${novo ? 'Novo horário' : 'Editar horário'}</h2></div><form id="fh" class="gd-form">` +
      `<label class="c">Matéria<select class="in" name="mat">${mats().map((m) => `<option value="${m.id}"${m.id === r.disciplinaId ? ' selected' : ''}>${escaparHtml(m.nome)}</option>`).join('')}</select></label>` +
      `<div class="f2"><label class="c">Início<input class="in" type="time" step="1800" name="ini" value="${r.inicio}"></label><label class="c">Fim<input class="in" type="time" step="1800" name="fim" value="${r.fim}"></label></div>` +
      `<div class="f2"><label class="c">Dia<select class="in" name="dia">${DIAS_SEMANA.map((d, i) => `<option value="${i}"${i === r.diaSemana ? ' selected' : ''}>${d}</option>`).join('')}</select></label>` +
      `<label class="c">Repete<select class="in" name="rep"><option value="semanal"${q ? '' : ' selected'}>toda semana</option><option value="quinzenal"${q ? ' selected' : ''}>quinzenal</option></select></label></div>` +
      `<div class="f2"><label class="c">Rótulo<input class="in" name="rot" maxlength="20" placeholder="T, P, Tutoria" value="${escaparHtml(r.rotulo)}" autocomplete="off"></label><label class="c">Sala<input class="in" name="loc" maxlength="80" placeholder="opcional" value="${escaparHtml(r.local)}" autocomplete="off"></label></div>` +
      `<label class="c">Vale a partir de<input class="in" type="date" name="desde" value="${r.aPartirDe}"></label>` +
      `<p class="dica">${novo ? 'Começa nessa data.' : 'Mudar vale daqui para frente; as aulas que já aconteceram ou já têm anotações, arquivos ou cartões não mudam.'}${q ? ' Na quinzenal, a primeira aula é o primeiro dia desse tipo a partir da data.' : ''}</p>` +
      (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '') +
      `<div class="esp"></div><div class="acoes"><button class="btn peq" type="submit">Salvar</button><button class="btn peq sec" type="button" data-a="fechar">Cancelar</button>` +
      (novo ? '' : `${q ? '<button class="btn peq sec" type="button" data-a="inverter">Inverter semanas</button>' : ''}<button class="btn peq sec" type="button" data-a="excluir">Excluir daqui para frente</button>`) + '</div></form>';
  }

  function desenhar() {
    const hs = vigentes(), porId = new Map(sessao.estado().disciplinas.map((m) => [m.id, m]));
    const ini = hs.length ? Math.min(...hs.map((h) => min(h.inicio))) : 420, fim = hs.length ? Math.max(...hs.map((h) => min(h.fim))) : 1140;
    const h0 = Math.min(7, Math.floor(ini / 60)), h1 = Math.max(19, Math.ceil(fim / 60)), total = (h1 - h0) * 60;
    const nd = hs.some((h) => h.dia_semana === 6) ? 7 : 6, mudanca = proximaMudanca();
    raiz.className = 'tgrade';
    raiz.innerHTML = `<div class="gd"><div class="gd-topo"><a class="voltar" href="#planejar">‹ Agenda</a><h1>Grade semanal</h1><span class="esp"></span>` +
      (mudanca ? `<button class="btn peq sec" type="button" data-a="ver" data-d="${mudanca}">Ver a mudança de ${dataPorExtenso(mudanca)}</button>` : '') +
      `<label class="gd-ref">Grade em <input class="in" type="date" id="ref" value="${ref}"></label></div>` +
      `<div class="gd-corpo"><div class="card gd-grade"><div class="gd-cab" style="--nd:${nd}"><span></span>${DIAS.slice(0, nd).map((d) => `<span>${d}</span>`).join('')}</div>` +
      `<div class="gd-gr" style="--nd:${nd}"><div class="gd-hr">${Array.from({ length: h1 - h0 + 1 }, (_, i) => `<span style="top:${i * 60 / total * 100}%">${h0 + i}h</span>`).join('')}</div>` +
      DIAS.slice(0, nd).map((d, i) => `<div class="gd-col" data-d="${i}" data-h0="${h0}" data-total="${total}">${Array.from({ length: h1 - h0 }, (_, j) => `<i class="ln" style="top:${j * 60 / total * 100}%"></i>`).join('')}${(() => { const doDia = hs.filter((h) => h.dia_semana === i), fx = distribuirFaixas(doDia.map((h) => ({ ini: min(h.inicio), fim: min(h.fim) }))); return doDia.map((h, k) => bloco(h, total, h0, porId, fx[k])).join(''); })()}</div>`).join('') +
      `</div></div><div class="card gd-painel">${painel()}</div></div></div>`;
  }

  const rascDe = (h) => ({ disciplinaId: h.disciplina_id, diaSemana: h.dia_semana, inicio: h.inicio, fim: h.fim, repete: h.repete, rotulo: h.rotulo, local: h.local, aPartirDe: ref > h.desde ? ref : h.desde });
  const lerForm = () => {
    const f = new FormData(raiz.querySelector('#fh'));
    return { disciplinaId: Number(f.get('mat')), diaSemana: Number(f.get('dia')), inicio: f.get('ini'), fim: f.get('fim'), repete: f.get('rep'), rotulo: f.get('rot'), local: f.get('loc'), aPartirDe: f.get('desde') };
  };
  const aplicar = (mudar) => { try { sessao.aplicar(mudar); erro = ''; return true; } catch (e) { erro = e.message; return false; } };

  raiz.onclick = (ev) => {
    const a = ev.target.closest('[data-a]'), bl = ev.target.closest('.gd-bl'), col = ev.target.closest('.gd-col');
    if (a) {
      const acao = a.dataset.a;
      if (acao === 'fechar') { cur = null; erro = ''; }
      else if (acao === 'ver') { ref = a.dataset.d; cur = null; }
      else if (acao === 'montar') { aplicar((e) => aplicarGrade(e, sugerirGrade(e), agora())); }
      else if (acao === 'excluir' || acao === 'inverter') {
        const dados = lerForm(), antes = sessao.estadoCompleto();
        if (aplicar((e) => (acao === 'excluir' ? excluirHorario(e, cur.h.id, dados.aPartirDe, agora()) : inverterQuinzenal(e, cur.h.id, dados.aPartirDe, agora())))) {
          ref = dados.aPartirDe > ref ? dados.aPartirDe : ref; cur = null;
          ctx.aviso(acao === 'excluir' ? 'Horário tirado da grade daqui para frente.' : 'Semanas invertidas a partir dessa data.', { texto: 'Desfazer', fazer: () => { sessao.aplicar(() => antes); desenhar(); } });
        } else cur.rasc = { ...cur.rasc, ...dados };
      }
    } else if (bl) {
      const h = (sessao.estado().grade ?? []).find((x) => x.id === Number(bl.dataset.id)); cur = { h, rasc: rascDe(h) }; erro = '';
    } else if (col && !ev.target.closest('.gd-bl')) {
      const r = col.getBoundingClientRect(), total = Number(col.dataset.total), h0 = Number(col.dataset.h0);
      const m = Math.max(h0 * 60, Math.min(arredonda(h0 * 60 + (ev.clientY - r.top) / r.height * total), h0 * 60 + total - 60));
      cur = { h: null, rasc: { disciplinaId: mats()[0]?.id, diaSemana: Number(col.dataset.d), inicio: hhmm(m), fim: hhmm(m + 60), repete: 'semanal', rotulo: '', local: '', aPartirDe: ref } }; erro = '';
    } else return;
    desenhar();
  };
  raiz.onchange = (ev) => {
    if (ev.target.id === 'ref') { if (ev.target.value) { ref = ev.target.value; cur = null; desenhar(); } return; }
    if (cur && ev.target.closest('#fh') && (ev.target.name === 'rep')) { cur.rasc = { ...cur.rasc, ...lerForm() }; desenhar(); }
  };
  raiz.onsubmit = (ev) => {
    ev.preventDefault();
    const d = lerForm();
    const dados = { disciplinaId: d.disciplinaId, diaSemana: d.diaSemana, inicio: d.inicio, fim: d.fim, repete: d.repete, rotulo: d.rotulo, local: d.local };
    const ok = cur.h
      ? aplicar((e) => alterarHorario(e, cur.h.id, { ...dados, ...(d.repete === 'quinzenal' && cur.h.repete === 'quinzenal' ? {} : { ancora: null }) }, d.aPartirDe, agora()))
      : aplicar((e) => criarHorario(e, { ...dados, desde: d.aPartirDe }, agora()).estado);
    if (ok) { if (d.aPartirDe > ref) ref = d.aPartirDe; cur = null; ctx.aviso('Grade salva.'); } else cur.rasc = { ...cur.rasc, ...d };
    desenhar();
  };
  // Se a janela mudar de tamanho ou voltar a ficar visível (o painel do navegador às vezes monta a página com altura mínima e só acerta com um clique),
  // a tela se desenha de novo sem perder o que está sendo digitado.
  const reajustar = () => {
    if (!raiz.querySelector('.gd')) return;
    if (cur && raiz.querySelector('#fh')) cur.rasc = { ...cur.rasc, ...lerForm() };
    desenhar();
  };
  const aoVoltar = () => { if (!document.hidden) reajustar(); };
  addEventListener('resize', reajustar); document.addEventListener('visibilitychange', aoVoltar);
  desenhar();
  return () => { removeEventListener('resize', reajustar); document.removeEventListener('visibilitychange', aoVoltar); raiz.className = ''; };
}
