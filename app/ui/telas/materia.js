// Tela Matéria (por dentro de uma matéria no Acervo): abas Aulas | Cartões. Em Aulas: faixa de pastas (os bimestres, por exemplo),
// a lista de aulas da pasta e, ao lado, o card da aula selecionada com a capa do slide (1ª página do PDF).
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss, siglaDaMateria } from '../../nucleo/materias.js';
import { abrirMenu } from '../menu.js';
import { criarAula, excluirAula, restaurarAula } from '../../nucleo/aulas.js';
import { criarPasta, renomearPasta, excluirPasta, restaurarPasta, moverAula, pastasDaMateria, aulasDaPasta, contagemPorPasta } from '../../nucleo/pastas.js';
import { arquivosDaAula, ehPdf } from '../../nucleo/arquivos.js';
import { cartoesDaAula } from '../../nucleo/cartoes.js';
import { diaDaSemana } from '../../nucleo/datas.js';
import { anosEncerrados } from '../../nucleo/anos.js';
import { capaDoArquivo } from '../componentes/leitor.js';
import { desenharCartoes } from './flashcards/gerenciar.js';
import * as pref from '../preferencias.js';

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Capas já lidas (1ª página do PDF), guardadas entre aberturas da tela: arquivo → { url, paginas }. As mais antigas saem.
const CAPAS = new Map(), LIMITE_CAPAS = 24;
const PASTA = '<svg class="mt-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const FANTASMA = '<svg class="mt-fant" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 15l5-5 4 4 3-3 6 6"/></svg>';

export function desenharMateria(raiz, ctx, materiaId) {
  const sessao = ctx.sessao, chavePasta = `ohara.mt.pasta.${materiaId}`;
  const materia = () => ativas(sessao.estadoCompleto().disciplinas).find((d) => d.id === materiaId);
  let aba = 'aulas', criando = false, novaPasta = false, erro = '', selecionada = Number(pref.ler('ohara.at.ultima')) || null, geracaoCapa = 0, limpezaCartoes = null;
  let pastaSel = pref.ler(chavePasta) === 'todas' || pref.ler(chavePasta) == null ? null : Number(pref.ler(chavePasta));
  const agoraLocal = () => { const d = new Date(ctx.agora()), p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

  const primeiroArq = (aulaId) => arquivosDaAula(sessao.estadoCompleto(), aulaId)[0]?.id ?? null;
  const guardarCapa = (k, c) => { CAPAS.delete(k); CAPAS.set(k, c); while (CAPAS.size > LIMITE_CAPAS) { const [k0, v0] = CAPAS.entries().next().value; if (v0?.url) URL.revokeObjectURL(v0.url); CAPAS.delete(k0); } };
  const quando = (a) => {
    if (!a.inicio) return a.tipo === 'livro' ? 'Livro' : 'Sem data';
    const dia = a.inicio.slice(0, 10);
    return `${DIAS[diaDaSemana(dia)]}, ${Number(dia.slice(8))} ${MESES[Number(dia.slice(5, 7)) - 1]} · ${a.inicio.slice(11, 16)}`;
  };

  function desenhar() {
    const m = materia();
    if (!m) { raiz.innerHTML = '<h1>Matéria não encontrada</h1><p class="sub"><a class="voltar" href="#materias">← Voltar ao Acervo</a></p>'; return; }
    document.title = `${m.nome} · Ohara`;
    const estado = sessao.estadoCompleto(), pastas = pastasDaMateria(estado, materiaId);
    if (pastaSel != null && !pastas.some((p) => p.id === pastaSel)) pastaSel = null;
    const aulas = aulasDaPasta(estado, materiaId, pastaSel), total = aulasDaPasta(estado, materiaId).length, ncart = ativas(estado.cartoes).filter((c) => aulasDaPasta(estado, materiaId).some((a) => a.id === c.aula_id)).length;
    if (!aulas.some((a) => a.id === selecionada)) selecionada = (aulas.find((a) => a.inicio && a.inicio <= agoraLocal()) ?? aulas[0])?.id ?? null;
    raiz.className = 'mt';
    const so = m.ano_id != null, ano = so ? anosEncerrados(estado).find((a) => a.id === m.ano_id) : null;
    raiz.innerHTML = `<div class="mt-topo"><a class="mt-volta" href="#materias">‹ Acervo</a><span class="mt-sg" style="--c:${corCss(m.cor)}" title="${escaparHtml(m.nome)}">${escaparHtml(siglaDaMateria(m))}</span>` +
      `<h1>${escaparHtml(m.nome)}</h1><small>${total} ${total === 1 ? 'aula' : 'aulas'}</small><span class="mt-esp"></span>` +
      `<div class="mt-abas" role="tablist" aria-label="${escaparHtml(m.nome)}"><button type="button" role="tab" data-aba="aulas" aria-selected="${aba === 'aulas'}" class="${aba === 'aulas' ? 'on' : ''}">Aulas <em>${total}</em></button>` +
      `<button type="button" role="tab" data-aba="cartoes" aria-selected="${aba === 'cartoes'}" class="${aba === 'cartoes' ? 'on' : ''}">Cartões <em>${ncart}</em></button></div>` +
      (so ? '' : `<button type="button" class="mt-btn" data-a="nova">Nova aula</button>`) + '</div>' +
      (so ? `<div class="mt-so"><b>${escaparHtml(ano?.nome ?? 'Ano arquivado')}</b> · só consulta. Para editar, reabra o ano no Acervo.</div>` : '') +
      (aba === 'aulas' ? faixaPastas(pastas, estado, so) + `<div class="mt-cols"><div class="mt-col"><div class="mt-cap">${escaparHtml(pastaSel == null ? 'Aulas' : 'Aulas · ' + pastas.find((p) => p.id === pastaSel).nome)} <em>${aulas.length}</em></div><div class="mt-card mt-lista">${lista(aulas, estado, so)}</div></div>${painel(aulas, estado)}</div>` : '<div class="mt-cartoes" id="mt-cartoes"></div>');
    if (aba === 'cartoes') { limpezaCartoes?.(); limpezaCartoes = desenharCartoes(raiz.querySelector('#mt-cartoes'), m.ano_id != null ? { ...ctx, sessao: { ...sessao, estado: sessao.estadoCompleto } } : ctx, { disciplinaId: materiaId }); }
    else { limpezaCartoes?.(); limpezaCartoes = null; carregarCapa(); }
    const campo = raiz.querySelector('input[name="titulo"], input[name="pasta"]'); if (campo) campo.focus();
  }

  function faixaPastas(pastas, estado, so = false) {
    const n = contagemPorPasta(estado, materiaId), u = (x) => `${x} ${x === 1 ? 'aula' : 'aulas'}`;
    const item = (id, nome, qtd) => `<div class="mt-pasta${pastaSel === id ? ' on' : ''}" role="button" tabindex="0" data-pasta="${id ?? 'todas'}">${PASTA}<b>${escaparHtml(nome)}</b><small>${u(qtd)}</small>` +
      (id != null && !so ? `<button type="button" class="mt-mais" data-a="menu-pasta" data-id="${id}" aria-label="Mais opções de ${escaparHtml(nome)}" aria-haspopup="menu"><svg class="at-s" viewBox="0 0 18 18" aria-hidden="true"><circle cx="3.8" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.2" cy="9" r="1.4" fill="currentColor" stroke="none"/></svg></button>` : '') + '</div>';
    const nova = so ? '' : novaPasta ? `<form class="mt-pasta mt-nova-form" id="form-pasta"><input class="in" name="pasta" maxlength="60" autocomplete="off" placeholder="Nome da pasta, ex.: 1º bimestre" aria-label="Nome da pasta"><button class="mt-btn peq" type="submit">Criar</button><button class="mt-btn peq mt-sec" type="button" data-a="cancelar-pasta">Cancelar</button></form>`
      : '<button type="button" class="mt-pasta mt-nova" data-a="nova-pasta"><b>+ Nova pasta</b></button>';
    return `<div class="mt-pastas">${item(null, 'Todas', n.todas)}${pastas.map((p) => item(p.id, p.nome, n[p.id])).join('')}${nova}</div>` + (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '');
  }

  function lista(aulas, estado, so = false) {
    if (!aulas.length) return `<p class="mt-vazio">${pastaSel == null ? 'Nenhuma aula ainda. Toque em "Nova aula" para criar a primeira.' : 'Nenhuma aula nesta pasta. Use o ⋯ de uma aula, "Mover para pasta…", ou crie uma nova aqui.'}</p>`;
    return aulas.map((a) => {
      const n = cartoesDaAula(estado, a.id).length, pdf = arquivosDaAula(estado, a.id).length > 0, dia = a.inicio ? a.inicio.slice(0, 10) : null;
      return `<div class="mt-lin${a.id === selecionada ? ' sel' : ''}" role="button" tabindex="0" data-aula="${a.id}"${so ? '' : ' draggable="true"'}><span class="mt-dt">${dia ? `<b>${dia.slice(8)}</b>${MESES[Number(dia.slice(5, 7)) - 1]}` : `<b>—</b>${a.tipo === 'livro' ? 'livro' : 's/ data'}`}</span>` +
        `<span class="mt-lt"><b>${escaparHtml(a.titulo)}</b><small>${escaparHtml(a.inicio ? a.inicio.slice(11, 16) + ' · ' : '')}${a.tipo === 'livro' ? 'Livro' : 'Aula'}</small></span>` +
        `<span class="mt-chips">${pdf ? '<span class="mt-ch f">PDF</span>' : ''}${n ? `<span class="mt-ch">${n} ${n === 1 ? 'cartão' : 'cartões'}</span>` : '<span class="mt-ch f">sem cartões</span>'}</span>` +
        (so ? '' : `<button type="button" class="mt-mais" data-a="menu" data-id="${a.id}" aria-label="Mais opções de ${escaparHtml(a.titulo)}" aria-haspopup="menu"><svg class="at-s" viewBox="0 0 18 18" aria-hidden="true"><circle cx="3.8" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.2" cy="9" r="1.4" fill="currentColor" stroke="none"/></svg></button>`) + '</div>';
    }).join('');
  }

  const formulario = (pastas) => `<div class="mt-col"><div class="mt-cap">Nova aula</div><form class="mt-card mt-form" id="nova"><label class="c">Título<input class="in" name="titulo" maxlength="80" autocomplete="off" required></label>` +
    `<div class="mt-duas"><label class="c">Tipo<select class="in" name="tipo"><option value="aula">Aula</option><option value="livro">Livro</option></select></label>` +
    `<label class="c">Pasta<select class="in" name="pasta_id"><option value="">Sem pasta</option>${pastas.map((p) => `<option value="${p.id}" ${p.id === pastaSel ? 'selected' : ''}>${escaparHtml(p.nome)}</option>`).join('')}</select></label></div>` +
    `<div class="mt-duas"><label class="c">Início<input class="in" type="datetime-local" name="inicio"></label><label class="c">Fim<input class="in" type="datetime-local" name="fim"></label></div>` +
    (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '') + `<div class="mt-acoes"><button class="mt-btn" type="submit">Criar</button><button class="mt-btn mt-sec" type="button" data-a="cancelar">Cancelar</button></div></form></div>`;

  function painel(aulas, estado) {
    if (criando) return formulario(pastasDaMateria(estado, materiaId));
    const a = aulas.find((x) => x.id === selecionada);
    if (!a) return '<div class="mt-col"><div class="mt-cap">Aula selecionada</div><div class="mt-card mt-painel mt-sem"><p class="mt-vazio">Escolha uma aula na lista.</p></div></div>';
    const arqs = arquivosDaAula(estado, a.id), pasta = pastasDaMateria(estado, materiaId).find((p) => p.id === a.pasta_id), nc = cartoesDaAula(estado, a.id).length, na = arqs.length;
    const capa = CAPAS.get(primeiroArq(a.id));
    return `<div class="mt-col"><div class="mt-cap">Aula selecionada</div><div class="mt-card mt-painel"><div class="mt-capa${capa?.url ? '' : ' sem'}" data-capa="${a.id}">${capa?.url ? `<img src="${capa.url}" alt="Primeira página do slide de ${escaparHtml(a.titulo)}">` : FANTASMA}` +
      `<em class="mt-pg">${na ? (capa?.paginas ? `Página 1 de ${capa.paginas}` : 'Lendo a capa…') : 'Sem slide anexado'}</em></div>` +
      `<div><div class="mt-tit">${escaparHtml(a.titulo)}</div><div class="mt-sub">${escaparHtml(quando(a))}${pasta ? ' · ' + escaparHtml(pasta.nome) : ''}</div></div>` +
      `<div class="mt-nums"><div class="mt-mini"><b>Slides</b><span class="n">${capa?.paginas ?? (na ? '·' : '0')}</span><small>${na ? 'páginas' : 'nenhum PDF'}</small></div>` +
      `<div class="mt-mini"><b>Anotações</b><span class="n">${a.anotacoes && a.anotacoes !== '{"ops":[{"insert":"\\n"}]}' ? 'Sim' : 'Não'}</span><small>${a.anotacoes ? 'escritas' : 'vazias'}</small></div>` +
      `<div class="mt-mini"><b>Cartões</b><span class="n">${nc}</span><small>${nc === 1 ? 'salvo' : 'salvos'}</small></div></div>` +
      `<span class="mt-esp"></span><div class="mt-acoes"><a class="mt-btn" href="#aula/${a.id}">Abrir na Mesa</a><a class="mt-btn mt-sec" href="#aula/${a.id}?cartoes">Ver cartões</a></div></div></div>`;
  }

  /** A capa da aula selecionada: lê o 1º arquivo, desenha a página 1 e troca o espaço reservado (sem redesenhar a tela toda). */
  async function carregarCapa() {
    const id = selecionada, g = ++geracaoCapa;
    const f = arquivosDaAula(sessao.estadoCompleto(), id)[0];
    if (id == null || !f || CAPAS.has(f.id)) return;
    const blob = await sessao.lerArquivo(f.id);
    const c = blob ? await capaDoArquivo(ehPdf(f) ? 'pdf' : 'imagem', blob) : null;
    if (!c) { guardarCapa(f.id, { url: null, paginas: null }); if (g === geracaoCapa) atualizarCapa(id); return; }
    guardarCapa(f.id, c);
    if (g === geracaoCapa && selecionada === id) atualizarCapa(id);
  }
  function atualizarCapa(id) {
    const no = raiz.querySelector(`[data-capa="${id}"]`), c = CAPAS.get(primeiroArq(id)); if (!no || !c) return;
    const a = sessao.estadoCompleto().aulas.find((x) => x.id === id);
    no.classList.toggle('sem', !c.url);
    no.innerHTML = (c.url ? `<img src="${c.url}" alt="Primeira página do slide de ${escaparHtml(a?.titulo ?? '')}">` : FANTASMA) + `<em class="mt-pg">${c.paginas ? `Página 1 de ${c.paginas}` : 'Não foi possível ler a capa'}</em>`;
    const n = raiz.querySelector('.mt-nums .mt-mini .n'); if (n && c.paginas) n.textContent = String(c.paginas);
  }

  function selecionar(id) {
    selecionada = id; pref.gravar('ohara.at.ultima', String(id)); criando = false;
    desenhar();
  }
  function excluirAulaComDesfazer(id) {
    const titulo = sessao.estadoCompleto().aulas.find((a) => a.id === id)?.titulo;
    sessao.aplicar((e) => excluirAula(e, id, new Date().toISOString())); desenhar();
    ctx.aviso(`"${titulo}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => { sessao.aplicar((e) => restaurarAula(e, id)); desenhar(); } });
  }
  function mudarPasta(p) { pastaSel = p; pref.gravar(chavePasta, p == null ? 'todas' : String(p)); erro = ''; desenhar(); }
  function tentar(fn) { try { fn(); erro = ''; } catch (e) { erro = e.message; } desenhar(); }

  raiz.onclick = (ev) => {
    if (ev.target.closest('#mt-cartoes')) return;
    const ab = ev.target.closest('[data-aba]');
    if (ab) { aba = ab.dataset.aba; criando = false; desenhar(); return; }
    const b = ev.target.closest('[data-a]');
    if (b) {
      const a = b.dataset.a, id = Number(b.dataset.id);
      if (a === 'nova') { if (aba !== 'aulas') aba = 'aulas'; criando = true; erro = ''; desenhar(); }
      else if (a === 'cancelar') { criando = false; erro = ''; desenhar(); }
      else if (a === 'nova-pasta') { novaPasta = true; erro = ''; desenhar(); }
      else if (a === 'cancelar-pasta') { novaPasta = false; erro = ''; desenhar(); }
      else if (a === 'menu') {
        const aula = sessao.estadoCompleto().aulas.find((x) => x.id === id), pastas = pastasDaMateria(sessao.estadoCompleto(), materiaId);
        abrirMenu(b, [{ rotulo: 'Abrir na Mesa', fazer: () => { location.hash = `#aula/${id}`; } }, { sep: true },
          ...pastas.map((p) => ({ rotulo: `Mover para ${p.nome}`, marcado: aula?.pasta_id === p.id, fazer: () => tentar(() => sessao.aplicar((e) => moverAula(e, id, p.id))) })),
          ...(aula?.pasta_id != null ? [{ rotulo: 'Tirar da pasta', fazer: () => tentar(() => sessao.aplicar((e) => moverAula(e, id, null))) }] : []),
          { sep: true }, { rotulo: 'Excluir (vai para a lixeira)', perigo: true, fazer: () => excluirAulaComDesfazer(id) }]);
      } else if (a === 'menu-pasta') {
        const p = pastasDaMateria(sessao.estadoCompleto(), materiaId).find((x) => x.id === id);
        abrirMenu(b, [{ rotulo: 'Renomear', fazer: () => { const nome = prompt('Novo nome da pasta', p?.nome ?? ''); if (nome != null) tentar(() => sessao.aplicar((e) => renomearPasta(e, id, nome))); } }, { sep: true },
          { rotulo: 'Excluir pasta (as aulas ficam)', perigo: true, fazer: () => {
            sessao.aplicar((e) => excluirPasta(e, id, new Date().toISOString())); if (pastaSel === id) pastaSel = null; desenhar();
            ctx.aviso(`A pasta "${p?.nome}" foi para a lixeira. As aulas continuam em Todas.`, { texto: 'Desfazer', fazer: () => { sessao.aplicar((e) => restaurarPasta(e, id)); desenhar(); } });
          } }]);
      }
      return;
    }
    const pa = ev.target.closest('[data-pasta]');
    if (pa) { mudarPasta(pa.dataset.pasta === 'todas' ? null : Number(pa.dataset.pasta)); return; }
    const li = ev.target.closest('[data-aula]');
    if (li) selecionar(Number(li.dataset.aula));
  };
  // Arrastar uma aula da lista para uma pasta da faixa (ou para "Todas", que a tira da pasta). No toque, o ⋯ da aula faz o mesmo.
  const alvoDe = (ev) => ev.target.closest?.('[data-pasta]');
  raiz.ondragstart = (ev) => { const li = ev.target.closest?.('[data-aula]'); if (!li) return; ev.dataTransfer.setData('text/plain', `ohara-aula:${li.dataset.aula}`); ev.dataTransfer.effectAllowed = 'move'; li.classList.add('arrasta'); };
  raiz.ondragend = () => { raiz.querySelectorAll('.arrasta,.alvo').forEach((x) => x.classList.remove('arrasta', 'alvo')); };
  raiz.ondragover = (ev) => { const p = alvoDe(ev); if (!p || !raiz.querySelector('.mt-lin.arrasta')) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; raiz.querySelectorAll('.alvo').forEach((x) => x !== p && x.classList.remove('alvo')); p.classList.add('alvo'); };
  raiz.ondragleave = (ev) => { const p = alvoDe(ev); if (p && !p.contains(ev.relatedTarget)) p.classList.remove('alvo'); };
  raiz.ondrop = (ev) => {
    const p = alvoDe(ev), m = /^ohara-aula:(\d+)$/.exec(ev.dataTransfer?.getData('text/plain') ?? ''); if (!p || !m) return;
    ev.preventDefault(); const aula = Number(m[1]), pasta = p.dataset.pasta === 'todas' ? null : Number(p.dataset.pasta);
    const nome = pasta == null ? 'fora de qualquer pasta' : `na pasta "${pastasDaMateria(sessao.estadoCompleto(), materiaId).find((x) => x.id === pasta)?.nome}"`;
    tentar(() => sessao.aplicar((e) => moverAula(e, aula, pasta))); if (!erro) ctx.aviso(`Aula movida: agora está ${nome}.`);
  };
  raiz.onkeydown = (ev) => {
    if (ev.target.closest?.('#mt-cartoes')) return;
    const li = ev.target.closest?.('[data-aula]'), pa = ev.target.closest?.('[data-pasta]');
    if (ev.target.matches?.('input,select,textarea,button,a')) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      if (li) { ev.preventDefault(); if (ev.key === 'Enter' && li.classList.contains('sel')) location.hash = `#aula/${li.dataset.aula}`; else selecionar(Number(li.dataset.aula)); }
      else if (pa) { ev.preventDefault(); mudarPasta(pa.dataset.pasta === 'todas' ? null : Number(pa.dataset.pasta)); }
    } else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && li) {
      const itens = [...raiz.querySelectorAll('[data-aula]')], i = itens.indexOf(li) + (ev.key === 'ArrowDown' ? 1 : -1);
      if (itens[i]) { ev.preventDefault(); selecionar(Number(itens[i].dataset.aula)); raiz.querySelector(`[data-aula="${itens[i].dataset.aula}"]`)?.focus(); }
    }
  };
  raiz.onsubmit = (ev) => {
    if (ev.target.closest('#mt-cartoes')) return;
    ev.preventDefault();
    const f = new FormData(ev.target);
    if (ev.target.id === 'form-pasta') {
      try { let id; sessao.aplicar((e) => { const r = criarPasta(e, materiaId, f.get('pasta'), new Date().toISOString()); id = r.pasta.id; return r.estado; }); novaPasta = false; erro = ''; pastaSel = id; pref.gravar(chavePasta, String(pastaSel)); } catch (e) { erro = e.message; }
      desenhar(); return;
    }
    try {
      let id; sessao.aplicar((e) => { const r = criarAula(e, materiaId, { titulo: f.get('titulo'), tipo: f.get('tipo'), inicio: f.get('inicio'), fim: f.get('fim'), pastaId: f.get('pasta_id') ? Number(f.get('pasta_id')) : null }, new Date().toISOString()); id = r.aula.id; return r.estado; });
      criando = false; erro = ''; selecionada = id;
    } catch (e) { erro = e.message; }
    desenhar();
  };
  desenhar();
  return () => { geracaoCapa++; limpezaCartoes?.(); raiz.className = ''; raiz.onclick = raiz.onsubmit = raiz.onkeydown = raiz.ondragstart = raiz.ondragend = raiz.ondragover = raiz.ondragleave = raiz.ondrop = null; };
}
