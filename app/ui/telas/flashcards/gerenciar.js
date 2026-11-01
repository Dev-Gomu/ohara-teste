// Gerenciar cartões (proposta C1 "híbrida" do ClaudeWeb): UMA barra (busca com fichas de filtro, botão + de filtros e ⋯ de ações); à esquerda a lista; à direita o cartão aberto
// no próprio editor formatado (o mesmo da Mesa: frente em faixa na cor da matéria), com Salvar, Descartar e Excluir.
// Selecionar, Limpeza, Anki e importar e Dicas de busca ficam no ⋯. Na seleção em massa a barra é trocada pela barra de ações. A revisão é no Treino (ou no Anki).
import { escaparHtml } from '../../../nucleo/texto.js';
import { ativas, corCss, imagensDoCartao, siglaDaMateria } from '../../../nucleo/materias.js';
import { resumo, conferir, montarTexto } from '../../../nucleo/flashcards_texto.js';
import { paraGuardado } from '../../../nucleo/flashcards_editor.js';
import { alterarCartao, excluirCartao, restaurarCartao, importarTexto, cartoesParaExportar, pendentesDeEnvio, marcarCartao, marcarVarios, moverCartoes, etiquetarCartoes } from '../../../nucleo/cartoes.js';
import { filtrarCartoes, ajudaDaBusca } from '../../../nucleo/busca_cartoes.js';
import { acharDuplicados, cartoesVazios } from '../../../nucleo/limpeza_cartoes.js';
import { diaDe } from '../../foco_servico.js';
import { criarEditorCartoes } from '../../componentes/editor_cartoes.js';

export function baixarBytes(bytes, nome, tipo) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const ICO = {
  estrela: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"/>',
  env: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lixo: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  lupa: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  pontos: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  sel: '<path d="M4 7l2 2 3-3M4 17l2 2 3-3M13 8h7M13 18h7"/>',
  mover: '<path d="M4 12h14M13 6l6 6-6 6"/>',
};
const svg = (k) => `<svg class="gc-i" viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;
const u = (n, um, vp) => `${n} ${n === 1 ? um : vp}`;

export function desenharCartoes(raiz, ctx, { disciplinaId = null } = {}) {
  const { sessao } = ctx;
  let filtro = disciplinaId == null ? '' : String(disciplinaId), busca = '', soNovos = false, soMarcados = false, modoSel = false, sel = new Set(), limpeza = false, selId = null, mais = false, menuAberto = null, ed = null, base = '', sujo = false,
    erro = '', relatorio = null, urls = [], anki = null, enviando = false, destruido = false;
  const liberar = () => { urls.forEach((x) => URL.revokeObjectURL(x)); urls = []; };
  const pendente = (c) => !c.exportado_em || c.atualizado_em > c.exportado_em;

  raiz.innerHTML = `<div class="gc"><div class="gc-bar" data-k="bar"><div class="gc-campo">${svg('lupa')}<span class="gc-fichas" data-k="fichas"></span><input type="search" data-k="busca" placeholder="Buscar ou filtrar…" autocomplete="off" aria-label="Buscar cartões"><button type="button" class="gc-ib peq" data-k="filtro-btn" aria-label="Filtros" aria-haspopup="true" title="Filtros">${svg('mais')}</button></div>` +
    `<button type="button" class="gc-ib" data-k="mais-menu-btn" aria-label="Mais ações" aria-haspopup="true" title="Mais ações">${svg('pontos')}</button></div>` +
    `<div class="gc-menu gc-menu-filtro" data-k="menu-filtro" hidden></div>` +
    `<div class="gc-menu gc-menu-mais" data-k="menu-mais" hidden><button type="button" class="gc-mi" data-k="sel-btn">${svg('sel')}Selecionar<kbd>S</kbd></button><button type="button" class="gc-mi" data-k="ajuda-btn">${svg('lupa')}Dicas de busca<kbd>?</kbd></button><button type="button" class="gc-mi" data-k="limp-btn">${svg('lixo')}Limpeza<kbd>L</kbd></button><button type="button" class="gc-mi" data-k="mais-btn">${svg('env')}Anki e importar<kbd>A</kbd></button></div>` +
    `<div class="gc-pop" data-k="ajuda" hidden role="dialog" aria-label="Como buscar"></div><div class="gc-lote" data-k="lote" hidden></div>` +
    `<div class="gc-cols" data-k="cols"><div class="gc-lista" data-k="lista" role="listbox" aria-label="Cartões"></div><div class="gc-pan" data-k="pan"></div></div>` +
    `<div class="gc-mais" data-k="mais" hidden></div><div class="gc-mais" data-k="limp" hidden></div></div>`;
  const $ = (k) => raiz.querySelector(`[data-k="${k}"]`);

  const visiveis = () => {
    const estado = sessao.estado(), q = busca.trim();   // com busca, vale todas as matérias (o chip de matéria só filtra sem busca)
    const base = cartoesParaExportar(estado, { disciplinaId: filtro && (!q || disciplinaId != null) ? Number(filtro) : null })
      .filter(({ cartao: c }) => (!soNovos || pendente(c)) && (!soMarcados || c.marcado));
    return filtrarCartoes(base, q, { revisoes: estado.revisoes, hoje: diaDe(ctx.agora()) }).sort((a, b) => b.cartao.id - a.cartao.id);
  };

  function desenharChips() {
    const estado = sessao.estado(), todos = cartoesParaExportar(estado), np = pendentesDeEnvio(todos.map((i) => i.cartao)).length;
    const nMarc = todos.filter((i) => i.cartao.marcado).length, mats = disciplinaId == null ? ativas(estado.disciplinas) : [];
    const dMat = filtro && disciplinaId == null ? mats.find((d) => String(d.id) === String(filtro)) : null;
    const ficha = (rm, rotulo, cor) => `<span class="gc-tok">${cor ? `<i class="gc-pt" style="--c:${cor}"></i>` : ''}${rotulo}<button type="button" data-rm="${rm}" aria-label="Tirar o filtro ${rotulo}">${svg('x')}</button></span>`;
    $('fichas').innerHTML = (dMat ? ficha('f', escaparHtml(siglaDaMateria(dMat)), corCss(dMat.cor)) : '') + (soMarcados ? ficha('marcados', 'Marcados') : '') + (soNovos ? ficha('novos', 'Novos e alterados') : '');
    const opcao = (d) => `<button type="button" class="gc-tok${String(filtro) === String(d.id) ? ' on' : ''}" data-f="${d.id}"><i class="gc-pt" style="--c:${corCss(d.cor)}"></i>${escaparHtml(siglaDaMateria(d))} ${todos.filter((i) => i.disciplina.id === d.id).length}</button>`;
    $('menu-filtro').innerHTML = (mats.length ? `<b class="gc-mh">Matéria</b><div class="gc-mw">${mats.map(opcao).join('')}</div>` : '') +
      `<b class="gc-mh">Estado</b><div class="gc-mw"><button type="button" class="gc-tok${soMarcados ? ' on' : ''}" data-marcados="1">${svg('estrela')}Marcados ${nMarc}</button><button type="button" class="gc-tok${soNovos ? ' on' : ''}" data-novos="1">Novos e alterados ${np}</button></div>`;
  }

  // ----- menus da barra (filtros, ⋯, ⋯ da seleção) -----
  function fecharMenus() {
    menuAberto = null; $('menu-filtro').hidden = true; $('menu-mais').hidden = true;
    const lm = raiz.querySelector('[data-k="menu-lote"]'); if (lm) lm.hidden = true;
  }
  function alternarMenu(nome) {
    const era = menuAberto; fecharMenus(); if (era === nome) return;
    menuAberto = nome; (nome === 'lote' ? raiz.querySelector('[data-k="menu-lote"]') : $(`menu-${nome}`)).hidden = false;
  }
  const topoModo = (titulo) => `<div class="gc-acoes gc-topo"><b>${titulo}</b><span class="gc-esp"></span><button type="button" class="gc-btn" data-k="voltar">Voltar aos cartões</button></div>`;

  function desenharLista() {
    const it = visiveis();
    if (selId != null && !it.some((i) => i.cartao.id === selId) && !sujo) selId = null;
    if (selId == null && it.length) selId = it[0].cartao.id;
    $('lista').innerHTML = it.map(({ cartao: c, disciplina: d, aula }) => `<button type="button" class="gc-lin${c.id === selId && !modoSel ? ' sel' : ''}${modoSel && sel.has(c.id) ? ' pick' : ''}" role="option" aria-selected="${modoSel ? sel.has(c.id) : c.id === selId}" data-id="${c.id}" title="${escaparHtml(d.nome)} › ${escaparHtml(aula.titulo)}">` +
      (modoSel ? `<span class="gc-ck${sel.has(c.id) ? ' on' : ''}">${svg('ok')}</span>` : '') + `<i class="gc-pt" style="--c:${corCss(d.cor)}"></i><span class="gc-tx"><b>${escaparHtml(resumo(c.frente, 90))}</b><small>${escaparHtml(resumo(c.verso, 120)) || escaparHtml(aula.titulo)}</small></span>` +
      (c.marcado ? `<span class="gc-star" title="Marcado">${svg('estrela')}</span>` : '') + (busca.trim() && disciplinaId == null ? `<span class="gc-tag">${escaparHtml(siglaDaMateria(d))}</span>` : '') + (c.exportado_em && c.atualizado_em > c.exportado_em ? '<span class="gc-tag">alterado</span>' : '') + '</button>').join('') ||
      `<p class="gc-vazio">${sessao.estado().cartoes.length ? (busca.trim() ? 'Nenhum cartão encontrado para essa busca.' : 'Nenhum cartão com esse filtro.') : 'Nenhum cartão ainda. Crie na Mesa (botão Criar ›) ou importe um texto em “Anki e importar”.'}</p>`;
  }

  function desenharPainel() {
    ed?.destruir(); ed = null; liberar(); sujo = false;
    const pan = $('pan'), item = visiveis().find((i) => i.cartao.id === selId) ?? cartoesParaExportar(sessao.estado()).find((i) => i.cartao.id === selId);
    if (!item) { pan.innerHTML = '<p class="gc-vazio">Escolha um cartão na lista para ler e editar.</p>'; return; }
    const { cartao: c, aula, disciplina: d } = item, n = imagensDoCartao(c);
    pan.style.setProperty('--mc', corCss(d.cor));
    pan.innerHTML = `<div class="fc-ed gc-ed" data-k="ed" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Editar cartão" spellcheck="true"></div>` +
      ((n.frente + n.verso) ? `<div class="gc-imgs">${['frente', 'verso'].map((lado) => Array.from({ length: n[lado] }, (_, j) => `<img data-lado="${lado}" data-j="${j}" alt="" title="${lado === 'frente' ? 'Frente' : 'Verso'}">`).join('')).join('')}</div>` : '') +
      `<label class="gc-et">Etiquetas<input class="gc-in" data-k="etq" value="${escaparHtml(c.etiquetas)}" autocomplete="off" placeholder="separadas por vírgula"></label>` +
      `<p class="gc-info"><b>${escaparHtml(d.nome)}</b> › ${escaparHtml(aula.titulo)}${c.pagina ? ` · slide ${c.pagina}` : ''}${!c.exportado_em ? ' · novo para o Anki' : c.atualizado_em > c.exportado_em ? ' · alterado desde o último envio' : ''}</p>` +
      (erro ? `<p class="gc-erro">${escaparHtml(erro)}</p>` : '') +
      `<div class="gc-acoes"><button type="button" class="gc-btn" data-k="salvar" disabled>${svg('ok')}Salvar <kbd>Ctrl Enter</kbd></button><button type="button" class="gc-btn gc-sec" data-k="descartar" disabled>Descartar</button><button type="button" class="gc-btn gc-sec${c.marcado ? ' on' : ''}" data-k="marcar" aria-pressed="${c.marcado ? 'true' : 'false'}">${svg('estrela')}${c.marcado ? 'Marcado' : 'Marcar'}</button><span class="gc-esp"></span><button type="button" class="gc-btn gc-sec" data-k="excluir">${svg('lixo')}Excluir</button></div>`;
    const edEl = pan.querySelector('[data-k="ed"]'), etq = pan.querySelector('[data-k="etq"]');
    base = paraGuardado(montarTexto(c));
    const marcar = () => { sujo = paraGuardado(ed.fonte()) !== base || etq.value !== c.etiquetas; pan.querySelector('[data-k="salvar"]').disabled = !sujo; pan.querySelector('[data-k="descartar"]').disabled = !sujo; };
    ed = criarEditorCartoes(edEl, { aoMudar: marcar, aoSalvar: () => salvar() });
    ed.definir(montarTexto(c)); etq.oninput = marcar; sujo = false;
    pan.querySelectorAll('.gc-imgs img').forEach((el) => sessao.lerImagemLado(c.id, el.dataset.lado, Number(el.dataset.j)).then((b) => { if (b && !destruido) { const url = URL.createObjectURL(b); urls.push(url); el.src = url; } }));
  }

  function selecionar(id) {
    if (id === selId) return;
    if (sujo) { ctx.aviso('Este cartão tem alterações: salve ou descarte antes de abrir outro.'); return; }
    selId = id; erro = ''; desenharLista(); desenharPainel();
  }
  function atualizarTudo() { desenharChips(); desenharLista(); desenharPainel(); desenharMais(); desenharLimpeza(); desenharLote(); }

  function salvar() {
    if (!sujo || selId == null) return;
    const { cartoes, problemas } = conferir(ed.fonte());
    if (!cartoes.length) { erro = 'Escreva o cartão: a primeira linha (com @) é a frente.'; return desenharPainelMantendo(); }
    if (cartoes.length > 1) { erro = 'Ao editar, deixe só um cartão no texto.'; return desenharPainelMantendo(); }
    if (problemas.length) { erro = problemas.join(' '); return desenharPainelMantendo(); }
    const id = selId, antes = sessao.estado().cartoes.find((x) => x.id === id), novo = cartoes[0], etq = $('pan').querySelector('[data-k="etq"]').value;
    try { sessao.aplicar((e) => alterarCartao(e, id, { frente: novo.frente, verso: novo.verso, etiquetas: etq }, new Date().toISOString())); }
    catch (e) { erro = e.message; return desenharPainelMantendo(); }
    erro = ''; sujo = false; atualizarTudo();
    ctx.aviso('Cartão atualizado.', { texto: 'Desfazer', fazer: () => { try { sessao.aplicar((e) => alterarCartao(e, id, { frente: antes.frente, verso: antes.verso, etiquetas: antes.etiquetas }, new Date().toISOString())); } catch (e) { ctx.aviso(e.message); } sujo = false; atualizarTudo(); } });
  }
  // mostra o erro sem perder o que foi digitado
  function desenharPainelMantendo() {
    let p = $('pan').querySelector('.gc-erro');
    if (!p) { p = document.createElement('p'); p.className = 'gc-erro'; $('pan').querySelector('.gc-acoes').before(p); }
    p.textContent = erro;
  }
  function excluir() {
    const id = selId, c = sessao.estado().cartoes.find((x) => x.id === id); if (!c) return;
    const it = visiveis(), i = it.findIndex((x) => x.cartao.id === id), prox = (it[i + 1] ?? it[i - 1])?.cartao.id ?? null;
    sessao.aplicar((e) => excluirCartao(e, id, new Date().toISOString()));
    sujo = false; selId = prox; atualizarTudo();
    ctx.aviso(`Cartão "${resumo(c.frente, 30)}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => { sessao.aplicar((e) => restaurarCartao(e, id)); selId = id; atualizarTudo(); } });
  }

  // ----- Anki e importar -----
  const ankiHtml = () => !anki ? '' : anki.erro ? `<p class="erro">${escaparHtml(anki.erro)}</p>` : anki.situacao
    ? `<p class="sub">No Anki agora: ${u(anki.situacao.vencidos, 'cartão para revisar', 'cartões para revisar')}; ${u(anki.situacao.revisadosHoje, 'revisado', 'revisados')} hoje.</p>`
    : `<p class="sub">${u(anki.r.novos, 'novo', 'novos')}, ${u(anki.r.atualizados, 'atualizado', 'atualizados')}${anki.r.adotados ? `, ${anki.r.adotados} já ${anki.r.adotados === 1 ? 'estava' : 'estavam'} no Anki e foi ligado ao Ohara` : ''}${anki.r.falhas.length ? `; ${anki.r.falhas.length} não ${anki.r.falhas.length === 1 ? 'foi enviado' : 'foram enviados'}:` : '.'}</p>` +
      (anki.r.falhas.length ? `<ul class="sub">${anki.r.falhas.slice(0, 5).map((f) => `<li>${escaparHtml((sessao.estado().cartoes.find((c) => c.id === f.id)?.frente ?? '').slice(0, 40))}: ${escaparHtml(f.motivo)}</li>`).join('')}</ul>` : '');
  const relatorioHtml = () => !relatorio ? '' : `<p class="sub">${u(relatorio.criados, 'cartão criado', 'cartões criados')}${relatorio.ignorados.length ? `; ${u(relatorio.ignorados.length, 'linha ignorada', 'linhas ignoradas')}:` : '.'}</p>` +
    (relatorio.ignorados.length ? `<ul class="sub">${relatorio.ignorados.map((i) => `<li>linha ${i.linha}: ${escaparHtml(i.motivo)}</li>`).join('')}</ul>` : '');
  function desenharMais() {
    $('cols').hidden = mais || limpeza; $('mais').hidden = !mais;
    if (!mais) { $('mais').innerHTML = ''; return; }
    const estado = sessao.estado(), todos = cartoesParaExportar(estado), pend = pendentesDeEnvio(todos.map((i) => i.cartao));
    const aulas = ativas(estado.aulas).filter((a) => ativas(estado.disciplinas).some((d) => d.id === a.disciplina_id));
    const nomeDe = (id) => estado.disciplinas.find((d) => d.id === id);
    $('mais').innerHTML = topoModo('Anki e importar') + `<div class="card bloco"><h2>Enviar para o Anki</h2><p class="sub">Gera um arquivo <b>.apkg</b>. No Anki: Arquivo › Importar. Enviar de novo atualiza os cartões em vez de duplicar. Os cartões ficam num baralho <i>Matéria::Aula</i>.</p>` +
      `<div class="acoes"><button class="btn peq" type="button" data-a="exportar-novos" ${pend.length ? '' : 'disabled'}>Só novos e alterados (${pend.length})</button><button class="btn peq sec" type="button" data-a="exportar-todos" ${todos.length ? '' : 'disabled'}>Todos (${todos.length})</button></div></div>` +
      `<div class="card bloco"><h2>Enviar direto ao Anki (no computador)</h2><p class="sub">Com o Anki aberto e o complemento <b>AnkiConnect</b> instalado, os cartões vão sem arquivo, atualizando os que já estão lá. No tablet use o .apkg acima.</p>` +
      `<div class="acoes"><button class="btn peq" type="button" data-a="anki-novos" ${pend.length && !enviando ? '' : 'disabled'}>${enviando ? 'Enviando…' : `Só novos e alterados (${pend.length})`}</button><button class="btn peq sec" type="button" data-a="anki-todos" ${todos.length && !enviando ? '' : 'disabled'}>Todos (${todos.length})</button><button class="btn peq sec" type="button" data-a="anki-ver" ${enviando ? 'disabled' : ''}>Ver o Anki</button></div>${ankiHtml()}</div>` +
      `<div class="card bloco"><h2>Importar texto</h2><form id="importar" class="form"><label class="c">Aula<select class="in" name="aula">${aulas.map((a) => `<option value="${a.id}">${escaparHtml(nomeDe(a.disciplina_id).nome)} › ${escaparHtml(a.titulo)}</option>`).join('')}</select></label>` +
      `<label class="c">Um cartão por linha: Frente :: Verso (e, se quiser, :: etiquetas)<textarea class="in" name="texto" placeholder="O que é biodisponibilidade? :: Fração da dose que chega à circulação."></textarea></label>` +
      `<div class="acoes"><button class="btn peq" type="submit" ${aulas.length ? '' : 'disabled'}>Importar</button></div>${relatorioHtml()}</form></div>`;
  }
  async function exportar(soNovosEnvio) {
    try {
      const todos = cartoesParaExportar(sessao.estado()), itens = soNovosEnvio ? pendentesDeEnvio(todos.map((i) => i.cartao)) : null;
      const r = await sessao.exportarCartoes(itens ? { ids: itens.map((c) => c.id) } : {});
      baixarBytes(r.bytes, r.nome, 'application/octet-stream'); ctx.aviso(`${u(r.total, 'cartão enviado', 'cartões enviados')} no arquivo ${r.nome}.`);
    } catch (e) { ctx.aviso(e.message); }
    desenharMais(); desenharChips(); desenharLista();
  }
  async function enviarAnki(acao) {
    enviando = true; anki = null; desenharMais();
    try {
      if (acao === 'ver') anki = { situacao: await sessao.situacaoDoAnki() };
      else {
        const todos = cartoesParaExportar(sessao.estado()), ids = acao === 'novos' ? pendentesDeEnvio(todos.map((i) => i.cartao)).map((c) => c.id) : null;
        anki = { r: await sessao.enviarAoAnki(ids ? { ids } : {}) };
      }
    } catch (e) { anki = { erro: e.message }; }
    enviando = false; desenharMais(); desenharChips(); desenharLista();
  }


  // ----- marcar e selecionar vários -----
  const EXEMPLOS = [['materia:fisio', 'só uma matéria'], ['marcado:sim', 'só os marcados'], ['treino:vencido', 'para rever hoje (novo, emdia)'], ['anki:novo', 'ainda não enviados (alterado, enviado)'], ['criado:>2026-10-20', 'criados depois de uma data'], ['erros:>=2', 'que você errou 2 vezes ou mais'], ['"frase exata"  -palavra', 'frase inteira · tirar palavra'], ['frente:  verso:  etiqueta:  aula:', 'procurar só num campo']];
  const ajudaHtml = () => `<div class="gc-pop-t">Combine palavras com filtros</div>${EXEMPLOS.map(([k, d]) => `<div class="gc-pop-l"><code>${escaparHtml(k)}</code><span>${escaparHtml(d)}</span></div>`).join('')}`;
  function fecharAjuda() { const a = $('ajuda'); a.hidden = true; document.removeEventListener('pointerdown', foraAjuda, true); document.removeEventListener('keydown', teclaAjuda, true); }
  const foraAjuda = (ev) => { if (!ev.target.closest('[data-k="ajuda"],[data-k="ajuda-btn"],[data-k="mais-menu-btn"]')) fecharAjuda(); };
  const teclaAjuda = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fecharAjuda(); } };
  function alternarAjuda() {
    const a = $('ajuda'); if (!a.hidden) { fecharAjuda(); return; }
    a.innerHTML = ajudaHtml(); a.hidden = false;
    const r = $('mais-menu-btn').getBoundingClientRect();
    a.style.top = `${r.bottom + 8}px`; a.style.left = `${Math.max(8, Math.min(innerWidth - a.offsetWidth - 8, r.right - a.offsetWidth))}px`;
    document.addEventListener('pointerdown', foraAjuda, true); document.addEventListener('keydown', teclaAjuda, true);
  }
  const aviso = (txt, desfazer) => ctx.aviso(txt, desfazer ? { texto: 'Desfazer', fazer: () => { desfazer(); atualizarTudo(); } } : undefined);
  const agoraIso = () => new Date(ctx.agora()).toISOString();
  const guardarOriginais = (ids) => new Map(sessao.estado().cartoes.filter((c) => ids.has(c.id)).map((c) => [c.id, { ...c }]));
  const devolver = (orig) => sessao.aplicar((e) => ({ ...e, cartoes: e.cartoes.map((c) => (orig.has(c.id) ? orig.get(c.id) : c)) }));

  function marcarUm() {
    const c = sessao.estado().cartoes.find((x) => x.id === selId); if (!c) return;
    sessao.aplicar((e) => marcarCartao(e, selId, !c.marcado));
    const id = selId; atualizarTudo(); selId = id;
  }

  function desenharLote() {
    const l = $('lote'), ativo = modoSel && !mais && !limpeza; l.hidden = !ativo; $('bar').hidden = ativo;
    if (!ativo) { fecharMenus(); return; }
    const n = sel.size, off = n ? '' : 'disabled', todos = visiveis().length;
    const lb = (a, ico, rot) => `<button type="button" class="gc-lb" data-lote="${a}" ${off}>${ico ? svg(ico) : ''}${rot}</button>`;
    l.innerHTML = `<b>${u(n, 'selecionado', 'selecionados')}</b>` + lb('marcar', 'estrela', 'Marcar') + lb('mover', 'mover', 'Mover') + lb('etiquetar', '', 'Etiquetar') + lb('excluir', 'lixo', 'Excluir') +
      `<button type="button" class="gc-lb" data-k="lote-mais" aria-label="Mais" aria-haspopup="true">${svg('pontos')}</button><button type="button" class="gc-lb" data-k="sel-btn" aria-label="Sair da seleção" title="Sair da seleção (Esc)">${svg('x')}</button>` +
      `<div class="gc-menu" data-k="menu-lote" hidden><button type="button" class="gc-mi" data-lote="todos">Todos os ${todos} da lista</button><button type="button" class="gc-mi" data-lote="desmarcar" ${off}>Desmarcar</button><button type="button" class="gc-mi" data-lote="nenhum" ${off}>Limpar seleção</button></div>`;
  }
  function alternarSelecao() {
    if (sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.');
    modoSel = !modoSel; sel = new Set(); atualizarTudo();
  }

  /** Janela simples de uma pergunta (mover, etiquetar). `corpo`: html dos campos; `ok(form)` roda ao confirmar e pode lançar erro. */
  function perguntar(titulo, corpo, rotuloOk, ok) {
    const el = document.createElement('div'); el.className = 'an-veu'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', titulo);
    el.innerHTML = `<form class="an-dlg"><h2>${escaparHtml(titulo)}</h2>${corpo}<p class="erro" data-erro hidden></p><div class="an-acoes"><button type="button" class="gc-btn gc-sec" data-fechar>Cancelar</button><button type="submit" class="gc-btn">${escaparHtml(rotuloOk)}</button></div></form>`;
    document.body.appendChild(el);
    const fechar = () => { document.removeEventListener('keydown', tecla, true); el.remove(); };
    const tecla = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } };
    document.addEventListener('keydown', tecla, true);
    el.addEventListener('click', (ev) => { if (ev.target === el || ev.target.closest('[data-fechar]')) fechar(); });
    el.querySelector('form').onsubmit = (ev) => { ev.preventDefault(); try { ok(new FormData(ev.target)); fechar(); } catch (err) { const pe = el.querySelector('[data-erro]'); pe.textContent = err.message; pe.hidden = false; } };
    el.querySelector('input,select')?.focus();
  }

  function lote(acao) {
    const ids = new Set(sel), n = ids.size, estado = sessao.estado();
    if (acao === 'todos') { visiveis().forEach((i) => sel.add(i.cartao.id)); desenharLista(); desenharLote(); return; }
    if (acao === 'nenhum') { sel = new Set(); desenharLista(); desenharLote(); return; }
    if (!n) return;
    const orig = guardarOriginais(ids);
    if (acao === 'marcar' || acao === 'desmarcar') {
      sessao.aplicar((e) => marcarVarios(e, [...ids], acao === 'marcar'));
      aviso(`${u(n, 'cartão', 'cartões')} ${acao === 'marcar' ? 'marcado' : 'desmarcado'}${n === 1 ? '' : 's'}.`, () => devolver(orig)); atualizarTudo();
    } else if (acao === 'excluir') {
      sessao.aplicar((e) => [...ids].reduce((x, id) => excluirCartao(x, id, agoraIso()), e));
      sel = new Set(); selId = null;
      aviso(`${u(n, 'cartão foi', 'cartões foram')} para a lixeira.`, () => sessao.aplicar((e) => [...ids].reduce((x, id) => restaurarCartao(x, id), e))); atualizarTudo();
    } else if (acao === 'mover') {
      const opcoes = ativas(estado.disciplinas).map((d) => `<optgroup label="${escaparHtml(d.nome)}">${ativas(estado.aulas).filter((a) => a.disciplina_id === d.id).sort((x, y) => (x.inicio ?? '').localeCompare(y.inicio ?? '')).map((a) => `<option value="${a.id}">${escaparHtml(a.titulo)}</option>`).join('')}</optgroup>`).join('');
      perguntar(`Mover ${u(n, 'cartão', 'cartões')} para qual aula?`, `<label class="c">Aula de destino<select class="in" name="aula">${opcoes}</select></label><p class="sub">No Anki, o baralho é Matéria::Aula: no próximo envio os cartões trocam de baralho.</p>`, 'Mover', (f) => {
        sessao.aplicar((e) => moverCartoes(e, [...ids], Number(f.get('aula')), agoraIso()));
        aviso(`${u(n, 'cartão movido', 'cartões movidos')}.`, () => devolver(orig)); sel = new Set(); atualizarTudo();
      });
    } else if (acao === 'etiquetar') {
      perguntar(`Etiquetar ${u(n, 'cartão', 'cartões')}`, '<label class="c">Etiqueta (uma palavra, sem espaços)<input class="in" name="etq" maxlength="40" autocomplete="off" placeholder="Ex.: prova1" required></label>', 'Etiquetar', (f) => {
        sessao.aplicar((e) => etiquetarCartoes(e, [...ids], f.get('etq'), agoraIso()));
        aviso(`Etiqueta acrescentada a ${u(n, 'cartão', 'cartões')}.`, () => devolver(orig)); atualizarTudo();
      });
    }
  }

  // ----- limpeza: duplicados e cartões vazios -----
  function abrirNaLista(id) {
    limpeza = false; mais = false; busca = ''; $('busca').value = ''; filtro = disciplinaId == null ? '' : String(disciplinaId); soNovos = false; soMarcados = false; modoSel = false; sel = new Set();
    selId = id; atualizarTudo();
    raiz.querySelector(`.gc-lin[data-id="${id}"]`)?.scrollIntoView({ block: 'center' });
  }
  function desenharLimpeza() {
    $('limp').hidden = !limpeza;
    if (!limpeza) { $('limp').innerHTML = ''; return; }
    const e = sessao.estado(), dup = acharDuplicados(e), vaz = cartoesVazios(e);
    const linha = ({ cartao: c, aula, disciplina: d }, extra = '') => `<div class="gc-l2"><i class="gc-pt" style="--c:${corCss(d.cor)}"></i><span class="gc-tx"><b>${escaparHtml(resumo(c.frente, 100)) || '(frente vazia)'}</b><small>${escaparHtml(d.nome)} › ${escaparHtml(aula.titulo)} · ${escaparHtml(resumo(c.verso, 80)) || '(verso vazio)'}</small></span>${extra}<button type="button" class="gc-btn gc-sec" data-abrir="${c.id}">Abrir</button><button type="button" class="gc-btn gc-sec" data-excl="${c.id}">${svg('lixo')}Excluir</button></div>`;
    $('limp').innerHTML = topoModo('Limpeza') + `<div class="card bloco"><h2>Cartões repetidos <em>${dup.length}</em></h2><p class="sub">Cartões com a mesma pergunta. Com o <b>verso igual</b> são cópias de verdade; com o <b>verso diferente</b> podem ser cartões distintos, então confira antes de excluir. Nada é apagado sem você escolher, e tudo vai para a lixeira.</p>` +
      (dup.length ? dup.map((g) => `<div class="gc-grupo"><div class="gc-grupo-t"><b>${u(g.itens.length, 'cartão', 'cartões')}</b><span class="gc-tag${g.iguais ? ' n' : ''}">${g.iguais ? 'verso igual' : 'verso diferente'}</span><span class="gc-esp"></span>${g.iguais ? `<button type="button" class="gc-btn gc-sec" data-manter="${escaparHtml(g.chave)}">Manter só o mais antigo</button>` : ''}</div>${g.itens.map((i) => linha(i)).join('')}</div>`).join('') : '<p class="sub">Nenhum cartão repetido. Tudo certo.</p>') + '</div>' +
      `<div class="card bloco"><h2>Cartões vazios <em>${vaz.length}</em></h2><p class="sub">Cartões sem texto de verdade na frente ou no verso (só marcas como # ou -).</p>` +
      (vaz.length ? vaz.map((i) => linha(i, `<span class="gc-tag">${i.lado === 'frente' ? 'frente vazia' : 'verso vazio'}</span>`)).join('') : '<p class="sub">Nenhum cartão vazio.</p>') + '</div>';
  }
  function excluirIds(ids, texto) {
    const lista = [...ids]; sessao.aplicar((e) => lista.reduce((x, id) => excluirCartao(x, id, agoraIso()), e));
    if (lista.includes(selId)) selId = null;
    aviso(texto, () => sessao.aplicar((e) => lista.reduce((x, id) => restaurarCartao(x, id), e))); atualizarTudo();
  }

  raiz.onclick = (ev) => {
    const t = ev.target;
    if (!t.closest('[data-k="filtro-btn"],[data-k="mais-menu-btn"],[data-k="lote-mais"],[data-novos],[data-marcados]')) fecharMenus();
    if (t.closest('[data-k="filtro-btn"]')) { alternarMenu('filtro'); return; }
    if (t.closest('[data-k="mais-menu-btn"]')) { alternarMenu('mais'); return; }
    if (t.closest('[data-k="lote-mais"]')) { alternarMenu('lote'); return; }
    if (t.closest('[data-k="voltar"]')) { mais = false; limpeza = false; atualizarTudo(); return; }
    const rm = t.closest('[data-rm]'); if (rm) { if (sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); tirarFicha(rm.dataset.rm); return; }
    const f = t.closest('[data-f]'); if (f) { if (sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); filtro = String(filtro) === f.dataset.f ? '' : f.dataset.f; fecharMenus(); atualizarTudo(); return; }
    if (t.closest('[data-novos]')) { if (sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); soNovos = !soNovos; atualizarTudo(); return; }
    if (t.closest('[data-marcados]')) { if (sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); soMarcados = !soMarcados; atualizarTudo(); return; }
    if (t.closest('[data-k="ajuda-btn"]')) { alternarAjuda(); return; }
    if (t.closest('[data-k="sel-btn"]')) { alternarSelecao(); return; }
    if (t.closest('[data-k="limp-btn"]')) { if (!limpeza && sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); limpeza = !limpeza; if (limpeza) { mais = false; modoSel = false; } atualizarTudo(); return; }
    const lt = t.closest('[data-lote]'); if (lt) { lote(lt.dataset.lote); return; }
    const ab = t.closest('[data-abrir]'); if (ab) { abrirNaLista(Number(ab.dataset.abrir)); return; }
    const ex = t.closest('[data-excl]'); if (ex) { excluirIds([Number(ex.dataset.excl)], 'Cartão para a lixeira.'); return; }
    const mt = t.closest('[data-manter]'); if (mt) { const g = acharDuplicados(sessao.estado()).find((x) => x.chave === mt.dataset.manter); if (g) excluirIds(g.itens.slice(1).map((i) => i.cartao.id), `${u(g.itens.length - 1, 'cópia foi', 'cópias foram')} para a lixeira.`); return; }
    if (t.closest('[data-k="marcar"]')) { marcarUm(); return; }
    const lin = t.closest('[data-id]'); if (lin) { const id = Number(lin.dataset.id); if (modoSel) { sel.has(id) ? sel.delete(id) : sel.add(id); desenharLista(); desenharLote(); } else selecionar(id); return; }
    if (t.closest('[data-k="mais-btn"]')) { if (!mais && sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); mais = !mais; if (mais) { limpeza = false; modoSel = false; } atualizarTudo(); return; }
    if (t.closest('[data-k="salvar"]')) { salvar(); return; }
    if (t.closest('[data-k="descartar"]')) { erro = ''; desenharPainel(); return; }
    if (t.closest('[data-k="excluir"]')) { excluir(); return; }
    const b = t.closest('[data-a]'); if (!b) return;
    if (b.dataset.a.startsWith('anki-')) return enviarAnki(b.dataset.a.slice(5));
    if (b.dataset.a === 'exportar-novos') return exportar(true);
    if (b.dataset.a === 'exportar-todos') return exportar(false);
  };
  raiz.oninput = (ev) => { if (ev.target.dataset?.k === 'busca') { busca = ev.target.value; if (!sujo) { desenharLista(); desenharPainel(); } else desenharLista(); } };
  raiz.onsubmit = (ev) => {
    ev.preventDefault(); const f = new FormData(ev.target);
    try { let r; sessao.aplicar((e) => { r = importarTexto(e, Number(f.get('aula')), f.get('texto'), new Date().toISOString(), () => globalThis.crypto.randomUUID()); return r.estado; }); relatorio = { criados: r.criados.length, ignorados: r.ignorados }; }
    catch (e) { ctx.aviso(e.message); }
    desenharMais(); desenharChips();
  };
  raiz.onkeydown = (ev) => {
    if (ev.key === 'Backspace' && ev.target.dataset?.k === 'busca' && !ev.target.value && !sujo) { const q = soNovos ? 'novos' : soMarcados ? 'marcados' : filtro && disciplinaId == null ? 'f' : null; if (q) { tirarFicha(q); return; } }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { const lin = ev.target.closest?.('.gc-lin'); if (!lin) return; ev.preventDefault(); (ev.key === 'ArrowDown' ? lin.nextElementSibling : lin.previousElementSibling)?.focus(); } };

  function tirarFicha(qual) {
    if (qual === 'f') filtro = ''; else if (qual === 'novos') soNovos = false; else soMarcados = false;
    atualizarTudo();
  }

  // ----- teclado (fora de campos de texto) e fechar menus ao tocar fora -----
  const foraMenu = (ev) => { if (menuAberto && !ev.target.closest('.gc-menu,[data-k="filtro-btn"],[data-k="mais-menu-btn"],[data-k="lote-mais"]')) fecharMenus(); };
  const emCampo = (el) => !!el?.closest?.('input,textarea,select,[contenteditable="true"]');
  const teclaGeral = (ev) => {
    if (destruido || !raiz.isConnected || ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector('.an-veu')) return;
    if (ev.key === 'Escape') { if (menuAberto) fecharMenus(); else if (modoSel) alternarSelecao(); return; }
    if (emCampo(ev.target)) return;
    const k = ev.key.toLowerCase(), cartoesVisiveis = !mais && !limpeza;
    const anda = (d) => { const it = visiveis(), i = it.findIndex((x) => x.cartao.id === selId), prox = it[Math.min(it.length - 1, Math.max(0, i + d))]; if (prox) { selecionar(prox.cartao.id); raiz.querySelector(`.gc-lin[data-id="${prox.cartao.id}"]`)?.scrollIntoView({ block: 'nearest' }); } };
    const acoes = {
      '/': () => $('busca').focus(), '?': () => $('ajuda-btn').click(), l: () => $('limp-btn').click(), a: () => $('mais-btn').click(),
      s: () => $('sel-btn').click(), n: () => { if (sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); soNovos = !soNovos; atualizarTudo(); },
      j: () => anda(1), k: () => anda(-1),
      x: () => { if (!modoSel) alternarSelecao(); if (!modoSel || selId == null) return; sel.has(selId) ? sel.delete(selId) : sel.add(selId); desenharLista(); desenharLote(); },
      m: () => (modoSel ? lote('marcar') : marcarUm()), d: () => (modoSel ? lote('excluir') : excluir()),
    };
    let f = acoes[ev.key] ?? acoes[k];
    if (!f && /^[0-8]$/.test(ev.key) && disciplinaId == null) f = () => {
      if (sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.');
      const d = ativas(sessao.estado().disciplinas)[Number(ev.key) - 1]; filtro = ev.key === '0' || !d || String(filtro) === String(d.id) ? '' : String(d.id); atualizarTudo();
    };
    if (!f || (!cartoesVisiveis && !'las'.includes(k) && ev.key !== '?')) return;
    ev.preventDefault(); f();
  };
  document.addEventListener('pointerdown', foraMenu, true); document.addEventListener('keydown', teclaGeral);

  desenharChips(); desenharLista(); desenharPainel(); desenharMais(); desenharLimpeza(); desenharLote();
  document.title = 'Cartões · Ohara';
  return () => { fecharAjuda(); destruido = true; document.removeEventListener('pointerdown', foraMenu, true); document.removeEventListener('keydown', teclaGeral); ed?.destruir(); liberar(); raiz.onclick = raiz.oninput = raiz.onsubmit = raiz.onkeydown = null; };
}
