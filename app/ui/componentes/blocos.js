// Componente: blocos lado a lado (como um gerenciador de janelas em mosaico). O primeiro bloco é o principal e nunca fecha.
// Com 1 bloco ele ocupa tudo; com 2, a divisão é exatamente ao meio; com 3, o principal fica de um lado e os outros dois
// se empilham no outro. O desenho (áreas da grade) está em estilos/componentes/blocos.css, ligado por atributos data-*.
// Não conhece tela nenhuma: a tela diz quais blocos existem e o que cada um mostra.
/**
 * `grade`: o elemento que contém os blocos. `blocos`: { nome: elemento } (o primeiro nome é o principal).
 * Devolve { abrir, fechar, alternar, ampliar, trocarLado, moverFoco, abertos, comFoco, focar }.
 */
export function criarBlocos(grade, { blocos, aoMudar = () => {} }) {
  const nomes = Object.keys(blocos), principal = nomes[0], estado = { abertos: new Set([principal]), lado: false, zoom: null };
  grade.classList.add('blocos');
  for (const [nome, el] of Object.entries(blocos)) { el.dataset.bloco = nome; if (!el.hasAttribute('tabindex')) el.tabIndex = 0; }
  const abertos = () => nomes.filter((n) => estado.abertos.has(n));
  const comFoco = () => { const el = document.activeElement?.closest?.('[data-bloco]'); return el && blocos[el.dataset.bloco] === el ? el.dataset.bloco : principal; };
  const focar = (nome) => blocos[nome]?.focus();

  function aplicar() {
    const ab = abertos(); let n = 0;
    for (const nome of nomes) {
      const el = blocos[nome], aberto = estado.abertos.has(nome);
      el.hidden = !aberto; el.toggleAttribute('data-ampliado', aberto && estado.zoom === nome);
      if (aberto) el.dataset.area = nome === principal ? 'p' : `s${++n}`;
    }
    grade.dataset.n = String(ab.length); grade.dataset.flip = estado.lado ? '1' : '0';
    if (estado.zoom) grade.dataset.zoom = estado.zoom; else delete grade.dataset.zoom;
    aoMudar(ab);
  }
  function abrir(nome) { if (!blocos[nome] || estado.abertos.has(nome)) return; estado.abertos.add(nome); aplicar(); }
  function fechar(nome) {
    if (nome === principal || !estado.abertos.has(nome)) return false;
    estado.abertos.delete(nome); if (estado.zoom === nome) estado.zoom = null; aplicar(); return true;
  }
  function alternar(nome) { if (estado.abertos.has(nome)) fechar(nome); else abrir(nome); return estado.abertos.has(nome); }
  function ampliar(nome = comFoco()) { estado.zoom = estado.zoom ? null : nome; aplicar(); focar(nome); }
  function trocarLado() { estado.lado = !estado.lado; aplicar(); }
  /** Foco para o bloco vizinho na direção pedida ('esq' | 'dir' | 'cima' | 'baixo'). Devolve se mexeu. */
  function moverFoco(direcao) {
    const ab = abertos(), atual = comFoco();
    if (estado.zoom) {                                           // ampliado: Direita/Baixo avançam, Esquerda/Cima voltam
      const i = ab.indexOf(estado.zoom), novo = ab[(i + (direcao === 'dir' || direcao === 'baixo' ? 1 : ab.length - 1)) % ab.length];
      estado.zoom = novo; aplicar(); focar(novo); return true;
    }
    const c = blocos[atual].getBoundingClientRect(), cx = c.x + c.width / 2, cy = c.y + c.height / 2; let melhor = null, nota = Infinity;
    for (const nome of ab) {
      if (nome === atual) continue;
      const q = blocos[nome].getBoundingClientRect(), dx = q.x + q.width / 2 - cx, dy = q.y + q.height / 2 - cy, horizontal = direcao === 'esq' || direcao === 'dir';
      const principalD = direcao === 'esq' ? -dx : direcao === 'dir' ? dx : direcao === 'cima' ? -dy : dy, lateral = horizontal ? Math.abs(dy) : Math.abs(dx);
      if (principalD > 0 && principalD + 2 * lateral < nota) { nota = principalD + 2 * lateral; melhor = nome; }
    }
    if (melhor) { focar(melhor); return true; }
    return false;
  }
  aplicar();
  return { abrir, fechar, alternar, ampliar, trocarLado, moverFoco, abertos, comFoco, focar, aberto: (n) => estado.abertos.has(n) };
}
