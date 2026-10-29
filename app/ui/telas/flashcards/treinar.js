// Flashcards › Treinar (demonstração: mostra os cartões em ordem aleatória e conta as respostas; ainda não agenda revisões).
import { escaparHtml } from '../../../nucleo/texto.js';
import { ativas } from '../../../nucleo/materias.js';
import { cartoesParaExportar } from '../../../nucleo/cartoes.js';
import { renderizarFrente, renderizarVerso } from '../../../nucleo/flashcards_texto.js';
import * as pref from '../../preferencias.js';
import { registrar } from '../../atalhos.js';

/** Devolve `desenharTreinar(corpo)`, que desenha a aba e devolve a função de limpeza. */
export function criarTelaTreinar({ sessao, raiz }) {
  const $ = (s, r = raiz) => r.querySelector(s);
  function desenharTreinar(corpo) {
    const e0 = sessao.estado(), mats = ativas(e0.disciplinas);
    let fila = [], i = 0, virado = false, res = { errei: 0, dificil: 0, bom: 0, facil: 0 }, escopo = pref.ler('ohara.fc.escopo');
    const embaralhar = (l) => { const a = [...l]; for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
    function inicio() {
      const todos = cartoesParaExportar(sessao.estado(), { disciplinaId: escopo ? Number(escopo) : null }).map((x) => x.cartao);
      corpo.innerHTML = `<div class="fc-treino-inicio"><h2>Treinar</h2><p class="sub">Treino de demonstração: mostra os cartões em ordem aleatória e conta suas respostas. <b>Ainda não agenda revisões</b> (isso vem com o algoritmo).</p>` +
        `<label class="c">Matéria<select class="in" id="esc"><option value="">Todas as matérias</option>${mats.map((m) => `<option value="${m.id}" ${String(m.id) === escopo ? 'selected' : ''}>${escaparHtml(m.nome)}</option>`).join('')}</select></label>` +
        `<p class="sub">${todos.length} ${todos.length === 1 ? 'cartão disponível' : 'cartões disponíveis'}.</p><button type="button" class="btn" id="comecar" ${todos.length ? '' : 'disabled'}>Começar<kbd>Enter</kbd></button></div>`;
      corpo.onchange = (ev) => { if (ev.target.id === 'esc') { escopo = ev.target.value; pref.gravar('ohara.fc.escopo', escopo); inicio(); } };
      corpo.onclick = (ev) => { if (ev.target.closest('#comecar')) { fila = embaralhar(todos); i = 0; virado = false; res = { errei: 0, dificil: 0, bom: 0, facil: 0 }; cartao(); } };
      $('#comecar')?.focus();
    }
    function cartao() {
      if (i >= fila.length) { fim(); return; }
      const c = fila[i];
      corpo.innerHTML = `<div class="fc-treino"><div class="fc-prog" aria-label="Progresso"><span style="width:${Math.round(i / fila.length * 100)}%"></span></div><div class="fc-cab"><span>${i + 1} / ${fila.length}</span><span class="esp"></span><button type="button" class="btn peq sec" id="sair">Sair<kbd>Esc</kbd></button></div>` +
        `<article class="fc-card grande"><header>FRENTE</header><div class="corpo frente">${renderizarFrente(c.frente)}</div></article>` +
        (virado ? `<article class="fc-card grande"><header>VERSO</header><div class="corpo verso">${renderizarVerso(c.verso)}</div></article>` : '') +
        `<div class="fc-resp">${virado ? [['errei', 'Errei', '1'], ['dificil', 'Difícil', '2'], ['bom', 'Bom', '3'], ['facil', 'Fácil', '4']].map(([k, r, t]) => `<button type="button" class="btn ${k === 'bom' ? '' : 'sec'}" data-r="${k}">${r}<kbd>${t}</kbd></button>`).join('') : `<button type="button" class="btn" id="mostrar">Mostrar o verso<kbd>Espaço</kbd></button>`}</div></div>`;
      corpo.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; if (b.id === 'mostrar') { virado = true; cartao(); } else if (b.id === 'sair') inicio(); else if (b.dataset.r) responder(b.dataset.r); };
      (virado ? corpo.querySelector('[data-r="bom"]') : $('#mostrar'))?.focus();
    }
    function responder(k) { res[k]++; i++; virado = false; cartao(); }
    function fim() {
      const n = fila.length, certas = res.bom + res.facil;
      corpo.innerHTML = `<div class="fc-treino-inicio"><h2>Treino concluído</h2><p class="sub">${n} ${n === 1 ? 'cartão' : 'cartões'} · ${certas} acertos (${n ? Math.round(certas / n * 100) : 0}%)</p>` +
        `<ul class="fc-res"><li><b>${res.errei}</b> Errei</li><li><b>${res.dificil}</b> Difícil</li><li><b>${res.bom}</b> Bom</li><li><b>${res.facil}</b> Fácil</li></ul><div class="acoes"><button type="button" class="btn" id="de-novo">Treinar de novo<kbd>Enter</kbd></button></div></div>`;
      corpo.onclick = (ev) => { if (ev.target.closest('#de-novo')) inicio(); };
      $('#de-novo').focus();
    }
    // Espaço mostra o verso, 1 a 4 respondem, Esc sai (age antes do Esc global)
    const livre = (ev) => !ev.target.closest?.('input,select,textarea') && fila.length > 0 && i < fila.length;
    const nota = (n) => (ev) => (livre(ev) && virado ? (responder(['errei', 'dificil', 'bom', 'facil'][n - 1]), true) : false);
    const desregistrar = registrar({
      Space: (ev) => (livre(ev) && !virado ? (virado = true, cartao(), true) : false),
      Digit1: nota(1), Digit2: nota(2), Digit3: nota(3), Digit4: nota(4), Numpad1: nota(1), Numpad2: nota(2), Numpad3: nota(3), Numpad4: nota(4),
      Escape: (ev) => (livre(ev) ? (ev.stopPropagation(), inicio(), true) : false),
    }, { captura: true });
    inicio();
    return desregistrar;
  }
  return desenharTreinar;
}
