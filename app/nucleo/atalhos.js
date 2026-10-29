// Núcleo (regra pura): nome padrão de uma combinação de teclas, para os atalhos poderem ser escritos como texto
// ("Alt+KeyS", "Ctrl+Enter", "Space"). Letras, números e sinais usam a tecla física (e.code), para valer em qualquer layout;
// o resto (Enter, Tab, Escape, setas) usa e.key. A tecla Command do Mac conta como Ctrl.
const FISICAS = /^(Key[A-Z]|Digit\d|Numpad\d|Bracket(Left|Right)|Comma|Period|Slash|Backslash|Space|Minus|Equal|Backquote|Semicolon|Quote)$/;

/** `e`: { key, code, ctrlKey, metaKey, altKey, shiftKey }. Ordem fixa dos modificadores: Ctrl, Alt, Shift. */
export function combinacao(e) {
  const tecla = FISICAS.test(e.code ?? '') ? e.code : e.key;
  return [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', tecla].filter(Boolean).join('+');
}
