// Bloco Cartões da Área de trabalho: o editor de cartões (o editor é a prévia, cartão da Enxuta), a aula do cartão e o salvar.
// Segue o contrato dos blocos de ui/componentes/mosaico.js. O rascunho fica no aparelho (ohara.fc.*) e sobrevive a trocar de tela.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss, imagensDoCartao } from '../../nucleo/materias.js';
import { descreverHorario } from '../../nucleo/aulas.js';
import { conferir, resumo, renderizarFrente, renderizarVerso, montarTexto } from '../../nucleo/flashcards_texto.js';
import { paraGuardado, paraDigitado } from '../../nucleo/flashcards_editor.js';
import { cartoesDaAula, importarTexto, excluirCartao, restaurarCartao, LIMITE_IMAGEM_BYTES, MAX_IMAGENS_LADO } from '../../nucleo/cartoes.js';
import { criarEditorCartoes } from '../componentes/editor_cartoes.js';
import * as pref from '../preferencias.js';

const ICO = '<svg class="at-s" viewBox="0 0 18 18" aria-hidden="true"><rect x="2" y="3" width="14" height="12" rx="3"/><circle cx="6.5" cy="7.5" r="1.4"/><path d="M3 14l4-4 3 3 2-2 3 3"/></svg>';
const MAIS = '<svg class="at-s" viewBox="0 0 18 18" aria-hidden="true"><rect x="2" y="3" width="14" height="12" rx="3"/><path d="M9 6.5v5M6.5 9h5"/></svg>';
const EH_IMAGEM = /^image\/(png|jpeg|webp|gif)$/;

/** `slides`: o bloco Slides (página para o cartão). `slidesAberto()`: o bloco Slides está aberto agora. */
export function criarBlocoCartoes({ sessao, ctx, aulaId, slides, slidesAberto = () => false, aoMudarContagem = () => {} }) {
  const el = document.createElement('section'), cabecalho = document.createElement('header');
  el.className = 'at-bloco at-cartoes'; cabecalho.className = 'at-cab';
  cabecalho.innerHTML = `<b class="mo-tit">Cartão</b><select class="at-selaula" data-k="aula" aria-label="Aula do cartão"></select>` +
    `<span class="at-seg at-abas" role="tablist" aria-label="Novo cartão ou cartões salvos"><button type="button" role="tab" data-aba="novo" aria-selected="true" class="on">Novo</button><button type="button" role="tab" data-aba="salvos" aria-selected="false">Salvos <span class="at-num" data-k="nsalvos">0</span></button></span><span class="mo-esp"></span>` +
    `<button type="button" class="mo-ib" data-k="opcoes" aria-expanded="false" aria-controls="at-opc-${aulaId}" aria-label="Opções dos cartões (Alt O)" title="Opções: etiquetas, código, importar (Alt O)"><svg class="at-s" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="3.8" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="14.2" r="1.4" fill="currentColor" stroke="none"/></svg></button>`;
  el.append(cabecalho);
  el.insertAdjacentHTML('beforeend',
    `<div class="at-opcoes" id="at-opc-${aulaId}" data-k="painel" hidden>` +
    `<div class="at-op"><label class="at-c">Etiquetas<input class="in" data-k="etq" autocomplete="off" placeholder="opcional"></label>` +
    `<div class="at-seg" role="group" aria-label="Modo" title="Código mostra as marcas (@ # - **) como texto"><button type="button" data-modo="normal" class="on">Normal</button><button type="button" data-modo="codigo">Código</button></div></div>` +
    `<div class="at-op"><button type="button" class="at-bt" data-k="novo" title="Começar um cartão novo (Alt N)">+ Novo cartão <kbd>Alt N</kbd></button><button type="button" class="at-bt" data-k="limpar">Limpar</button></div>` +
    `<details class="at-imp"><summary>Importar vários de uma vez (Frente :: Verso)</summary><div class="at-op"><textarea class="in" data-k="imp-texto" placeholder="Pergunta :: Resposta" rows="4"></textarea></div><div class="at-op"><button type="button" class="at-bt" data-k="importar">Importar para a aula escolhida</button></div></details></div>` +
    `<div class="at-edit" data-k="edit" hidden><span data-k="edit-txt"></span><button type="button" data-k="edit-cancelar">Cancelar</button></div>` +
    `<div class="at-edwrap" data-k="wrap"><div class="fc-ed" data-k="ed" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Editor do cartão" spellcheck="true"></div><div class="at-ovl" data-k="ovl"></div></div>` +
    `<textarea class="fc-codigo" data-k="txt" hidden spellcheck="false" aria-label="Texto do flashcard com as marcas"></textarea>` +
    `<p class="erro at-erro" data-k="erro" hidden role="alert"></p>` +
    `<footer class="at-rodape"><span class="at-dica" data-k="rodape"></span><span class="mo-esp"></span><button type="button" class="at-salvar" data-k="salvar">Salvar <kbd>Ctrl Enter</kbd></button></footer>` +
    `<div class="at-salvos" data-k="salvos" role="tabpanel" hidden></div>` +
    `<div class="at-gav" data-k="gav" hidden></div><div class="at-vis" data-k="vis" hidden></div>` +
    `<input type="file" data-k="arq" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>`);
  const $ = (k) => el.querySelector(`[data-k="${k}"]`), edEl = $('ed'), txt = $('txt');

  const rasc = { texto: pref.ler('ohara.fc.texto'), aula: pref.ler('ohara.fc.aula'), etiquetas: pref.ler('ohara.fc.etiquetas'), atual: 0 };
  let modoCodigo = false, aba = 'novo', aberto = null, editando = null, espera = null, imagensAlteradas = false, originais = null, travadas = false, destruido = false, imgs = [], gav = null, visor = null, alvoArq = null, quadro = 0;   // imgs[i] = { frente: [File], verso: [File] } do cartão i do texto (só até salvar)

  const grupos = () => {
    const e = sessao.estado(), mats = ativas(e.disciplinas);
    return mats.map((m) => ({ m, aulas: ativas(e.aulas).filter((a) => a.disciplina_id === m.id).sort((x, y) => (y.inicio ?? '').localeCompare(x.inicio ?? '')) })).filter((g) => g.aulas.length);
  };
  const aulaValida = (id) => grupos().some((g) => g.aulas.some((a) => String(a.id) === String(id)));
  /** O rascunho em andamento continua na aula dele; sem rascunho, vale a aula da Área. */
  function aulaInicial() {
    if ((rasc.texto || '').trim() && aulaValida(rasc.aula)) return String(rasc.aula);
    if (aulaValida(aulaId)) return String(aulaId);
    const g = grupos(); return g[0] ? String(g[0].aulas[0].id) : '';
  }
  function desenharSelect() {
    const sel = $('aula');
    sel.innerHTML = grupos().map((g) => `<optgroup label="${escaparHtml(g.m.nome)}">${g.aulas.map((a) => `<option value="${a.id}">${escaparHtml(a.titulo)}${descreverHorario(a) ? ' · ' + escaparHtml(descreverHorario(a)) : ''}</option>`).join('')}</optgroup>`).join('');
    sel.value = rasc.aula;
    const mat = ativas(sessao.estado().disciplinas).find((d) => d.id === sessao.estado().aulas.find((a) => String(a.id) === rasc.aula)?.disciplina_id);
    el.style.setProperty('--mc', mat ? corCss(mat.cor) : 'var(--ac)');
  }
  const fonteAtual = () => (modoCodigo ? paraGuardado(txt.value) : ed.fonte());
  const erro = (m) => { $('erro').textContent = m || ''; $('erro').hidden = !m; };
  const cartoesSalvos = () => (rasc.aula ? cartoesDaAula(sessao.estado(), Number(rasc.aula)) : []);
  /** Número na aba "Salvos" e, se a aba estiver aberta, a lista dos cartões da aula do cartão (do mais novo para o mais antigo). */
  function atualizarSalvos() {
    const lista = cartoesSalvos(); $('nsalvos').textContent = String(lista.length);
    if (aba !== 'salvos') return;
    const lugar = $('salvos');
    lugar.innerHTML = lista.length
      ? `<div class="at-sv-lista">${[...lista].reverse().map((c) => { const n = imagensDoCartao(c), ni = n.frente + n.verso; return `<div class="at-sv${aberto === c.id ? ' on' : ''}"><button type="button" class="at-sv-b" data-sv="${c.id}" aria-expanded="${aberto === c.id}"><i></i><span class="at-sv-tx"><b>${escaparHtml(resumo(c.frente, 110))}</b><small>${escaparHtml(resumo(c.verso, 150))}</small></span>${c.pagina ? `<span class="at-sv-pg">p.${c.pagina}</span>` : ''}${ni ? `<em>${ICO}${ni}</em>` : ''}</button>${aberto === c.id ? `<div class="at-sv-det"><div class="at-sv-fr">${renderizarFrente(c.frente)}</div><div class="at-sv-vs">${renderizarVerso(c.verso)}</div><div class="at-sv-acoes"><button type="button" data-sv-edit="${c.id}">Editar</button><button type="button" class="perigo" data-sv-del="${c.id}">Excluir</button></div></div>` : ''}</div>`; }).join('')}</div><a class="at-sv-ver" href="#cartoes">Abrir todos no Gerenciar ›</a>`
      : '<p class="at-nada" style="padding:8px 14px">Nenhum cartão salvo nesta aula ainda.</p>';
  }
  function mostrarAba(nova) {
    if (nova === aba) return;
    if (editando && nova === 'salvos') cancelarEdicao();
    aba = nova; aberto = null; fecharVisor(); fecharGaveta();
    const salvos = aba === 'salvos';
    $('wrap').hidden = salvos || modoCodigo; txt.hidden = salvos || !modoCodigo; $('salvos').hidden = !salvos; $('painel').hidden = true; $('opcoes').setAttribute('aria-expanded', 'false');
    el.querySelector('.at-rodape').hidden = salvos; $('erro').hidden = salvos || !$('erro').textContent;
    el.querySelectorAll('[data-aba]').forEach((b) => { const on = b.dataset.aba === aba; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    atualizarSalvos(); if (!salvos) { agendar(); (modoCodigo ? txt : edEl).focus(); }
  }
  // ---- excluir e editar um cartão salvo (o texto volta para o editor; imagens: ainda só pelo Gerenciar)
  function excluirSalvo(id) {
    const c = cartoesSalvos().find((x) => x.id === id); if (!c) return;
    sessao.aplicar((e) => excluirCartao(e, id, new Date().toISOString())); aberto = null; atualizarRodape(); aoMudarContagem();
    ctx.aviso('Cartão enviado para a lixeira.', { texto: 'Desfazer', fazer: () => { sessao.aplicar((e) => restaurarCartao(e, id)); atualizarRodape(); aoMudarContagem(); } });
  }
  function rotuloSalvar() { $('salvar').innerHTML = `${editando ? 'Atualizar' : 'Salvar'} <kbd>Ctrl Enter</kbd>`; }
  /** Traz de volta, como arquivos, as imagens já salvas do cartão. `completo` = false se algum conteúdo não está neste aparelho. */
  async function carregarImagensSalvas(c) {
    const n = imagensDoCartao(c), r = { frente: [], verso: [], completo: true }, EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
    for (const lado of ['frente', 'verso']) for (let j = 0; j < n[lado]; j++) {
      const b = await sessao.lerImagemLado(c.id, lado, j);
      if (b) r[lado].push(new File([b], `${lado}-${j + 1}.${EXT[b.type] ?? 'png'}`, { type: b.type })); else r.completo = false;
    }
    return r;
  }
  async function editarSalvo(id) {
    const c = cartoesSalvos().find((x) => x.id === id); if (!c) return;
    const salvas = await carregarImagensSalvas(c); if (destruido) return;
    if (editando) cancelarEdicao();
    espera = { texto: fonteAtual(), imgs, aula: rasc.aula };
    mostrarAba('novo'); erro('');
    editando = { id, frente: c.frente, verso: c.verso }; imgs = []; imagensAlteradas = false; travadas = !salvas.completo; originais = { frente: salvas.frente, verso: salvas.verso };
    definirTexto(montarTexto(c)); $('aula').disabled = true;
    if (!travadas && (salvas.frente.length || salvas.verso.length)) imgs[0] = { frente: [...salvas.frente], verso: [...salvas.verso] };
    if (travadas) erro('Faltam imagens deste cartão neste aparelho (restaure um backup completo ou sincronize): o texto pode ser editado, as imagens não.');
    agendar();
    $('edit-txt').textContent = `Editando: ${resumo(c.frente, 60)}`; $('edit').hidden = false; rotuloSalvar(); ed.foco();
  }
  function cancelarEdicao() {
    if (!editando) return false;
    editando = null; originais = null; travadas = false; imagensAlteradas = false; $('edit').hidden = true; $('aula').disabled = false; rotuloSalvar();
    const e = espera; espera = null;
    definirTexto(e.texto, true); imgs = e.imgs; rasc.aula = e.aula; desenharSelect(); atualizarRodape(); agendar();
    return true;
  }
  async function salvarEdicao() {
    const { cartoes, problemas } = conferir(fonteAtual());
    if (!cartoes.length) { erro('Escreva o cartão: comece uma linha com @ e um espaço para a frente.'); return; }
    if (cartoes.length > 1) { erro('Ao editar, deixe só um cartão no texto.'); return; }
    if (problemas.length) { erro(problemas.join(' ')); return; }
    const { id, frente, verso } = editando, novo = cartoes[0], antes = originais, trocou = imagensAlteradas && !travadas;
    const lados = trocou ? { frente: imgs[0]?.frente ?? [], verso: imgs[0]?.verso ?? [] } : null;
    try { await sessao.atualizarCartao(id, { frente: novo.frente, verso: novo.verso }, lados); }
    catch (err) { erro(err.message); return; }
    ctx.aviso('Cartão atualizado.', { texto: 'Desfazer', fazer: async () => { try { await sessao.atualizarCartao(id, { frente, verso }, trocou ? antes : null); } catch (err) { ctx.aviso(err.message); } atualizarRodape(); aoMudarContagem(); } });
    cancelarEdicao(); mostrarAba('salvos'); aoMudarContagem();
  }
  function atualizarRodape() {
    const n = conferir(rasc.texto).cartoes.length, salvos = rasc.aula ? cartoesDaAula(sessao.estado(), Number(rasc.aula)).length : 0;
    $('rodape').textContent = `${n ? `Cartão ${Math.min(rasc.atual, n - 1) + 1} de ${n}` : 'Comece com @ e um espaço para a frente do cartão'} · ${salvos} ${salvos === 1 ? 'salvo' : 'salvos'} nesta aula`;
    const ni = imgs.reduce((t, im) => t + (im?.frente?.length ?? 0) + (im?.verso?.length ?? 0), 0);
    if (ni) $('rodape').textContent += ` · ${ni} ${ni === 1 ? 'imagem' : 'imagens'}`;
    atualizarSalvos();
  }

  const ed = criarEditorCartoes(edEl, {
    aoMudar: (src) => { rasc.texto = src; if (!editando) pref.gravar('ohara.fc.texto', src); atualizarRodape(); agendar(); },
    aoCartao: (n) => { rasc.atual = n; atualizarRodape(); agendar(); },
    aoTab: () => {},
    aoSalvar: () => salvar(),
  });
  function definirTexto(src, manterImagens = false) {
    if (!manterImagens) { fecharVisor(); fecharGaveta(); imgs = []; soltarUrls(); }
    rasc.atual = 0; rasc.texto = src; ed.definir(src); if (modoCodigo) txt.value = paraDigitado(src); agendar();
  }

  // ---- imagens do cartão: no cartão em foco, um ícone apagado; com imagens, uma pílula com o número que abre a gaveta de miniaturas
  const urlDe = new Map();   // File → endereço da miniatura
  const miniatura = (f) => { if (!urlDe.has(f)) urlDe.set(f, URL.createObjectURL(f)); return urlDe.get(f); };
  const soltarUrls = () => { for (const u of urlDe.values()) URL.revokeObjectURL(u); urlDe.clear(); };
  const listaDe = (i, lado) => imgs[i]?.[lado] ?? [];
  const nomeLado = (lado) => (lado === 'frente' ? 'Frente' : 'Verso');
  const agendar = () => { cancelAnimationFrame(quadro); quadro = requestAnimationFrame(desenharIcones); };
  function cartoesDoTexto() {   // os cartões do texto, na ordem: a linha da frente, a última linha e todas as linhas
    const out = []; let g = null;
    for (const d of edEl.children) { if (d.dataset.t === 'frente') { g = { frente: d, ultima: d, linhas: [d] }; out.push(g); } else if (g) { g.ultima = d; g.linhas.push(d); } }
    return out;
  }
  function desenharIcones() {
    const ov = $('ovl'); ov.textContent = '';
    if (modoCodigo || travadas || el.hidden || !el.isConnected) return;
    const gs = cartoesDoTexto(); if (!gs.length) return;
    const w = $('wrap').getBoundingClientRect(), foco = Math.min(rasc.atual, gs.length - 1);
    gs.forEach((g, i) => {
      const marcar = (lado, rect, topo) => {
        const n = listaDe(i, lado).length; if (!n && i !== foco) return;
        const b = document.createElement('button'); b.type = 'button'; b.dataset.i = String(i); b.dataset.lado = lado;
        if (n) { b.className = `at-pil at-pil-${lado}`; b.innerHTML = `${ICO}<span>${n}</span>`; b.title = `${n} ${n === 1 ? 'imagem' : 'imagens'} ${lado === 'frente' ? 'na frente' : 'no verso'} · toque para ver`; b.dataset.pil = '1'; b.style.top = `${topo + 1}px`; b.style.left = `${rect.right - w.left - 66}px`; }
        else { b.className = `at-g at-g-${lado} fan`; b.innerHTML = MAIS; b.title = `Anexar imagem ${lado === 'frente' ? 'na frente' : 'no verso'} (ou cole ou arraste)`; b.style.top = `${topo}px`; b.style.left = `${rect.right - w.left - 40}px`; }
        b.setAttribute('aria-label', b.title); ov.append(b);
      };
      const fr = g.frente.getBoundingClientRect(); marcar('frente', fr, fr.top - w.top + 10);
      if (g.ultima !== g.frente) { const ur = g.ultima.getBoundingClientRect(); marcar('verso', ur, ur.top - w.top + ur.height / 2 - 14); }
    });
    posicionarGaveta();
  }
  const depoisDeMudar = () => { atualizarRodape(); agendar(); desenharGaveta(); desenharVisor(); };
  function anexar(i, lado, f) {
    if (!f) return false;
    if (editando && travadas) { erro('Faltam imagens deste cartão neste aparelho: não dá para mudar as imagens dele agora.'); return false; }
    if (!EH_IMAGEM.test(f.type) || f.size > LIMITE_IMAGEM_BYTES) { erro('A imagem do cartão deve ser PNG, JPG, WEBP ou GIF de até 5 MB.'); return false; }
    if (listaDe(i, lado).length >= MAX_IMAGENS_LADO) { erro(`Cada lado do cartão aceita até ${MAX_IMAGENS_LADO} imagens.`); return false; }
    erro(''); imgs[i] = { ...(imgs[i] ?? {}), [lado]: [...listaDe(i, lado), f] }; if (editando) imagensAlteradas = true; depoisDeMudar(); return true;
  }
  const anexarVarias = (i, lado, arquivos) => { for (const f of arquivos) if (!anexar(i, lado, f)) break; };
  function tirar(i, lado, j) {
    const antes = listaDe(i, lado); if (!antes[j]) return;
    imgs[i] = { ...imgs[i], [lado]: antes.filter((_, x) => x !== j) }; if (editando) imagensAlteradas = true; depoisDeMudar();
    ctx.aviso('Imagem tirada.', { texto: 'Desfazer', fazer: () => { imgs[i] = { ...(imgs[i] ?? {}), [lado]: antes }; if (editando) imagensAlteradas = true; depoisDeMudar(); } });
  }
  const pedirArquivo = (i, lado) => { alvoArq = { i, lado }; $('arq').click(); };
  $('arq').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length && alvoArq) anexarVarias(alvoArq.i, alvoArq.lado, fs); alvoArq = null; };

  // gaveta de miniaturas (abre ao tocar na pílula)
  const gavEl = $('gav');
  function fecharGaveta() { if (!gav) return false; gav = null; gavEl.hidden = true; return true; }
  function desenharGaveta() {
    if (!gav) { gavEl.hidden = true; return; }
    const arr = listaDe(gav.i, gav.lado); if (!arr.length) { fecharGaveta(); return; }
    gavEl.hidden = false;
    gavEl.innerHTML = `<div class="at-gav-cab"><span>${nomeLado(gav.lado)} · cartão ${gav.i + 1}</span><span>${arr.length} ${arr.length === 1 ? 'imagem' : 'imagens'}</span></div><div class="at-gav-grade">` +
      arr.map((f, j) => `<button type="button" class="at-gav-it" data-ver="${j}" style="background-image:url(${miniatura(f)})" title="${escaparHtml(f.name)}"><span class="at-gav-x" data-tirar="${j}" role="button" aria-label="Tirar a imagem ${escaparHtml(f.name)}"><svg class="at-s" viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg></span></button>`).join('') +
      (arr.length < MAX_IMAGENS_LADO ? '<button type="button" class="at-gav-nv" data-novo="1">＋ Adicionar</button>' : '') + '</div>';
    posicionarGaveta();
  }
  function posicionarGaveta() {
    if (!gav || gavEl.hidden) return;
    const b = $('ovl').querySelector(`.at-pil[data-i="${gav.i}"][data-lado="${gav.lado}"]`); if (!b) return;
    const r = b.getBoundingClientRect(), e = el.getBoundingClientRect(), h = gavEl.offsetHeight, w = gavEl.offsetWidth;
    gavEl.style.left = `${Math.max(10, Math.min(e.width - w - 10, r.right - e.left - w))}px`;
    const abaixo = r.bottom - e.top + 8; gavEl.style.top = `${abaixo + h > e.height - 10 ? Math.max(10, r.top - e.top - h - 8) : abaixo}px`;
  }
  gavEl.addEventListener('click', (e) => {
    if (!gav) return;
    const x = e.target.closest('[data-tirar]'), v = e.target.closest('[data-ver]'), n = e.target.closest('[data-novo]');
    if (x) { e.stopPropagation(); tirar(gav.i, gav.lado, Number(x.dataset.tirar)); }
    else if (v) abrirVisor(gav.i, gav.lado, Number(v.dataset.ver));
    else if (n) pedirArquivo(gav.i, gav.lado);
  });
  const aoTocarFora = (e) => { if (gav && !e.target.closest('[data-k="gav"]') && !e.target.closest('.at-pil')) { fecharGaveta(); } };
  document.addEventListener('pointerdown', aoTocarFora);

  // galeria: a imagem grande, setas, tira de miniaturas, adicionar e tirar
  const visEl = $('vis');
  function fecharVisor() { if (!visor) return false; visor = null; visEl.hidden = true; visEl.textContent = ''; return true; }
  function abrirVisor(i, lado, j) { fecharGaveta(); visor = { i, lado, j }; desenharVisor(); visEl.querySelector('[data-vk="fechar"]')?.focus(); }
  function desenharVisor() {
    if (!visor) { visEl.hidden = true; return; }
    const arr = listaDe(visor.i, visor.lado); if (!arr.length) { fecharVisor(); return; }
    visor.j = Math.min(visor.j, arr.length - 1); const f = arr[visor.j]; visEl.hidden = false;
    visEl.innerHTML = `<div class="at-vis-cx"><div class="at-vis-img"><img src="${miniatura(f)}" alt="${escaparHtml(f.name)}">` +
      (arr.length > 1 ? '<button type="button" class="at-vis-nav at-vis-e" data-vk="ant" aria-label="Imagem anterior">‹</button><button type="button" class="at-vis-nav at-vis-d" data-vk="prox" aria-label="Próxima imagem">›</button>' : '') + '</div>' +
      `<div class="at-vis-tira">${arr.map((x, k) => `<button type="button" class="at-vis-t${k === visor.j ? ' on' : ''}" data-vk="ir" data-j="${k}" style="background-image:url(${miniatura(x)})" aria-label="Imagem ${k + 1}"></button>`).join('')}${arr.length < MAX_IMAGENS_LADO ? '<button type="button" class="at-vis-t at-vis-mais" data-vk="novo" aria-label="Adicionar imagem">＋</button>' : ''}</div>` +
      `<div class="at-vis-leg"><span>${escaparHtml(f.name)} · ${nomeLado(visor.lado).toLowerCase()} do cartão ${visor.i + 1} · ${visor.j + 1} de ${arr.length}</span><button type="button" data-vk="tirar">Tirar</button><button type="button" data-vk="fechar">Fechar</button></div></div>`;
  }
  visEl.addEventListener('click', (e) => {
    if (!visor) return;
    const k = e.target.closest('[data-vk]')?.dataset.vk, n = listaDe(visor.i, visor.lado).length;
    if (k === 'ant') { visor.j = (visor.j + n - 1) % n; desenharVisor(); }
    else if (k === 'prox') { visor.j = (visor.j + 1) % n; desenharVisor(); }
    else if (k === 'ir') { visor.j = Number(e.target.closest('[data-j]').dataset.j); desenharVisor(); }
    else if (k === 'novo') pedirArquivo(visor.i, visor.lado);
    else if (k === 'tirar') { const { i, lado, j } = visor; tirar(i, lado, j); }
    else if (k === 'fechar' || e.target === visEl) fecharVisor();
  });
  visEl.addEventListener('keydown', (e) => {
    if (!visor) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); visEl.querySelector('[data-vk="ant"]')?.click(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); visEl.querySelector('[data-vk="prox"]')?.click(); }
  });
  $('ovl').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const i = Number(b.dataset.i), lado = b.dataset.lado;
    if (b.dataset.pil) { if (gav && gav.i === i && gav.lado === lado) fecharGaveta(); else { gav = { i, lado }; desenharGaveta(); } }
    else pedirArquivo(i, lado);
  });
  /** A linha do cursor (ou a linha pedida) → qual cartão e qual lado: na linha da frente é a frente; nas outras, o verso. */
  function alvoDaLinha(linha) {
    const gs = cartoesDoTexto(); if (!gs.length) return null;
    const i = linha ? gs.findIndex((g) => g.linhas.includes(linha)) : -1;
    if (i < 0) return { i: Math.min(rasc.atual, gs.length - 1), lado: 'verso' };
    return { i, lado: linha.dataset.t === 'frente' ? 'frente' : 'verso' };
  }
  edEl.addEventListener('paste', (e) => {   // um print ou uma imagem copiada vai para o lado do cursor; texto segue o caminho de sempre
    const fs = [...(e.clipboardData?.files ?? [])].filter((x) => x.type.startsWith('image/'));
    if (!fs.length || (e.clipboardData.getData('text/plain') || '').trim()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    let n = getSelection().anchorNode; while (n && n.parentNode !== edEl) n = n.parentNode;
    const alvo = alvoDaLinha(n && n.nodeType === 1 ? n : null);
    if (!alvo) { erro('Escreva a frente do cartão antes de anexar uma imagem.'); return; }
    anexarVarias(alvo.i, alvo.lado, fs);
  }, true);
  const limparAlvo = () => edEl.querySelectorAll('.at-alvo').forEach((x) => x.classList.remove('at-alvo'));
  edEl.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); limparAlvo(); e.target.closest?.('.l')?.classList.add('at-alvo');
  });
  edEl.addEventListener('dragleave', (e) => { if (!edEl.contains(e.relatedTarget)) limparAlvo(); });
  edEl.addEventListener('drop', (e) => {
    const fs = [...(e.dataTransfer?.files ?? [])].filter((x) => x.type.startsWith('image/')); limparAlvo();
    if (!fs.length) return;
    e.preventDefault(); e.stopPropagation();
    const alvo = alvoDaLinha(e.target.closest?.('.l') ?? null);
    if (!alvo) { erro('Escreva a frente do cartão antes de anexar uma imagem.'); return; }
    anexarVarias(alvo.i, alvo.lado, fs);
  }, true);
  edEl.addEventListener('scroll', agendar, { passive: true });
  const obsWrap = new ResizeObserver(agendar); obsWrap.observe($('wrap'));

  async function salvar() {
    erro('');
    if (editando) { salvarEdicao(); return; }
    const { cartoes, problemas } = conferir(fonteAtual());
    if (!cartoes.length) { erro('Escreva o cartão: comece uma linha com @ e um espaço para a frente.'); return; }
    if (problemas.length) { const n = Number(/Cartão (\d+)/.exec(problemas[0])?.[1] ?? 1); ed.irParaCartao(n - 1); erro(problemas.join(' ')); return; }
    if (!rasc.aula) { erro('Crie uma matéria e uma aula antes de salvar cartões.'); return; }
    const etiquetas = $('etq').value;
    const pagina = slidesAberto() && Number(rasc.aula) === aulaId ? slides.pagina() : null;
    let feitos = 0;
    try { for (const [i, c] of cartoes.entries()) { const im = imgs[i], lados = im && (im.frente?.length || im.verso?.length) ? { frente: im.frente ?? [], verso: im.verso ?? [] } : null; await sessao.criarCartao(Number(rasc.aula), { frente: c.frente, verso: c.verso, etiquetas, pagina }, lados); feitos++; } }
    catch (e) { erro(`${feitos ? `${feitos} salvo(s). ` : ''}${e.message}`); return; }
    ctx.aviso(`${feitos} ${feitos === 1 ? 'cartão salvo' : 'cartões salvos'}.`);
    definirTexto(''); pref.gravar('ohara.fc.texto', '');
    rasc.aula = aulaInicial(); pref.gravar('ohara.fc.aula', rasc.aula); desenharSelect(); atualizarRodape(); aoMudarContagem(); ed.foco();
  }
  function limpar() { const antes = fonteAtual(), antesImgs = imgs; if (!antes.trim()) return; definirTexto(''); ed.foco(); ctx.aviso('Texto limpo.', { texto: 'Desfazer', fazer: () => { definirTexto(antes, true); imgs = antesImgs; atualizarRodape(); agendar(); } }); }
  function modo(codigo) {
    if (codigo === modoCodigo) return;
    if (codigo) txt.value = ed.digitado(); else definirTexto(paraGuardado(txt.value), true);
    modoCodigo = codigo; txt.hidden = !codigo || aba === 'salvos'; $('wrap').hidden = codigo || aba === 'salvos'; agendar();
    el.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('on', b.dataset.modo === (codigo ? 'codigo' : 'normal'))); (codigo ? txt : edEl).focus();
  }
  const novoCartao = () => { if (!modoCodigo) { ed.novoCartao(); return; } txt.focus(); txt.setRangeText(`${txt.value && !txt.value.endsWith('\n') ? '\n' : ''}@ `, txt.selectionStart, txt.selectionEnd, 'end'); txt.dispatchEvent(new Event('input')); };
  function alternarOpcoes(on) {
    const p = $('painel'), abrir = on ?? p.hidden; p.hidden = !abrir; $('opcoes').setAttribute('aria-expanded', String(abrir));
    if (abrir) p.querySelector('input,button')?.focus(); else (modoCodigo ? txt : edEl).focus();
  }
  txt.oninput = () => { rasc.texto = paraGuardado(txt.value); if (!editando) pref.gravar('ohara.fc.texto', rasc.texto); atualizarRodape(); };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !el.contains(b)) return;
    if (b.dataset.aba) mostrarAba(b.dataset.aba);
    else if (b.dataset.svEdit) editarSalvo(Number(b.dataset.svEdit));
    else if (b.dataset.svDel) excluirSalvo(Number(b.dataset.svDel));
    else if (b.dataset.k === 'edit-cancelar') cancelarEdicao();
    else if (b.dataset.sv) { aberto = aberto === Number(b.dataset.sv) ? null : Number(b.dataset.sv); atualizarSalvos(); }
    else if (b.dataset.modo) modo(b.dataset.modo === 'codigo');
    else if (b.dataset.k === 'salvar') salvar();
    else if (b.dataset.k === 'novo') novoCartao();
    else if (b.dataset.k === 'limpar') limpar();
    else if (b.dataset.k === 'opcoes') alternarOpcoes();
    else if (b.dataset.k === 'importar') {
      const t = $('imp-texto').value; if (!t.trim() || !rasc.aula) return;
      try {
        let r; sessao.aplicar((s) => { r = importarTexto(s, Number(rasc.aula), t, new Date().toISOString(), () => globalThis.crypto.randomUUID()); return r.estado; });
        ctx.aviso(`${r.criados.length} criados${r.ignorados.length ? `, ${r.ignorados.length} ignorados (linha ${r.ignorados.map((i) => i.linha).join(', ')})` : ''}.`);
        $('imp-texto').value = ''; atualizarRodape(); aoMudarContagem();
      } catch (err) { erro(err.message); }
    }
  });
  el.addEventListener('change', (e) => {
    const k = e.target.dataset?.k;
    if (k === 'aula') { rasc.aula = e.target.value; pref.gravar('ohara.fc.aula', rasc.aula); aberto = null; desenharSelect(); atualizarRodape(); }
    else if (k === 'etq') { rasc.etiquetas = e.target.value; pref.gravar('ohara.fc.etiquetas', rasc.etiquetas); }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); }
    else if (e.target === txt && e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); salvar(); }
  });

  const removerOuvinte = sessao.aoGravar(() => { if (!destruido) atualizarRodape(); });   // cartões criados/apagados em outro lugar (ou chegados pela sincronia) refletem aqui
  rasc.aula = aulaInicial(); $('etq').value = rasc.etiquetas; desenharSelect(); definirTexto(rasc.texto); atualizarRodape();

  return {
    nome: 'cartoes', titulo: 'Cartão', el, cabecalho,
    mostrar() { if (!editando) rasc.aula = aulaValida(rasc.aula) ? rasc.aula : aulaInicial(); desenharSelect(); atualizarRodape(); agendar(); },
    esconder() { fecharVisor(); fecharGaveta(); },
    focar() { if (aba === 'salvos') el.querySelector('.at-sv-b,.at-abas button.on')?.focus(); else (modoCodigo ? txt : edEl).focus(); },
    aoRedimensionar() { agendar(); },
    salvar() {},
    destruir() { removerOuvinte(); document.removeEventListener('pointerdown', aoTocarFora); destruido = true; cancelAnimationFrame(quadro); obsWrap.disconnect(); fecharVisor(); fecharGaveta(); soltarUrls(); ed.destruir(); },
    novoCartao: () => { cancelarEdicao(); mostrarAba('novo'); novoCartao(); },
    alternarOpcoes: (on) => { mostrarAba('novo'); alternarOpcoes(on); }, mostrarAba, fecharOpcoes() { if (fecharVisor() || fecharGaveta()) return true; if (editando && aba === 'novo') return cancelarEdicao(); if ($('painel').hidden) return false; alternarOpcoes(false); return true; },
    aulaDoCartao: () => rasc.aula,
  };
}
