// Núcleo (regras puras, sem I/O): Matérias (disciplinas).
// O estado é { disciplinas, aulas, arquivos, marcadores, blocos, provas, tarefas, cartoes } (listas); cada função devolve um estado novo e nunca altera o recebido.
// Exclusão = lixeira (`excluido_em`). Excluir uma matéria leva as aulas dela junto, com o mesmo instante,
// e restaurar traz de volta só as que foram junto (as que o usuário já tinha excluído antes continuam na lixeira).

import { normalizarNome } from './texto.js';

export const LIMITE_NOME = 80;
const COR = /^#[0-9a-fA-F]{6}$/;

export function estadoVazio() {
  return { disciplinas: [], aulas: [], arquivos: [], marcadores: [], blocos: [], provas: [], tarefas: [], cartoes: [] };
}

export function proximoId(lista) {
  return lista.reduce((m, x) => Math.max(m, x.id), 0) + 1;
}

export const ativas = (lista) => lista.filter((x) => !x.excluido_em);
export const naLixeira = (lista) => lista.filter((x) => x.excluido_em);

/** Valida e devolve o nome limpo, ou lança Error com mensagem para o usuário. `ignorarId` serve para renomear. */
export function validarNomeMateria(estado, nome, ignorarId = null) {
  const limpo = normalizarNome(nome);
  if (!limpo) throw new Error('Dê um nome à matéria.');
  if (limpo.length > LIMITE_NOME) throw new Error(`O nome pode ter no máximo ${LIMITE_NOME} letras.`);
  const chave = limpo.toLocaleLowerCase('pt-BR');
  const repetida = ativas(estado.disciplinas).some((d) => d.id !== ignorarId && d.nome.toLocaleLowerCase('pt-BR') === chave);
  if (repetida) throw new Error('Já existe uma matéria com esse nome.');
  return limpo;
}

export function validarCor(cor) {
  if (!COR.test(String(cor ?? ''))) throw new Error('Cor inválida: use o formato #RRGGBB.');
  return cor.toLowerCase();
}

export function criarMateria(estado, { nome, cor }, agora) {
  const d = { id: proximoId(estado.disciplinas), nome: validarNomeMateria(estado, nome), cor: validarCor(cor), dificuldade: 2, criado_em: agora, excluido_em: null };
  return { estado: { ...estado, disciplinas: [...estado.disciplinas, d] }, materia: d };
}

function trocar(estado, id, mudar) {
  const alvo = estado.disciplinas.find((d) => d.id === id);
  if (!alvo) throw new Error('Matéria não encontrada.');
  return { ...estado, disciplinas: estado.disciplinas.map((d) => (d.id === id ? mudar(d) : d)) };
}

export function validarDificuldade(n) {
  if (![1, 2, 3].includes(Number(n))) throw new Error('A dificuldade vai de 1 (fácil) a 3 (difícil).');
  return Number(n);
}

export function alterarMateria(estado, id, { nome, cor, dificuldade }) {
  return trocar(estado, id, (d) => ({
    ...d,
    nome: nome === undefined ? d.nome : validarNomeMateria(estado, nome, id),
    cor: cor === undefined ? d.cor : validarCor(cor),
    dificuldade: dificuldade === undefined ? (d.dificuldade ?? 2) : validarDificuldade(dificuldade),
  }));
}

export function excluirMateria(estado, id, agora) {
  const d = estado.disciplinas.find((x) => x.id === id);
  if (!d || d.excluido_em) throw new Error('Matéria não encontrada.');
  return {
    ...estado,
    disciplinas: estado.disciplinas.map((x) => (x.id === id ? { ...x, excluido_em: agora } : x)),
    aulas: estado.aulas.map((a) => (a.disciplina_id === id && !a.excluido_em ? { ...a, excluido_em: agora } : a)),
  };
}

export function restaurarMateria(estado, id) {
  const d = estado.disciplinas.find((x) => x.id === id);
  if (!d || !d.excluido_em) throw new Error('Essa matéria não está na lixeira.');
  const instante = d.excluido_em;
  // Se já existe outra ativa com o mesmo nome, a restauração é recusada em vez de criar duplicata.
  validarNomeMateria(estado, d.nome, id);
  return {
    ...estado,
    disciplinas: estado.disciplinas.map((x) => (x.id === id ? { ...x, excluido_em: null } : x)),
    aulas: estado.aulas.map((a) => (a.disciplina_id === id && a.excluido_em === instante ? { ...a, excluido_em: null } : a)),
  };
}

/** Quanto a lixeira tem, para a confirmação "Apagar de vez N matérias, M aulas e K arquivos?". */
export function contarLixeira(estado) {
  return { disciplinas: naLixeira(estado.disciplinas).length, aulas: naLixeira(estado.aulas).length, arquivos: naLixeira(estado.arquivos ?? []).length, cartoes: naLixeira(estado.cartoes ?? []).length, provas: naLixeira(estado.provas ?? []).length };
}

/**
 * Apaga de vez tudo o que está na lixeira (e o que dependia dos itens apagados: aulas de matéria apagada,
 * arquivos e marcadores de aula apagada). Devolve também a contagem e os ids dos arquivos, para o chamador apagar os blobs.
 */
export function esvaziarLixeira(estado) {
  const apagados = contarLixeira(estado);
  const disciplinasFora = new Set(naLixeira(estado.disciplinas).map((d) => d.id));
  const disciplinas = ativas(estado.disciplinas);
  const vivasD = new Set(disciplinas.map((d) => d.id));
  const aulas = ativas(estado.aulas).filter((a) => !disciplinasFora.has(a.disciplina_id));
  const aulasVivas = new Set(aulas.map((a) => a.id));
  const arquivosAntes = estado.arquivos ?? [];
  const arquivos = ativas(arquivosAntes).filter((a) => aulasVivas.has(a.aula_id));
  const vivos = new Set(arquivos.map((a) => a.id));
  const cartoesAntes = estado.cartoes ?? [];
  const cartoes = ativas(cartoesAntes).filter((c) => aulasVivas.has(c.aula_id));
  const cartoesVivos = new Set(cartoes.map((c) => c.id));
  return {
    estado: {
      disciplinas, aulas, arquivos, cartoes,
      marcadores: ativas(estado.marcadores ?? []).filter((m) => aulasVivas.has(m.aula_id)),
      blocos: estado.blocos ?? [],
      provas: ativas(estado.provas ?? []).filter((p) => vivasD.has(p.disciplina_id)),
      tarefas: (estado.tarefas ?? []).filter((t) => !t.excluido_em && vivasD.has(t.disciplina_id) && (t.aula_id == null || aulasVivas.has(t.aula_id))),
    },
    apagados,
    // chaves dos conteúdos guardados à parte (arquivos anexados e imagens de cartões) que deixam de existir
    arquivosApagados: [...arquivosAntes.filter((a) => !vivos.has(a.id)).map((a) => a.id),
      ...cartoesAntes.filter((c) => c.tem_imagem && !cartoesVivos.has(c.id)).map((c) => chaveImagemCartao(c.id))],
  };
}

/** Chave, no armazenamento de conteúdos, da imagem de um cartão (fica acima da faixa dos ids de arquivos anexados). */
export const chaveImagemCartao = (cartaoId) => 1000000 + cartaoId;

// Cores oferecidas ao criar uma matéria. Na tela, cada uma vira a variável do tema (--m1..--m5), que muda no escuro.
export const PALETA = ['#9a5a5e', '#7a8794', '#8a8f78', '#5e7f78', '#8b7aa0', '#5f7fa6', '#a06a8a', '#a8924a'];

/** Valor CSS da cor de uma matéria: a variável do tema se for da paleta, senão o próprio #RRGGBB. */
export function corCss(cor) {
  const i = PALETA.indexOf(String(cor).toLowerCase());
  return i >= 0 ? `var(--m${i + 1})` : cor;
}

/** Primeira cor da paleta ainda não usada por uma matéria ativa; se todas estiverem em uso, recomeça. */
export function proximaCor(estado) {
  const usadas = ativas(estado.disciplinas).map((d) => d.cor);
  return PALETA.find((c) => !usadas.includes(c)) ?? PALETA[usadas.length % PALETA.length];
}

/** O que a tela da lixeira lista: matérias excluídas e aulas excluídas de matérias que continuam ativas
 * (as aulas que saíram junto com uma matéria voltam com ela, então não aparecem sozinhas). */
export function itensDaLixeira(estado) {
  const ativasIds = new Set(ativas(estado.disciplinas).map((d) => d.id));
  const aulasAtivas = new Set(ativas(estado.aulas).filter((a) => ativasIds.has(a.disciplina_id)).map((a) => a.id));
  const porData = (a, b) => b.excluido_em.localeCompare(a.excluido_em);
  return {
    materias: naLixeira(estado.disciplinas).sort(porData),
    aulas: naLixeira(estado.aulas).filter((a) => ativasIds.has(a.disciplina_id)).sort(porData),
    arquivos: naLixeira(estado.arquivos ?? []).filter((f) => aulasAtivas.has(f.aula_id)).sort(porData),
    cartoes: naLixeira(estado.cartoes ?? []).filter((c) => aulasAtivas.has(c.aula_id)).sort(porData),
    provas: naLixeira(estado.provas ?? []).filter((p) => ativasIds.has(p.disciplina_id)).sort(porData),
  };
}
