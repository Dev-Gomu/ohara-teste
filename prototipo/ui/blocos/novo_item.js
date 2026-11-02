// Janelinha para anotar uma data sem sair da tela (usada pela Hub): prova, trabalho, compromisso ou lembrete. Mesmas regras da Agenda
// (nucleo/eventos.js › salvarItem); só pede o essencial: tipo, matéria, título, data e hora. O resto se completa na Agenda.
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas } from '../../nucleo/materias.js';
import { salvarItem } from '../../nucleo/eventos.js';

const TIPOS = { prova: 'Prova', trabalho: 'Trabalho', compromisso: 'Compromisso', lembrete: 'Lembrete' };

/** Abre a janelinha. `dia` = data sugerida (AAAA-MM-DD); `tipo` = aba inicial (padrão prova). `aoSalvar()` roda depois de gravar. Devolve uma função que fecha. */
export function abrirNovoItem({ sessao, agora, dia, aoSalvar, aviso, tipo: tipoInicial = 'prova' }) {
  let tipo = tipoInicial, erro = '';
  const fundo = document.createElement('div');
  fundo.className = 'novo-item-fundo';
  const mats = () => ativas(sessao.estado().disciplinas);
  const fechar = () => { document.removeEventListener('keydown', teclas, true); fundo.remove(); };
  const teclas = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } };

  function desenhar() {
    const usaMat = tipo === 'prova' || tipo === 'trabalho';
    fundo.innerHTML = `<form class="novo-item card" role="dialog" aria-label="Novo item da Agenda"><h2>Novo na Agenda</h2>` +
      `<div class="seg">${Object.keys(TIPOS).map((k) => `<button type="button" class="pil${tipo === k ? ' a' : ''}" data-tipo="${k}">${TIPOS[k]}</button>`).join('')}</div>` +
      (usaMat ? `<label class="c">Matéria<select class="in" name="mat">${mats().map((m) => `<option value="${m.id}">${escaparHtml(m.nome)}</option>`).join('')}</select></label>` : '') +
      `<label class="c">${tipo === 'prova' ? 'Nome da prova' : 'Título'}<input class="in" name="titulo" maxlength="80" autocomplete="off" placeholder="${tipo === 'prova' ? 'Prova 1' : ''}"></label>` +
      `<div class="f2"><label class="c">Data<input class="in" type="date" name="data" value="${dia}"></label><label class="c">Hora<input class="in" type="time" name="hora"></label></div>` +
      (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '') +
      `<div class="acoes"><button class="btn peq" type="submit">Salvar</button><button class="btn peq sec" type="button" data-fechar>Cancelar</button></div></form>`;
    fundo.querySelector('[name=titulo]').focus();
  }
  fundo.onclick = (ev) => {
    if (ev.target === fundo || ev.target.closest('[data-fechar]')) { fechar(); return; }
    const t = ev.target.closest('[data-tipo]');
    if (t) { tipo = t.dataset.tipo; erro = ''; desenhar(); }
  };
  fundo.onsubmit = (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), dados = { tipo, titulo: f.get('titulo'), data: f.get('data'), hora: f.get('hora') };
    if (f.get('mat')) dados.disciplinaId = Number(f.get('mat'));
    try { sessao.aplicar((e) => salvarItem(e, dados, agora()).estado); } catch (e) { erro = e.message; desenhar(); return; }
    fechar(); aviso?.('Anotado na Agenda.'); aoSalvar?.();
  };
  document.addEventListener('keydown', teclas, true);
  document.body.appendChild(fundo); desenhar();
  return fechar;
}
