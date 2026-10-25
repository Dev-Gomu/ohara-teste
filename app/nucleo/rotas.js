// Núcleo (regras puras, sem I/O): telas do app e leitura do endereço (#hoje, #materias, #ajustes).

export const TELAS = [
  { chave: 'hoje', nome: 'Hoje' },
  { chave: 'materias', nome: 'Matérias' },
  { chave: 'ajustes', nome: 'Ajustes' },
];

export const TELA_INICIAL = 'hoje';

/** "#materias" → "materias". Endereço vazio ou desconhecido cai na tela inicial. */
export function telaDoEndereco(hash) {
  const chave = String(hash ?? '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return TELAS.some((t) => t.chave === chave) ? chave : TELA_INICIAL;
}

/**
 * Lê o endereço completo: #materias, #materias/3 (aulas da matéria 3), #aula/7 (aula 7).
 * `menu` é a entrada do menu que fica destacada naquela tela.
 */
export function rotaDoEndereco(hash) {
  const [chave, id] = String(hash ?? '').replace(/^#\/?/, '').split('?')[0].split('/');
  const n = /^\d+$/.test(id ?? '') ? Number(id) : null;
  if (chave === 'materias' && n !== null) return { tela: 'materia', id: n, menu: 'materias' };
  if (chave === 'aula' && n !== null) return { tela: 'aula', id: n, menu: 'materias' };
  const tela = telaDoEndereco(hash);
  return { tela, id: null, menu: tela };
}

export const TEMAS = ['claro', 'escuro'];

/** Tema guardado, se for válido; senão o do sistema (`sistemaEscuro` = prefers-color-scheme: dark). */
export function escolherTema(guardado, sistemaEscuro) {
  return TEMAS.includes(guardado) ? guardado : sistemaEscuro ? 'escuro' : 'claro';
}

export const outroTema = (tema) => (tema === 'claro' ? 'escuro' : 'claro');
