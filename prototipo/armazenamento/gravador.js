// Grava o banco com atraso (debounce): várias alterações seguidas viram uma gravação só.
// `exportar` devolve os bytes do banco; `descarregar()` grava já (usar ao fechar/esconder a página).
// Se a gravação falhar, o erro vai para `aoFalhar` e a alteração volta a ficar pendente. `aoGravar` avisa que gravou (a sincronia usa isso).

export function criarGravador(armazenamento, exportar, { atrasoMs = 1500, aoFalhar = () => {}, aoGravar = () => {}, timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) } } = {}) {
  let tempo = null;
  let pendente = false;
  let emCurso = Promise.resolve();

  async function gravar() {
    if (!pendente) return;
    pendente = false;
    try { await armazenamento.gravarBanco(exportar()); aoGravar(); }
    catch (e) { pendente = true; aoFalhar(e); }
  }

  return {
    get pendente() { return pendente; },
    /** Avisa que o banco mudou; a gravação sai depois do atraso, contado a partir da última alteração. */
    agendar() {
      pendente = true;
      if (tempo !== null) timers.clear(tempo);
      tempo = timers.set(() => { tempo = null; emCurso = emCurso.then(gravar); }, atrasoMs);
    },
    /** Grava agora, se houver algo pendente, e espera terminar. */
    descarregar() {
      if (tempo !== null) { timers.clear(tempo); tempo = null; }
      emCurso = emCurso.then(gravar);
      return emCurso;
    },
  };
}
