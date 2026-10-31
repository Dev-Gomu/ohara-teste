// Núcleo (regras puras, sem DOM nem I/O): o arranjo dos blocos da Área de trabalho (Slides, Anotações, Cartões).
// Toda função devolve um arranjo novo e nunca altera o recebido. Guardado por aula e por aparelho (ver chaveArranjo).

export const BLOCOS = ['slides', 'anotacoes', 'cartoes'];
export const LIMITE = { min: 25, max: 75 };   // % da largura da 1ª coluna e da altura do bloco de cima, à direita
export const PASSO_REDIM = 4;                 // Alt R + tecla
export const ARRANJO_PADRAO = { v: 1, ordem: ['slides', 'anotacoes', 'cartoes'], abertos: ['slides', 'anotacoes'], largura: 50, altura: 50, foco: 'anotacoes' };

export const chaveArranjo = (aulaId) => `ohara.at.arranjo.${aulaId}`;

const unicos = (lista) => [...new Set(lista)];
const prender = (v) => Math.min(LIMITE.max, Math.max(LIMITE.min, v));
const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? prender(n) : 50; };
const primeiroVisivel = (ordem, abertos) => ordem.find((n) => abertos.includes(n)) ?? null;

/** Qualquer coisa (JSON lido, null, lixo) → arranjo válido. Nunca lança. */
export function normalizar(x) {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const ordem0 = Array.isArray(o.ordem) ? unicos(o.ordem.filter((n) => BLOCOS.includes(n))) : [];
  const ordem = [...ordem0, ...BLOCOS.filter((n) => !ordem0.includes(n))];
  const abertos = Array.isArray(o.abertos) ? unicos(o.abertos.filter((n) => BLOCOS.includes(n))) : [...ARRANJO_PADRAO.abertos];
  const foco = abertos.includes(o.foco) ? o.foco : abertos.includes(ARRANJO_PADRAO.foco) ? ARRANJO_PADRAO.foco : primeiroVisivel(ordem, abertos);
  return { v: 1, ordem, abertos, largura: numero(o.largura), altura: numero(o.altura), foco };
}

/** Ao abrir a tela: o guardado; sem nada guardado (ou zero abertos) vale o padrão. `abrir` entra nos abertos e recebe o foco. */
export function arranjoAoAbrir(guardado, { abrir: nome = null } = {}) {
  let a = normalizar(guardado);
  if (!a.abertos.length) a = { ...normalizar(null), ordem: a.ordem, largura: a.largura, altura: a.altura };
  return BLOCOS.includes(nome) ? abrir(a, nome) : a;
}

export const visiveis = (a) => a.ordem.filter((n) => a.abertos.includes(n));

export function abrir(a, nome) {
  if (!BLOCOS.includes(nome)) return a;
  return { ...a, abertos: a.abertos.includes(nome) ? [...a.abertos] : [...a.abertos, nome], foco: nome };
}
export function fechar(a, nome) {
  if (!a.abertos.includes(nome)) return a;
  const abertos = a.abertos.filter((n) => n !== nome);
  return { ...a, abertos, foco: a.foco === nome ? primeiroVisivel(a.ordem, abertos) : a.foco };
}
export const alternar = (a, nome) => (a.abertos.includes(nome) ? fechar(a, nome) : abrir(a, nome));

export function trocar(a, nomeA, nomeB) {
  const i = a.ordem.indexOf(nomeA), j = a.ordem.indexOf(nomeB);
  if (i < 0 || j < 0 || i === j) return a;
  const ordem = [...a.ordem]; [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  return { ...a, ordem, foco: nomeA };
}

export function definirTamanho(a, eixo, valor) {
  if (eixo !== 'largura' && eixo !== 'altura') return a;
  return { ...a, [eixo]: numero(valor) };
}
export const redimensionar = (a, eixo, delta) => (eixo === 'largura' || eixo === 'altura' ? definirTamanho(a, eixo, a[eixo] + delta) : a);
export const tamanhosPadrao = (a) => ({ ...a, largura: 50, altura: 50 });
export const ordemPadrao = (a) => ({ ...a, ordem: [...BLOCOS] });

/** Vizinho lógico (sem medir a tela). Com 3 visíveis: o 1º à esquerda, o 2º em cima à direita, o 3º embaixo à direita. */
export function vizinho(a, nome, direcao) {
  const v = visiveis(a), i = v.indexOf(nome);
  if (i < 0 || v.length < 2) return null;
  if (v.length === 2) return (direcao === 'dir' && i === 0) || (direcao === 'esq' && i === 1) ? v[1 - i] : null;
  if (i === 0) return direcao === 'dir' ? v[1] : null;
  if (direcao === 'esq') return v[0];
  if (i === 1 && direcao === 'baixo') return v[2];
  if (i === 2 && direcao === 'cima') return v[1];
  return null;
}

/** Com um bloco ampliado: 'dir'/'baixo' avançam e 'esq'/'cima' voltam, em ciclo, entre os visíveis. */
export function proximoAmpliado(a, atual, direcao) {
  const v = visiveis(a); if (!v.length) return null;
  const i = Math.max(0, v.indexOf(atual)), passo = direcao === 'dir' || direcao === 'baixo' ? 1 : -1;
  return v[(i + passo + v.length) % v.length];
}

/** Grade para o CSS: { n, colunas, linhas, lugar: { nome: { coluna, linha } } }. `ampliado` mostra só ele. */
export function disposicao(a, ampliado = null) {
  const v = visiveis(a);
  if (ampliado && v.includes(ampliado)) return { n: 1, colunas: '1fr', linhas: '1fr', lugar: { [ampliado]: { coluna: '1', linha: '1' } } };
  const n = v.length, lugar = {};
  if (n === 0) return { n, colunas: '1fr', linhas: '1fr', lugar };
  if (n === 1) return { n, colunas: '1fr', linhas: '1fr', lugar: { [v[0]]: { coluna: '1', linha: '1' } } };
  const colunas = `${a.largura}fr ${100 - a.largura}fr`;
  if (n === 2) return { n, colunas, linhas: '1fr', lugar: { [v[0]]: { coluna: '1', linha: '1' }, [v[1]]: { coluna: '2', linha: '1' } } };
  return { n, colunas, linhas: `${a.altura}fr ${100 - a.altura}fr`, lugar: { [v[0]]: { coluna: '1', linha: '1 / 3' }, [v[1]]: { coluna: '2', linha: '1' }, [v[2]]: { coluna: '2', linha: '2' } } };
}

/** Para guardar: nunca inclui o ampliado nem o modo redimensionar. */
export const paraGuardar = (a) => JSON.stringify({ v: 1, ordem: a.ordem, abertos: a.abertos, largura: a.largura, altura: a.altura, foco: a.foco });
