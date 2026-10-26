// Menu "⋯": lista de botões grandes ao lado de um botão âncora. Fecha ao escolher, tocar fora ou apertar Esc.
// itens: [{ rotulo, fazer, perigo?, marcado?, sep? }]. Abrir o mesmo botão de novo fecha.
let aberto = null;
export function fecharMenu() { if (aberto) { aberto.fechar(); aberto = null; } }
export function abrirMenu(ancora, itens) {
  if (aberto && aberto.ancora === ancora) { fecharMenu(); return; }
  fecharMenu();
  const m = document.createElement('div'); m.className = 'menu-pop'; m.setAttribute('role', 'menu');
  for (const it of itens) {
    if (it.sep) { m.appendChild(Object.assign(document.createElement('hr'), {})); continue; }
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.className = 'mi' + (it.perigo ? ' perigo' : '') + (it.marcado ? ' on' : '');
    b.textContent = (it.marcado ? '✓ ' : '') + it.rotulo;
    b.onclick = () => { fecharMenu(); it.fazer?.(); };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = ancora.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  const fora = (e) => { if (!m.contains(e.target) && !ancora.contains(e.target)) fecharMenu(); };
  const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fecharMenu(); ancora.focus(); } };
  setTimeout(() => document.addEventListener('pointerdown', fora, true));
  document.addEventListener('keydown', tecla, true);
  ancora.setAttribute('aria-expanded', 'true'); m.querySelector('.mi')?.focus();
  aberto = { ancora, fechar() { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', tecla, true); ancora.setAttribute('aria-expanded', 'false'); m.remove(); } };
}
