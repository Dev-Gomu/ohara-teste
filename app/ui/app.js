// Casca do app: navegação por #hoje, #materias e #ajustes, e tema claro/escuro. Sem regra de negócio.
import { TELAS, rotaDoEndereco, escolherTema, outroTema, escolherPaleta, escolherVisual } from '../nucleo/rotas.js';
import { escaparHtml } from '../nucleo/texto.js';
import { iniciarSessao } from './sessao.js';
import { desenharMaterias } from './telas/materias.js';
import { desenharMateria } from './telas/materia.js';
import { desenharAula } from './telas/aula.js';
import { desenharAjustes } from './telas/ajustes.js';
import { desenharHoje } from './telas/hoje.js';
import { desenharFoco } from './telas/foco.js';
import { desenharPainel } from './telas/painel.js';
import { desenharPlanejar } from './telas/planejar.js';
import { desenharCartoes } from './telas/cartoes.js';
import { criarServicoFoco } from './foco_servico.js';

const ICONES = {
  hoje: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  materias: '<path d="M3 7h6l2 2h10v10H3z"/>',
  planejar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  cartoes: '<rect x="3" y="6" width="14" height="11" rx="2"/><path d="M7 20h14V9"/>',
  foco: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  painel: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
};

// Telas ainda vazias: cada uma será trocada pela de verdade nas tarefas 1.10 a 1.14.
const TEXTOS = {
  hoje: ['Hoje', 'Em construção.'],
  materias: ['Matérias', 'Em construção.'],
  ajustes: ['Ajustes', 'Em construção.'],
  foco: ['Foco', 'Em construção.'],
  painel: ['Painel', 'Em construção.'],
  planejar: ['Planejar', 'Em construção.'],
  cartoes: ['Cartões', 'Em construção.'],
};

const CHAVE_TEMA = 'ohara.tema';
const guardar = {
  ler() { try { return localStorage.getItem(CHAVE_TEMA); } catch { return null; } },
  gravar(v) { try { localStorage.setItem(CHAVE_TEMA, v); } catch { /* sem armazenamento: o tema vale só nesta sessão */ } },
};

const CHAVE_PALETA = 'ohara.paleta';
function corDaBarra() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--nav').trim() || '#0B5A44';
}
function aplicarTema(tema) { document.documentElement.dataset.tema = tema; corDaBarra(); }
function aplicarPaleta(p) { if (p === 'verde') delete document.documentElement.dataset.paleta; else document.documentElement.dataset.paleta = p; corDaBarra(); }

const CHAVE_VISUAL = 'ohara.visual';
function aplicarVisual(v) { document.documentElement.dataset.visual = v; corDaBarra(); }
function definirVisual(v) { try { localStorage.setItem(CHAVE_VISUAL, v); } catch { /* vale só nesta sessão */ } aplicarVisual(v); desenhar(); }

function definirTema(tema) { guardar.gravar(tema); aplicarTema(tema); desenhar(); }
function definirPaleta(p) { try { localStorage.setItem(CHAVE_PALETA, p); } catch { /* vale só nesta sessão */ } aplicarPaleta(p); desenhar(); }

function desenhar() {
  if (limpar) { limpar(); limpar = null; }
  const rota = rotaDoEndereco(location.hash);
  const tela = rota.menu;
  const tema = document.documentElement.dataset.tema;
  document.getElementById('nav').innerHTML = '<div class="logo">Ohara</div>' +
    TELAS.map((t) => `<a href="#${t.chave}" class="${t.chave === tela ? 'on' : ''}" ${t.chave === tela ? 'aria-current="page"' : ''}>` +
      `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[t.chave]}</svg>${escaparHtml(t.nome)}</a>`).join('') +
    `<div class="fim"><button id="bt" type="button">Tema: ${tema}</button></div>`;
  document.getElementById('bt').onclick = () => definirTema(outroTema(document.documentElement.dataset.tema));
  const [titulo, texto] = TEXTOS[tela];
  const raiz = document.getElementById('app');
  raiz.onclick = raiz.onsubmit = raiz.onchange = null; raiz.className = '';
  document.title = `${titulo} · Ohara`;
  if (!sessao) { raiz.innerHTML = `<h1>${escaparHtml(titulo)}</h1><p class="sub">${escaparHtml(erroSessao || 'Abrindo seus dados…')}</p>`; return; }
  const ctx = { sessao, foco, aviso, definirTema, definirPaleta, definirVisual, agora: () => window.ohara?.agoraFalsoMs ?? Date.now() };
  if (rota.tela === 'materias') desenharMaterias(raiz, ctx);
  else if (rota.tela === 'materia') desenharMateria(raiz, ctx, rota.id);
  else if (rota.tela === 'aula') limpar = desenharAula(raiz, ctx, rota.id);
  else if (rota.tela === 'ajustes') desenharAjustes(raiz, ctx);
  else if (rota.tela === 'hoje') limpar = desenharHoje(raiz, ctx);
  else if (rota.tela === 'foco') limpar = desenharFoco(raiz, ctx, rota.id);
  else if (rota.tela === 'planejar') limpar = desenharPlanejar(raiz, ctx);
  else if (rota.tela === 'cartoes') limpar = desenharCartoes(raiz, ctx);
  else if (rota.tela === 'painel') limpar = desenharPainel(raiz, ctx);
  else raiz.innerHTML = `<h1>${escaparHtml(titulo)}</h1><p class="sub">${escaparHtml(texto)}</p>`;
}

let sessao = null, foco = null, erroSessao = '', limpar = null;
function aviso(texto, acao) {
  const t = document.getElementById('aviso');
  t.innerHTML = `<span>${escaparHtml(texto)}</span>` + (acao ? `<button type="button">${escaparHtml(acao.texto)}</button>` : '');
  if (acao) t.querySelector('button').onclick = () => { t.classList.remove('on'); acao.fazer(); };
  t.classList.add('on'); clearTimeout(aviso.t); aviso.t = setTimeout(() => t.classList.remove('on'), 6000);
}

aplicarTema(escolherTema(guardar.ler(), matchMedia('(prefers-color-scheme: dark)').matches));
aplicarVisual(escolherVisual((() => { try { return localStorage.getItem(CHAVE_VISUAL); } catch { return null; } })()));
aplicarPaleta(escolherPaleta((() => { try { return localStorage.getItem(CHAVE_PALETA); } catch { return null; } })()));
addEventListener('hashchange', desenhar);
desenhar();
iniciarSessao({ aoFalhar: (e) => aviso('Não consegui salvar: ' + e.message) })
  .then((s) => { sessao = s; foco = criarServicoFoco(s, { aviso }); window.ohara = { sessao, foco }; desenhar(); })
  .catch((e) => { erroSessao = 'Não foi possível abrir os dados: ' + e.message; desenhar(); });

// Service worker: o app abre sem internet e atualiza sozinho (a página nova aparece ao recarregar).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker o app funciona, só não abre offline */ });
