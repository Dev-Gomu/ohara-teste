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

/** Nome do arquivo da imagem do cartão dentro do Anki. */
export const nomeImagemAnki = (cartaoId, extensao) => `ohara-cartao-${cartaoId}.${extensao}`;

/**
 * Campos da nota. `arquivoImagem`: nome da imagem já guardada no Anki (ou null). Devolve { frente, verso, origem }.
 */
export function camposDaNota({ cartao: c, aula, disciplina }, arquivoImagem = null) {
  let frente = escAnki(c.frente);
  if (c.tem_imagem && arquivoImagem) frente += `<br><img src="${arquivoImagem}">`;
  return { frente, verso: escAnki(c.verso), origem: escAnki(`${disciplina.nome} · ${aula.titulo}${c.pagina ? ` · slide ${c.pagina}` : ''}`) };
}

/** Etiqueta que liga a nota do Anki ao cartão do Ohara (o guid nunca muda). Etiquetas do Anki não aceitam espaço. */
export const etiquetaDoCartao = (guid) => `ohara_${String(guid).replace(/[^A-Za-z0-9_-]/g, '_')}`;
