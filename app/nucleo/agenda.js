// Núcleo (regras puras, sem I/O): transforma as ocorrências lidas de um .ics em aulas, sem duplicar.
import { criarAula } from './aulas.js';
import { ativas } from './materias.js';
import { normalizarNome } from './texto.js';

export const chaveDoTitulo = (titulo) => normalizarNome(titulo).toLocaleLowerCase('pt-BR');

/**
 * `escolhas`: Map chaveDoTitulo → id da matéria (null/ausente = ignorar esse título).
 * Quem já foi importado antes (mesma chave, mesmo que a aula tenha ido para a lixeira) não é criado de novo.
 * Devolve { estado, criadas, jaExistiam, semMateria } (contagens e a lista de títulos sem matéria).
 */
export function importarOcorrencias(estado, ocorrencias, escolhas, agora) {
  const conhecidas = new Set(estado.aulas.map((a) => a.ics_uid).filter(Boolean));
  const mats = new Set(ativas(estado.disciplinas).map((d) => d.id));
  let e = estado, criadas = 0, jaExistiam = 0; const semMateria = new Set();
  for (const o of ocorrencias) {
    const disc = escolhas.get(chaveDoTitulo(o.titulo));
    if (!disc || !mats.has(disc)) { semMateria.add(o.titulo); continue; }
    if (conhecidas.has(o.chave)) { jaExistiam++; continue; }
    e = criarAula(e, disc, { titulo: o.titulo || 'Aula', tipo: 'aula', inicio: o.inicio, fim: o.fim }, agora, o.chave).estado;
    conhecidas.add(o.chave); criadas++;
  }
  return { estado: e, criadas, jaExistiam, semMateria: [...semMateria] };
}

/** Agrupa as ocorrências por título (uma matéria para todas as aulas do mesmo nome): [{ chave, titulo, quantidade, primeira }]. */
export function agruparPorTitulo(ocorrencias) {
  const m = new Map();
  for (const o of ocorrencias) { const k = chaveDoTitulo(o.titulo); const g = m.get(k) ?? { chave: k, titulo: o.titulo, quantidade: 0, primeira: o.inicio }; g.quantidade++; m.set(k, g); }
  return [...m.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt'));
}
