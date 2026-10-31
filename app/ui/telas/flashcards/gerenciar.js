// Gerenciar cartões (versão 7 da prancheta): à esquerda a lista (busca, matéria, "novos e alterados"); à direita o cartão aberto
// no próprio editor formatado (o mesmo da Mesa: frente em faixa na cor da matéria), com Salvar, Descartar e Excluir.
// Anki e importar de texto ficam atrás do botão "Anki e importar". A revisão é no Treino (ou no Anki).
import { escaparHtml } from '../../../nucleo/texto.js';
import { ativas, corCss, imagensDoCartao, siglaDaMateria } from '../../../nucleo/materias.js';
import { resumo, conferir, montarTexto } from '../../../nucleo/flashcards_texto.js';
import { paraGuardado } from '../../../nucleo/flashcards_editor.js';
import { alterarCartao, excluirCartao, restaurarCartao, importarTexto, cartoesParaExportar, pendentesDeEnvio } from '../../../nucleo/cartoes.js';
import { criarEditorCartoes } from '../../componentes/editor_cartoes.js';

export function baixarBytes(bytes, nome, tipo) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const ICO = {
  env: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lixo: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  lupa: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
};
const svg = (k) => `<svg class="gc-i" viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;
const u = (n, um, vp) => `${n} ${n === 1 ? um : vp}`;

export function desenharCartoes(raiz, ctx, { disciplinaId = null } = {}) {
  const { sessao } = ctx;
  let filtro = disciplinaId == null ? '' : String(disciplinaId), busca = '', soNovos = false, selId = null, mais = false, ed = null, base = '', sujo = false,
    erro = '', relatorio = null, urls = [], anki = null, enviando = false, destruido = false;
  const liberar = () => { urls.forEach((x) => URL.revokeObjectURL(x)); urls = []; };
  const pendente = (c) => !c.exportado_em || c.atualizado_em > c.exportado_em;

  raiz.innerHTML = `<div class="gc"><div class="gc-bar"><label class="gc-busca">${svg('lupa')}<input type="search" data-k="busca" placeholder="Buscar na frente ou no verso" autocomplete="off" aria-label="Buscar cartões"></label>` +
    `<span class="gc-esp"></span><button type="button" class="gc-chip gc-novos" data-novos="1" data-k="novos"></button><button type="button" class="gc-btn gc-sec" data-k="mais-btn">${svg('env')}Anki e importar</button></div>` +
    `<div class="gc-chips" data-k="chips"></div><div class="gc-cols" data-k="cols"><div class="gc-lista" data-k="lista" role="listbox" aria-label="Cartões"></div><div class="gc-pan" data-k="pan"></div></div>` +
    `<div class="gc-mais" data-k="mais" hidden></div></div>`;
  const $ = (k) => raiz.querySelector(`[data-k="${k}"]`);

  const visiveis = () => {
    const q = busca.trim().toLowerCase();
    return cartoesParaExportar(sessao.estado(), { disciplinaId: filtro ? Number(filtro) : null })
      .filter(({ cartao: c }) => (!soNovos || pendente(c)) && (!q || `${c.frente}\n${c.verso}\n${c.etiquetas}`.toLowerCase().includes(q)))
      .sort((a, b) => b.cartao.id - a.cartao.id);
  };

  function desenharChips() {
    const estado = sessao.estado(), todos = cartoesParaExportar(estado), np = pendentesDeEnvio(todos.map((i) => i.cartao)).length;
    const chip = (id, nome, n, cor) => `<button type="button" class="gc-chip${String(filtro) === String(id) ? ' on' : ''}" data-f="${id}">${cor ? `<i class="gc-pt" style="--c:${cor}"></i>` : ''}${escaparHtml(nome)} <em>${n}</em></button>`;
    $('chips').innerHTML = (disciplinaId == null ? chip('', 'Todas', todos.length) + ativas(estado.disciplinas).map((d) => chip(d.id, siglaDaMateria(d), todos.filter((i) => i.disciplina.id === d.id).length, corCss(d.cor))).join('') : '');
    $('chips').hidden = disciplinaId != null; $('novos').classList.toggle('on', soNovos); $('novos').innerHTML = `Novos e alterados <em>${np}</em>`;
  }

  function desenharLista() {
    const it = visiveis();
    if (selId != null && !it.some((i) => i.cartao.id === selId) && !sujo) selId = null;
    if (selId == null && it.length) selId = it[0].cartao.id;
    $('lista').innerHTML = it.map(({ cartao: c, disciplina: d, aula }) => `<button type="button" class="gc-lin${c.id === selId ? ' sel' : ''}" role="option" aria-selected="${c.id === selId}" data-id="${c.id}" title="${escaparHtml(d.nome)} › ${escaparHtml(aula.titulo)}">` +
      `<i class="gc-pt" style="--c:${corCss(d.cor)}"></i><span class="gc-tx"><b>${escaparHtml(resumo(c.frente, 90))}</b><small>${escaparHtml(resumo(c.verso, 120)) || escaparHtml(aula.titulo)}</small></span>` +
      (!c.exportado_em ? '<span class="gc-tag n">novo</span>' : c.atualizado_em > c.exportado_em ? '<span class="gc-tag">alterado</span>' : '') + '</button>').join('') ||
      `<p class="gc-vazio">${sessao.estado().cartoes.length ? 'Nenhum cartão com esse filtro.' : 'Nenhum cartão ainda. Crie na Mesa (botão Criar ›) ou importe um texto em “Anki e importar”.'}</p>`;
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
      `<div class="gc-acoes"><button type="button" class="gc-btn" data-k="salvar" disabled>${svg('ok')}Salvar <kbd>Ctrl Enter</kbd></button><button type="button" class="gc-btn gc-sec" data-k="descartar" disabled>Descartar</button><span class="gc-esp"></span><button type="button" class="gc-btn gc-sec" data-k="excluir">${svg('lixo')}Excluir</button></div>`;
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
  function atualizarTudo() { desenharChips(); desenharLista(); desenharPainel(); desenharMais(); }

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
    $('cols').hidden = !!mais; $('mais').hidden = !mais; $('mais-btn').classList.toggle('on', mais);
    $('mais-btn').innerHTML = mais ? 'Voltar aos cartões' : `${svg('env')}Anki e importar`;
    if (!mais) { $('mais').innerHTML = ''; return; }
    const estado = sessao.estado(), todos = cartoesParaExportar(estado), pend = pendentesDeEnvio(todos.map((i) => i.cartao));
    const aulas = ativas(estado.aulas).filter((a) => ativas(estado.disciplinas).some((d) => d.id === a.disciplina_id));
    const nomeDe = (id) => estado.disciplinas.find((d) => d.id === id);
    $('mais').innerHTML = `<div class="card bloco"><h2>Enviar para o Anki</h2><p class="sub">Gera um arquivo <b>.apkg</b>. No Anki: Arquivo › Importar. Enviar de novo atualiza os cartões em vez de duplicar. Os cartões ficam num baralho <i>Matéria::Aula</i>.</p>` +
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

  raiz.onclick = (ev) => {
    const t = ev.target;
    const f = t.closest('[data-f]'); if (f) { if (sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); filtro = f.dataset.f; atualizarTudo(); return; }
    if (t.closest('[data-novos]')) { if (sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); soNovos = !soNovos; atualizarTudo(); return; }
    const lin = t.closest('[data-id]'); if (lin) { selecionar(Number(lin.dataset.id)); return; }
    if (t.closest('[data-k="mais-btn"]')) { if (!mais && sujo) return ctx.aviso('Este cartão tem alterações: salve ou descarte antes.'); mais = !mais; if (!mais) atualizarTudo(); else desenharMais(); return; }
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
  raiz.onkeydown = (ev) => { if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { const lin = ev.target.closest?.('.gc-lin'); if (!lin) return; ev.preventDefault(); (ev.key === 'ArrowDown' ? lin.nextElementSibling : lin.previousElementSibling)?.focus(); } };

  desenharChips(); desenharLista(); desenharPainel(); desenharMais();
  document.title = 'Cartões · Ohara';
  return () => { destruido = true; ed?.destruir(); liberar(); raiz.onclick = raiz.oninput = raiz.onsubmit = raiz.onkeydown = null; };
}
