// Núcleo (regras puras, sem I/O): PIN da tela de Notas. É só uma trava de tela: não criptografa os dados nem o backup (quem abrir o arquivo do
// backup lê tudo). Por isso o "hash" é simples e roda em qualquer lugar (inclusive http na rede local, onde o navegador não oferece crypto.subtle).

export const PIN_MIN = 4, PIN_MAX = 6;
export const INATIVIDADE_MS = 2 * 60 * 1000;

export const pinValido = (pin) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(String(pin ?? ''));

/** Resumo de 53 bits (cyrb53) repetido, em texto. Não é segredo forte; só impede ler o PIN guardado a olho. */
export function resumirPin(pin, sal) {
  let h = `${sal}:${pin}`;
  for (let r = 0; r < 2000; r++) {
    let h1 = 0xdeadbeef ^ r, h2 = 0x41c6ce57 ^ r;
    for (let i = 0; i < h.length; i++) { const c = h.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    h = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  return h;
}

/** Texto a guardar para um PIN novo: "sal.resumo". `aleatorio` é um número 0–1 (quem chama sorteia). */
export function criarRegistroPin(pin, aleatorio) {
  if (!pinValido(pin)) throw new Error(`O PIN tem de ter de ${PIN_MIN} a ${PIN_MAX} números.`);
  const sal = Math.floor(aleatorio * 1e9).toString(36);
  return `${sal}.${resumirPin(pin, sal)}`;
}

export function conferirPin(registro, pin) {
  const [sal, resumo] = String(registro ?? '').split('.');
  return !!sal && !!resumo && pinValido(pin) && resumirPin(pin, sal) === resumo;
}

/** A tela de Notas continua aberta enquanto houve atividade nos últimos `limite` ms. */
export const expirou = (ultimaAtividadeMs, agoraMs, limite = INATIVIDADE_MS) => ultimaAtividadeMs == null || agoraMs - ultimaAtividadeMs > limite;
