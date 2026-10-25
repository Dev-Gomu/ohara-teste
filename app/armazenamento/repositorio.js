// Ponte entre o estado do núcleo ({ disciplinas, aulas }) e as tabelas do SQLite. Sem regra de negócio.
// salvarEstado regrava as duas tabelas numa transação (o banco inteiro já é gravado de uma vez, ver ETAPA1.md).

const COLUNAS = {
  disciplina: ['id', 'nome', 'cor', 'criado_em', 'excluido_em'],
  aula: ['id', 'disciplina_id', 'titulo', 'tipo', 'inicio', 'fim', 'anotacoes', 'criado_em', 'excluido_em'],
  arquivo: ['id', 'aula_id', 'nome', 'tipo_mime', 'tamanho', 'criado_em', 'excluido_em'],
  marcador: ['id', 'aula_id', 'arquivo_id', 'pagina', 'trecho', 'criado_em', 'excluido_em'],
  bloco_foco: ['id', 'disciplina_id', 'tarefa', 'tipo', 'dia', 'inicio', 'minutos_previstos', 'minutos_feitos', 'estado', 'criado_em', 'excluido_em'],
};
const CHAVES = { disciplina: 'disciplinas', aula: 'aulas', arquivo: 'arquivos', marcador: 'marcadores', bloco_foco: 'blocos' };

function ler(db, tabela) {
  const r = db.exec(`SELECT ${COLUNAS[tabela].join(',')} FROM ${tabela} ORDER BY id`);
  if (!r.length) return [];
  return r[0].values.map((linha) => Object.fromEntries(COLUNAS[tabela].map((c, i) => [c, linha[i]])));
}

export function carregarEstado(db) {
  return Object.fromEntries(Object.entries(CHAVES).map(([tabela, chave]) => [chave, ler(db, tabela)]));
}

export function salvarEstado(db, estado) {
  db.run('BEGIN');
  try {
    db.run('PRAGMA defer_foreign_keys = ON');
    for (const t of ['bloco_foco', 'marcador', 'arquivo', 'aula', 'disciplina']) db.run(`DELETE FROM ${t}`);
    for (const [tabela, chave] of Object.entries(CHAVES)) {
      const linhas = estado[chave] ?? [];
      const cols = COLUNAS[tabela];
      const ins = db.prepare(`INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const l of linhas) ins.run(cols.map((c) => l[c] ?? null));
      ins.free();
    }
    db.run('DELETE FROM anotacao_versao WHERE aula_id NOT IN (SELECT id FROM aula)');   // histórico de aula apagada de vez
    db.run('COMMIT');
  } catch (e) { db.run('ROLLBACK'); throw e; }
}

/** Anotação nova direto na linha da aula (barato: não regrava o resto). */
export function gravarAnotacao(db, aulaId, conteudo) {
  db.run('UPDATE aula SET anotacoes = ? WHERE id = ?', [conteudo, aulaId]);
}

/** Guarda uma versão do texto e apaga as mais antigas além de `max`. Devolve o id novo. */
export function inserirVersao(db, aulaId, conteudo, agora, max, idsParaApagar) {
  db.run('INSERT INTO anotacao_versao (aula_id, conteudo, criado_em) VALUES (?, ?, ?)', [aulaId, conteudo, agora]);
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  const ids = db.exec('SELECT id FROM anotacao_versao WHERE aula_id = ?', [aulaId])[0].values.map((l) => l[0]);
  for (const x of idsParaApagar(ids, max)) db.run('DELETE FROM anotacao_versao WHERE id = ?', [x]);
  return id;
}

/** Versões da aula, da mais nova para a mais antiga. */
export function listarVersoes(db, aulaId) {
  const r = db.exec('SELECT id, conteudo, criado_em FROM anotacao_versao WHERE aula_id = ? ORDER BY id DESC', [aulaId]);
  return r.length ? r[0].values.map(([id, conteudo, criado_em]) => ({ id, conteudo, criado_em })) : [];
}

export function ultimaVersaoEm(db, aulaId) {
  const r = db.exec('SELECT criado_em FROM anotacao_versao WHERE aula_id = ? ORDER BY id DESC LIMIT 1', [aulaId]);
  return r.length ? r[0].values[0][0] : null;
}
