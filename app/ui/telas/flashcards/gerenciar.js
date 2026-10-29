// Tela Cartões: todos os cartões, filtrar por matéria, editar, excluir (lixeira), importar texto "Frente :: Verso" e
// exportar para o Anki (.apkg). A revisão é no Anki.
import { escaparHtml } from '../../../nucleo/texto.js';
import { ativas, corCss } from '../../../nucleo/materias.js';
import { resumo } from '../../../nucleo/flashcards_texto.js';
import { alterarCartao, excluirCartao, restaurarCartao, importarTexto, cartoesParaExportar, pendentesDeEnvio } from '../../../nucleo/cartoes.js';

export function baixarBytes(bytes, nome, tipo) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function desenharCartoes(raiz, ctx) {
  const { sessao } = ctx;
  let abertoMais = false, filtro = '', editando = null, erro = '', relatorio = null, urls = [], anki = null, enviando = false;
  const liberar = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };

  function desenhar() {
    liberar();
    const estado = sessao.estado(), itens = cartoesParaExportar(estado, { disciplinaId: filtro ? Number(filtro) : null });
    const todos = cartoesParaExportar(estado), pend = pendentesDeEnvio(todos.map((i) => i.cartao));
    const aulas = ativas(estado.aulas).filter((a) => ativas(estado.disciplinas).some((d) => d.id === a.disciplina_id));
    const nomeDe = (id) => estado.disciplinas.find((d) => d.id === id);
    raiz.innerHTML = `<h1>Cartões</h1><p class="sub">${todos.length ? `${todos.length} ${todos.length === 1 ? 'cartão' : 'cartões'}, ${pend.length} para enviar ao Anki` : 'Nenhum cartão ainda. Crie na tela da aula (botão Cartões) ou importe um texto abaixo.'}</p>` +
      `<div class="card bloco"><h2>Enviar para o Anki</h2><p class="sub">Gera um arquivo <b>.apkg</b>. No Anki: Arquivo › Importar. Enviar de novo atualiza os cartões em vez de duplicar. Os cartões ficam num baralho <i>Matéria::Aula</i>.</p>` +
      `<div class="acoes"><button class="btn peq" type="button" data-a="exportar-novos" ${pend.length ? '' : 'disabled'}>Só novos e alterados (${pend.length})</button><button class="btn peq sec" type="button" data-a="exportar-todos" ${todos.length ? '' : 'disabled'}>Todos (${todos.length})</button></div></div>` +
      `<div class="card bloco"><h2>Enviar direto ao Anki (no computador)</h2><p class="sub">Com o Anki aberto e o complemento <b>AnkiConnect</b> instalado, os cartões vão sem arquivo, atualizando os que já estão lá. Só funciona neste modo no computador; no tablet use o .apkg acima.</p>` +
      `<div class="acoes"><button class="btn peq" type="button" data-a="anki-novos" ${pend.length && !enviando ? '' : 'disabled'}>${enviando ? 'Enviando…' : `Só novos e alterados (${pend.length})`}</button><button class="btn peq sec" type="button" data-a="anki-todos" ${todos.length && !enviando ? '' : 'disabled'}>Todos (${todos.length})</button><button class="btn peq sec" type="button" data-a="anki-ver" ${enviando ? 'disabled' : ''}>Ver o Anki</button></div>${ankiHtml()}</div>` +
      `<div class="card bloco"><h2>Importar texto</h2><form id="importar" class="form"><label class="c">Aula<select class="in" name="aula">${aulas.map((a) => `<option value="${a.id}">${escaparHtml(nomeDe(a.disciplina_id).nome)} › ${escaparHtml(a.titulo)}</option>`).join('')}</select></label>` +
      `<label class="c">Um cartão por linha: Frente :: Verso (e, se quiser, :: etiquetas)<textarea class="in" name="texto" placeholder="O que é biodisponibilidade? :: Fração da dose que chega à circulação."></textarea></label>` +
      `<div class="acoes"><button class="btn peq" type="submit" ${aulas.length ? '' : 'disabled'}>Importar</button></div>${relatorioHtml()}</form></div>` +
      `<div class="card bloco"><div class="acoes" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Seus cartões</h2><select class="in" id="filtro" style="width:auto"><option value="">Todas as matérias</option>${ativas(estado.disciplinas).map((d) => `<option value="${d.id}" ${String(d.id) === filtro ? 'selected' : ''}>${escaparHtml(d.nome)}</option>`).join('')}</select></div>` +
      (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '') + (itens.map(({ cartao: c, aula, disciplina }) => editando === c.id ? formEdicao(c) : cartaoHtml(c, aula, disciplina)).join('') || '<p class="sub">Nada por aqui.</p>') + '</div>';
    // O uso de todo dia (ver e editar cartões) vem primeiro; Anki e importação ficam recolhidos.
    const blocos = [...raiz.querySelectorAll(':scope > .card.bloco')], listaCards = blocos.pop(), det = document.createElement('details');
    det.className = 'mais-cartoes'; det.open = abertoMais; det.innerHTML = '<summary class="btn sec">Enviar ao Anki e importar texto</summary>';
    blocos.forEach((c) => det.appendChild(c)); raiz.querySelector('p.sub').after(listaCards); listaCards.after(det);
    det.addEventListener('toggle', () => { abertoMais = det.open; });
    for (const { cartao: c } of itens) if (c.tem_imagem) sessao.lerImagemCartao(c.id).then((b) => { const el = raiz.querySelector(`img[data-cartao="${c.id}"]`); if (b && el) { const u = URL.createObjectURL(b); urls.push(u); el.src = u; } });
    document.title = 'Cartões · Ohara';
  }
  const ankiHtml = () => !anki ? '' : anki.erro ? `<p class="erro">${escaparHtml(anki.erro)}</p>` : anki.situacao
    ? `<p class="sub" style="margin:10px 0 0">No Anki agora: ${anki.situacao.vencidos} ${anki.situacao.vencidos === 1 ? 'cartão para revisar' : 'cartões para revisar'}; ${anki.situacao.revisadosHoje} ${anki.situacao.revisadosHoje === 1 ? 'revisado' : 'revisados'} hoje.</p>`
    : `<p class="sub" style="margin:10px 0 0">${anki.r.novos} ${anki.r.novos === 1 ? 'novo' : 'novos'}, ${anki.r.atualizados} ${anki.r.atualizados === 1 ? 'atualizado' : 'atualizados'}${anki.r.adotados ? `, ${anki.r.adotados} já ${anki.r.adotados === 1 ? 'estava' : 'estavam'} no Anki e foi ligado ao Ohara` : ''}${anki.r.falhas.length ? `; ${anki.r.falhas.length} não ${anki.r.falhas.length === 1 ? 'foi' : 'foram'} enviado${anki.r.falhas.length === 1 ? '' : 's'}:` : '.'}</p>` +
      (anki.r.falhas.length ? `<ul class="sub">${anki.r.falhas.slice(0, 5).map((f) => `<li>${escaparHtml((sessao.estado().cartoes.find((c) => c.id === f.id)?.frente ?? '').slice(0, 40))}: ${escaparHtml(f.motivo)}</li>`).join('')}</ul>` : '');
  const relatorioHtml = () => !relatorio ? '' : `<p class="sub" style="margin:10px 0 0">${relatorio.criados} ${relatorio.criados === 1 ? 'cartão criado' : 'cartões criados'}${relatorio.ignorados.length ? `; ${relatorio.ignorados.length} ${relatorio.ignorados.length === 1 ? 'linha ignorada' : 'linhas ignoradas'}:` : '.'}</p>` +
    (relatorio.ignorados.length ? `<ul class="sub">${relatorio.ignorados.map((i) => `<li>linha ${i.linha}: ${escaparHtml(i.motivo)}</li>`).join('')}</ul>` : '');
  const cartaoHtml = (c, aula, d) => `<div class="cartao"><span class="pt" style="background:${corCss(d.cor)};margin-top:6px"></span><div class="t"><b>${escaparHtml(resumo(c.frente, 120))}</b>${escaparHtml(resumo(c.verso, 160))}${c.tem_imagem ? `<img data-cartao="${c.id}" alt="">` : ''}<small>${escaparHtml(d.nome)} › ${escaparHtml(aula.titulo)}${c.pagina ? ` · slide ${c.pagina}` : ''}${c.etiquetas ? ` · ${escaparHtml(c.etiquetas)}` : ''}${!c.exportado_em ? ' · novo' : c.atualizado_em > c.exportado_em ? ' · alterado' : ''}</small></div>` +
    `<button class="btn peq sec" type="button" data-a="editar" data-id="${c.id}">Editar</button><button class="btn peq sec" type="button" data-a="excluir" data-id="${c.id}">Excluir</button></div>`;
  const formEdicao = (c) => `<form class="cartao form" id="editar" data-id="${c.id}" style="flex-direction:column;align-items:stretch"><label class="c">Frente<textarea class="in" name="frente">${escaparHtml(c.frente)}</textarea></label><label class="c">Verso<textarea class="in" name="verso">${escaparHtml(c.verso)}</textarea></label>` +
    `<label class="c">Etiquetas<input class="in" name="etiquetas" value="${escaparHtml(c.etiquetas)}" autocomplete="off"></label><div class="acoes"><button class="btn peq" type="submit">Salvar</button><button class="btn peq sec" type="button" data-a="cancelar">Cancelar</button></div></form>`;

  async function exportar(filtroEnvio) {
    try {
      const estado = sessao.estado(), todos = cartoesParaExportar(estado);
      const itens = filtroEnvio ? pendentesDeEnvio(todos.map((i) => i.cartao)) : null;
      const r = await sessao.exportarCartoes(itens ? { ids: itens.map((c) => c.id) } : {});
      baixarBytes(r.bytes, r.nome, 'application/octet-stream'); ctx.aviso(`${r.total} ${r.total === 1 ? 'cartão enviado' : 'cartões enviados'} no arquivo ${r.nome}.`); erro = '';
    } catch (e) { erro = e.message; }
    desenhar();
  }

  async function enviarAnki(acao) {
    enviando = true; anki = null; desenhar();
    try {
      if (acao === 'ver') anki = { situacao: await sessao.situacaoDoAnki() };
      else {
        const todos = cartoesParaExportar(sessao.estado()), ids = acao === 'novos' ? pendentesDeEnvio(todos.map((i) => i.cartao)).map((c) => c.id) : null;
        anki = { r: await sessao.enviarAoAnki(ids ? { ids } : {}) };
      }
    } catch (e) { anki = { erro: e.message }; }
    enviando = false; desenhar();
  }

  raiz.onclick = async (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const id = Number(b.dataset.id), agora = new Date().toISOString();
    if (b.dataset.a.startsWith('anki-')) return enviarAnki(b.dataset.a.slice(5));
    if (b.dataset.a === 'exportar-novos') return exportar(true);
    if (b.dataset.a === 'exportar-todos') return exportar(false);
    try {
      if (b.dataset.a === 'editar') editando = id;
      else if (b.dataset.a === 'cancelar') editando = null;
      else if (b.dataset.a === 'excluir') {
        const c = sessao.estado().cartoes.find((x) => x.id === id);
        sessao.aplicar((e) => excluirCartao(e, id, agora));
        ctx.aviso(`Cartão "${c.frente.slice(0, 30)}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => { sessao.aplicar((e) => restaurarCartao(e, id)); desenhar(); } });
      }
      erro = '';
    } catch (e) { erro = e.message; }
    desenhar();
  };
  raiz.onchange = (ev) => { if (ev.target.id === 'filtro') { filtro = ev.target.value; desenhar(); } };
  raiz.onsubmit = (ev) => {
    ev.preventDefault(); const f = new FormData(ev.target), agora = new Date().toISOString();
    try {
      if (ev.target.id === 'editar') { sessao.aplicar((e) => alterarCartao(e, Number(ev.target.dataset.id), { frente: f.get('frente'), verso: f.get('verso'), etiquetas: f.get('etiquetas') }, agora)); editando = null; }
      else if (ev.target.id === 'importar') { let r; sessao.aplicar((e) => { r = importarTexto(e, Number(f.get('aula')), f.get('texto'), agora, () => globalThis.crypto.randomUUID()); return r.estado; }); relatorio = { criados: r.criados.length, ignorados: r.ignorados }; }
      erro = '';
    } catch (e) { erro = e.message; }
    desenhar();
  };
  desenhar();
  return liberar;
}
