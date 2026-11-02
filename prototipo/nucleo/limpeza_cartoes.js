// Núcleo (regras puras, sem I/O): limpeza dos cartões, para o Gerenciar. Acha duplicados (mesma frente) e cartões vazios
// (sem texto de verdade, só marcas). Só mostra; quem apaga é o usuário, e vai para a lixeira.
import { ativas } from './materias.js';
import { norm } from './busca_cartoes.js';

const miolo = (t) => norm(t).replace(/[^a-z0-9À-ɏ]+/g, ' ').trim().replace(/\s+/g, ' ');

/** Os cartões vivos (de aula e matéria vivas) com a aula e a matéria de cada um. */
function itensVivos(estado) {
  const mats = new Map(ativas(estado.disciplinas).map((d) => [d.id, d])), aulas = new Map(ativas(estado.aulas).filter((a) => mats.has(a.disciplina_id)).map((a) => [a.id, a]));
  return ativas(estado.cartoes ?? []).filter((c) => aulas.has(c.aula_id)).map((c) => ({ cartao: c, aula: aulas.get(c.aula_id), disciplina: mats.get(aulas.get(c.aula_id).disciplina_id) }));
}

/**
 * Grupos de cartões com a mesma frente (ignorando maiúsculas, acentos, pontuação e marcas). Cada grupo vem do mais antigo ao mais novo,
 * e `iguais` diz se o verso também é igual (duplicado de verdade) ou só a pergunta se repete (talvez cartões diferentes).
 */
export function acharDuplicados(estado) {
  const mapa = new Map();
  for (const it of itensVivos(estado)) { const k = miolo(it.cartao.frente); if (!k) continue; mapa.set(k, [...(mapa.get(k) ?? []), it]); }
  return [...mapa.values()].filter((g) => g.length > 1).map((g) => {
    const itens = g.sort((a, b) => a.cartao.id - b.cartao.id);
    return { chave: miolo(itens[0].cartao.frente), itens, iguais: new Set(itens.map((i) => miolo(i.cartao.verso))).size === 1 };
  }).sort((a, b) => Number(b.iguais) - Number(a.iguais) || b.itens.length - a.itens.length || a.chave.localeCompare(b.chave, 'pt-BR'));
}

/** Cartões cuja frente ou cujo verso não tem texto de verdade (só espaços ou marcas como "#", "-", "(+)"). */
export function cartoesVazios(estado) {
  const vazio = (t) => !miolo(String(t ?? '').replace(/\(\s*[+\-?]\s*\)/g, ' '));
  return itensVivos(estado).filter(({ cartao: c }) => vazio(c.frente) || vazio(c.verso)).map((it) => ({ ...it, lado: vazio(it.cartao.frente) ? 'frente' : 'verso' }));
}
