// Aba Notas da matéria (dentro de ui/telas/materia.js), atrás do PIN. Dois semestres, cada um com o seu cabeçalho e os seus dois bimestres;
// o bimestre atual (pasta com estrela no Acervo) é o tom mais forte da tela. Regras de cálculo: nucleo/notas.js. Prefixo nt-.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas } from '../../nucleo/materias.js';
import { TIPOS, NOTA_MAXIMA, calcularNotas, criarItem, alterarItem, excluirItem, restaurarItem, lancarReposicao, definirEsquema, provasDaAgenda, formatarNota } from '../../nucleo/notas.js';
import { telaDoPin, temPin, aberto, abrir, trancar, atividade, definirPin, removerPin } from '../pin.js';

const ICONES = {
  prova: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
  trabalho: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5h6v2"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17v.01"/>',
  outro: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>',
};
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const MAIS = svg('<path d="M12 5v14M5 12h14"/>'), ENGR = svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>');
const LOCK = svg('<rect x="5" y="11" width="14" height="9" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
const num = (v) => (Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 100) / 100).replace('.', ',') : '');

export function desenharNotas(raiz, ctx, materiaId) {
  const sessao = ctx.sessao;
  let limpaPin = null, modal = null, erro = '', esqueci = false, relogio = null;
  const agora = () => ctx.agora();
  const materia = () => ativas(sessao.estadoCompleto().disciplinas).find((d) => d.id === materiaId);
  const somenteLeitura = () => materia()?.ano_id != null;
  const parar = () => { limpaPin?.(); limpaPin = null; };

  function desenhar() {
    parar();
    if (!materia()) { raiz.innerHTML = ''; return; }
    if (!aberto(agora())) { desenharPin(); return; }
    abrir(agora());
    raiz.innerHTML = tela();
  }

  // ---------- PIN ----------
  function desenharPin() {
    modal = null;
    const criar = !temPin();
    raiz.innerHTML = '<div class="nt-pin" id="nt-pin"></div>';
    const no = raiz.querySelector('#nt-pin');
    const extra = criar ? '<span class="pin-aviso">O PIN só esconde a tela. Ele não protege o arquivo de backup.</span>' : '<button type="button" class="pin-link" data-a="esqueci">Esqueci o PIN</button>';
    limpaPin = telaDoPin(no, {
      modo: criar ? 'criar' : 'abrir', titulo: criar ? 'Proteger as notas' : 'Notas protegidas', extra,
      aoAcertar: (pin) => { if (criar) definirPin(pin, agora()); else abrir(agora()); desenhar(); },
    });
    if (esqueci && !criar) {
      no.insertAdjacentHTML('beforeend', '<div class="nt-esqueci"><p>Apagar o PIN <b>não apaga as notas</b>. Mas qualquer pessoa com acesso a este app poderia fazer o mesmo. Apagar e criar um novo?</p>' +
        '<div class="nt-acoes"><button type="button" class="nt-btn" data-a="esqueci-sim">Apagar o PIN</button><button type="button" class="nt-btn sec" data-a="esqueci-nao">Cancelar</button></div></div>');
    }
  }

  // ---------- tela ----------
  const pill = (t, c = '') => `<span class="nt-chip ${c}">${t}</span>`;
  const parcial = (p) => (p ? pill('parcial', 'par') : '');

  function itemHtml(i, so) {
    const ic = `<span class="nt-ic">${svg(ICONES[i.tipo] ?? ICONES.outro)}</span>`;
    const pend = i.nota == null;
    return `<button type="button" class="nt-ir${pend ? ' pd' : ''}" data-a="item" data-id="${i.id}" ${so ? 'disabled' : ''} aria-label="${escaparHtml(i.titulo)}, ${pend ? 'pendente' : 'nota ' + formatarNota(i.nota)}">${ic}<span class="n">${escaparHtml(i.titulo)}</span>` +
      (i.reposicao ? pill('reposição') : '') + (pend ? pill('pendente', 'pd') : `<b>${formatarNota(Math.min(NOTA_MAXIMA, i.nota + i.bonus))}</b>`) + '</button>';
  }

  function bimestreHtml(b, so) {
    const barra = b.itens.length ? `<div class="nt-bar">${b.itens.map((i) => `<u style="flex:${i.pct}" title="${escaparHtml(i.titulo)} · ${Math.round(i.pct)}%"></u>`).join('')}</div>` : '<div class="nt-bar vazia"></div>';
    return `<article class="nt-bc${b.atual ? ' now' : ''}"><div class="nt-hd"><h4>${b.n}º bimestre</h4>${b.atual ? pill('bimestre atual', 'tag') : ''}</div><div class="nt-sub">${num(b.peso)}% do semestre</div>` +
      `<div class="nt-itens">${b.itens.length ? b.itens.map((i) => itemHtml(i, so)).join('') : `<button type="button" class="nt-ir vz" data-a="novo" data-b="${b.n}" ${so ? 'disabled' : ''}><span class="n">Nenhum item ainda</span>${pill('+ item')}</button>`}</div>` +
      `<div class="nt-ft"><span>Média</span>${parcial(b.parcial && b.media != null)}<b>${formatarNota(b.media)}</b></div>${barra}</article>`;
  }

  function tela() {
    const m = materia(), r = calcularNotas(sessao.estadoCompleto(), materiaId), so = somenteLeitura();
    const p = r.preciso;
    const preciso = p.situacao === 'sem-base' ? ['—', 'lance as notas do 1º semestre'] : p.situacao === 'ok' ? ['ok', `o 1º semestre já garante os ${formatarNota(r.minimo)} no ano`]
      : p.situacao === 'dificil' ? [formatarNota(p.valor), 'passa de 10: não dá mais com as notas de agora'] : [formatarNota(p.valor), `no 2º semestre<br>para aprovar com ${formatarNota(r.minimo)}`];
    const sem = r.semestres.map((s) => {
      const cls = r.atual == null || s.atual ? 'cur' : 'oth';
      return `<section class="nt-sb ${cls}"><div class="nt-sh"><span class="t">${s.n}º semestre</span>${s.atual ? pill('semestre atual') : ''}${parcial(s.parcial && s.media != null)}<b>${formatarNota(s.media)}</b></div>` +
        `<div class="nt-bs">${s.bimestres.map((b) => bimestreHtml(b, so)).join('')}</div></section>`;
    }).join('');
    return `<div class="nt"><div class="nt-sum"><div class="nt-sc"><div><small>Média do ano</small><div class="big">${formatarNota(r.ano.media)}</div></div>${parcial(r.ano.parcial && r.ano.media != null)}</div>` +
      `<div class="nt-sc nd"><div><small>Preciso de</small><div class="nb">${preciso[0]}</div></div><em>${preciso[1]}</em></div>` +
      `<div class="nt-lado"><button type="button" class="nt-ib" data-a="novo" title="Nova nota" aria-label="Nova nota" ${so ? 'disabled' : ''}>${MAIS}</button>` +
      `<button type="button" class="nt-ib" data-a="pesos" title="Pesos e regras" aria-label="Pesos e regras" ${so ? 'disabled' : ''}>${ENGR}</button>` +
      `<button type="button" class="nt-ib" data-a="trancar" title="Trancar as notas" aria-label="Trancar as notas">${LOCK}</button></div></div>` +
      `<div class="nt-sems">${sem}</div>${modal ? modalHtml(m) : ''}</div>` + (erro ? `<p class="erro nt-erro">${escaparHtml(erro)}</p>` : '');
  }

  // ---------- janelas ----------
  const opcoesTipo = (sel) => Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  const opcoesBim = (sel) => [1, 2, 3, 4].map((n) => `<option value="${n}" ${n === Number(sel) ? 'selected' : ''}>${n}º bimestre</option>`).join('');

  function modalHtml() {
    const e = sessao.estadoCompleto();
    if (modal.tipo === 'item') {
      const it = modal.id ? ativas(e.avaliacoes ?? []).find((x) => x.id === modal.id) : null;
      const doItem = it ?? { bimestre: modal.bimestre ?? 1, titulo: '', tipo: 'prova', peso: modal.peso ?? 1, nota: null, bonus: 0 };
      const agenda = it ? [] : provasDaAgenda(e, materiaId);
      const rep = it ? ativas(e.avaliacoes ?? []).find((x) => x.reposicao_de === it.id) : null;
      return `<div class="nt-modal" role="dialog" aria-modal="true" aria-label="${it ? 'Editar item' : 'Nova nota'}"><form class="nt-dlg" id="nt-form" data-k="item" data-id="${it?.id ?? ''}"><h3>${it ? 'Editar item' : 'Nova nota'}</h3>` +
        (agenda.length ? `<label class="c">Da Agenda (opcional)<select class="in" name="agenda"><option value="">Nenhuma</option>${agenda.map((p) => `<option value="${escaparHtml(p.origem)}" data-t="${escaparHtml(p.titulo)}" data-b="${p.bimestre ?? ''}" data-p="${p.peso}">${escaparHtml(p.titulo)}${p.bimestre ? ` · ${p.bimestre}º bim.` : ''}</option>`).join('')}</select></label>` : '') +
        `<label class="c">Nome<input class="in" name="titulo" maxlength="80" autocomplete="off" required value="${escaparHtml(doItem.titulo)}" placeholder="Ex.: Prova 1"></label>` +
        `<div class="nt-duas"><label class="c">Tipo<select class="in" name="tipo">${opcoesTipo(doItem.tipo)}</select></label><label class="c">Bimestre<select class="in" name="bimestre">${opcoesBim(doItem.bimestre)}</select></label></div>` +
        `<div class="nt-tres"><label class="c">Nota (0 a 10)<input class="in" name="nota" inputmode="decimal" autocomplete="off" value="${doItem.nota == null ? '' : num(doItem.nota)}" placeholder="vazio = pendente"></label>` +
        `<label class="c">Peso no bimestre<input class="in" name="peso" inputmode="decimal" autocomplete="off" value="${num(doItem.peso)}"></label>` +
        `<label class="c">Bônus<input class="in" name="bonus" inputmode="decimal" autocomplete="off" value="${doItem.bonus ? num(doItem.bonus) : ''}" placeholder="0"></label></div>` +
        `<p class="nt-dica">Só a proporção do peso importa: 60 e 40 valem 60% e 40%. Nota vazia = pendente (não vale zero).</p>` +
        (it ? `<label class="c">Reposição (substitui a nota acima quando preenchida)<input class="in" name="reposicao" inputmode="decimal" autocomplete="off" value="${rep?.nota == null ? '' : num(rep.nota)}" placeholder="sem reposição"></label>` : '') +
        '<p class="erro nt-merro" role="alert"></p>' +
        `<div class="nt-acoes"><button class="nt-btn" type="submit">Salvar</button><button class="nt-btn sec" type="button" data-a="fechar">Cancelar</button>${it ? '<button class="nt-btn sec ex" type="button" data-a="excluir">Excluir</button>' : ''}</div></form></div>`;
    }
    // pesos e regras
    const r = calcularNotas(e, materiaId), q = r.esquema;
    const faixa = (a, b) => `<div class="nt-faixa" data-faixa="${a}"><i style="flex:${a}">${num(a)}%</i><i style="flex:${b}">${num(b)}%</i></div>`;
    const sems = r.semestres.map((s) => {
      const b1 = s.bimestres[0].peso;
      return `<div class="nt-pg"><h4>${s.n}º semestre</h4><label class="c">Peso do 1º bimestre<span class="nt-faixa-l"><input type="range" name="b${s.n}" min="10" max="90" step="5" value="${b1}" aria-label="Peso do ${s.n * 2 - 1}º bimestre">` +
        `<output>${num(b1)} / ${num(100 - b1)}</output></span></label>${faixa(b1, 100 - b1)}` +
        `<details class="nt-bonus"${q.bonus_bimestre.slice(s.n * 2 - 2, s.n * 2).some(Boolean) || q.bonus_semestre[s.n - 1] ? ' open' : ''}><summary>Bônus (opcional)</summary><div class="nt-duas"><label class="c">No ${s.n * 2 - 1}º bimestre<input class="in" name="bb${s.n * 2 - 1}" inputmode="decimal" value="${q.bonus_bimestre[s.n * 2 - 2] || ''}" placeholder="0"></label>` +
        `<label class="c">No ${s.n * 2}º bimestre<input class="in" name="bb${s.n * 2}" inputmode="decimal" value="${q.bonus_bimestre[s.n * 2 - 1] || ''}" placeholder="0"></label></div>` +
        `<label class="c">No semestre<input class="in" name="bs${s.n}" inputmode="decimal" value="${q.bonus_semestre[s.n - 1] || ''}" placeholder="0"></label></details></div>`;
    }).join('');
    const itens = r.semestres.flatMap((s) => s.bimestres).filter((b) => b.itens.length).map((b) =>
      `<div class="nt-pi"><b>${b.n}º bimestre</b>${b.itens.map((i) => `<label class="nt-pil"><span>${escaparHtml(i.titulo)}</span><input class="in" name="i${i.id}" inputmode="decimal" value="${num(i.peso)}" aria-label="Peso de ${escaparHtml(i.titulo)}"><em>${Math.round(i.pct)}%</em></label>`).join('')}</div>`).join('');
    const ps = q.pesos_semestre[0];
    return `<div class="nt-modal" role="dialog" aria-modal="true" aria-label="Pesos e regras"><form class="nt-dlg largo" id="nt-form" data-k="pesos"><h3>Pesos e regras</h3>` +
      `<p class="nt-dica">Vale só para esta matéria neste ano. Os bimestres de cada semestre somam sempre 100%.</p>` +
      `<div class="nt-duas"><label class="c">Nota para passar<input class="in" name="minimo" inputmode="decimal" value="${num(q.minimo)}"></label>` +
      `<label class="c">Peso do 1º semestre no ano<span class="nt-faixa-l"><input type="range" name="s1" min="10" max="90" step="5" value="${ps}" aria-label="Peso do 1º semestre"><output>${num(ps)} / ${num(100 - ps)}</output></span></label></div>` +
      `<div class="nt-pgs">${sems}</div>${itens ? `<h4 class="nt-h4">Pesos dos itens</h4><div class="nt-pis">${itens}</div>` : ''}` +
      '<p class="erro nt-merro" role="alert"></p>' +
      `<div class="nt-acoes"><button class="nt-btn" type="submit">Salvar</button><button class="nt-btn sec" type="button" data-a="fechar">Cancelar</button></div></form></div>`;
  }

  const lerNum = (v) => Number(String(v ?? '').trim().replace(',', '.') || 0);

  function salvarItem(form) {
    const f = new FormData(form), id = Number(form.dataset.id) || null;
    const dados = { titulo: f.get('titulo'), tipo: f.get('tipo'), bimestre: f.get('bimestre'), peso: f.get('peso'), nota: f.get('nota'), bonus: f.get('bonus') };
    try {
      sessao.aplicar((e) => {
        let x;
        if (id) { x = alterarItem(e, id, dados); const rep = f.get('reposicao'); if (rep !== '' || ativas(x.avaliacoes).some((a) => a.reposicao_de === id)) x = lancarReposicao(x, id, rep, new Date().toISOString()); return x; }
        return criarItem(e, materiaId, { ...dados, origem: f.get('agenda') || '' }, new Date().toISOString()).estado;
      });
      modal = null; erro = '';
    } catch (e) { form.querySelector('.nt-merro').textContent = e.message; return; }
    atualizar();
  }

  function salvarPesos(form) {
    const f = new FormData(form);
    try {
      sessao.aplicar((e) => {
        const b1 = lerNum(f.get('b1')), b2 = lerNum(f.get('b2')), s1 = lerNum(f.get('s1'));
        let x = definirEsquema(e, materiaId, {
          minimo: lerNum(f.get('minimo')), pesos_semestre: [s1, 100 - s1], pesos_bimestre: [b1, 100 - b1, b2, 100 - b2],
          bonus_bimestre: [1, 2, 3, 4].map((n) => lerNum(f.get(`bb${n}`))), bonus_semestre: [1, 2].map((n) => lerNum(f.get(`bs${n}`))),
        });
        for (const [k, v] of f.entries()) if (/^i\d+$/.test(k)) x = alterarItem(x, Number(k.slice(1)), { peso: v });
        return x;
      });
      modal = null; erro = '';
    } catch (e) { form.querySelector('.nt-merro').textContent = e.message; return; }
    atualizar();
  }

  function excluirComDesfazer(id) {
    const titulo = ativas(sessao.estadoCompleto().avaliacoes ?? []).find((x) => x.id === id)?.titulo;
    sessao.aplicar((e) => excluirItem(e, id, new Date().toISOString())); modal = null; atualizar();
    ctx.aviso(`"${titulo}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => { sessao.aplicar((e) => restaurarItem(e, id)); atualizar(); } });
  }

  /** Redesenha mantendo o foco útil (no campo da janela aberta ou no botão que a abriu). */
  function atualizar() {
    desenhar();
    raiz.querySelector('.nt-dlg input[name="titulo"], .nt-dlg input[name="nota"], .nt-dlg input[name="minimo"]')?.focus();
  }

  const sincronizarPesos = (inp) => {
    const lado = inp.closest('.c'), fx = lado?.nextElementSibling;
    const v = Number(inp.value), out = inp.parentElement.querySelector('output');
    if (out) out.textContent = `${num(v)} / ${num(100 - v)}`;
    if (fx?.classList.contains('nt-faixa')) { const [a, b] = fx.children; a.style.flex = v; b.style.flex = 100 - v; a.textContent = `${num(v)}%`; b.textContent = `${num(100 - v)}%`; }
  };

  // ---------- eventos ----------
  const tocou = () => atividade(agora());
  raiz.addEventListener('pointerdown', tocou); raiz.addEventListener('keydown', tocou);
  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b || !raiz.contains(b)) return;
    ev.stopPropagation();
    switch (b.dataset.a) {
      case 'item': modal = { tipo: 'item', id: Number(b.dataset.id) }; atualizar(); break;
      case 'novo': modal = { tipo: 'item', id: null, bimestre: Number(b.dataset.b) || undefined }; atualizar(); break;
      case 'pesos': modal = { tipo: 'pesos' }; atualizar(); break;
      case 'fechar': modal = null; atualizar(); break;
      case 'excluir': excluirComDesfazer(Number(raiz.querySelector('#nt-form').dataset.id)); break;
      case 'trancar': trancar(); modal = null; desenhar(); break;
      case 'esqueci': esqueci = true; desenhar(); break;
      case 'esqueci-nao': esqueci = false; desenhar(); break;
      case 'esqueci-sim': removerPin(); esqueci = false; desenhar(); break;
    }
  };
  raiz.onsubmit = (ev) => { ev.preventDefault(); ev.stopPropagation(); const f = ev.target; if (f.id !== 'nt-form') return; if (f.dataset.k === 'pesos') salvarPesos(f); else salvarItem(f); };
  raiz.oninput = (ev) => { if (ev.target.type === 'range') sincronizarPesos(ev.target); };
  raiz.onchange = (ev) => {
    const s = ev.target; if (s.name !== 'agenda') return;
    const o = s.selectedOptions[0], f = s.form; if (!o?.value) return;
    f.titulo.value = o.dataset.t; if (o.dataset.b) f.bimestre.value = o.dataset.b; if (o.dataset.p) f.peso.value = num(o.dataset.p);
  };
  const teclaEsc = (ev) => { if (ev.key === 'Escape' && modal) { ev.stopPropagation(); modal = null; atualizar(); } };
  document.addEventListener('keydown', teclaEsc, true);
  // tranca sozinha depois de 2 minutos sem toque nem tecla
  relogio = setInterval(() => { if (raiz.isConnected && !modal && !aberto(agora()) && !raiz.querySelector('.nt-pin')) desenhar(); else if (modal) atividade(agora()); }, 5000);   // janela aberta conta como atividade

  desenhar();
  return () => {
    parar(); clearInterval(relogio); document.removeEventListener('keydown', teclaEsc, true);
    raiz.removeEventListener('pointerdown', tocou); raiz.removeEventListener('keydown', tocou);
    raiz.onclick = raiz.onsubmit = raiz.oninput = raiz.onchange = null; raiz.innerHTML = '';
  };
}

