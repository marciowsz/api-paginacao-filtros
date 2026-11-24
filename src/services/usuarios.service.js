/**
 * Regras de negócio de usuários. Lança exceções customizadas;
 * quem decide o status HTTP é o middleware global de erros.
 */
const { NotFoundError, UserAlreadyExistsError } = require('../errors/AppError');

function usuariosService(db) {
  const toUsuario = (row) => ({
    id: row.id,
    nome: row.nome,
    email: row.email,
    idade: row.idade,
    criadoEm: row.criado_em,
  });

  return {
    criar({ nome, email, idade }) {
      const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
      if (existente) throw new UserAlreadyExistsError(email);

      const { lastInsertRowid } = db
        .prepare('INSERT INTO usuarios (nome, email, idade) VALUES (?, ?, ?)')
        .run(nome, email, idade);
      return this.buscarPorId(Number(lastInsertRowid));
    },

    buscarPorId(id) {
      const row = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
      if (!row) throw new NotFoundError('Usuário', id);
      return toUsuario(row);
    },
  };
}

module.exports = { usuariosService };
