// Envio direto ao Anki pelo AnkiConnect (complemento do Anki no computador; o Anki precisa estar aberto). Só funciona no PC: o
// endereço é 127.0.0.1:8765 e a origem do app precisa estar liberada na configuração do complemento. No tablet o caminho é o .apkg.
// O mesmo cartão é reconhecido por uma etiqueta `ohara_<guid>`, então enviar de novo atualiza em vez de duplicar. Notas que já
// entraram por .apkg (sem a etiqueta) são achadas pela frente e passam a ter a etiqueta.
import { CAMPOS_NOTA, CSS_NOTA, MODELO_FRENTE, MODELO_VERSO, NOME_TIPO_NOTA, camposDaNota, etiquetaDoCartao, nomeDoBaralho, nomeImagemAnki } from '../nucleo/anki.js';

export const ENDERECO_PADRAO = 'http://127.0.0.1:8765';
const SEM_ANKI = 'Não consegui falar com o Anki. Abra o Anki no computador (com o complemento AnkiConnect instalado e este endereço liberado) e tente de novo.';

export function criarAnkiConnect({ fetch = globalThis.fetch, url = ENDERECO_PADRAO } = {}) {
  return {
    async invocar(action, params = {}) {
      let resp;
      try { resp = await fetch(url, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) }); } catch { throw new Error(SEM_ANKI); }
      let corpo;
      try { corpo = await resp.json(); } catch { throw new Error('O Anki respondeu algo que não entendi. Confira se o AnkiConnect está atualizado.'); }
      if (corpo?.error) throw new Error(corpo.error);
      return corpo?.result;
    },
  };
}

function bytesParaBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fatias = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));
/** Texto dentro de aspas na busca do Anki: barra, aspas, * e _ precisam de barra antes. */
const escaparBusca = (t) => t.replace(/[\\"*_]/g, (c) => '\\' + c);

async function garantirTipoDeNota(ac) {
  const modelos = await ac.invocar('modelNames');
  if (modelos.includes(NOME_TIPO_NOTA)) return;
  await ac.invocar('createModel', { modelName: NOME_TIPO_NOTA, inOrderFields: CAMPOS_NOTA, css: CSS_NOTA, cardTemplates: [{ Name: 'Cartão 1', Front: MODELO_FRENTE, Back: MODELO_VERSO }] });
}

/** Notas do Anki que têm etiqueta ohara_*: Map etiqueta → { id, cards, tags }. */
async function notasDoOhara(ac) {
  const ids = await ac.invocar('findNotes', { query: 'tag:ohara_*' }), mapa = new Map();
  for (const lote of fatias(ids, 200)) {
    for (const n of await ac.invocar('notesInfo', { notes: lote })) {
      const tag = n.tags.find((t) => t.startsWith('ohara_'));
      if (tag) mapa.set(tag.toLowerCase(), { id: n.noteId, cards: n.cards, tags: n.tags });
    }
  }
  return mapa;
}

/**
 * Envia os cartões. `itens`: [{ cartao, aula, disciplina }]; `imagens`: Map id do cartão → { bytes, extensao }.
 * Devolve { novos, atualizados, adotados, falhas: [{ id, motivo }], enviados: [ids que chegaram ao Anki] }.
 */
export async function enviarCartoes(ac, itens, imagens = new Map()) {
  await ac.invocar('version');
  await garantirTipoDeNota(ac);
  for (const nome of new Set(itens.map((i) => nomeDoBaralho(i.disciplina, i.aula)))) await ac.invocar('createDeck', { deck: nome });
  const existentes = await notasDoOhara(ac);
  const r = { novos: 0, atualizados: 0, adotados: 0, falhas: [], enviados: [] };
  for (const item of itens) {
    const c = item.cartao, deck = nomeDoBaralho(item.disciplina, item.aula), marca = etiquetaDoCartao(c.guid);
    const desejadas = [marca, ...(c.etiquetas ? c.etiquetas.split(' ') : [])];
    try {
      let arquivo = null; const img = imagens.get(c.id);
      if (c.tem_imagem && img) { arquivo = nomeImagemAnki(c.id, img.extensao); await ac.invocar('storeMediaFile', { filename: arquivo, data: bytesParaBase64(img.bytes) }); }
      const { frente, verso, origem } = camposDaNota(item, arquivo), campos = { Frente: frente, Verso: verso, Origem: origem };
      const atual = existentes.get(marca.toLowerCase());
      if (atual) { await atualizarNota(ac, atual, campos, deck, desejadas); r.atualizados++; }
      else {
        try {
          await ac.invocar('addNote', { note: { deckName: deck, modelName: NOME_TIPO_NOTA, fields: campos, tags: desejadas, options: { allowDuplicate: false } } });
          r.novos++;
        } catch (e) {
          if (!/duplicate/i.test(e.message)) throw e;
          const achados = await ac.invocar('findNotes', { query: `"note:${NOME_TIPO_NOTA}" "Frente:${escaparBusca(frente)}"` });
          if (!achados.length) throw new Error('já existe no Anki uma nota igual, mas não consegui achá-la para atualizar');
          const [info] = await ac.invocar('notesInfo', { notes: [achados[0]] });
          await atualizarNota(ac, { id: info.noteId, cards: info.cards, tags: info.tags }, campos, deck, desejadas);
          r.adotados++;
        }
      }
      r.enviados.push(c.id);
    } catch (e) {
      if (e.message === SEM_ANKI) throw e;           // o Anki fechou no meio: parar, o que já foi fica marcado como enviado
      r.falhas.push({ id: c.id, motivo: e.message });
    }
  }
  return r;
}

async function atualizarNota(ac, nota, campos, deck, desejadas) {
  await ac.invocar('updateNoteFields', { note: { id: nota.id, fields: campos } });
  if (nota.cards?.length) await ac.invocar('changeDeck', { cards: nota.cards, deck });
  const minusculas = new Set(nota.tags.map((t) => t.toLowerCase())), sobram = nota.tags.filter((t) => !t.startsWith('ohara_') && !desejadas.some((d) => d.toLowerCase() === t.toLowerCase()));
  const faltam = desejadas.filter((d) => !minusculas.has(d.toLowerCase()));
  if (faltam.length) await ac.invocar('addTags', { notes: [nota.id], tags: faltam.join(' ') });
  if (sobram.length) await ac.invocar('removeTags', { notes: [nota.id], tags: sobram.join(' ') });
}

/** Como está o Anki agora: cartões para revisar e revisados hoje. */
export async function situacaoDoAnki(ac) {
  await ac.invocar('version');
  const vencidos = (await ac.invocar('findCards', { query: 'is:due' })).length, revisadosHoje = await ac.invocar('getNumCardsReviewedToday');
  return { vencidos, revisadosHoje };
}
