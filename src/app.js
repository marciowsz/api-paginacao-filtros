/**
 * Monta a aplicação Express. Recebe o banco por parâmetro para que os
 * testes possam usar um banco isolado (ou simular uma falha de banco).
 */
const express = require('express');
const morgan = require('morgan');
const { createDatabase } = require('./db/database');
const { seedProdutos } = require('./db/seed');
const { usuariosService } = require('./services/usuarios.service');
const { produtosService } = require('./services/produtos.service');
const { usuariosRoutes } = require('./routes/usuarios.routes');
const { produtosRoutes } = require('./routes/produtos.routes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

/** Banco padrão: já vem com os 150 produtos de exemplo */
function bancoComDadosDeExemplo() {
  const db = createDatabase();
  seedProdutos(db);
  return db;
}

function createApp({ db = bancoComDadosDeExemplo() } = {}) {
  const app = express();

  app.disable('x-powered-by'); // não revela a tecnologia do servidor
  app.use(express.json({ limit: '100kb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/', (req, res) => {
    res.json({
      api: 'API de Loja - Paginação, Filtros e Metadados',
      exemplo: '/produtos?page=1&limit=10&sort=preco&order=desc&categoria=eletronicos',
      rotas: [
        'GET /produtos?page&limit&sort&order&categoria&ativo&search&minPrice&maxPrice',
        'POST /usuarios',
        'GET /usuarios/:id',
        'POST /produtos',
        'GET /produtos/:id',
        'POST /produtos/:id/baixa-estoque',
      ],
    });
  });

  app.use('/usuarios', usuariosRoutes(usuariosService(db)));
  app.use('/produtos', produtosRoutes(produtosService(db)));

  // Sempre por último: 404 de rota e o handler global de erros
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
