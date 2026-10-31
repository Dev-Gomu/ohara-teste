// Lista de "salvar já" que as telas registram (ex.: o texto das anotações ainda no atraso de 600 ms).
// A sessão chama descarregarPendencias() antes de backup e sincronia, para nada ficar de fora. Sem DOM.
const itens = new Set();

/** Registra uma função que grava o que estiver pendente. Devolve a função que desfaz o registro. */
export function registrarPendencia(fn) { itens.add(fn); return () => itens.delete(fn); }

/** Chama todas; uma que falha não impede as outras. Devolve quantas falharam. */
export function descarregarPendencias() {
  let falhas = 0;
  for (const f of [...itens]) { try { f(); } catch { falhas++; } }
  return falhas;
}
