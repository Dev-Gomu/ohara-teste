// Núcleo (regras puras): as "zonas" de cada tela, para o teclado andar como na Mesa (Tab salta de zona, Enter entra, Esc sobe).
// Cada tela diz quais regiões (cartões, colunas, faixas) são zonas por seletores CSS; a casca (ui/zonas.js) marca esses elementos.
// A Mesa não está aqui: os blocos dela já são zonas (.mo-bloco).

/** { chave da tela (html[data-tela]): [{ sel, nome, topo?, base?, rotulo? }  (rotulo: 'titulo' = o nome falado vem do título h2 ou summary da zona)] }. `topo`/`base`: seletores (dentro da zona) da barra de cima e da de baixo; sem eles vale o primeiro e o último controle. */
export const ZONAS = {
  hoje: [
    { sel: '.hj .hprov', nome: 'Próximas provas', topo: '.hph' },
    { sel: '.hj .hcal', nome: 'Calendário', topo: '.hcab' },
    { sel: '.hj .hag', nome: 'Agenda', topo: '.hcab' },
    { sel: '.hj .hlem', nome: 'Lembretes de hoje', topo: '.hcab', base: '.hlrod' },
  ],
  // o Acervo, a matéria e o Gerenciar cartões dividem a chave "materias": cada seletor só acha o que existe na tela aberta
  materias: [
    { sel: '.fc-materias .mcs', nome: 'Matérias' },
    { sel: '.mt-pastas', nome: 'Pastas' },
    { sel: '.mt-datas', nome: 'Datas' },
    { sel: '.mt-lista', nome: 'Aulas' },
    { sel: '.mt-painel', nome: 'Aula selecionada' },
    { sel: '.mt-cartoes', nome: 'Cartões da matéria' },
    { sel: '.gc-cols > *', nome: 'Gerenciar cartões' },
  ],
  planejar: [
    { sel: '.ag-tr > .card', nome: 'Painel lateral', rotulo: 'titulo' },
    { sel: '.ag-main', nome: 'Agenda' },
    { sel: '.ag-gav', nome: 'Cadastro' },
  ],
  revisor: [{ sel: '.tr-ent', nome: 'Treino' }, { sel: '.tr-cv', nome: 'Cartão' }],
  ajustes: [{ sel: 'main > .card.bloco', nome: 'Seção', rotulo: 'titulo' }],
};

export const zonasDaTela = (tela) => ZONAS[tela] ?? [];
