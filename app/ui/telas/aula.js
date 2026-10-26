// Tela da Aula: slide (PDF ou imagem) à esquerda, anotações à direita; em pé, duas abas.
// Cada painel cuida do próprio DOM (leitor e editor ficam vivos); a tela só é redesenhada ao entrar nela.
import { escaparHtml, formatarBytes } from '../../nucleo/texto.js';
import { ativas } from '../../nucleo/materias.js';
import { descreverHorario } from '../../nucleo/aulas.js';
import { arquivosDaAula, excluirArquivo, restaurarArquivo, ehPdf } from '../../nucleo/arquivos.js';
import { criarMarcador, removerMarcador, marcadoresDaAula, descreverMarcador } from '../../nucleo/marcadores.js';
import { textoDoDelta } from '../../nucleo/anotacoes.js';
import { cartoesDaAula, excluirCartao, restaurarCartao, importarTexto } from '../../nucleo/cartoes.js';
import { criarLeitor } from '../leitor.js';
import { abrirMenu } from '../menu.js';

const carregarScript = (src) => new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não consegui carregar o editor.')); document.head.appendChild(s); });
async function carregarQuill() {
  if (!globalThis.Quill) {
    if (!document.querySelector('link[data-quill]')) document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'vendor/quill.snow.css' })).dataset.quill = '1';
    await carregarScript('vendor/quill.js');
  }
  return globalThis.Quill;
}
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Desenha a tela e devolve uma função de limpeza (grava o que estiver pendente e solta o leitor). */
export function desenharAula(raiz, ctx, aulaId) {
  const sessao = ctx.sessao;
  const estado0 = sessao.estado();
  const aula = estado0.aulas.find((a) => a.id === aulaId && !a.excluido_em);
  const materia = aula && ativas(estado0.disciplinas).find((d) => d.id === aula.disciplina_id);
  if (!aula || !materia) { raiz.innerHTML = '<h1>Aula não encontrada</h1><p class="sub"><a class="voltar" href="#materias">← Voltar às matérias</a></p>'; return () => {}; }
  document.title = `${aula.titulo} · Ohara`;
  raiz.className = 'cheia';

  let modoCartoes = false, rascunho = { frente: '', verso: '', etiquetas: '', pagina: null, marcadorId: null }, ultimaSelecao = '', erroCartao = '', leitor = null, quill = null, arquivoAtual = null, temporizador = null, pendente = false, aba = 'slide', historicoAberto = false;
  const lista = () => arquivosDaAula(sessao.estado(), aulaId);

  raiz.innerHTML = `<div class="topo"><a class="voltar" href="#materias/${materia.id}">← ${escaparHtml(materia.nome)}</a>` +
    `<div class="tt"><b>${escaparHtml(aula.titulo)}</b><small>${aula.tipo === 'livro' ? 'Livro' : 'Aula'}${descreverHorario(aula) ? ' · ' + escaparHtml(descreverHorario(aula)) : ''}</small></div><span class="esp"></span>` +
    `<div class="gp" role="group" aria-label="Slide"><button type="button" id="ant" aria-label="Slide anterior (Alt Page Up)">◀</button><span id="pag">—</span><button type="button" id="prox" aria-label="Próximo slide (Alt Page Down)">▶</button></div>` +
    `<button type="button" class="btn peq sec" id="mais-menu" aria-label="Mais opções" aria-haspopup="menu">⋯</button>` +
    `<button type="button" class="btn peq sec" id="foco-btn" title="Tela cheia de foco (Alt Enter)">Foco ⤢</button><div class="abas" role="tablist"><button type="button" data-aba="slide" class="on">Slide</button><button type="button" data-aba="notas">Anotações</button></div>` +
    `<input type="file" id="anexar" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf" hidden></div>` +
    `<div class="aula" data-aba="slide">` +
    `<section class="painel" id="p-slide"><p class="erro" id="erro-slide" hidden></p><div id="leitor" tabindex="0" aria-label="Slide (setas e Page Down passam de slide; J e K rolam; + e − dão zoom)"><p class="vazio" id="sem-arq"></p></div></section>` +
    `<div class="divisoria" id="divisoria" role="separator" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="75" aria-valuenow="50" tabindex="0" aria-label="Divisória entre slide e anotações (setas, ou Alt vírgula e Alt ponto)"></div><section class="painel" id="p-notas"><div class="cab"><button type="button" class="btn peq" id="marcar" title="Marcar a linha (Ctrl M)">Marcar ◆</button><button type="button" class="btn peq sec" id="ver-slide" hidden>Mostrar slide</button><button type="button" class="btn peq sec" id="bt-marc" aria-haspopup="true" aria-expanded="false" title="Ver marcados" hidden>◆ <span id="n-marc">0</span></button>` +
    `<span class="esp" id="salvo"></span></div>` +
    `<div id="hist-lista" hidden></div><div id="cartoes-modo" hidden></div><div id="editor"></div><div class="barra-ed" id="barra-ed" role="toolbar" aria-label="Formatação">
    <span class="gr"><button type="button" class="ql-header" value="1" title="Título 1 (Ctrl Alt 1)"></button><button type="button" class="ql-header" value="2" title="Título 2 (Ctrl Alt 2)"></button></span>
    <span class="gr"><button type="button" class="ql-bold" title="Negrito (Ctrl B)"></button><button type="button" class="ql-italic" title="Itálico (Ctrl I)"></button><button type="button" class="ql-underline" title="Sublinhado (Ctrl U)"></button></span>
    <span class="gr"><button type="button" class="ql-realce" title="Marca-texto (Ctrl Shift H)"><svg viewBox="0 0 18 18"><path class="ql-stroke" d="M11 3l4 4-6 6H5v-4z"/><path class="ql-stroke" d="M3 16h12"/></svg></button></span>
    <span class="gr"><button type="button" class="ql-list" value="ordered" title="Lista numerada (Ctrl Shift 7)"></button><button type="button" class="ql-list" value="bullet" title="Lista com marcadores (Ctrl Shift 8)"></button> </span>
    <span class="gr resto"><button type="button" class="ql-list" value="check" title="Lista de tarefas (Ctrl Shift 9)"></button><button type="button" class="ql-link" title="Link (Ctrl K)"></button><button type="button" class="ql-header" value="3" title="Título 3 (Ctrl Alt 3)"></button><button type="button" class="ql-strike" title="Riscado (Ctrl Shift X)"></button><button type="button" class="ql-code" title="Código (Ctrl E)"></button><button type="button" class="ql-blockquote" title="Citação (> e espaço)"></button><button type="button" class="ql-indent" value="-1" title="Voltar (Shift Tab)"></button><button type="button" class="ql-indent" value="+1" title="Recuar (Tab)"></button><button type="button" class="ql-clean" title="Limpar formatação (Ctrl \\)"></button></span>
    <button type="button" class="mais-ed" id="mais-ed" aria-label="Mais formatações" aria-expanded="false" title="Mais formatações">⋯</button><button type="button" class="ocultar-b" id="ocultar-b" title="Ocultar a barra (Alt T)">Ocultar ⌄</button></div><button type="button" class="abarra" id="abarra" title="Mostrar a barra (Alt T)">⌃ Barra</button><div class="bolha-ed" id="bolha-ed" role="toolbar" aria-label="Formatar o trecho selecionado" hidden><button type="button" data-f="h1">H1</button><button type="button" data-f="h2">H2</button><button type="button" data-f="bold" class="b">B</button><button type="button" data-f="italic" class="i">I</button><button type="button" data-f="underline" class="u">U</button><button type="button" data-f="realce" title="Marca-texto">Marca</button><button type="button" data-f="link">Link</button><button type="button" data-f="code">&lt;/&gt;</button></div><div class="marc-pop" id="marc-pop" hidden><h2>Marcados na aula</h2><div id="marcados"></div></div></section></div>`;
  const $ = (s) => raiz.querySelector(s);

  // ----- arquivos e leitor -----
  function desenharSeletor() {
    const l = lista();
    $('#sem-arq').innerHTML = l.length ? '' : 'Nenhum slide ainda.<br><button type="button" class="btn" id="anexar-vazio">Anexar PDF ou imagem</button>';
    const av = $('#anexar-vazio'); if (av) av.onclick = () => $('#anexar').click();
    raiz.querySelectorAll('#nav-slide-off').forEach((x) => x.remove());
    $('#p-slide').classList.toggle('sem-slide', !l.length);
    for (const id of ['ant', 'prox']) $('#' + id).disabled = !l.length;
  }
  function mostrarErro(m) { const e = $('#erro-slide'); e.textContent = m || ''; e.hidden = !m; }
  async function abrirArquivo(f) {
    arquivoAtual = f; mostrarErro('');
    const blob = await sessao.lerArquivo(f.id);
    if (!blob) { mostrarErro('O conteúdo deste arquivo não está neste aparelho (restaure um backup completo).'); return; }
    try { await leitor.abrir(ehPdf(f) ? 'pdf' : 'imagem', blob, Number(sessao.lerConfig(`pagina_${f.id}`)) || 1); } catch (e) { mostrarErro(e.message); }
  }
  leitor = criarLeitor($('#leitor'), {
    aoMudarPagina: (n, total) => { $('#pag').textContent = `${n} / ${total}`; $('#pag').title = 'Slide atual'; $('#ant').disabled = n <= 1; $('#prox').disabled = n >= total; if (arquivoAtual && leitor.total > 1) sessao.gravarConfig(`pagina_${arquivoAtual.id}`, n); },
    aoMudarZoom: () => {},
  });
  async function removerArquivo() {
    const f = arquivoAtual; if (!f) return;
    sessao.aplicar((e) => excluirArquivo(e, f.id, new Date().toISOString()));
    arquivoAtual = null; leitor.fechar(); desenharSeletor(); mostrarErro('');
    const resto = lista(); if (resto.length) await abrirArquivo(resto[resto.length - 1]); else $('#pag').textContent = '—';
    ctx.aviso(`"${f.nome}" foi para a lixeira.`, { texto: 'Desfazer', fazer: async () => { sessao.aplicar((e) => restaurarArquivo(e, f.id)); desenharSeletor(); await abrirArquivo(f); desenharSeletor(); } });
  }
  $('#ant').onclick = () => leitor.anterior(); $('#prox').onclick = () => leitor.proximo();
  $('#mais-menu').onclick = (e) => {
    const l = lista(), cont = leitor.modo === 'continuo';
    abrirMenu(e.currentTarget, [
      { rotulo: 'Anexar slide ou imagem…', fazer: () => $('#anexar').click() },
      ...(l.length > 1 ? l.map((f) => ({ rotulo: f.nome, marcado: f.id === arquivoAtual?.id, fazer: () => abrirArquivo(f) })) : []),
      ...(l.length ? [{ rotulo: cont ? 'Mostrar um slide por vez' : 'Rolar o arquivo contínuo', fazer: () => leitor.definirModo(cont ? 'pagina' : 'continuo') }] : []),
      ...(l.length ? [{ rotulo: 'Aumentar o slide (+)', fazer: () => leitor.mais() }, { rotulo: 'Diminuir o slide (−)', fazer: () => leitor.menos() }, { rotulo: 'Tamanho que cabe na tela (0)', fazer: () => leitor.normal() }] : []),
      { sep: true },
      { rotulo: soNotas ? 'Mostrar o slide (Alt S)' : 'Só anotações, sem slide (Alt S)', fazer: () => aplicarSoNotas(!soNotas) },
      { rotulo: fantasma ? 'Mostrar a barra do editor (Alt T)' : 'Ocultar a barra do editor (Alt T)', fazer: () => aplicarFantasma(!fantasma) },
      { rotulo: modoCartoes ? 'Voltar às anotações' : 'Criar cartões desta aula', fazer: alternarCartoes },
      { rotulo: 'Histórico de versões do texto', fazer: alternarHistorico },
      ...(arquivoAtual ? [{ sep: true }, { rotulo: `Remover “${arquivoAtual.nome}”`, perigo: true, fazer: removerArquivo }] : []),
    ]);
  };
  $('#anexar').onchange = async (e) => {
    const arq = e.target.files[0]; e.target.value = ''; if (!arq) return;
    try { const reg = await sessao.anexar(aulaId, arq); desenharSeletor(); await abrirArquivo(reg); ctx.aviso(`"${reg.nome}" anexado (${formatarBytes(reg.tamanho)}).`); }
    catch (err) { mostrarErro(err.message); }
  };

  // ----- editor, marcador e histórico -----
  function salvarAgora() {
    if (!pendente || !quill) return;
    clearTimeout(temporizador); temporizador = null; pendente = false;
    try { sessao.salvarAnotacao(aulaId, JSON.stringify(quill.getContents())); $('#salvo').textContent = `Salvo às ${hora()}`; }
    catch (e) { $('#salvo').textContent = 'Não salvou: ' + e.message; pendente = true; }
  }
  function marcar() {
    if (!quill) return;
    const sel = quill.getSelection(true) || { index: Math.max(0, quill.getLength() - 1) };
    const [linha, desloc] = quill.getLine(sel.index);
    const inicio = sel.index - desloc, texto = (linha.domNode.textContent || '').replace(/^◆\s*(p\.\d+\s*)?/, '').trim();
    if ((linha.domNode.textContent || '').startsWith('◆')) { ctx.aviso('Essa linha já está marcada.'); return; }
    const pag = arquivoAtual && leitor.total > 1 ? leitor.pagina : null;
    sessao.aplicar((e) => criarMarcador(e, aulaId, { arquivoId: arquivoAtual?.id ?? null, pagina: pag, trecho: texto }, new Date().toISOString()).estado);
    quill.insertText(inicio, `◆ ${pag ? `p.${pag} ` : ''}`, { bold: true }, 'user');
    desenharMarcados(); ctx.aviso(pag ? `◆ Marcado no slide ${pag}.` : '◆ Linha marcada.');
  }
  function desenharMarcados() {
    const ms = marcadoresDaAula(sessao.estado(), aulaId);
    $('#n-marc').textContent = String(ms.length); $('#bt-marc').hidden = !ms.length; if (!ms.length) $('#marc-pop').hidden = true;
    $('#marcados').innerHTML = ms.length ? ms.map((m) => `<div class="it"><button type="button" class="ir" data-pag="${m.pagina ?? ''}" data-arq="${m.arquivo_id ?? ''}">${escaparHtml(descreverMarcador(m))}</button><button type="button" class="x" data-rem="${m.id}" aria-label="Remover marcador">×</button></div>`).join('')
      : '<p class="vazio">Nenhum marcador. Use o botão Marcar ou Ctrl+M no texto.</p>';
  }
  $('#bt-marc').onclick = () => { const p = $('#marc-pop'); p.hidden = !p.hidden; $('#bt-marc').setAttribute('aria-expanded', String(!p.hidden)); };
  const foraMarc = (e) => { const p = $('#marc-pop'); if (!p.hidden && !p.contains(e.target) && !e.target.closest('#bt-marc')) { p.hidden = true; $('#bt-marc').setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('pointerdown', foraMarc);
  $('#marcados').onclick = async (e) => {
    const ir = e.target.closest('.ir'), x = e.target.closest('.x');
    if (x) { sessao.aplicar((s) => removerMarcador(s, Number(x.dataset.rem), new Date().toISOString())); desenharMarcados(); }
    else if (ir && ir.dataset.pag) {
      const f = lista().find((a) => a.id === Number(ir.dataset.arq));
      if (f && f.id !== arquivoAtual?.id) { await abrirArquivo(f); desenharSeletor(); }
      $('#marc-pop').hidden = true; aba = 'slide'; $('.aula').dataset.aba = aba; raiz.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('on', b.dataset.aba === aba));
      leitor.irPara(Number(ir.dataset.pag));
    }
  };
  $('#marcar').onclick = marcar;
  raiz.querySelectorAll('.abas button').forEach((b) => { b.onclick = () => { aba = b.dataset.aba; $('.aula').dataset.aba = aba; raiz.querySelectorAll('.abas button').forEach((x) => x.classList.toggle('on', x === b)); }; });

  function desenharHistorico() {
    const h = $('#hist-lista'); h.hidden = !historicoAberto; if (!historicoAberto) return;
    const vs = sessao.listarVersoes(aulaId);
    h.innerHTML = vs.length ? `<p class="sub">Versões anteriores do texto. Restaurar guarda o texto de agora no histórico.</p>` + vs.map((v) => `<div class="lin"><div class="t">${escaparHtml(dataHora(v.criado_em))}<small>${escaparHtml(textoDoDelta(v.conteudo).slice(0, 90) || '(vazio)')}</small></div><button type="button" class="btn peq sec" data-v="${v.id}">Restaurar</button></div>`).join('')
      : '<p class="sub">Ainda não há versões anteriores. O histórico guarda um ponto de volta a cada 5 minutos de escrita.</p>';
  }
  // ----- barra do editor: colada embaixo; oculta = modo fantasma (bolha sobre o texto selecionado) -----
  const lembra = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* vale só agora */ } };
  const lido = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  let fantasma = lido('ohara.barraEd') === 'oculta', soNotas = lido('ohara.soNotas') === '1';
  function aplicarFantasma(v) { fantasma = v; $('#p-notas').classList.toggle('fantasma', v); lembra('ohara.barraEd', v ? 'oculta' : 'visivel'); if (!v) $('#bolha-ed').hidden = true; }
  function aplicarSoNotas(v) { soNotas = v; $('.aula').classList.toggle('solo', v); lembra('ohara.soNotas', v ? '1' : '0'); $('#ver-slide').hidden = !v; if (v) quill?.focus(); }
  $('#ocultar-b').onclick = () => aplicarFantasma(true);
  $('#abarra').onclick = () => { aplicarFantasma(false); quill?.focus(); };
  function alternarHistorico() { salvarAgora(); historicoAberto = !historicoAberto; desenharHistorico(); }
  $('#ver-slide').onclick = () => aplicarSoNotas(false);
  $('#mais-ed').onclick = () => { const b = $('#barra-ed'); b.classList.toggle('aberta'); $('#mais-ed').setAttribute('aria-expanded', String(b.classList.contains('aberta'))); };
  $('#hist-lista').onclick = (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    try { salvarAgora(); quill.setContents(JSON.parse(sessao.restaurarVersao(aulaId, Number(b.dataset.v))), 'silent'); $('#salvo').textContent = 'Versão restaurada'; } catch (err) { ctx.aviso(err.message); }
    desenharHistorico();
  };

  // ----- modo de produção de cartões (depois da aula) -----
  function desenharCartoes() {
    const pn = $('#p-notas'); pn.classList.toggle('modo-cartoes', modoCartoes); $('#cartoes-modo').hidden = !modoCartoes; 
    if (!modoCartoes) return;
    const ms = marcadoresDaAula(sessao.estado(), aulaId), cs = cartoesDaAula(sessao.estado(), aulaId);
    $('#cartoes-modo').innerHTML = `<div class="marc" style="max-height:none;border:0"><h2>Marcados na aula</h2>${ms.length ? ms.map((m) => `<div class="it"><span class="ir" style="cursor:default">${escaparHtml(descreverMarcador(m))}</span><button type="button" class="btn peq sec" data-c="virar" data-id="${m.id}">Virar cartão</button></div>`).join('') : '<p class="vazio">Nada marcado. Marque linhas com Ctrl+M enquanto anota.</p>'}</div>` +
      `<form id="cartao" class="form" style="padding:14px"><label class="c">Frente<textarea class="in" name="frente" maxlength="2000">${escaparHtml(rascunho.frente)}</textarea></label><label class="c">Verso<textarea class="in" name="verso" maxlength="2000">${escaparHtml(rascunho.verso)}</textarea></label>` +
      `<div class="acoes"><button type="button" class="btn peq sec" data-c="sel-frente">Seleção do texto → frente</button><button type="button" class="btn peq sec" data-c="sel-verso">Seleção do texto → verso</button></div>` +
      `<label class="c">Etiquetas (opcional)<input class="in" name="etiquetas" value="${escaparHtml(rascunho.etiquetas)}" autocomplete="off"></label><label class="c">Imagem (opcional)<input class="in" type="file" name="imagem" accept="image/png,image/jpeg,image/webp,image/gif"></label>` +
      (erroCartao ? `<p class="erro">${escaparHtml(erroCartao)}</p>` : '') + `<div class="acoes"><button class="btn peq" type="submit">Criar cartão</button></div></form>` +
      `<details style="padding:0 14px 8px"><summary class="sub">Importar vários de uma vez (Frente :: Verso)</summary><form id="importar-aula" class="form"><textarea class="in" name="texto" placeholder="Pergunta :: Resposta"></textarea><div class="acoes"><button class="btn peq sec" type="submit">Importar</button></div></form></details>` +
      `<div style="padding:0 14px 14px"><h2>Cartões desta aula (${cs.length})</h2>${cs.map((c) => `<div class="cartao"><div class="t"><b>${escaparHtml(c.frente)}</b>${escaparHtml(c.verso)}${c.pagina ? `<small>slide ${c.pagina}</small>` : ''}</div><button type="button" class="btn peq sec" data-c="excluir" data-id="${c.id}">Excluir</button></div>`).join('') || '<p class="vazio" style="margin:0">Nenhum cartão ainda.</p>'}</div>`;
  }
  function alternarCartoes() { salvarAgora(); modoCartoes = !modoCartoes; if (modoCartoes) { rascunho.pagina = arquivoAtual && leitor.total > 1 ? leitor.pagina : null; } desenharCartoes(); }
  $('#cartoes-modo').onclick = (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const lerCampos = () => { const f = new FormData($('#cartao')); rascunho = { ...rascunho, frente: f.get('frente'), verso: f.get('verso'), etiquetas: f.get('etiquetas') }; };
    if (b.dataset.c === 'virar') { const m = marcadoresDaAula(sessao.estado(), aulaId).find((x) => x.id === Number(b.dataset.id)); lerCampos(); rascunho = { ...rascunho, frente: m.trecho, pagina: m.pagina, marcadorId: m.id }; }
    else if (b.dataset.c === 'sel-frente' || b.dataset.c === 'sel-verso') { lerCampos(); if (!ultimaSelecao) { erroCartao = 'Selecione um trecho no editor de anotações primeiro.'; desenharCartoes(); return; } erroCartao = ''; rascunho[b.dataset.c === 'sel-frente' ? 'frente' : 'verso'] = ultimaSelecao; }
    else if (b.dataset.c === 'excluir') { const id = Number(b.dataset.id); sessao.aplicar((s) => excluirCartao(s, id, new Date().toISOString())); ctx.aviso('Cartão enviado para a lixeira.', { texto: 'Desfazer', fazer: () => { sessao.aplicar((s) => restaurarCartao(s, id)); desenharCartoes(); } }); }
    desenharCartoes();
  };
  $('#cartoes-modo').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try {
      if (e.target.id === 'cartao') {
        await sessao.criarCartao(aulaId, { frente: f.get('frente'), verso: f.get('verso'), etiquetas: f.get('etiquetas'), pagina: rascunho.pagina, marcadorId: rascunho.marcadorId }, f.get('imagem')?.size ? f.get('imagem') : null);
        rascunho = { frente: '', verso: '', etiquetas: f.get('etiquetas'), pagina: rascunho.pagina, marcadorId: null }; erroCartao = ''; ctx.aviso('Cartão criado.'); desenharMarcados();
      } else if (e.target.id === 'importar-aula') {
        let r; sessao.aplicar((s) => { r = importarTexto(s, aulaId, f.get('texto'), new Date().toISOString(), () => globalThis.crypto.randomUUID()); return r.estado; });
        ctx.aviso(`${r.criados.length} criados${r.ignorados.length ? `, ${r.ignorados.length} ignorados (linha ${r.ignorados.map((i) => i.linha).join(', ')})` : ''}.`);
      }
    } catch (err) { erroCartao = err.message; }
    desenharCartoes();
  };

  const aoSair = () => salvarAgora();
  addEventListener('pagehide', aoSair); document.addEventListener('visibilitychange', aoSair);
  const limpar = () => { document.removeEventListener('pointerdown', foraMarc); document.removeEventListener('ohara-divisoria', aoDivisoria); removeEventListener('pagehide', aoSair); document.removeEventListener('visibilitychange', aoSair); salvarAgora(); leitor.fechar(); raiz.className = ''; };

  desenharSeletor(); desenharMarcados();
  const l = lista();
  if (l.length) abrirArquivo(l[l.length - 1]);

  function alternarRealce() { if (!quill) return; const f = quill.getFormat(); quill.format('background', f.background ? false : 'rgba(255, 196, 46, .42)', 'user'); }
  function alternarLista(tipo) { if (!quill) return; quill.format('list', quill.getFormat().list === tipo ? false : tipo, 'user'); }

  // ----- divisória no meio, com margens mínimas; arrasta, usa as setas ou Alt , e Alt . -----
  const aulaEl = $('.aula'), divisoria = $('#divisoria'), CHAVE_FATIA = 'ohara.fatia';
  let fatia = 50; try { fatia = Number(localStorage.getItem(CHAVE_FATIA)) || 50; } catch { /* sem armazenamento: começa no meio */ }
  const aplicarFatia = (v) => { fatia = Math.min(75, Math.max(25, v)); aulaEl.style.setProperty('--fatia', fatia + '%'); divisoria.setAttribute('aria-valuenow', String(Math.round(fatia))); try { localStorage.setItem(CHAVE_FATIA, String(fatia)); } catch { /* vale só agora */ } };
  aplicarFatia(fatia);
  divisoria.onpointerdown = (e) => {
    divisoria.setPointerCapture(e.pointerId); const r = aulaEl.getBoundingClientRect();
    const mover = (ev) => aplicarFatia((ev.clientX - r.left) / r.width * 100), parar = () => { divisoria.removeEventListener('pointermove', mover); divisoria.removeEventListener('pointerup', parar); };
    divisoria.addEventListener('pointermove', mover); divisoria.addEventListener('pointerup', parar);
  };
  divisoria.onkeydown = (e) => { const d = { ArrowLeft: -2, ArrowRight: 2 }[e.key]; if (d) { e.preventDefault(); aplicarFatia(fatia + d); } else if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); aplicarFatia(50); } };
  divisoria.ondblclick = () => aplicarFatia(50);
  const aoDivisoria = (e) => aplicarFatia(fatia + e.detail * 3);
  document.addEventListener('ohara-divisoria', aoDivisoria);

  // ----- teclado: ir entre slide e anotações (Alt L / Alt H) e comandos do slide -----
  const focarEditor = () => { if (aba !== 'notas' && getComputedStyle($('.abas')).display !== 'none') $('.abas [data-aba="notas"]').click(); quill?.focus(); };
  const focarSlide = () => { if (aba !== 'slide' && getComputedStyle($('.abas')).display !== 'none') $('.abas [data-aba="slide"]').click(); $('#leitor').focus(); };
  const aoMover = (e) => {
    const d = e.detail.direcao, emSlide = !!e.target.closest('#p-slide'), emNotas = !!e.target.closest('#p-notas');
    if (d === 'dir' && emSlide) { e.preventDefault(); focarEditor(); }
    else if (d === 'esq' && emNotas) { e.preventDefault(); focarSlide(); }
  };
  raiz.addEventListener('ohara-mover', aoMover);
  raiz.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.code === 'KeyT') { e.preventDefault(); aplicarFantasma(!fantasma); if (!fantasma) quill?.focus(); }
    else if (e.code === 'KeyS') { e.preventDefault(); aplicarSoNotas(!soNotas); }
  });
  // Passar de slide sem sair do texto: Alt+Page Down / Page Up e Alt+] / Alt+[
  raiz.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || !arquivoAtual) return;
    if (e.code === 'PageDown' || e.code === 'BracketRight') { e.preventDefault(); leitor.proximo(); }
    else if (e.code === 'PageUp' || e.code === 'BracketLeft') { e.preventDefault(); leitor.anterior(); }
  });
  $('#leitor').addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const l = $('#leitor');
    if (e.key === 'j') { l.scrollBy({ top: 90 }); e.preventDefault(); } else if (e.key === 'k') { l.scrollBy({ top: -90 }); e.preventDefault(); }
    else if (e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === ' ') { leitor.proximo(); e.preventDefault(); } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') { leitor.anterior(); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { leitor.mais(); e.preventDefault(); } else if (e.key === '-') { leitor.menos(); e.preventDefault(); } else if (e.key === '0') { leitor.normal(); e.preventDefault(); }
  });
  $('#foco-btn').onclick = () => window.ohara?.teclado?.alternarFoco?.();

  // bolha de formatação sobre o texto selecionado (só no modo fantasma)
  function mostrarBolha(r) {
    const bo = $('#bolha-ed');
    if (!fantasma || !r || !r.length || !quill) { bo.hidden = true; return; }
    bo.hidden = false;
    const b = quill.getBounds(r.index, r.length), ed = quill.container.getBoundingClientRect(), pn = $('#p-notas').getBoundingClientRect();
    const w = bo.offsetWidth, esq = ed.left - pn.left + b.left, topo = ed.top - pn.top + b.top - bo.offsetHeight - 10;
    const x = Math.max(8, Math.min(pn.width - w - 8, esq)); bo.style.left = x + 'px'; bo.style.top = Math.max(8, topo) + 'px'; bo.style.setProperty('--seta', Math.max(14, Math.min(w - 26, esq - x + 10)) + 'px');
  }
  $('#bolha-ed').onmousedown = (e) => e.preventDefault();
  $('#bolha-ed').onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b || !quill) return; const f = b.dataset.f, fmt = quill.getFormat();
    if (f === 'h1' || f === 'h2') quill.format('header', fmt.header === Number(f[1]) ? false : Number(f[1]), 'user');
    else if (f === 'realce') alternarRealce();
    else if (f === 'link') { const u = prompt('Endereço do link (https://…):', 'https://'); if (u) quill.format('link', u, 'user'); }
    else quill.format(f, !fmt[f], 'user');
  };
  aplicarFantasma(fantasma); aplicarSoNotas(soNotas);
  carregarQuill().then((Quill) => {
    quill = new Quill($('#editor'), { theme: 'snow', placeholder: 'Escreva as anotações da aula…  (# título, - lista, > citação; Ctrl K link)',
      formats: ['header', 'bold', 'italic', 'underline', 'strike', 'background', 'code', 'blockquote', 'list', 'indent', 'link'],
      modules: { toolbar: { container: '#barra-ed', handlers: { realce: () => alternarRealce() } } } });
    $('#barra-ed').querySelectorAll('.ql-header').forEach((b) => { b.textContent = 'H' + b.value; b.classList.add('txt'); });   // texto leve em vez do ícone grosso
    quill.root.setAttribute('spellcheck', 'true'); quill.root.setAttribute('lang', 'pt-BR');
    // "# ", "## ", "### " e "> " no começo da linha viram título e citação (as listas "- " e "1. " o Quill já faz).
    quill.keyboard.addBinding({ key: ' ', collapsed: true, prefix: /^(#{1,3})$/ }, function (range, ctx) { const n = ctx.prefix.length; quill.deleteText(range.index - n, n, 'user'); quill.formatLine(range.index - n, 1, 'header', n, 'user'); return false; });
    quill.keyboard.addBinding({ key: ' ', collapsed: true, prefix: /^>$/ }, function (range) { quill.deleteText(range.index - 1, 1, 'user'); quill.formatLine(range.index - 1, 1, 'blockquote', true, 'user'); return false; });
    try { const d = sessao.estado().aulas.find((a) => a.id === aulaId).anotacoes; if (d) quill.setContents(JSON.parse(d), 'silent'); } catch { /* texto antigo ilegível: começa vazio, o original continua no histórico */ }
    quill.on('selection-change', (r) => {
      if (r && r.length) ultimaSelecao = quill.getText(r.index, r.length).trim();
      mostrarBolha(r);
    });
    quill.on('text-change', (_d, _v, origem) => {
      if (origem === 'silent') return;
      pendente = true; clearTimeout(temporizador); temporizador = setTimeout(salvarAgora, 600); $('#salvo').textContent = 'Escrevendo…';
    });
    // Atalhos de formatação (Ctrl no Linux/Windows, Cmd no Mac). Alt sozinho é do sistema (ver nucleo/teclado.js).
    quill.root.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey, c = e.code;
      if (e.key.toLowerCase() === 'm' && !e.metaKey && (e.ctrlKey || e.altKey)) { e.preventDefault(); marcar(); return; }   // Ctrl+M ou Alt+M: marcar a linha
      if (ctrl && e.altKey && !e.shiftKey && /^Digit[123]$/.test(c)) { e.preventDefault(); const n = Number(c.slice(5)); quill.format('header', quill.getFormat().header === n ? false : n, 'user'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'Digit7') { e.preventDefault(); alternarLista('ordered'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'Digit8') { e.preventDefault(); alternarLista('bullet'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'Digit9') { e.preventDefault(); alternarLista('check'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'KeyX') { e.preventDefault(); quill.format('strike', !quill.getFormat().strike, 'user'); }
      else if (ctrl && e.shiftKey && !e.altKey && c === 'KeyH') { e.preventDefault(); alternarRealce(); }
      else if (ctrl && !e.shiftKey && !e.altKey && c === 'KeyE') { e.preventDefault(); quill.format('code', !quill.getFormat().code, 'user'); }
      else if (ctrl && !e.shiftKey && !e.altKey && c === 'Backslash') { e.preventDefault(); const r = quill.getSelection(); if (r) quill.removeFormat(r.index, r.length, 'user'); }
    });
  }).catch((e) => { $('#salvo').textContent = e.message; });

  return limpar;
}
