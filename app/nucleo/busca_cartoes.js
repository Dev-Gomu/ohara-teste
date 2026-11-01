// Núcleo (regras puras, sem I/O): busca avançada de cartões no Gerenciar.
// Sintaxe: palavras soltas (todas precisam aparecer na frente, no verso ou nas etiquetas, sem diferenciar acento nem maiúscula),
// "frase exata", -palavra (exclui) e filtros campo:valor:
//   frente: verso: etiqueta: aula: materia:   texto contido no campo
//   marcado:sim · imagem:sim                   cartões marcados / com imagem
//   treino:novo|vencido|emdia                  situação na revisão do Treino
//   anki:novo|alterado|enviado                 situação no envio ao Anki
//   criado:>AAAA-MM-DD  (também <, >=, <=, ou só a data)   quando foi criado
//   erros:>=N                                  quantas vezes foi errado depois de aprendido (lapsos)
import { imagensDoCartao } from './materias.js';

export const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*=#@]/g, '').toLowerCase();
const CAMPOS_TEXTO = new Set(['frente', 'verso', 'etiqueta', 'tag', 'aula', 'materia']);
const CAMPOS = new Set([...CAMPOS_TEXTO, 'marcado', 'imagem', 'treino', 'anki', 'criado', 'erros']);
const AJUDA = 'frente: verso: etiqueta: aula: materia: · marcado:sim · imagem:sim · treino:novo|vencido|emdia · anki:novo|alterado|enviado · criado:>2026-10-01 · erros:>=2 · "frase exata" · -excluir';
export const ajudaDaBusca = () => AJUDA;

/** Divide em pedaços respeitando aspas: [{ neg, campo, valor }]. */
export function lerConsulta(texto) {
  const saida = [], re = /(-?)(?:([a-zA-ZçÇ]+):)?(?:"([^"]*)"|(\S+))/g;
  let m;
  while ((m = re.exec(String(texto ?? '')))) {
    let campo = m[2] ? norm(m[2]) : null, valor = m[3] ?? m[4] ?? '';
    if (campo && !CAMPOS.has(campo)) { valor = `${m[2]}:${valor}`; campo = null; }      // "10:30" ou "dr:smith" viram texto comum
    if (!valor.length && !campo) continue;
    saida.push({ neg: m[1] === '-', campo: campo === 'tag' ? 'etiqueta' : campo, valor });
  }
  return saida;
}

function comparar(valor, op, alvo) {
  if (op === '>') return valor > alvo; if (op === '<') return valor < alvo; if (op === '>=') return valor >= alvo; if (op === '<=') return valor <= alvo;
  return valor === alvo;
}
const lerOp = (v) => { const m = /^(>=|<=|>|<|=)?\s*(.*)$/.exec(v.trim()); return { op: m[1] === '=' ? '' : (m[1] ?? ''), alvo: m[2] }; };

/**
 * `itens`: [{ cartao, aula, disciplina }]. `ctx`: { revisoes: [...], hoje: 'AAAA-MM-DD' }. Devolve só os que combinam com TODOS os termos.
 */
export function filtrarCartoes(itens, consulta, ctx = {}) {
  const termos = lerConsulta(consulta);
  if (!termos.length) return itens;
  const revs = new Map((ctx.revisoes ?? []).map((r) => [r.cartao_id, r]));
  const casa = ({ cartao: c, aula, disciplina: d }, t) => {
    const v = norm(t.valor);
    if (!t.campo) return norm(`${c.frente}\n${c.verso}\n${c.etiquetas}`).includes(v);
    if (t.campo === 'frente') return norm(c.frente).includes(v);
    if (t.campo === 'verso') return norm(c.verso).includes(v);
    if (t.campo === 'etiqueta') return norm(c.etiquetas).includes(v);
    if (t.campo === 'aula') return norm(aula.titulo).includes(v);
    if (t.campo === 'materia') return norm(`${d.nome} ${d.sigla ?? ''}`).includes(v);
    const sim = ['sim', 's', '1', 'true', 'yes'].includes(v);
    if (t.campo === 'marcado') return sim === !!c.marcado;
    if (t.campo === 'imagem') { const n = imagensDoCartao(c); return sim === (n.frente + n.verso > 0); }
    if (t.campo === 'treino') { const r = revs.get(c.id); return v === 'novo' ? !r : v === 'vencido' ? !!r && r.vence_dia <= (ctx.hoje ?? '') : v === 'emdia' ? !!r && r.vence_dia > (ctx.hoje ?? '') : false; }
    if (t.campo === 'anki') return v === 'novo' ? !c.exportado_em : v === 'alterado' ? !!c.exportado_em && c.atualizado_em > c.exportado_em : v === 'enviado' ? !!c.exportado_em && c.atualizado_em <= c.exportado_em : false;
    if (t.campo === 'criado') { const { op, alvo } = lerOp(t.valor); const dia = String(c.criado_em ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(alvo) && comparar(dia, op, alvo); }
    if (t.campo === 'erros') { const { op, alvo } = lerOp(t.valor); const n = Number(alvo); return Number.isFinite(n) && comparar(revs.get(c.id)?.lapsos ?? 0, op, n); }
    return true;
  };
  return itens.filter((it) => termos.every((t) => casa(it, t) !== t.neg));
}
