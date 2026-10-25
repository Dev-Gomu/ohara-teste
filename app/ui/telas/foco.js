// Tela Sala de Foco: escolher matéria e tarefa, começar um bloco (ou "Revisão no Anki"), acompanhar o relógio, abandonar.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss } from '../../nucleo/materias.js';
import { formatarRelogio, restanteMs, progresso } from '../../nucleo/foco.js';
import { sequencia, horasMinutos } from '../../nucleo/estudo.js';
import { diaDe } from '../foco_servico.js';

export function desenharFoco(raiz, ctx, tarefaId = null) {
  const { sessao, foco } = ctx;
  let confirmando = false, erro = '';
  const nomeMateria = (id) => sessao.estado().disciplinas.find((d) => d.id === id);

  function desenhar() {
    const s = foco.ativa(), cfg = foco.config();
    document.title = s ? `${formatarRelogio(restanteMs(s, Date.now()))} · Foco · Ohara` : 'Foco · Ohara';
    raiz.innerHTML = `<h1>Foco</h1>` + (s ? emAndamento(s) : ocioso(cfg)) + dosDia();
  }

  function dosDia() {
    const hoje = diaDe(Date.now()), blocos = sessao.estado().blocos.filter((b) => b.dia === hoje && !b.excluido_em);
    if (!blocos.length) return '';
    return `<div class="card bloco"><h2>Feito hoje</h2>${blocos.slice().reverse().map((b) => {
      const m = nomeMateria(b.disciplina_id);
      return `<div class="lin"><span class="pt" style="background:${m ? corCss(m.cor) : 'var(--tx2)'}"></span><div class="t">${escaparHtml(b.tarefa || (b.tipo === 'anki' ? 'Revisão no Anki' : 'Estudo'))}<small>${escaparHtml(m?.nome ?? 'Sem matéria')} · ${b.minutos_feitos} min${b.estado === 'abandonado' ? ` de ${b.minutos_previstos} (abandonado)` : ''}</small></div></div>`;
    }).join('')}</div>`;
  }

  function ocioso(cfg) {
    const alvo = tarefaId == null ? null : sessao.estado().tarefas.find((t) => t.id === tarefaId && !t.feita_em && !t.excluido_em);
    const metaMin = cfg.meta_diaria_min, sq = sequencia(sessao.estado().blocos, diaDe(Date.now()), metaMin);
    const mats = ativas(sessao.estado().disciplinas);
    return `<p class="sub">Hoje: ${horasMinutos(sq.minutosHoje)} de ${horasMinutos(metaMin)}${sq.dias ? ` · sequência de ${sq.dias} ${sq.dias === 1 ? 'dia' : 'dias'}` : ''}</p>` +
      `<form class="card form" id="novo"><label class="c">Matéria<select class="in" name="materia"><option value="">Sem matéria</option>${mats.map((m) => `<option value="${m.id}" ${alvo?.disciplina_id === m.id ? 'selected' : ''}>${escaparHtml(m.nome)}</option>`).join('')}</select></label>` +
      `<label class="c">O que vai estudar<input class="in" name="tarefa" maxlength="120" autocomplete="off" value="${escaparHtml(alvo?.titulo ?? '')}" placeholder="Ex.: ler os slides da aula 4"></label>` +
      `<label class="c">Minutos<input class="in" name="minutos" type="number" min="1" max="180" value="${alvo ? Math.max(alvo.minutos, 1) : cfg.foco_min}" inputmode="numeric"></label>` +
      (alvo ? `<input type="hidden" name="tarefa_id" value="${alvo.id}"><p class="sub" style="margin:0">Tarefa do plano: ao concluir o bloco ela é marcada como feita.</p>` : '') +
      (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '') +
      `<div class="acoes"><button class="btn" type="submit" value="foco">Começar bloco</button><button class="btn sec" type="submit" value="anki">Revisão no Anki</button></div></form>`;
  }

  function emAndamento(s) {
    const m = nomeMateria(s.disciplina_id), pausa = s.fase === 'pausa';
    const rotulo = pausa ? (s.longa ? 'Pausa longa' : 'Pausa') : (s.tipo === 'anki' ? 'Revisão no Anki' : 'Bloco de foco');
    return `<p class="sub">${escaparHtml(rotulo)}${m ? ' · ' + escaparHtml(m.nome) : ''}${s.tarefa && !pausa ? ' · ' + escaparHtml(s.tarefa) : ''}</p>` +
      `<div class="card relogio"><div class="grande" id="relogio">${formatarRelogio(restanteMs(s, Date.now()))}</div><div class="fino"><span id="prog" style="width:${Math.round(progresso(s, Date.now()) * 100)}%"></span></div>` +
      (confirmando ? `<div class="confirma"><p>Abandonar o bloco? Conta só os minutos inteiros que você já fez (${Math.min(Math.floor((Date.now() - s.inicio_ms) / 60000), Math.round(s.duracao_ms / 60000))} min).</p><div class="acoes"><button class="btn peq ur" type="button" data-a="abandonar-sim">Abandonar</button><button class="btn peq sec" type="button" data-a="abandonar-nao">Continuar</button></div></div>`
        : `<div class="acoes">${pausa ? '<button class="btn" type="button" data-a="pular">Pular pausa</button>' : '<button class="btn sec" type="button" data-a="abandonar">Abandonar bloco</button>'}</div>`) + `</div>`;
  }

  raiz.onsubmit = (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), tipo = ev.submitter?.value === 'anki' ? 'anki' : 'foco';
    try {
      foco.iniciar({ tarefa: f.get('tarefa') || (tipo === 'anki' ? 'Revisão no Anki' : ''), disciplinaId: f.get('materia') ? Number(f.get('materia')) : null, tipo, minutos: Number(f.get('minutos')), tarefaId: f.get('tarefa_id') ? Number(f.get('tarefa_id')) : null });
      erro = '';
    } catch (e) { erro = e.message; }
    desenhar();
  };
  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'abandonar') { confirmando = true; desenhar(); }
    else if (b.dataset.a === 'abandonar-nao') { confirmando = false; desenhar(); }
    else if (b.dataset.a === 'abandonar-sim') { const m = foco.abandonar(); confirmando = false; ctx.aviso(m ? `Bloco abandonado: ${m} min registrados.` : 'Bloco abandonado (menos de 1 minuto, nada registrado).'); desenhar(); }
    else if (b.dataset.a === 'pular') { foco.pularPausa(); desenhar(); }
  };

  let ultima = foco.ativa()?.fase + '|' + foco.ativa()?.inicio_ms;
  const parar = foco.ouvir(() => {
    const s = foco.ativa(), chave = s?.fase + '|' + s?.inicio_ms;
    if (chave !== ultima) { ultima = chave; confirmando = false; desenhar(); return; }
    if (s) {
      const r = document.getElementById('relogio'); if (!r) return;
      r.textContent = formatarRelogio(restanteMs(s, Date.now())); document.getElementById('prog').style.width = Math.round(progresso(s, Date.now()) * 100) + '%';
      document.title = `${r.textContent} · Foco · Ohara`;
    }
  });
  desenhar();
  return parar;
}
