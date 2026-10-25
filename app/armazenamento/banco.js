// Banco SQLite (sql.js) com migrações. Sem I/O de arquivo: quem chama entrega o módulo SQL e,
// se houver, os bytes do banco salvo. Gravar no IndexedDB é tarefa da 1.6.

export const MIGRACOES = [
  // v1
  `CREATE TABLE disciplina (
     id INTEGER PRIMARY KEY, nome TEXT NOT NULL, cor TEXT NOT NULL,
     criado_em TEXT NOT NULL, excluido_em TEXT);
   CREATE TABLE aula (
     id INTEGER PRIMARY KEY, disciplina_id INTEGER NOT NULL REFERENCES disciplina(id),
     titulo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'aula',
     inicio TEXT, fim TEXT, anotacoes TEXT NOT NULL DEFAULT '',
     criado_em TEXT NOT NULL, excluido_em TEXT);
   CREATE TABLE arquivo (
     id INTEGER PRIMARY KEY, aula_id INTEGER NOT NULL REFERENCES aula(id),
     nome TEXT NOT NULL, tipo_mime TEXT NOT NULL, tamanho INTEGER NOT NULL,
     criado_em TEXT NOT NULL, excluido_em TEXT);
   CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
   CREATE TABLE horario_cobranca (
     id INTEGER PRIMARY KEY, dia_semana INTEGER NOT NULL, hora TEXT NOT NULL);`,
  // v2 (Etapa 2): marcadores da aula e histórico das anotações
  `CREATE TABLE marcador (
     id INTEGER PRIMARY KEY, aula_id INTEGER NOT NULL REFERENCES aula(id), arquivo_id INTEGER, pagina INTEGER,
     trecho TEXT NOT NULL, criado_em TEXT NOT NULL, excluido_em TEXT);
   CREATE TABLE anotacao_versao (
     id INTEGER PRIMARY KEY, aula_id INTEGER NOT NULL REFERENCES aula(id), conteudo TEXT NOT NULL, criado_em TEXT NOT NULL);`,
];

export function versaoDoBanco(db) {
  const r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'");
  if (!r.length) return 0;
  const v = db.exec("SELECT versao FROM meta");
  return v.length ? v[0].values[0][0] : 0;
}

// Aplica as migrações que faltam, cada uma dentro de uma transação. Recusa banco de versão futura.
export function migrar(db, migracoes = MIGRACOES) {
  const atual = versaoDoBanco(db);
  if (atual > migracoes.length) {
    throw new Error(`Banco na versão ${atual}, mas este app só entende até a ${migracoes.length}. Atualize o app.`);
  }
  if (atual === 0) db.run('CREATE TABLE IF NOT EXISTS meta (versao INTEGER NOT NULL)');
  for (let v = atual; v < migracoes.length; v++) {
    db.run('BEGIN');
    try {
      db.run(migracoes[v]);
      db.run('DELETE FROM meta');
      db.run('INSERT INTO meta (versao) VALUES (?)', [v + 1]);
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }
  return versaoDoBanco(db);
}

// SQL: o módulo devolvido por initSqlJs. dados: Uint8Array de um banco salvo (opcional).
export function abrirBanco(SQL, dados, migracoes = MIGRACOES) {
  const db = dados ? new SQL.Database(dados) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  migrar(db, migracoes);
  return db;
}

/** Exporta os bytes do banco. O sql.js desliga as chaves estrangeiras depois de exportar; aqui elas voltam. */
export function exportarBanco(db) {
  const bytes = db.export();
  db.run('PRAGMA foreign_keys = ON');
  return bytes;
}
