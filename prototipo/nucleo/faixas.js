// Núcleo (regra pura): como blocos de horário que se sobrepõem dividem a largura do dia. Quem começa antes ocupa a primeira faixa; quem
// começa durante outro vai para a próxima faixa livre; todos os blocos de um mesmo "enroscado" ficam com a mesma largura.
// `blocos`: [{ ini, fim }] em minutos. Devolve, na mesma ordem, [{ faixa, de }]: a posição (0…de-1) e em quantas faixas o grupo se divide.
export function distribuirFaixas(blocos) {
  const ordem = blocos.map((b, i) => i).sort((a, b) => blocos[a].ini - blocos[b].ini || blocos[b].fim - blocos[a].fim || a - b);
  const saida = new Array(blocos.length);
  let grupo = [], fimDoGrupo = -Infinity, fins = [];
  const fechar = () => { for (const i of grupo) saida[i].de = fins.length; grupo = []; fins = []; fimDoGrupo = -Infinity; };
  for (const i of ordem) {
    const { ini, fim } = blocos[i];
    if (ini >= fimDoGrupo) fechar();
    let f = fins.findIndex((fimFaixa) => fimFaixa <= ini);
    if (f < 0) { f = fins.length; fins.push(fim); } else fins[f] = fim;
    saida[i] = { faixa: f, de: 1 };
    grupo.push(i); fimDoGrupo = Math.max(fimDoGrupo, fim);
  }
  fechar();
  return saida;
}
