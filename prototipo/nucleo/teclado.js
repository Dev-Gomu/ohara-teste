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
 * Devolve { acao, ... } ou null. Ações: tela (tela), lancador, ajuda, lembrete (anotar um lembrete, em qualquer tela), mover (direcao; simples = sem Alt; seta = tecla de seta), zona (passo), sair.
 */
export function interpretar(e, { digitando = false } = {}) {
  if (e.isComposing || e.metaKey) return null;
  if (e.key === 'Escape') return { acao: 'sair' };
  if (e.altKey && !e.ctrlKey && !e.shiftKey) {
    const m = new RegExp(`^Digit([1-${TELAS_DO_ATALHO.length}])$`).exec(e.code ?? '');
    if (m) return { acao: 'tela', tela: TELAS_DO_ATALHO[Number(m[1]) - 1] };
    if (e.code === 'KeyP') return { acao: 'lancador' };
    if (e.code === 'Slash') return { acao: 'ajuda' };
    if (e.code === 'KeyI') return { acao: 'lembrete' };
    const d = DIRECOES_LETRA[e.code] ?? DIRECOES_SETA[e.key];
    if (d) return { acao: 'mover', direcao: d };
    return null;
  }
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyP') return { acao: 'lancador' };
  if (e.ctrlKey || e.altKey || digitando) return null;
  if (e.key === '?') return { acao: 'ajuda' };
  if (e.key === '/') return { acao: 'lancador' };
  if (e.key === 'Tab') return { acao: 'zona', passo: e.shiftKey ? -1 : 1 };
  if (e.shiftKey) return null;
  if (DIRECOES_LETRA[e.code]) return { acao: 'mover', direcao: DIRECOES_LETRA[e.code], simples: true };
  if (DIRECOES_SETA[e.key]) return { acao: 'mover', direcao: DIRECOES_SETA[e.key], simples: true, seta: true };   // seta solta: só mexe se houver para onde ir
  return null;
}

/** Tab entre zonas (menu, blocos…): `n` zonas, `i` a atual (-1 se o foco está fora de todas). Anda em ciclo. */
export function proximaZona(n, i, passo) {
  if (n < 1) return -1;
  if (i < 0) return passo > 0 ? 0 : n - 1;
  return (i + passo + n) % n;
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
  { grupo: 'Andar pelo sistema', itens: [['Alt 1 … 6', 'Hub, Mesa, Acervo, Treino, Agenda, Configs'], ['Alt P  ou  Ctrl P  ou  /', 'Ir para… (matéria, aula ou tela, digitando)'], ['Alt I', 'Anotar um lembrete para hoje, em qualquer tela'], ['Esc', 'Fecha janelas e menus'], ['Alt H J K L  ou  Alt ← ↓ ↑ →', 'Foco para o vizinho (vale até dentro do editor)'], ['H J K L  ou  ← ↓ ↑ →', 'Sem Alt, quando você não está digitando: no bloco, vai ao bloco vizinho; dentro dele, ao item vizinho'], ['Tab  ·  Shift Tab', 'Salta de zona em zona (menu, cada bloco); dentro do bloco, as setas fazem o papel do Tab']] },
  { grupo: 'Mesa (área de trabalho, em blocos)', itens: [['Alt S  ·  Alt A  ·  Alt C', 'Abre ou fecha Slides, Anotações, Cartões'], ['Alt H J K L', 'Foco para o bloco vizinho'], ['Alt Shift H J K L', 'Troca o bloco de lugar com o vizinho'], ['Alt R, depois H J K L', 'Muda o tamanho (Enter ou Esc termina)'], ['Alt T  ·  Alt F  ·  Alt B', 'Vai à barra de topo · ao campo · à barra de baixo do bloco'], ['Alt ,  e  Alt .', 'Elemento anterior e próximo dentro da barra'], ['Alt X', 'Com 2 blocos abertos: troca o bloco em foco pelo escondido (de novo desfaz)'], ['Alt M  ·  Alt W', 'Amplia o bloco · fecha o bloco'], ['Alt 0  ·  Alt Shift 0', 'Tamanhos padrão · ordem padrão'], ['Alt O', 'Opções (⋮) do bloco em foco'], ['Enter  ·  Esc', 'Entra no campo do bloco · volta ao bloco; Esc de novo vai ao menu de cima (← → escolhem, Enter abre, ↓ ou Esc voltam)'], ['Arrastar o cabeçalho  ·  arrastar o vão', 'Troca de lugar · muda o tamanho (dois toques no vão: padrão)']] },
  { grupo: 'Slides', itens: [['Alt ]  ·  Alt [', 'Próxima e anterior página, de qualquer bloco'], ['← →  ·  Page Down  Page Up', 'Próxima e anterior página (no slide)'], ['↑ ↓  ·  J K', 'Rola para cima e para baixo'], ['+  −  0  ·  Ctrl roda', 'Mais zoom, menos zoom, tamanho que cabe'], ['Dois toques  ·  pinça  ·  deslizar', '100% ↔ 200% · zoom · passa de página']] },
  { grupo: 'Anotações', itens: [['Aa (botão)', 'Barra de formatação fixa ou escondida (escondida: menu ao selecionar)'], ['Ctrl M', 'Marcar a linha com a página do slide'], ['Ctrl B  I  U', 'Negrito, itálico, sublinhado'], ['Ctrl Shift H  ·  Ctrl Shift X', 'Marca-texto · riscado'], ['Ctrl Alt 1  2  3', 'Título 1, 2, 3 (de novo volta ao texto)'], ['Ctrl Shift 7  8  9', 'Lista numerada, com marcadores, de tarefas'], ['Ctrl K  ·  Ctrl E  ·  Ctrl \\', 'Link · código · limpar formatação'], ['Tab  Shift Tab', 'Recuar e voltar na lista'], ['# ⎵  ## ⎵  > ⎵  - ⎵  1. ⎵', 'No começo da linha: título, citação, lista']] },
  { grupo: 'Cartões', itens: [['@  #  ?  (sem espaço)  ·  -  +  --  1. (com espaço)', 'Frente (abre um cartão novo), seção, dúvida · lista, a favor, contra, numerada'], ['Enter duas vezes  ·  Alt N', 'Cartão novo (depois do atual)'], ['Ctrl B  ·  Ctrl E', 'Negrito e destaque (ou **texto** e ==texto==)'], ['Ctrl Enter  ·  Ctrl Z', 'Salvar os cartões; desfazer']] },
  { grupo: 'Agenda', itens: [['N  ·  T', 'Novo item (no dia e hora do foco) · voltar para hoje'], ['[  ]  ou  Page Up  Page Down', 'Semana ou mês anterior e seguinte (Esc fecha a gaveta de cadastro)']] },
  { grupo: 'Acervo e Treino', itens: [['Alt C  (no Acervo)', 'Criar cartões: abre a Mesa com o bloco Cartões'], ['Espaço  ·  1 2 3 4  ·  Esc', 'No treino: mostrar o verso, responder, sair']] },
];
