// Tela Planejar: plano dos próximos dias, provas, dificuldade e horas disponíveis, importar aulas (.ics) e exportar o plano.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss, alterarMateria } from '../../nucleo/materias.js';
import { DIAS_SEMANA, diaComSemana, somarDias, dataPorExtenso, diasEntre } from '../../nucleo/datas.js';
import { criarProva, excluirProva, restaurarProva, provasFuturas, aulasDaProva, marcarTarefaFeita, desmarcarTarefa } from '../../nucleo/planejador.js';
import { lerIcs, ocorrencias, gerarIcs } from '../../nucleo/ics.js';
import { importarOcorrencias, agruparPorTitulo, chaveDoTitulo } from '../../nucleo/agenda.js';
import { descreverHorario } from '../../nucleo/aulas.js';
import { diaDe } from '../foco_servico.js';

export function baixarTexto(texto, nome, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function desenharPlanejar(raiz, ctx) {
  const { sessao } = ctx;
  let erro = '', formProva = false, importacao = null, relatorio = '';
  const hoje = () => diaDe(ctx.agora());
  const mats = () => ativas(sessao.estado().disciplinas);

  function desenhar() {
    sessao.sincronizarPlano(hoje(), new Date(ctx.agora()).toISOString());
    const estado = sessao.estado(), h = hoje(), porId = new Map(estado.disciplinas.map((d) => [d.id, d]));
    const dias = Array.from({ length: 7 }, (_, i) => somarDias(h, i)), disp = sessao.disponibilidade();
    const doDia = (d) => estado.tarefas.filter((t) => !t.excluido_em && (t.feita_em ? t.feita_em.slice(0, 10) === d : t.dia === d));
    const semVaga = estado.tarefas.filter((t) => !t.feita_em && t.sem_vaga).length;
    raiz.innerHTML = `<h1>Planejar</h1><p class="sub">O plano se refaz sozinho: o que atrasa passa para os próximos dias, sempre antes da prova.</p>` +
      (semVaga ? `<div class="aviso ur"><span>${semVaga} ${semVaga === 1 ? 'bloco não cabe' : 'blocos não cabem'} nas horas disponíveis. Aumente o tempo livre abaixo ou fale com o professor sobre a data.</span></div>` : '') +
      `<div class="card bloco"><h2>Próximos 7 dias</h2>${(() => { let primeiro = true; return dias.map((d, i) => { const ts = doDia(d), pend = ts.filter((t) => !t.feita_em).length, titulo = `${escaparHtml(diaComSemana(d))}${d === h ? ' · hoje' : ''}`;
        const corpo = ts.length ? ts.map((t) => { const eh = primeiro && !t.feita_em; if (eh) primeiro = false; return linhaTarefa(t, porId, eh); }).join('') : '<p class="sub" style="margin:4px 0 10px">Nada planejado.</p>';
        return i < 2 ? `<div class="dia-plano${d === h ? ' hoje-p' : ''}"><h3 class="dia-t">${titulo}</h3>${corpo}</div>`
          : `<details class="dia-plano"><summary>${titulo} <span>${ts.length ? `${ts.length} ${ts.length === 1 ? 'tarefa' : 'tarefas'}` : 'livre'}</span></summary>${corpo}</details>`; }).join(''); })()}</div>` +
      `<div class="card bloco"><h2>Provas</h2>${provasFuturas(estado, h).map((p) => { const m = porId.get(p.disciplina_id), n = diasEntre(h, p.data); return `<div class="lin"><span class="pt" style="background:${m ? corCss(m.cor) : 'var(--tx2)'}"></span><div class="t">${escaparHtml(p.titulo)}<small>${escaparHtml(m?.nome ?? '')} · ${escaparHtml(dataPorExtenso(p.data))} · ${n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`} · ${aulasDaProva(p).length} ${aulasDaProva(p).length === 1 ? 'aula' : 'aulas'}</small></div><button class="btn peq sec" type="button" data-a="excluir-prova" data-id="${p.id}">Excluir</button></div>`; }).join('') || '<p class="sub">Nenhuma prova marcada.</p>'}` +
      (formProva ? formularioProva(estado) : '<p><button class="btn peq" type="button" data-a="nova-prova">Nova prova</button></p>') + '</div>' +
      `<div class="card bloco"><h2>Dificuldade das matérias</h2><p class="sub">De 1 (fácil) a 3 (difícil): matéria mais difícil pede mais blocos de estudo por aula.</p>${mats().map((m) => `<div class="lin"><span class="pt" style="background:${corCss(m.cor)}"></span><div class="t">${escaparHtml(m.nome)}</div><select class="in curto" data-dif="${m.id}" aria-label="Dificuldade de ${escaparHtml(m.nome)}">${[1, 2, 3].map((n) => `<option value="${n}" ${(m.dificuldade ?? 2) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`).join('') || '<p class="sub">Crie matérias primeiro.</p>'}</div>` +
      `<div class="card bloco"><h2>Tempo livre para estudar</h2><form id="disp" class="form"><div class="semana">${DIAS_SEMANA.map((d, i) => `<label class="c">${d.slice(0, 3)}<input class="in" name="d${i}" type="number" min="0" max="1440" step="5" inputmode="numeric" value="${disp[i]}"></label>`).join('')}</div><p class="sub" style="margin:0">Minutos por dia da semana. Zero = dia sem estudo.</p><div class="acoes"><button class="btn peq" type="submit">Salvar</button></div></form></div>` +
      `<div class="card bloco"><h2>Agenda (.ics)</h2><p class="sub">Importe as aulas do Google Agenda (Configurações › Importar e exportar › Exportar) ou leve o plano para ele. Importar de novo não duplica.</p>` +
      `<div class="acoes"><label class="btn peq sec arquivo">Importar aulas (.ics)<input type="file" id="ics" accept=".ics,text/calendar" hidden></label><button class="btn peq sec" type="button" data-a="exportar">Exportar plano (.ics)</button></div>` + painelImportacao() + (relatorio ? `<p class="sub" style="margin-top:10px">${escaparHtml(relatorio)}</p>` : '') + '</div>' +
      (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '');
    document.title = 'Planejar · Ohara';
  }

  function linhaTarefa(t, porId, destaque = false) {
    const m = porId.get(t.disciplina_id), atrasada = !t.feita_em && t.dia_original < t.dia;
    return `<div class="lin${destaque ? ' prox' : ''}"><button type="button" class="ck ${t.feita_em ? 'f' : ''}" data-a="${t.feita_em ? 'desfazer' : 'feita'}" data-id="${t.id}" aria-label="${t.feita_em ? 'Desmarcar' : 'Marcar como feita'}"></button>` +
      `<span class="pt" style="background:${m ? corCss(m.cor) : 'var(--tx2)'}"></span><div class="t" style="${t.feita_em ? 'opacity:.55;text-decoration:line-through' : ''}">${escaparHtml(t.titulo)}<small>${escaparHtml(m?.nome ?? '')} · ${t.minutos} min${atrasada ? ` · <span class="tag-ur">atrasada desde ${escaparHtml(dataPorExtenso(t.dia_original))}</span>` : ''}${t.sem_vaga && !t.feita_em ? ' · <span class="tag-ur">não cabe nas horas</span>' : ''}</small></div>` +
      (t.feita_em ? '' : destaque ? `<a class="btn peq" href="#foco/${t.id}">Começar</a>` : `<a class="ir-linha" href="#foco/${t.id}" aria-label="Começar ${escaparHtml(t.titulo)}">▶</a>`) + '</div>';
  }

  function formularioProva(estado) {
    const m = mats();
    return `<form class="form card sub-form" id="prova"><label class="c">Matéria<select class="in" name="materia">${m.map((x) => `<option value="${x.id}">${escaparHtml(x.nome)}</option>`).join('')}</select></label>` +
      `<label class="c">Nome da prova<input class="in" name="titulo" maxlength="80" placeholder="Ex.: Prova 1" autocomplete="off"></label><label class="c">Data<input class="in" name="data" type="date" required></label>` +
      `<fieldset class="aulas-prova" id="aulas-prova">${aulasCheckbox(m[0]?.id)}</fieldset>` +
      `<div class="acoes"><button class="btn peq" type="submit">Salvar prova</button><button class="btn peq sec" type="button" data-a="cancelar-prova">Cancelar</button></div></form>`;
  }
  function aulasCheckbox(discId) {
    const aulas = ativas(sessao.estado().aulas).filter((a) => a.disciplina_id === discId && a.tipo === 'aula').sort((x, y) => (x.inicio ?? '').localeCompare(y.inicio ?? ''));
    return `<legend class="c">Aulas que caem</legend>` + (aulas.length ? aulas.map((a) => `<label class="ck-linha"><input type="checkbox" name="aula" value="${a.id}" checked> ${escaparHtml(a.titulo)}${descreverHorario(a) ? ` <small>${escaparHtml(descreverHorario(a))}</small>` : ''}</label>`).join('') : '<p class="sub">Esta matéria ainda não tem aulas. Crie as aulas e depois marque a prova.</p>');
  }

  function painelImportacao() {
    if (!importacao) return '';
    const m = mats(), memoria = JSON.parse(sessao.lerConfig('ics_materia') || '{}');
    return `<form id="importar" class="form sub-form"><p class="sub" style="margin:8px 0 0">${importacao.total} ${importacao.total === 1 ? 'aula encontrada' : 'aulas encontradas'} (de hoje a 6 meses). Escolha a matéria de cada nome:</p>` +
      importacao.grupos.map((g) => `<div class="lin"><div class="t">${escaparHtml(g.titulo)}<small>${g.quantidade} ${g.quantidade === 1 ? 'aula' : 'aulas'} · a partir de ${escaparHtml(g.primeira.replace('T', ' '))}</small></div><select class="in" name="g|${escaparHtml(g.chave)}"><option value="">Não importar</option>${m.map((x) => `<option value="${x.id}" ${memoria[g.chave] === x.id ? 'selected' : ''}>${escaparHtml(x.nome)}</option>`).join('')}</select></div>`).join('') +
      `<div class="acoes"><button class="btn peq" type="submit">Importar</button><button class="btn peq sec" type="button" data-a="cancelar-ics">Cancelar</button></div></form>`;
  }

  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const id = Number(b.dataset.id), agora = new Date(ctx.agora()).toISOString();
    try {
      switch (b.dataset.a) {
        case 'feita': sessao.aplicar((e) => marcarTarefaFeita(e, id, agora)); break;
        case 'desfazer': sessao.aplicar((e) => desmarcarTarefa(e, id)); break;
        case 'nova-prova': formProva = true; break;
        case 'cancelar-prova': formProva = false; break;
        case 'excluir-prova': {
          const nome = sessao.estado().provas.find((p) => p.id === id)?.titulo;
          sessao.aplicar((e) => excluirProva(e, id, agora));
          ctx.aviso(`"${nome}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => { sessao.aplicar((e) => restaurarProva(e, id)); desenhar(); } });
          break;
        }
        case 'cancelar-ics': importacao = null; break;
        case 'exportar': {
          const e = sessao.estado(), t = gerarIcs({ tarefas: e.tarefas, provas: e.provas, nomes: new Map(e.disciplinas.map((d) => [d.id, d.nome])) }, agora);
          baixarTexto(t, `ohara-plano-${hoje()}.ics`, 'text/calendar'); relatorio = 'Plano exportado. No Google Agenda: Configurações › Importar e exportar › Importar.'; break;
        }
      }
      erro = '';
    } catch (e) { erro = e.message; }
    desenhar();
  };
  raiz.onchange = async (ev) => {
    const t = ev.target;
    if (t.dataset.dif) { try { sessao.aplicar((e) => alterarMateria(e, Number(t.dataset.dif), { dificuldade: Number(t.value) })); erro = ''; } catch (e) { erro = e.message; } desenhar(); }
    else if (t.name === 'materia' && t.closest('#prova')) { document.getElementById('aulas-prova').innerHTML = aulasCheckbox(Number(t.value)); }
    else if (t.id === 'ics' && t.files[0]) {
      try {
        const txt = await t.files[0].text(), h = hoje(), desl = -new Date().getTimezoneOffset();
        const oc = ocorrencias(lerIcs(txt, desl), h, somarDias(h, 183));
        importacao = oc.length ? { oc, grupos: agruparPorTitulo(oc), total: oc.length } : null; relatorio = oc.length ? '' : 'Não encontrei aulas com horário nesse arquivo (eventos de dia inteiro são ignorados).'; erro = '';
      } catch (e) { erro = e.message; }
      desenhar();
    }
  };
  raiz.onsubmit = (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), agora = new Date(ctx.agora()).toISOString();
    try {
      if (ev.target.id === 'prova') { sessao.aplicar((e) => criarProva(e, { disciplinaId: Number(f.get('materia')), titulo: f.get('titulo'), data: f.get('data'), aulas: f.getAll('aula').map(Number) }, agora).estado); formProva = false; }
      else if (ev.target.id === 'disp') { sessao.gravarDisponibilidade(Array.from({ length: 7 }, (_, i) => Number(f.get('d' + i)))); ctx.aviso('Tempo livre salvo.'); }
      else if (ev.target.id === 'importar') {
        const escolhas = new Map(), memoria = JSON.parse(sessao.lerConfig('ics_materia') || '{}');
        for (const [k, v] of f.entries()) if (k.startsWith('g|') && v) { escolhas.set(k.slice(2), Number(v)); memoria[k.slice(2)] = Number(v); }
        let r; sessao.aplicar((e) => { r = importarOcorrencias(e, importacao.oc, escolhas, agora); return r.estado; });
        sessao.gravarConfig('ics_materia', JSON.stringify(memoria));
        relatorio = `${r.criadas} ${r.criadas === 1 ? 'aula importada' : 'aulas importadas'}${r.jaExistiam ? `, ${r.jaExistiam} já existiam` : ''}${r.semMateria.length ? `; sem matéria: ${r.semMateria.join(', ')}` : ''}.`; importacao = null;
      }
      erro = '';
    } catch (e) { erro = e.message; }
    desenhar();
  };
  desenhar();
  return () => {};
}
