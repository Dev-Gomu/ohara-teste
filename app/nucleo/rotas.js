// Núcleo (regras puras, sem I/O): telas do app e leitura do endereço (#hoje, #materias, #ajustes).

export const TELAS = [
  { chave: 'hoje', nome: 'Hoje' },
  { chave: 'materias', nome: 'Matérias' },
  { chave: 'foco', nome: 'Foco' },
  { chave: 'planejar', nome: 'Planejar' },
  { chave: 'painel', nome: 'Painel' },
  { chave: 'cartoes', nome: 'Cartões' },
  { chave: 'ajustes', nome: 'Ajustes' },
];

export const TELA_INICIAL = 'hoje';

/** "#materias" → "materias". Endereço vazio ou desconhecido cai na tela inicial. */
export function telaDoEndereco(hash) {
  const chave = String(hash ?? '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return TELAS.some((t) => t.chave === chave) ? chave : TELA_INICIAL;
}

/**
 * Lê o endereço completo: #materias, #materias/3 (aulas da matéria 3), #aula/7 (aula 7), #foco/5 (Sala de Foco com a tarefa 5).
 * `menu` é a entrada do menu que fica destacada naquela tela.
 */
export function rotaDoEndereco(hash) {
  const [chave, id] = String(hash ?? '').replace(/^#\/?/, '').split('?')[0].split('/');
  const n = /^\d+$/.test(id ?? '') ? Number(id) : null;
  if (chave === 'materias' && n !== null) return { tela: 'materia', id: n, menu: 'materias' };
  if (chave === 'foco' && n !== null) return { tela: 'foco', id: n, menu: 'foco' };
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

/** Paletas do visual Focus: chave, nome e as duas cores que aparecem na amostra (menu e destaque). */
export const PALETAS = [
  { chave: 'verde', nome: 'Verde clínico', amostra: ['#0B5A44', '#0E8F6A'] },
  { chave: 'floresta', nome: 'Floresta', amostra: ['#1F4D3A', '#2E7D52'] },
  { chave: 'hospital', nome: 'Hospital', amostra: ['#0F6B6B', '#12877F'] },
  { chave: 'grafite', nome: 'Grafite', amostra: ['#1D2420', '#1FA971'] },
];
/** Paleta guardada, se for uma das conhecidas; senão a primeira. */
export const escolherPaleta = (guardada) => (PALETAS.some((p) => p.chave === guardada) ? guardada : PALETAS[0].chave);

/** Visuais do app: o Focus (verde, contorno) e o alternativo Pastas (cinza, sombras e pastas). */
export const VISUAIS = [{ chave: 'focus', nome: 'Focus' }, { chave: 'pastas', nome: 'Pastas' }];
export const escolherVisual = (guardado) => (VISUAIS.some((v) => v.chave === guardado) ? guardado : VISUAIS[0].chave);
