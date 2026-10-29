// Núcleo (regras puras, sem I/O): o que cada combinação de teclas significa e como "andar" entre elementos da tela, como num
// gerenciador de janelas em mosaico (tiling). A casca (ui/teclado.js) só liga isto aos eventos e ao foco do navegador.
//
// Convenção: Alt + algo é "do sistema" e vale até dentro do editor; tecla solta (h j k l, ?, /) só vale fora de campos de texto.

const TELAS_DO_ATALHO = ['hoje', 'materias', 'foco', 'planejar', 'painel', 'cartoes', 'ajustes'];   // Alt+1 … Alt+7 (ordem do menu)
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
    const m = /^Digit([1-7])$/.exec(e.code ?? '');
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
  { grupo: 'Andar pelo sistema', itens: [['Alt 1 … 7', 'Hoje, Matérias, Foco, Planejar, Painel, Cartões, Ajustes'], ['Alt P  ou  Ctrl P  ou  /', 'Ir para… (matéria, aula ou tela, digitando)'], ['Alt B', 'Fixar ou soltar a barra lateral'], ['Alt Enter', 'Tela cheia de foco (esconde barra e topo)'], ['Esc', 'Fecha janelas e sai do foco']] },
  { grupo: 'Mover entre painéis e itens', itens: [['Alt H J K L  ou  Alt ← ↓ ↑ →', 'Foco para o vizinho (vale até dentro do editor)'], ['H J K L  ou  ← ↓ ↑ →', 'O mesmo, quando você não está digitando'], ['Enter', 'Abre o item em foco'], ['Alt , e Alt .', 'Diminui ou aumenta o espaço do slide na aula']] },
  { grupo: 'No slide (PDF)', itens: [['J  K', 'Rola para baixo e para cima'], ['Page Down  Page Up', 'Próxima e anterior página'], ['+  −  0', 'Mais zoom, menos zoom, tamanho normal']] },
  { grupo: 'Flashcards (tela Criar)', itens: [['Alt C  G  T', 'Criar, Gerenciar, Treinar'], ['@  #  ?  (sem espaço)  ·  -  +  --  1. (com espaço)', 'Frente (abre um cartão novo), seção, dúvida · lista, a favor, contra, numerada'], ['Enter duas vezes  ·  Alt N', 'Cartão novo (depois do atual)'], ['Ctrl B  ·  Ctrl E', 'Negrito e destaque (ou **texto** e ==texto==)'], ['Ctrl Enter  ·  Ctrl Z', 'Salvar os cartões; desfazer'], ['Tab  ·  Alt S', 'Ver o cartão pronto; abrir o slide ao lado (metade e metade)'], ['Alt H J K L  ·  Alt F  ·  Alt Q  ·  Alt X', 'Foco entre blocos; ampliar; fechar; trocar o lado'], ['Alt ]  ·  Alt [', 'Próxima e anterior página do slide, sem sair do editor'], ['Espaço  ·  1 2 3 4  ·  Esc', 'No treino: mostrar o verso, responder, sair']] },
  { grupo: 'No editor de anotações', itens: [['Alt T', 'Ocultar ou mostrar a barra do editor (oculta = bolha ao selecionar)'], ['Alt S', 'Só anotações: esconde o slide e usa a tela toda'], ['Ctrl B  I  U', 'Negrito, itálico, sublinhado'], ['Ctrl Shift X', 'Riscado'], ['Ctrl Shift H', 'Marca-texto'], ['Ctrl E', 'Código'], ['Ctrl Alt 1  2  3', 'Título 1, 2, 3 (de novo volta ao texto)'], ['Ctrl Shift 7  8  9', 'Lista numerada, com marcadores, de tarefas'], ['Ctrl K', 'Link'], ['Ctrl \\', 'Limpar formatação'], ['Tab  Shift Tab', 'Recuar e voltar na lista'], ['Ctrl M  ou  Alt M', 'Marcar a linha com a página do slide'], ['# ⎵  ## ⎵  > ⎵  - ⎵  1. ⎵', 'Digite no começo da linha: vira título, citação, lista']] },
];
