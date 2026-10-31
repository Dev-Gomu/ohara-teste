// Núcleo (regras puras, sem I/O): troca de dados entre aparelhos (tablet ↔ PC). Cada aparelho tem a sua cópia; a troca é um pacote
// (.zip) que leva o estado inteiro. Para saber se dá para simplesmente substituir ou se os dois mudaram, cada aparelho guarda
// "marcos": as impressões digitais dos estados em que já trocou. Se o estado atual daqui é um marco que o pacote conhece, o
// pacote descende do que temos e substitui sem perder nada; senão, os dois mudaram e é conflito (as duas versões ficam guardadas).

export const MARCOS_MAX = 30;

/** Config que é só deste aparelho (não conta como mudança de conteúdo). */
export const CONFIG_LOCAL = new Set(['foco_ativo', 'ultimo_backup', 'inicio_uso']);

/**
 * O que identifica o conteúdo do estado. Fica de fora o que muda sem o usuário ter mudado nada de verdade: o plano ainda não feito
 * (é recalculado todo dia), a data do último envio ao Anki e o estado do cronômetro.
 * `configLinhas`: [[chave, valor], ...].
 */
export function conteudoParaImpressao(estado, configLinhas = []) {
  return JSON.stringify({
    disciplinas: estado.disciplinas, aulas: estado.aulas, arquivos: estado.arquivos, marcadores: estado.marcadores, blocos: estado.blocos, provas: estado.provas, pastas: estado.pastas ?? [],
    tarefas: estado.tarefas.filter((t) => t.feita_em).map((t) => [t.chave, t.feita_em]),
    cartoes: estado.cartoes.map(({ exportado_em, ...resto }) => resto),
    config: configLinhas.filter(([k]) => !CONFIG_LOCAL.has(k)).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  });
}

/** Junta listas de marcos sem repetir, mantendo os mais recentes (os do fim). */
export function unirMarcos(...listas) {
  const vistos = new Set(), saida = [];
  for (const m of listas.flat().reverse()) if (m && !vistos.has(m)) { vistos.add(m); saida.push(m); }
  return saida.slice(0, MARCOS_MAX).reverse();
}

/** O aparelho está "vazio" se não tem nada que o usuário tenha criado. */
export const estadoVazio = (estado) => !estado.disciplinas.length && !estado.aulas.length && !estado.cartoes.length && !estado.provas.length && !estado.blocos.length;

/**
 * Decide o que fazer com um pacote recebido.
 * `local`: { impressao, marcos, vazio }. `pacote`: { impressao, marcos }.
 * Devolve { acao: 'igual' | 'nada_novo' | 'substituir' | 'conflito', motivo }.
 */
export function decidirTroca(local, pacote) {
  if (local.impressao === pacote.impressao) return { acao: 'igual', motivo: 'Os dois aparelhos já estão iguais.' };
  if (local.vazio) return { acao: 'substituir', motivo: 'Este aparelho ainda está vazio: ele recebe tudo do pacote.' };
  if (local.marcos.includes(pacote.impressao)) return { acao: 'nada_novo', motivo: 'Você já tem tudo o que este pacote traz (e mudou coisas depois). Envie os dados daqui para o outro aparelho.' };
  if (pacote.marcos.includes(local.impressao)) return { acao: 'substituir', motivo: 'Nada mudou aqui desde a última troca: o pacote só traz novidades.' };
  return { acao: 'conflito', motivo: 'Os dois aparelhos mudaram desde a última troca (ou é a primeira troca entre eles).' };
}

/**
 * Marcos depois de uma troca. `escolha`: 'pacote' (ficou o do pacote), 'meu' (ficou o daqui; o pacote é dado como visto) ou 'envio' (acabou
 * de gerar um pacote). `novaImpressao`: impressão do estado depois da troca.
 */
export function marcosDepoisDaTroca(local, pacote, escolha, novaImpressao) {
  if (escolha === 'envio') return unirMarcos(local.marcos, [local.impressao]);
  if (escolha === 'meu') return unirMarcos(pacote.marcos, local.marcos, [pacote.impressao, local.impressao]);
  return unirMarcos(local.marcos, pacote.marcos, [local.impressao, pacote.impressao, novaImpressao]);
}

/** Nome do aparelho para mostrar ("Tablet", "Computador"), a partir do que o navegador diz. */
export function nomeDoAparelho(userAgent = '') {
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? 'Celular' : 'Tablet';
  if (/iPad|Tablet/i.test(userAgent)) return 'Tablet';
  return 'Computador';
}

/** Conteúdos (PDFs e imagens de cartão) que o estado cita e que não estão nem no pacote nem neste aparelho. */
export function arquivosQueFaltam(estado, idsPresentes, chaveImagemCartao, chavesDoCartao = null) {
  const tem = new Set(idsPresentes.map(Number));
  const faltam = [];
  for (const a of estado.arquivos) if (!a.excluido_em && !tem.has(a.id)) faltam.push(a.id);
  for (const c of estado.cartoes) {
    if (c.excluido_em) continue;
    const chaves = chavesDoCartao ? chavesDoCartao(c) : (c.tem_imagem ? [chaveImagemCartao(c.id)] : []);
    for (const k of chaves) if (!tem.has(k)) faltam.push(k);
  }
  return faltam;
}
