// Núcleo (regras puras, sem I/O): cartões de estudo (flashcards). Ligados a uma aula (e, por ela, à matéria) e, se quiser, à
// página do slide. A revisão é no Anki; aqui só se produz e se exporta. O `guid` nunca muda: é o que o Anki usa para saber
// que reenviar um cartão é atualizar, não duplicar. Exclusão vai para a lixeira.
import { ativas } from './materias.js';

export const LIMITE_TEXTO = 2000;
export const LIMITE_IMAGEM_BYTES = 5 * 1048576;

const limpar = (t) => String(t ?? '').replace(/\r\n?/g, '\n').trim();

/** Etiquetas: separadas por espaço, vírgula ou ponto e vírgula; sem espaços dentro (o Anki não aceita); sem repetir. */
export function normalizarEtiquetas(texto) {
  const lista = (Array.isArray(texto) ? texto : String(texto ?? '').split(/[\s,;]+/)).map((t) => t.trim().replace(/::+/g, '_').toLowerCase()).filter(Boolean);
  return [...new Set(lista)].join(' ');
}

function validar({ frente, verso }) {
  const f = limpar(frente), v = limpar(verso);
  if (!f) throw new Error('Escreva a frente do cartão.');
  if (!v) throw new Error('Escreva o verso do cartão.');
  if (f.length > LIMITE_TEXTO || v.length > LIMITE_TEXTO) throw new Error(`Cada lado do cartão pode ter até ${LIMITE_TEXTO} letras.`);
  return { frente: f, verso: v };
}

const proximoId = (lista) => lista.reduce((m, x) => Math.max(m, x.id), 0) + 1;

/** `marcadorId`: o "marcado na aula" que virou cartão; ele sai da lista de marcados. */
export function criarCartao(estado, aulaId, { frente, verso, pagina = null, etiquetas = '', temImagem = false, marcadorId = null }, agora, guid) {
  if (!ativas(estado.aulas).some((a) => a.id === aulaId)) throw new Error('A aula não existe.');
  const base = validar({ frente, verso });
  const id = proximoId(estado.cartoes);
  const cartao = { id, aula_id: aulaId, pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : null, ...base, etiquetas: normalizarEtiquetas(etiquetas),
    tem_imagem: temImagem ? 1 : 0, guid: guid ?? `ohara-${id}-${Date.parse(agora) || 0}`, criado_em: agora, atualizado_em: agora, exportado_em: null, excluido_em: null };
  const marcadores = marcadorId == null ? estado.marcadores : estado.marcadores.map((m) => (m.id === marcadorId && !m.excluido_em ? { ...m, excluido_em: agora } : m));
  return { estado: { ...estado, cartoes: [...estado.cartoes, cartao], marcadores }, cartao };
}

export function alterarCartao(estado, id, { frente, verso, etiquetas, pagina, temImagem }, agora) {
  const atual = estado.cartoes.find((c) => c.id === id && !c.excluido_em);
  if (!atual) throw new Error('Cartão não encontrado.');
  const base = validar({ frente: frente ?? atual.frente, verso: verso ?? atual.verso });
  const novo = { ...atual, ...base, etiquetas: etiquetas === undefined ? atual.etiquetas : normalizarEtiquetas(etiquetas),
    pagina: pagina === undefined ? atual.pagina : (Number.isInteger(pagina) && pagina > 0 ? pagina : null), tem_imagem: temImagem === undefined ? atual.tem_imagem : (temImagem ? 1 : 0), atualizado_em: agora };
  return { ...estado, cartoes: estado.cartoes.map((c) => (c.id === id ? novo : c)) };
}

export function excluirCartao(estado, id, agora) {
  if (!estado.cartoes.some((c) => c.id === id && !c.excluido_em)) throw new Error('Cartão não encontrado.');
  return { ...estado, cartoes: estado.cartoes.map((c) => (c.id === id ? { ...c, excluido_em: agora } : c)) };
}

export function restaurarCartao(estado, id) {
  const c = estado.cartoes.find((x) => x.id === id);
  if (!c || !c.excluido_em) throw new Error('Esse cartão não está na lixeira.');
  if (!ativas(estado.aulas).some((a) => a.id === c.aula_id)) throw new Error('Restaure a aula antes de restaurar o cartão.');
  return { ...estado, cartoes: estado.cartoes.map((x) => (x.id === id ? { ...x, excluido_em: null } : x)) };
}

export const cartoesDaAula = (estado, aulaId) => ativas(estado.cartoes).filter((c) => c.aula_id === aulaId).sort((a, b) => a.id - b.id);

/** Cartões que valem exportar (de aula e matéria ativas), com a matéria e a aula de cada um. */
export function cartoesParaExportar(estado, { aulaId = null, disciplinaId = null, ids = null } = {}) {
  const mats = new Map(ativas(estado.disciplinas).map((d) => [d.id, d])), aulas = new Map(ativas(estado.aulas).filter((a) => mats.has(a.disciplina_id)).map((a) => [a.id, a]));
  return ativas(estado.cartoes).filter((c) => aulas.has(c.aula_id) && (aulaId == null || c.aula_id === aulaId) && (disciplinaId == null || aulas.get(c.aula_id).disciplina_id === disciplinaId) && (ids == null || ids.includes(c.id)))
    .map((c) => ({ cartao: c, aula: aulas.get(c.aula_id), disciplina: mats.get(aulas.get(c.aula_id).disciplina_id) })).sort((a, b) => a.cartao.id - b.cartao.id);
}

export function marcarExportados(estado, ids, agora) {
  const s = new Set(ids);
  return { ...estado, cartoes: estado.cartoes.map((c) => (s.has(c.id) ? { ...c, exportado_em: agora } : c)) };
}

/** Cartões novos ou alterados desde o último envio ao Anki. */
export const pendentesDeEnvio = (cartoes) => cartoes.filter((c) => !c.exportado_em || c.atualizado_em > c.exportado_em);

/**
 * Importação em texto: uma linha por cartão, `Frente :: Verso` ou `Frente :: Verso :: etiquetas`. Linhas em branco são ignoradas;
 * linha sem `::` ou com lado vazio e frente que já existe na aula são devolvidas em `ignorados` com o motivo (nada some em silêncio).
 */
export function importarTexto(estado, aulaId, texto, agora, novoGuid = () => undefined) {
  let e = estado; const criados = [], ignorados = [];
  const existentes = new Set(cartoesDaAula(estado, aulaId).map((c) => c.frente.toLocaleLowerCase('pt-BR')));
  limpar(texto).split('\n').forEach((linha, i) => {
    if (!linha.trim()) return;
    const partes = linha.split('::').map((p) => p.trim());
    if (partes.length < 2) { ignorados.push({ linha: i + 1, texto: linha, motivo: 'faltou o separador "::"' }); return; }
    if (partes.length > 3) { ignorados.push({ linha: i + 1, texto: linha, motivo: 'tem mais de dois separadores "::"' }); return; }
    const [frente, verso, etiquetas = ''] = partes;
    if (!frente || !verso) { ignorados.push({ linha: i + 1, texto: linha, motivo: 'frente ou verso vazio' }); return; }
    const chave = frente.toLocaleLowerCase('pt-BR');
    if (existentes.has(chave)) { ignorados.push({ linha: i + 1, texto: linha, motivo: 'já existe um cartão com essa frente nesta aula' }); return; }
    try { const r = criarCartao(e, aulaId, { frente, verso, etiquetas }, agora, novoGuid()); e = r.estado; criados.push(r.cartao); existentes.add(chave); }
    catch (err) { ignorados.push({ linha: i + 1, texto: linha, motivo: err.message }); }
  });
  return { estado: e, criados, ignorados };
}
