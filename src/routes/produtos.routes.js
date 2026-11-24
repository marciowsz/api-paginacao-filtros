const { Router } = require('express');
const { validate } = require('../middlewares/validate');
const {
  produtoSchema,
  idParamSchema,
  baixaEstoqueSchema,
  listarProdutosQuerySchema,
} = require('../schemas/schemas');
const { montarMeta } = require('../utils/paginacao');

function produtosRoutes(service) {
  const router = Router();

  // GET /produtos?page=1&limit=10&sort=preco&order=desc&categoria=eletronicos&ativo=true&minPrice=100&maxPrice=500&search=pro
  router.get('/', validate(listarProdutosQuerySchema, 'query'), (req, res) => {
    const query = req.validated.query;
    const { data, totalItems } = service.listar(query);
    const meta = montarMeta({
      totalItems,
      query,
      basePath: req.baseUrl,
      explicitos: new Set(Object.keys(req.query)),
    });
    res.set('X-Total-Count', String(totalItems)).json({ data, meta });
  });

  // POST /produtos - cadastra um produto
  router.post('/', validate(produtoSchema), (req, res) => {
    const produto = service.criar(req.validated.body);
    res.status(201).location(`/produtos/${produto.id}`).json(produto);
  });

  // GET /produtos/:id
  router.get('/:id', validate(idParamSchema, 'params'), (req, res) => {
    res.json(service.buscarPorId(req.validated.params.id));
  });

  // POST /produtos/:id/baixa-estoque - venda (regra de negócio: 422 se faltar estoque)
  router.post(
    '/:id/baixa-estoque',
    validate(idParamSchema, 'params'),
    validate(baixaEstoqueSchema),
    (req, res) => {
      res.json(service.baixarEstoque(req.validated.params.id, req.validated.body.quantidade));
    },
  );

  return router;
}

module.exports = { produtosRoutes };
