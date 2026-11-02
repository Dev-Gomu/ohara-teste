// Núcleo (regras puras, sem I/O): lembrete de backup.

export const LIMITE_DIAS = 7;
const DIA = 86400000;

/**
 * Situação do backup. `ultimo` e `agora` são datas ISO (ou null). `temDados` evita cobrar backup de um app vazio.
 * estado: 'nada' (não mostrar aviso), 'ok' (feito há pouco), 'atrasado' (7 dias ou mais) ou 'nunca' (há dados e nenhum backup).
 */
export function situacaoBackup(ultimo, agora, temDados = true, limite = LIMITE_DIAS) {
  if (!ultimo) return temDados ? { estado: 'nunca', dias: null, texto: 'Você ainda não fez backup dos seus dados.' } : { estado: 'nada', dias: null, texto: '' };
  const dias = Math.max(0, Math.floor((new Date(agora) - new Date(ultimo)) / DIA));
  const quando = dias === 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
  return { estado: dias >= limite ? 'atrasado' : 'ok', dias, texto: `Último backup ${quando}.` };
}
