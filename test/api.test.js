process.env.NODE_ENV = 'test';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/db/database');

/** Confere o padrão de erro: { status, error, message, details, timestamp } */
function assertErrorFormat(res, status, error) {
  assert.equal(res.status, status);
  assert.deepEqual(Object.keys(res.body).sort(), ['details', 'error', 'message', 'status', 'timestamp']);
  assert.equal(res.body.status, status);
  assert.equal(res.body.error, error);
  assert.ok(Array.isArray(res.body.details));
  assert.ok(!Number.isNaN(Date.parse(res.body.timestamp)));
}

const usuarioValido = { nome: 'Ana Souza', email: 'ana@email.com', idade: 30 };
const produtoValido = {
  sku: 'CEL-001',
  nome: 'Smartphone X',
  categoria: 'eletronicos',
  preco: 2499.9,
  estoque: 5,
};

let app;
beforeEach(() => {
  app = createApp({ db: createDatabase(':memory:') });
});

describe('Parte 1 - Validação de dados (POST /usuarios)', () => {
  it('cadastra um usuário válido (201)', async () => {
    const res = await request(app).post('/usuarios').send(usuarioValido);
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 1);
    assert.equal(res.body.email, 'ana@email.com');
    assert.equal(res.headers.location, '/usuarios/1');
  });

  it('recusa e-mail com formato inválido (400)', async () => {
    const res = await request(app).post('/usuarios').send({ ...usuarioValido, email: 'ana.email.com' });
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.deepEqual(res.body.details, [{ field: 'email', message: 'O formato do e-mail está incorreto.' }]);
  });

  it('recusa idade 0 e idade negativa (400)', async () => {
    for (const idade of [0, -5]) {
      const res = await request(app).post('/usuarios').send({ ...usuarioValido, idade });
      assertErrorFormat(res, 400, 'VALIDATION_ERROR');
      assert.deepEqual(res.body.details, [{ field: 'idade', message: 'A idade deve ser maior que 0.' }]);
    }
  });

  it('lista TODOS os campos obrigatórios que faltaram (400)', async () => {
    const res = await request(app).post('/usuarios').send({});
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.deepEqual(
      res.body.details.map((d) => d.field),
      ['nome', 'email', 'idade'],
    );
  });

  it('recusa tipo errado (idade como texto)', async () => {
    const res = await request(app).post('/usuarios').send({ ...usuarioValido, idade: 'trinta' });
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.equal(res.body.details[0].message, 'A idade deve ser um número.');
  });

  it('recusa campos não permitidos (ex.: tentar se dar perfil admin)', async () => {
    const res = await request(app).post('/usuarios').send({ ...usuarioValido, perfil: 'admin' });
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.deepEqual(res.body.details, [{ field: 'perfil', message: 'Campo não permitido.' }]);
  });

  it('dados inválidos NÃO chegam ao banco de dados', async () => {
    const db = createDatabase(':memory:');
    let consultasAoBanco = 0;
    const dbEspiao = {
      prepare: (sql) => {
        consultasAoBanco += 1;
        return db.prepare(sql);
      },
    };
    const appEspiao = createApp({ db: dbEspiao });

    await request(appEspiao).post('/usuarios').send({ nome: 'A', email: 'x', idade: -1 });
    assert.equal(consultasAoBanco, 0, 'a validação deveria barrar antes do banco');

    await request(appEspiao).post('/usuarios').send(usuarioValido);
    assert.ok(consultasAoBanco > 0, 'requisição válida deve chegar ao banco');
  });
});

describe('Parte 1 - Validação de dados (POST /produtos)', () => {
  it('cadastra um produto válido com valores padrão (201)', async () => {
    const res = await request(app).post('/produtos').send(produtoValido);
    assert.equal(res.status, 201);
    assert.equal(res.body.ativo, true);
    assert.equal(res.body.estoque, 5);
  });

  it('recusa preço <= 0, categoria inexistente e SKU fora do padrão', async () => {
    const res = await request(app)
      .post('/produtos')
      .send({ ...produtoValido, preco: 0, categoria: 'brinquedos', sku: 'abc' });
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.deepEqual(res.body.details.map((d) => d.field).sort(), ['categoria', 'preco', 'sku']);
  });
});

describe('Parte 2 - Tratamento global de erros', () => {
  it('JSON com erro de sintaxe vira 400 INVALID_JSON (sem derrubar a API)', async () => {
    const res = await request(app)
      .post('/usuarios')
      .set('Content-Type', 'application/json')
      .send('{"nome": "Ana", "email": }');
    assertErrorFormat(res, 400, 'INVALID_JSON');
  });

  it('rota inexistente vira 404 ROUTE_NOT_FOUND', async () => {
    const res = await request(app).get('/clientes');
    assertErrorFormat(res, 404, 'ROUTE_NOT_FOUND');
  });

  it('recurso inexistente vira 404 NOT_FOUND', async () => {
    const res = await request(app).get('/usuarios/999');
    assertErrorFormat(res, 404, 'NOT_FOUND');
  });

  it('id inválido na URL vira 400', async () => {
    const res = await request(app).get('/usuarios/abc');
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
  });

  it('erro interno vira 500 genérico, sem stack trace, e a API continua de pé', async () => {
    const dbQuebrado = {
      prepare() {
        throw new Error('SQLITE_IOERR: disk I/O error at /var/lib/app/db.sqlite');
      },
    };
    const appQuebrado = createApp({ db: dbQuebrado });

    const res = await request(appQuebrado).post('/usuarios').send(usuarioValido);
    assertErrorFormat(res, 500, 'INTERNAL_SERVER_ERROR');
    assert.equal(res.body.message, 'Erro interno no servidor. Tente novamente mais tarde.');
    const corpo = JSON.stringify(res.body);
    assert.ok(!corpo.includes('SQLITE'), 'não pode vazar detalhe do banco');
    assert.ok(!corpo.includes('/var/lib'), 'não pode vazar caminho de arquivo');
    assert.ok(!corpo.includes('at '), 'não pode vazar stack trace');
    assert.ok(res.headers['x-error-id']);

    // A aplicação continua respondendo depois do erro 500
    const depois = await request(appQuebrado).get('/');
    assert.equal(depois.status, 200);
  });
});

describe('Parte 3 - Exceções customizadas', () => {
  it('UserAlreadyExistsError -> 409 Conflict (e-mail sem diferenciar maiúsculas)', async () => {
    await request(app).post('/usuarios').send(usuarioValido);
    const res = await request(app)
      .post('/usuarios')
      .send({ ...usuarioValido, email: 'ANA@EMAIL.COM' });
    assertErrorFormat(res, 409, 'USER_ALREADY_EXISTS');
    assert.equal(res.body.details[0].field, 'email');
  });

  it('ProductAlreadyExistsError -> 409 Conflict', async () => {
    await request(app).post('/produtos').send(produtoValido);
    const res = await request(app).post('/produtos').send(produtoValido);
    assertErrorFormat(res, 409, 'PRODUCT_ALREADY_EXISTS');
  });

  it('InsufficientStockError -> 422 Unprocessable Entity, estoque não muda', async () => {
    await request(app).post('/produtos').send(produtoValido); // estoque 5
    const res = await request(app).post('/produtos/1/baixa-estoque').send({ quantidade: 10 });
    assertErrorFormat(res, 422, 'INSUFFICIENT_STOCK');
    assert.match(res.body.details[0].message, /só há 5/);

    const produto = await request(app).get('/produtos/1');
    assert.equal(produto.body.estoque, 5);
  });

  it('baixa de estoque válida -> 200', async () => {
    await request(app).post('/produtos').send(produtoValido);
    const res = await request(app).post('/produtos/1/baixa-estoque').send({ quantidade: 2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.estoque, 3);
  });

  it('ProductInactiveError -> 422 ao vender produto inativo', async () => {
    await request(app).post('/produtos').send({ ...produtoValido, ativo: false });
    const res = await request(app).post('/produtos/1/baixa-estoque').send({ quantidade: 1 });
    assertErrorFormat(res, 422, 'PRODUCT_INACTIVE');
  });
});
