// Mesa: uma tela só com até 3 blocos em mosaico (Slides, Anotações, Cartões) para uma aula.
// A tela monta o topo, cria o mosaico e os blocos, guarda o arranjo (por aula e por aparelho) e registra os atalhos.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss, siglaDaMateria } from '../../nucleo/materias.js';
import { descreverHorario } from '../../nucleo/aulas.js';
import { cartoesDaAula } from '../../nucleo/cartoes.js';
import { provasDaAula } from '../../nucleo/eventos.js';
import { MESES_CURTOS } from '../../nucleo/datas.js';
import { arranjoAoAbrir, chaveArranjo, paraGuardar, PASSO_REDIM } from '../../nucleo/mosaico.js';
import { criarMosaico } from '../componentes/mosaico.js';
import { criarBlocoSlides } from '../blocos/slides.js';
import { criarBlocoAnotacoes } from '../blocos/anotacoes.js';
import { criarBlocoCartoes } from '../blocos/cartoes.js';
import { registrar } from '../atalhos.js';
import * as pref from '../preferencias.js';
import { ICONE_BLOCO } from '../blocos/icones.js';

const NOMES = { slides: 'Slides', anotacoes: 'Anotações', cartoes: 'Cartões' };
const TECLAS = { slides: 'S', anotacoes: 'A', cartoes: 'C' };
const iconeToggle = (n) => `<svg class="at-s at-ti" viewBox="0 0 24 24" aria-hidden="true">${ICONE_BLOCO[n]}</svg>`;

/** Desenha a tela e devolve a função de limpeza. */
export function desenharArea(raiz, ctx, aulaId, rota = {}) {
  const sessao = ctx.sessao, estado = sessao.estado();
  const aula = estado.aulas.find((a) => a.id === aulaId && !a.excluido_em);
  const materia = aula && ativas(estado.disciplinas).find((d) => d.id === aula.disciplina_id);
  if (!aula || !materia) { raiz.innerHTML = '<h1>Aula não encontrada</h1><p class="sub"><a class="voltar" href="#materias">← Voltar às matérias</a></p>'; return () => {}; }
  document.title = `${aula.titulo} · Ohara`;
  raiz.className = 'cheia at';
  pref.gravar('ohara.at.ultima', String(aulaId));

  const horario = descreverHorario(aula);
  // "Cai na prova…": a próxima prova com data cujo conteúdo inclui esta aula (a Agenda é a fonte)
  const hojeDia = new Date(ctx.agora ? ctx.agora() : Date.now()), hojeTxt = `${hojeDia.getFullYear()}-${String(hojeDia.getMonth() + 1).padStart(2, '0')}-${String(hojeDia.getDate()).padStart(2, '0')}`;
  const cai = provasDaAula(estado, aulaId, hojeTxt)[0];
  const caiTxt = cai ? ` · Cai na ${cai.titulo} (${Number(cai.dia.slice(8))} ${MESES_CURTOS[Number(cai.dia.slice(5, 7)) - 1]}${cai.em <= 14 ? ` · ${cai.em === 0 ? 'hoje' : `${cai.em}d`}` : ''})` : '';
  raiz.innerHTML = `<div class="topo at-topo"><a class="at-mat" href="#materias/${materia.id}" style="--c:${corCss(materia.cor)}" title="${escaparHtml(materia.nome)}">${escaparHtml(siglaDaMateria(materia))}</a>` +
    `<span class="at-tt"><b>${escaparHtml(aula.titulo)}</b><small>${aula.tipo === 'livro' ? 'Livro' : 'Aula'}${horario ? ' · ' + escaparHtml(horario) : ''}${escaparHtml(caiTxt)}</small></span><span class="at-esp"></span>` +
    `<div class="at-tg" role="group" aria-label="Blocos abertos">${Object.keys(NOMES).map((n) => `<button type="button" data-bloco="${n}" aria-pressed="false" title="${NOMES[n]} (Alt ${TECLAS[n]})">${iconeToggle(n)}<span class="at-rot">${NOMES[n]}</span><span class="at-ini">${TECLAS[n]}</span>${n === 'cartoes' ? '<span class="at-num" data-k="ncartoes" hidden></span>' : ''}</button>`).join('')}</div>` +
    `</div><div class="at-grade" id="at-grade"></div>`;
  const $ = (s) => raiz.querySelector(s);

  const slides = criarBlocoSlides({ sessao, ctx, aulaId });
  let mosaico = null;
  const blocos = { slides, anotacoes: criarBlocoAnotacoes({ sessao, ctx, aulaId, slides, abrirSlides: () => mosaico?.abrir('slides') }), cartoes: criarBlocoCartoes({ sessao, ctx, aulaId, slides, slidesAberto: () => !!mosaico?.aberto('slides'), aoMudarContagem: () => atualizarContagem() }) };
  /** O número no botão Cartões: quantos cartões salvos a aula desta tela tem. */
  function atualizarContagem() {
    const n = cartoesDaAula(sessao.estado(), aulaId).length, num = $('[data-k="ncartoes"]'), btn = num?.closest('button');
    if (!num) return; num.textContent = String(n); num.hidden = !n;
    btn.title = `Cartões (Alt C)${n ? ` · ${n} ${n === 1 ? 'salvo' : 'salvos'} nesta aula` : ''}`;
  }
  const acender = (a) => raiz.querySelectorAll('.at-tg button').forEach((b) => b.setAttribute('aria-pressed', String(a.abertos.includes(b.dataset.bloco))));
  const chave = chaveArranjo(aulaId);
  mosaico = criarMosaico($('#at-grade'), {
    blocos, arranjo: arranjoAoAbrir(pref.lerJson(chave, null), { abrir: rota.abrir ?? null }),
    aoMudar: (a) => { pref.gravar(chave, paraGuardar(a)); acender(a); },
  });
  const removerOuvinteGravou = sessao.aoGravar(atualizarContagem); atualizarContagem();
  acender(mosaico.arranjo()); pref.gravar(chave, paraGuardar(mosaico.arranjo()));
  mosaico.focar(mosaico.comFoco());   // abre a Mesa com o foco no bloco, pronto para o teclado

  raiz.querySelector('.at-tg').onclick = (e) => { const b = e.target.closest('button[data-bloco]'); if (b) mosaico.alternar(b.dataset.bloco); };
  const aoMover = (e) => { if (e.target.closest?.('.mo-bloco') && (!e.detail.simples || e.target.classList.contains('mo-bloco'))) {   // sem Alt, só vale com o foco no próprio bloco
     const moveu = mosaico.mover(e.detail.direcao); if (moveu || !e.detail.simples) e.preventDefault(); } };   // seta solta sem vizinho: deixa a página rolar   // Alt H J K L andam entre blocos; H J K L e setas também, quando o foco está no bloco
  raiz.addEventListener('ohara-mover', aoMover);

  // ---- atalhos (ver a tabela de colisões em docs/historico/PLANO_IMPLEMENTACAO_AREA_DE_TRABALHO.md)
  const DIRECOES = { KeyH: 'esq', KeyJ: 'baixo', KeyK: 'cima', KeyL: 'dir', ArrowLeft: 'esq', ArrowDown: 'baixo', ArrowUp: 'cima', ArrowRight: 'dir' };
  const mapa = {
    'Alt+KeyS': () => { mosaico.alternar('slides'); }, 'Alt+KeyA': () => { mosaico.alternar('anotacoes'); }, 'Alt+KeyC': () => { mosaico.alternar('cartoes'); },
    'Alt+KeyX': () => { if (!mosaico.substituir()) ctx.aviso('Só funciona com 2 blocos abertos.'); },
    'Alt+KeyW': () => { mosaico.fechar(mosaico.comFoco()); }, 'Alt+KeyM': () => { mosaico.ampliar(); },
    'Alt+KeyT': () => { if (!mosaico.irPara('topo')) return false; }, 'Alt+KeyF': () => { if (!mosaico.irPara('campo')) return false; }, 'Alt+KeyB': () => { if (!mosaico.irPara('base')) return false; },
    'Alt+Comma': () => { if (!mosaico.passo(-1)) return false; }, 'Alt+Period': () => { if (!mosaico.passo(1)) return false; },
    'Alt+KeyR': () => { mosaico.modoRedim(true); ctx.aviso('Redimensionar: H J K L ou setas · Enter ou Esc termina'); },
    'Alt+Digit0': () => { mosaico.padraoTamanhos(); ctx.aviso('Tamanhos padrão.'); }, 'Alt+Shift+Digit0': () => { mosaico.padraoOrdem(); ctx.aviso('Ordem padrão.'); },
    'Alt+KeyN': () => { mosaico.abrir('cartoes'); blocos.cartoes.novoCartao(); },
    'Alt+KeyO': () => { const n = mosaico.comFoco(); if (n === 'cartoes') blocos.cartoes.alternarOpcoes(); else if (n) blocos[n].abrirMenu(); else return false; },
    'Alt+BracketRight': () => { if (!mosaico.aberto('slides')) return false; slides.proxima(); }, 'Alt+PageDown': () => { if (!mosaico.aberto('slides')) return false; slides.proxima(); },
    'Alt+BracketLeft': () => { if (!mosaico.aberto('slides')) return false; slides.anterior(); }, 'Alt+PageUp': () => { if (!mosaico.aberto('slides')) return false; slides.anterior(); },
  };
  for (const [codigo, dir] of Object.entries(DIRECOES)) mapa[`Alt+Shift+${codigo}`] = () => { mosaico.trocarCom(dir); };
  const desregistrar = registrar(mapa);

  // Modo redimensionar (Alt R) e Esc: antes dos outros ouvintes, para valer até com o foco dentro do editor.
  const REDIM = { KeyH: ['largura', -PASSO_REDIM], ArrowLeft: ['largura', -PASSO_REDIM], KeyL: ['largura', PASSO_REDIM], ArrowRight: ['largura', PASSO_REDIM], KeyK: ['altura', -PASSO_REDIM], ArrowUp: ['altura', -PASSO_REDIM], KeyJ: ['altura', PASSO_REDIM], ArrowDown: ['altura', PASSO_REDIM] };
  const mapaCaptura = {};
  for (const [codigo, [eixo, d]] of Object.entries(REDIM)) mapaCaptura[codigo] = () => { if (!mosaico.emRedim()) return false; mosaico.redimensionar(eixo, d); };
  mapaCaptura.Enter = () => { if (!mosaico.emRedim()) return false; mosaico.modoRedim(false); };
  mapaCaptura.Escape = () => {
    if (document.querySelector('#lancador:not([hidden]),#ajuda-atalhos:not([hidden]),.menu-pop')) return false;   // quem está por cima fecha primeiro
    if (mosaico.emRedim()) { mosaico.modoRedim(false); return true; }
    if (mosaico.aberto('anotacoes') && blocos.anotacoes.fecharTransitorios()) return true;
    if (mosaico.aberto('cartoes') && blocos.cartoes.fecharOpcoes()) return true;
    const ativo = document.activeElement, bloco = ativo?.closest?.('.mo-bloco');
    if (bloco && ativo !== bloco) { bloco.focus({ preventScroll: true }); return true; }   // sai do miolo para o bloco
    if (mosaico.ampliado()) { mosaico.ampliar(); return true; }
    if (bloco && ativo === bloco) { const nav = document.querySelector('#nav a.on') ?? document.querySelector('#nav a'); if (nav) { nav.focus(); return true; } }   // Esc no bloco: vai ao menu de cima
    return false;
  };
  const desregistrarCaptura = registrar(mapaCaptura, { captura: true });
  const aoPonteiro = () => { if (mosaico.emRedim()) mosaico.modoRedim(false); };
  document.addEventListener('pointerdown', aoPonteiro, true);

  return () => { removerOuvinteGravou(); desregistrar(); desregistrarCaptura(); document.removeEventListener('pointerdown', aoPonteiro, true); raiz.removeEventListener('ohara-mover', aoMover); for (const b of Object.values(blocos)) b.destruir(); mosaico.destruir(); raiz.className = ''; };
}
