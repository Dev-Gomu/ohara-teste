// Casca do app: navegação por #hoje, #materias e #ajustes, e tema claro/escuro. Sem regra de negócio.
import { atualizarApp } from './atualizar.js';
import { TELAS, rotaDoEndereco, escolherTema, outroTema } from '../nucleo/rotas.js';
import { escaparHtml } from '../nucleo/texto.js';
import { iniciarSessao } from './sessao.js';
import { desenharBiblioteca } from './telas/biblioteca.js';
import { desenharMateria } from './telas/materia.js';
import { desenharArea } from './telas/area.js';
import { aulaArquivada } from '../nucleo/anos.js';
import { desenharAjustes } from './telas/ajustes.js';
import { desenharHoje } from './telas/hoje.js';
import { desenharFoco } from './telas/foco.js';
import { desenharPainel } from './telas/painel.js';
import { desenharPlanejar } from './telas/planejar.js';
import { desenharGrade } from './telas/grade.js';
import { desenharAgenda } from './telas/agenda.js';
import { ocorrenciasVirtuais, materializarDoDia } from '../nucleo/grade.js';
import { diaDe } from './foco_servico.js';
import { desenharRevisor } from './telas/revisor.js';
import { aulaParaAbrirAgora } from '../nucleo/aulas.js';
import { criarServicoFoco } from './foco_servico.js';
import { criarServicoSincronia } from './sincronia.js';
import { iniciarTeclado } from './teclado.js';
import * as pref from './preferencias.js';
import { abrirNovoItem } from './blocos/novo_item.js';
import { iniciarZonas } from './zonas.js';

const ICONES = {
  hoje: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  materias: '<path d="M3 7h6l2 2h10v10H3z"/>',
  planejar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  area: '<rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="7" rx="2"/><rect x="13" y="13" width="8" height="7" rx="2"/>',
  revisor: '<rect x="3" y="6" width="14" height="11" rx="2"/><path d="M7 20h14V9"/>',
  foco: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  painel: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
};

// Telas ainda vazias: cada uma será trocada pela de verdade nas tarefas 1.10 a 1.14.
const TEXTOS = {
  hoje: ['Hub', 'Em construção.'],
  materias: ['Acervo', 'Em construção.'],
  area: ['Mesa', 'Em construção.'],
  revisor: ['Treino', 'Em construção.'],
  ajustes: ['Configs', 'Em construção.'],
  foco: ['Foco', 'Em construção.'],
  painel: ['Painel', 'Em construção.'],
  planejar: ['Agenda', 'Em construção.'],
  grade: ['Grade', 'Em construção.'],
  plano: ['Plano de estudo', 'Em construção.'],
  cartoes: ['Cartões', 'Em construção.'],
};

const CHAVE_TEMA = 'ohara.tema';
const guardar = {
  ler() { return pref.ler(CHAVE_TEMA, null); },
  gravar(v) { pref.gravar(CHAVE_TEMA, v); },
};

const CHAVE_BARRA = 'ohara.barra';
const html = document.documentElement;
// A barra "solta" (☰ flutuante) saiu de uso: o menu de cima fica sempre visível. Preferência antiga guardada como 'solta' é ignorada.
const lerBarra = () => 'fixa';
function aplicarBarra(v) { html.dataset.barra = v; html.removeAttribute('data-barra-aberta'); }
const barra = {
  fixa: () => html.dataset.barra !== 'solta',
  aberta: () => !!html.dataset.barraAberta,
  abrir() { if (!barra.fixa()) html.dataset.barraAberta = '1'; },
  fechar() { html.removeAttribute('data-barra-aberta'); },
  alternar() { /* sem barra solta por enquanto: Alt B não faz nada */ },
};
function corDaBarra() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--nav').trim() || '#0B5A44';
}
function aplicarTema(tema) { document.documentElement.dataset.tema = tema; corDaBarra(); }


function definirTema(tema) { guardar.gravar(tema); aplicarTema(tema); desenhar(); }

/** O botão "Mesa" (área de trabalho) do menu: vai para a aula certa (em andamento, última usada ou mais recente). */
function abrirAreaDeTrabalho(raiz, ctx) {
  const d = new Date(ctx.agora()), p = (n) => String(n).padStart(2, '0');
  const aula = aulaParaAbrirAgora(ctx.sessao.estado(), pref.ler('ohara.at.ultima'), `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
  if (aula) { location.replace(`#aula/${aula.id}`); return; }
  raiz.innerHTML = '<h1>Mesa</h1><p class="sub">Crie uma matéria e uma aula para começar. <a class="voltar" href="#materias">Ir para o Acervo</a></p>';
}

/** As aulas da grade que caem hoje viram aulas de verdade (com espaço para slides, anotações e cartões). Só grava se houver o que criar. */
function materializarHoje() {
  if (!sessao) return;
  const ms = window.ohara?.agoraFalsoMs ?? Date.now(), dia = diaDe(ms);
  if (ocorrenciasVirtuais(sessao.estadoCompleto(), dia, dia).length) sessao.aplicar((e) => materializarDoDia(e, dia, new Date(ms).toISOString()));
}

function desenhar() {
  if (limpar) { limpar(); limpar = null; }
  try { materializarHoje(); } catch (e) { aviso('Não consegui criar as aulas de hoje: ' + e.message); }
  const rota = rotaDoEndereco(location.hash);
  const tela = rota.menu;
  document.documentElement.dataset.tela = tela;   // estilos/pc.css usa isto para a escala e as margens no PC
  const tema = document.documentElement.dataset.tema;
  document.getElementById('nav').innerHTML = '<div class="logo">Ohara</div>' +
    TELAS.map((t) => `<a href="#${t.chave}" title="${escaparHtml(t.nome)}" class="${t.chave === tela ? 'on' : ''}" ${t.chave === tela ? 'aria-current="page"' : ''}>` +
      `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[t.chave]}</svg>${escaparHtml(t.nome)}</a>`).join('') +
    `<div class="fim"><button id="ver-atalhos" type="button" title="Atalhos de teclado (?)" aria-label="Atalhos de teclado"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17v.01"/></svg></button></div>`;
  document.getElementById('ver-atalhos').onclick = () => teclado.abrirAjuda();
  document.getElementById('nav').onclick = (ev) => { if (ev.target.closest('a') && !barra.fixa()) barra.fechar(); };
  const [titulo, texto] = TEXTOS[tela];
  const raiz = document.getElementById('app');
  raiz.onclick = raiz.onsubmit = raiz.onchange = raiz.onkeydown = raiz.oncontextmenu = raiz.onfocusout = null; raiz.className = '';
  document.title = `${titulo} · Ohara`;
  if (!sessao) { raiz.innerHTML = `<h1>${escaparHtml(titulo)}</h1><p class="sub">${escaparHtml(erroSessao || 'Abrindo seus dados…')}</p>`; return; }
  const ctx = { sessao, foco, sincronia, aviso, atualizarApp: () => atualizarApp(aviso), definirTema, agora: () => window.ohara?.agoraFalsoMs ?? Date.now() };
  if (rota.tela === 'materias') limpar = desenharBiblioteca(raiz, ctx, 'materias');
  else if (rota.tela === 'cartoes') limpar = desenharBiblioteca(raiz, ctx, 'cartoes');
  else if (rota.tela === 'revisor') limpar = desenharRevisor(raiz, ctx);
  else if (rota.tela === 'area-atalho') abrirAreaDeTrabalho(raiz, ctx);
  else if (rota.tela === 'materia') limpar = desenharMateria(raiz, ctx, rota.id);
  else if (rota.tela === 'area') limpar = desenharArea(raiz, aulaArquivada(sessao.estadoCompleto(), rota.id) ? { ...ctx, sessao: { ...sessao, estado: sessao.estadoCompleto } } : ctx, rota.id, rota);   // aula de ano arquivado: abre para consulta
  else if (rota.tela === 'ajustes') desenharAjustes(raiz, ctx);
  else if (rota.tela === 'hoje') limpar = desenharHoje(raiz, ctx);
  else if (rota.tela === 'foco') limpar = desenharFoco(raiz, ctx, rota.id);
  else if (rota.tela === 'planejar') limpar = desenharAgenda(raiz, ctx);
  else if (rota.tela === 'plano') limpar = desenharPlanejar(raiz, ctx);
  else if (rota.tela === 'grade') limpar = desenharGrade(raiz, ctx);
  else if (rota.tela === 'painel') limpar = desenharPainel(raiz, ctx);
  else raiz.innerHTML = `<h1>${escaparHtml(titulo)}</h1><p class="sub">${escaparHtml(texto)}</p>`;
}

let sessao = null, foco = null, sincronia = null, erroSessao = '', limpar = null;
function aviso(texto, acao) {
  const t = document.getElementById('aviso');
  t.innerHTML = `<span>${escaparHtml(texto)}</span>` + (acao ? `<button type="button">${escaparHtml(acao.texto)}</button>` : '');
  if (acao) t.querySelector('button').onclick = () => { t.classList.remove('on'); acao.fazer(); };
  t.classList.add('on'); clearTimeout(aviso.t); aviso.t = setTimeout(() => t.classList.remove('on'), 6000);
}

// Escala no PC: 1 no tablet (1280×800); em janelas maiores o desenho cresce (--zt inteiro no Treino; --zl metade, nas telas de lista e leitura). Ver estilos/pc.css.
function escalarPc() {
  const z = Math.max(1, Math.min(innerWidth / 1280, innerHeight / 800, 1.5)), r = document.documentElement.style;
  r.setProperty('--zt', z.toFixed(3)); r.setProperty('--zl', (1 + (z - 1) / 2).toFixed(3));
}
escalarPc(); addEventListener('resize', escalarPc);
aplicarBarra(lerBarra());
document.addEventListener('click', (ev) => { if (barra.aberta() && !ev.target.closest('#nav') && !ev.target.closest('#abrir-barra')) barra.fechar(); });
document.getElementById('abrir-barra').onclick = () => (barra.aberta() ? barra.fechar() : barra.abrir());
addEventListener('hashchange', () => barra.fechar());
aplicarTema(escolherTema(guardar.ler(), false));   // claro por padrão; o escuro só se a pessoa escolher
addEventListener('hashchange', desenhar);
desenhar();
// Alt I: anota um lembrete para hoje de qualquer tela (a janelinha é a do "+" da Hub, já na aba Lembrete)
function novoLembrete() {
  if (!sessao || document.querySelector('.novo-item-fundo')) return;
  const agora = () => new Date(window.ohara?.agoraFalsoMs ?? Date.now()).toISOString();
  abrirNovoItem({ sessao, agora, dia: diaDe(window.ohara?.agoraFalsoMs ?? Date.now()), aviso, tipo: 'lembrete', aoSalvar: () => { if (['#hoje', '#planejar', ''].includes(location.hash.split('?')[0])) desenhar(); else aviso('Lembrete anotado.'); } });
}
iniciarZonas();   // zonas de teclado nas telas além da Mesa (Tab, Enter, Esc, Alt T F B)
const teclado = iniciarTeclado({ estado: () => sessao?.estado() ?? { disciplinas: [], aulas: [] }, barra, novoLembrete });

iniciarSessao({ aoFalhar: (e) => aviso('Não consegui salvar: ' + e.message) })
  .then((s) => {
    sessao = s; foco = criarServicoFoco(s, { aviso });
    sincronia = criarServicoSincronia({ sessao, foco, aviso, aoReceber: () => desenhar(), irParaAjustes: () => { location.hash = '#ajustes'; } });
    window.ohara = { sessao, foco, teclado, sincronia }; desenhar(); sincronia.iniciar();
  })
  .catch((e) => { erroSessao = 'Não foi possível abrir os dados: ' + e.message; desenhar(); });

// Service worker: o app abre sem internet e atualiza sozinho (a página nova aparece ao recarregar).
// Atualização: a versão nova baixa sozinha e assume; a página aberta continua na antiga até recarregar, então avisamos.
// Em localhost/127.0.0.1 (desenvolvimento) o service worker só atrapalha: guarda arquivos antigos e mistura versões. Lá ele é desligado e o
// que ele guardou é apagado (recarrega uma vez só, se havia algo). No app publicado e no tablet pela rede ele funciona normalmente.
const emDesenvolvimento = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (emDesenvolvimento && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (regs) => {
    const chaves = await caches.keys();
    if (!regs.length && !chaves.length) return;
    await Promise.all([...regs.map((r) => r.unregister()), ...chaves.map((k) => caches.delete(k))]);
    location.reload();
  }).catch(() => {});
} else if ('serviceWorker' in navigator) {
  const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const procurar = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) procurar(); }); setInterval(procurar, 30 * 60 * 1000);
  }).catch(() => { /* sem service worker o app funciona, só não abre offline */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (tinhaControle) { aviso('Versão nova do Ohara pronta.', { texto: 'Atualizar', fazer: () => location.reload() }); clearTimeout(aviso.t); } });
}
