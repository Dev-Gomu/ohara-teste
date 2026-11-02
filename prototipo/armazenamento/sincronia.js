// Sincronia entre aparelhos (tablet ↔ PC) por uma nuvem. Não decide nada sozinha: reaproveita a troca por pacote (armazenamento/troca.js),
// que já sabe se dá para substituir sem perder nada ou se os dois mudaram (conflito: nada é aplicado, quem escolhe é o usuário).
// `nuvem`: { ler() → { bytes, versao } | null, gravar(bytes, versaoEsperada) → versao nova }. Qualquer nuvem serve (Google Drive, uma de teste).
// `troca`: { gerarPacote(), analisarPacote(zip), aplicarPacote(zip, analise, escolha) }, ligado à sessão (ver ui/sincronia.js).
// Uma sincronização por vez: se pedirem outra enquanto uma roda, a segunda espera a primeira e devolve o mesmo resultado.

export class ErroVersao extends Error { constructor() { super('A nuvem mudou enquanto eu enviava.'); this.name = 'ErroVersao'; } }

/** Resultado: { resultado: 'igual' | 'enviado' | 'recebido' | 'conflito', analise?, zip? }. Lança o erro da nuvem (rede, autorização). */
export function criarSincronia({ nuvem, troca, podeReceber = () => true }) {
  let emCurso = null;

  async function enviar(versaoEsperada) {
    const pacote = await troca.gerarPacote();
    await nuvem.gravar(pacote.bytes, versaoEsperada);
  }

  async function uma() {
    const remoto = await nuvem.ler();
    if (!remoto) { await enviar(null); return { resultado: 'enviado' }; }
    const analise = await troca.analisarPacote(remoto.bytes);
    switch (analise.acao) {
      case 'igual': return { resultado: 'igual' };
      case 'nada_novo': {      // a nuvem está atrás deste aparelho: manda o que temos aqui
        await troca.aplicarPacote(remoto.bytes, analise, 'meu');
        await enviar(remoto.versao);
        return { resultado: 'enviado' };
      }
      case 'substituir': {     // a nuvem só tem novidades: recebe (a sessão guarda uma cópia do que havia antes)
        if (!podeReceber()) return { resultado: 'adiado' };
        await troca.aplicarPacote(remoto.bytes, analise, 'pacote');
        return { resultado: 'recebido' };
      }
      default: return { resultado: 'conflito', analise, zip: remoto.bytes };
    }
  }

  return {
    sincronizar() {
      // se a nuvem mudou no meio do envio (outro aparelho gravou), olha de novo uma vez antes de desistir
      if (!emCurso) emCurso = uma().catch((e) => { if (e instanceof ErroVersao) return uma(); throw e; }).finally(() => { emCurso = null; });
      return emCurso;
    },
    get ocupada() { return !!emCurso; },
  };
}
