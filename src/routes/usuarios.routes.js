const { Router } = require('express');
const { validate } = require('../middlewares/validate');
const { usuarioSchema, idParamSchema } = require('../schemas/schemas');

function usuariosRoutes(service) {
  const router = Router();

  // POST /usuarios - cadastra um usuário (validação antes de tocar no banco)
  router.post('/', validate(usuarioSchema), (req, res) => {
    const usuario = service.criar(req.validated.body);
    res.status(201).location(`/usuarios/${usuario.id}`).json(usuario);
  });

  // GET /usuarios/:id
  router.get('/:id', validate(idParamSchema, 'params'), (req, res) => {
    res.json(service.buscarPorId(req.validated.params.id));
  });

  return router;
}

module.exports = { usuariosRoutes };
