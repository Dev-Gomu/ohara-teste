// Preferências locais do aparelho (tema, painéis, página do slide...). Nunca quebra se o navegador negar o armazenamento:
// nesse caso o valor só vale até fechar a página. Todas as chaves começam com "ohara.".
export const ler = (chave, padrao = '') => { try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; } };
export const gravar = (chave, valor) => { try { localStorage.setItem(chave, String(valor)); } catch { /* vale só agora */ } };
export const remover = (chave) => { try { localStorage.removeItem(chave); } catch { /* vale só agora */ } };
export const lerJson = (chave, padrao = null) => { try { const v = localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } };
export const gravarJson = (chave, valor) => gravar(chave, JSON.stringify(valor));
