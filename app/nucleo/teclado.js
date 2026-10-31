// Núcleo (regras puras, sem I/O): o que cada combinação de teclas significa e como "andar" entre elementos da tela, como num
// gerenciador de janelas em mosaico (tiling). A casca (ui/teclado.js) só liga isto aos eventos e ao foco do navegador.
//
// Convenção: Alt + algo é "do sistema" e vale até dentro do editor; tecla solta (h j k l, ?, /) só vale fora de campos de texto.

import { TELAS } from './rotas.js';

const TELAS_DO_ATALHO = TELAS.map((t) => t.chave);   // Alt+1 … Alt+6 (ordem do menu)
const DIRECOES_LETRA = { KeyH: 'esq', KeyJ: 'baixo', KeyK: 'cima', KeyL: 'dir' };
const DIRECOES_SETA = { ArrowLeft: 'esq', ArrowDown: 'baixo', ArrowUp: 'cima', ArrowRight: 'dir' };

/**
 * `e`: { key, code, altKey, ctrlKey, metaKey, shiftKey, isComposing }. `digitando`: o foco está num campo de texto/editor.
 * Devolve { acao, ... } ou null. Ações: tela (tela), barra, foco, lancador, ajuda, mover (direcao), divisoria (delta), sair.
 */
export function interpretar(e, { digitando = false } = {}) {
  if (e.isComposing || e.metaKey) return null;
  if (e.key === 'Escape') return { acao: 'sair' };
  if (e.altKey && !e.ctrlKey && !e.shiftKey) {
    const m = new RegExp(`^Digit([1-${TELAS_DO_ATALHO.length}])$`).exec(e.code ?? '');
    if (m) return { acao: 'tela', tela: TELAS_DO_ATALHO[Number(m[1]) - 1] };
    if (e.code === 'KeyB') return { acao: 'barra' };
    if (e.key === 'Enter') return { acao: 'foco' };
    if (e.code === 'KeyP') return { acao: 'lancador' };
    if (e.code === 'Slash') return { acao: 'ajuda' };
    if (e.code === 'Comma') return { acao: 'divisoria', delta: -1 };
    if (e.code === 'Period') return { acao: 'divisoria', delta: 1 };
    const d = DIRECOES_LETRA[e.code] ?? DIRECOES_SETA[e.key];
    if (d) return { acao: 'mover', direcao: d };
    return null;
  }
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyP') return { acao: 'lancador' };
  if (e.ctrlKey || e.altKey || digitando) return null;
  if (e.key === '?') return { acao: 'ajuda' };
  if (e.key === '/') return { acao: 'lancador' };
  if (!e.shiftKey && DIRECOES_LETRA[e.code]) return { acao: 'mover', direcao: DIRECOES_LETRA[e.code] };
  return null;
}

/**
 * Vizinho mais próximo de `rects[i]` na direção pedida ('esq' | 'dir' | 'cima' | 'baixo'); -1 se não houver.
 * `rects`: [{ x, y, w, h }]. O que está bem alinhado vale mais do que o que está só um pouco mais perto.
 */
export function vizinho(rects, i, direcao) {
  const a = rects[i], acx = a.x + a.w / 2, acy = a.y + a.h / 2, horizontal = direcao === 'esq' || direcao === 'dir', sinal = direcao === 'dir' || direcao === 'baixo' ? 1 : -1;
  let melhor = -1, nota = Infinity;
  rects.forEach((b, j) => {
    if (j === i) return;
    const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2, principal = (horizontal ? bcx - acx : bcy - acy) * sinal;
    if (principal < 2) return;                                             // precisa estar de fato do lado pedido
    const lado = horizontal ? Math.abs(bcy - acy) : Math.abs(bcx - acx);
    const sobrepoe = horizontal ? (b.y < a.y + a.h && a.y < b.y + b.h) : (b.x < a.x + a.w && a.x < b.x + b.w);
    const n = principal + (sobrepoe ? 0.4 : 2.5) * lado;
    if (n < nota) { nota = n; melhor = j; }
  });
  return melhor;
}

/** Atalhos para a janela de ajuda: [{ grupo, itens: [[teclas, o que faz]] }]. Um só lugar para o texto e para conferir os testes. */
export const AJUDA = [
  { grupo: 'Andar pelo sistema', itens: [['Alt 1 … 6', 'Hub, Mesa, Acervo, Treino, Agenda, Configs'], ['Alt P  ou  Ctrl P  ou  /', 'Ir para… (matéria, aula ou tela, digitando)'], ['Alt B', 'Fixar ou soltar a barra lateral'], ['Alt Enter', 'Tela cheia de foco (esconde barra e topo)'], ['Esc', 'Fecha janelas e sai do foco'], ['Alt H J K L  ou  Alt ← ↓ ↑ →', 'Foco para o vizinho (vale até dentro do editor)'], ['H J K L  ou  ← ↓ ↑ →', 'O mesmo, quando você não está digitando']] },
  { grupo: 'Mesa (área de trabalho, em blocos)', itens: [['Alt S  ·  Alt A  ·  Alt C', 'Abre ou fecha Slides, Anotações, Cartões'], ['Alt H J K L', 'Foco para o bloco vizinho'], ['Alt Shift H J K L', 'Troca o bloco de lugar com o vizinho'], ['Alt R, depois H J K L', 'Muda o tamanho (Enter ou Esc termina)'], ['Alt ,  e  Alt .', 'Diminui ou aumenta a coluna da esquerda'], ['Alt F  ·  Alt Q', 'Amplia o bloco · fecha o bloco'], ['Alt 0  ·  Alt Shift 0', 'Tamanhos padrão · ordem padrão'], ['Alt O', 'Opções (⋮) do bloco em foco'], ['Enter  ·  Esc', 'Entra no bloco · sai do bloco'], ['Arrastar o cabeçalho  ·  arrastar o vão', 'Troca de lugar · muda o tamanho (dois toques no vão: padrão)']] },
  { grupo: 'Slides', itens: [['Alt ]  ·  Alt [', 'Próxima e anterior página, de qualquer bloco'], ['← →  ·  Page Down  Page Up', 'Próxima e anterior página (no slide)'], ['J  K', 'Rola para baixo e para cima'], ['+  −  0  ·  Ctrl roda', 'Mais zoom, menos zoom, tamanho que cabe'], ['Dois toques  ·  pinça  ·  deslizar', '100% ↔ 200% · zoom · passa de página']] },
  { grupo: 'Anotações', itens: [['Alt T', 'Barra de formatação fixa ou escondida (escondida: menu ao selecionar)'], ['Ctrl M  ou  Alt M', 'Marcar a linha com a página do slide'], ['Ctrl B  I  U', 'Negrito, itálico, sublinhado'], ['Ctrl Shift H  ·  Ctrl Shift X', 'Marca-texto · riscado'], ['Ctrl Alt 1  2  3', 'Título 1, 2, 3 (de novo volta ao texto)'], ['Ctrl Shift 7  8  9', 'Lista numerada, com marcadores, de tarefas'], ['Ctrl K  ·  Ctrl E  ·  Ctrl \\', 'Link · código · limpar formatação'], ['Tab  Shift Tab', 'Recuar e voltar na lista'], ['# ⎵  ## ⎵  > ⎵  - ⎵  1. ⎵', 'No começo da linha: título, citação, lista']] },
  { grupo: 'Cartões', itens: [['@  #  ?  (sem espaço)  ·  -  +  --  1. (com espaço)', 'Frente (abre um cartão novo), seção, dúvida · lista, a favor, contra, numerada'], ['Enter duas vezes  ·  Alt N', 'Cartão novo (depois do atual)'], ['Ctrl B  ·  Ctrl E', 'Negrito e destaque (ou **texto** e ==texto==)'], ['Ctrl Enter  ·  Ctrl Z', 'Salvar os cartões; desfazer']] },
  { grupo: 'Acervo e Treino', itens: [['Alt C  (no Acervo)', 'Criar cartões: abre a Mesa com o bloco Cartões'], ['Espaço  ·  1 2 3 4  ·  Esc', 'No treino: mostrar o verso, responder, sair']] },
];
