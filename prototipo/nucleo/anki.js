// Núcleo (regras puras, sem I/O): como um cartão do Ohara vira nota do Anki. Usado pelo .apkg e pelo AnkiConnect, para que os
// dois caminhos produzam exatamente a mesma nota (baralho, campos e tipo de nota).

export const NOME_TIPO_NOTA = 'Ohara básico';
export const CAMPOS_NOTA = ['Frente', 'Verso', 'Origem'];
export const CSS_NOTA = '.card{font-family:sans-serif;font-size:20px;text-align:center}';
export const MODELO_FRENTE = '{{Frente}}';
export const MODELO_VERSO = '{{FrontSide}}<hr id="answer">{{Verso}}<div style="font-size:11px;color:#888;margin-top:14px">{{Origem}}</div>';

/** Texto simples → HTML do Anki (escapa e troca quebra de linha por <br>). */
export const escAnki = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

/** Baralho `Matéria::Aula` (o Anki usa `::` para subbaralho, então `::` dentro dos nomes vira `:`). */
export const nomeDoBaralho = (disciplina, aula) => `${disciplina.nome.replaceAll('::', ':')}::${aula.titulo.replaceAll('::', ':')}`;

/** Nome do arquivo de uma imagem do cartão dentro do Anki (a 1ª da frente mantém o nome de antes). */
export const nomeImagemAnki = (cartaoId, extensao, lado = 'frente', j = 0) => (lado === 'frente' && j === 0 ? `ohara-cartao-${cartaoId}.${extensao}` : `ohara-cartao-${cartaoId}-${lado}${j + 1}.${extensao}`);

/** Imagens de um cartão como { frente: [{ bytes, extensao }], verso: [...] }. Aceita também o formato antigo { bytes, extensao } (uma imagem na frente). */
export function listaDeImagens(img) {
  if (!img) return { frente: [], verso: [] };
  if (Array.isArray(img.frente) || Array.isArray(img.verso)) return { frente: img.frente ?? [], verso: img.verso ?? [] };
  return img.bytes ? { frente: [img], verso: [] } : { frente: [], verso: [] };
}

/**
 * Campos da nota. `arquivosFrente` e `arquivosVerso`: nomes (um ou uma lista) das imagens já guardadas no Anki. Devolve { frente, verso, origem }.
 */
export function camposDaNota({ cartao: c, aula, disciplina }, arquivosFrente = null, arquivosVerso = null) {
  const lista = (x) => [].concat(x ?? []).filter(Boolean), img = (n) => `<br><img src="${n}">`;
  const frente = escAnki(c.frente) + lista(arquivosFrente).map(img).join(''), verso = escAnki(c.verso) + lista(arquivosVerso).map(img).join('');
  return { frente, verso, origem: escAnki(`${disciplina.nome} · ${aula.titulo}${c.pagina ? ` · slide ${c.pagina}` : ''}`) };
}

/** Etiqueta que liga a nota do Anki ao cartão do Ohara (o guid nunca muda). Etiquetas do Anki não aceitam espaço. */
export const etiquetaDoCartao = (guid) => `ohara_${String(guid).replace(/[^A-Za-z0-9_-]/g, '_')}`;
