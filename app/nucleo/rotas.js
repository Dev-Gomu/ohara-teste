// Núcleo (regras puras, sem I/O): telas do app e leitura do endereço (#hoje, #materias, #aula/7, #ajustes...).

/** O menu de cima, na ordem (Alt 1 … Alt 6): Hub (Hoje), Mesa (Área de trabalho), Acervo (Biblioteca: matérias e todos os cartões), Treino (Revisor), Agenda (Planejar), Configs (Ajustes). "area" abre a Mesa de uma aula. */
export const TELAS = [
  { chave: 'hoje', nome: 'Hub' },
  { chave: 'area', nome: 'Mesa' },
  { chave: 'materias', nome: 'Acervo' },
  { chave: 'revisor', nome: 'Treino' },
  { chave: 'planejar', nome: 'Agenda' },
  { chave: 'ajustes', nome: 'Configs' },
];

/** Telas que existem mas não têm botão no menu: a que fica destacada no menu enquanto elas estão abertas. */
export const TELAS_FORA_DO_MENU = { foco: 'hoje', painel: 'hoje', cartoes: 'materias' };

export const TELA_INICIAL = 'hoje';

/** "#materias" → "materias". Endereço vazio ou desconhecido cai na tela inicial. */
export function telaDoEndereco(hash) {
  const chave = String(hash ?? '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return TELAS.some((t) => t.chave === chave) || Object.hasOwn(TELAS_FORA_DO_MENU, chave) ? chave : TELA_INICIAL;
}

/**
 * Lê o endereço completo: #materias (Biblioteca), #materias/3 (aulas da matéria 3), #cartoes (Biblioteca, todos os cartões),
 * #aula/7 ou #aula/7?cartoes (Área de trabalho da aula 7, com o bloco pedido aberto), #area (abre a aula certa da Área de trabalho),
 * #foco/5 (Sala de Foco com a tarefa 5), #revisor, #planejar. `menu` é a entrada do menu que fica destacada naquela tela.
 */
export function rotaDoEndereco(hash) {
  const bruto = String(hash ?? '').replace(/^#\/?/, ''), [caminho, consulta = ''] = bruto.split('?');
  const [chave, id] = caminho.split('/');
  const n = /^\d+$/.test(id ?? '') ? Number(id) : null;
  if (chave === 'materias' && n !== null) return { tela: 'materia', id: n, menu: 'materias' };
  if (chave === 'foco' && n !== null) return { tela: 'foco', id: n, menu: TELAS_FORA_DO_MENU.foco };
  if (chave === 'aula' && n !== null) return { tela: 'area', id: n, menu: 'area', abrir: ['slides', 'anotacoes', 'cartoes'].includes(consulta) ? consulta : null };
  if (chave === 'area') return { tela: 'area-atalho', id: null, menu: 'area' };
  const tela = telaDoEndereco(hash);
  return { tela, id: null, menu: TELAS_FORA_DO_MENU[tela] ?? tela };
}

export const TEMAS = ['claro', 'escuro'];

/** Tema guardado, se for válido; senão o do sistema (`sistemaEscuro` = prefers-color-scheme: dark). */
export function escolherTema(guardado, sistemaEscuro) {
  return TEMAS.includes(guardado) ? guardado : sistemaEscuro ? 'escuro' : 'claro';
}

export const outroTema = (tema) => (tema === 'claro' ? 'escuro' : 'claro');
