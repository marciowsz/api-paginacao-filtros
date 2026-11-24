# API REST: Paginação, Filtros e Metadados

Entregável da **Semana 6** de Desenvolvimento de APIs e Backend. Evolui a API da Semana 5 ([api-validacao-erros](https://github.com/marciowsz/api-validacao-erros)) com:
- **paginação** com `LIMIT`/`OFFSET`;
- **ordenação dinâmica**;
- **filtros**, incluindo filtro de **intervalo de preço**;
- **metadados de paginação** com links de navegação **HATEOAS**.

**Autor:** Marcio Rogério Reis Freire Junior ([@marciowsz](https://github.com/marciowsz))

[![CI](https://github.com/marciowsz/api-paginacao-filtros/actions/workflows/ci.yml/badge.svg)](https://github.com/marciowsz/api-paginacao-filtros/actions/workflows/ci.yml)

## Como rodar

Requisito: **Node.js 22.13 ou mais novo**. O banco é o SQLite nativo do Node e já sobe com **150 produtos** de exemplo.

```bash
npm install
npm start        # http://localhost:3000/produtos
npm test         # 42 testes (23 novos desta semana + 19 da Semana 5)
```

As requisições de exemplo estão em [`requests.http`](requests.http).

## Arquivos principais (rotas e configurações)

| Arquivo | Papel |
|---|---|
| [`src/routes/produtos.routes.js`](src/routes/produtos.routes.js) | Rota `GET /produtos` |
| [`src/schemas/schemas.js`](src/schemas/schemas.js) | `listarProdutosQuerySchema`: valida e converte os *query params* |
| [`src/services/produtos.service.js`](src/services/produtos.service.js) | Monta o SQL com `WHERE`, `ORDER BY`, `LIMIT` e `OFFSET` |
| [`src/utils/paginacao.js`](src/utils/paginacao.js) | Monta o objeto `meta` e os links HATEOAS |
| [`src/db/seed.js`](src/db/seed.js) | Gera os 150 produtos de exemplo |
| [`test/paginacao.test.js`](test/paginacao.test.js) | Testes da paginação, dos filtros e dos links |

## Parâmetros de `GET /produtos`

| Parâmetro | Tipo | Padrão | Exemplo | Descrição |
|---|---|---|---|---|
| `page` | inteiro ≥ 1 | `1` | `?page=2` | Página atual |
| `limit` | inteiro ≥ 1 | `10` | `?limit=20` | Itens por página (**máximo 100**) |
| `sort` | `id`, `nome`, `preco`, `estoque`, `criadoEm` | `id` | `?sort=preco` | Campo de ordenação |
| `order` | `asc`, `desc` | `asc` | `?order=desc` | Direção |
| `categoria` | `eletronicos`, `vestuario`, `casa`, `livros`, `esportes` | — | `?categoria=eletronicos` | Filtro exato |
| `ativo` | `true`, `false` | — | `?ativo=true` | Filtro booleano |
| `search` | texto | — | `?search=notebook` | Busca no nome (sem diferenciar maiúsculas) |
| `minPrice` | número ≥ 0 | — | `?minPrice=100` | Preço mínimo (inclusive) |
| `maxPrice` | número ≥ 0 | — | `?maxPrice=500` | Preço máximo (inclusive) |

Todos os parâmetros vão na **query string**, nunca no corpo de um `GET`, e são combináveis. Os nomes seguem o padrão do mercado (`page`, `limit`, `sort`, `order`, `search`) e o recurso está no plural (`/produtos`).

---

## Parte 1: Paginação básica

A API devolve só a **fatia** pedida. O SQL gerado é:

```sql
SELECT COUNT(*) AS total FROM produtos WHERE ...;                        -- para o meta
SELECT * FROM produtos WHERE ... ORDER BY preco DESC, id DESC LIMIT ? OFFSET ?;  -- só a página
```

- `OFFSET = (page - 1) * limit`. A página 2 com `limit=10` pula 10 linhas e traz as próximas 10.
- `id` entra como **desempate** no `ORDER BY`. Assim a ordem é estável e nenhum item se repete ou some entre páginas (há um teste que percorre as 15 páginas e confere os 150 ids).
- Uma página além do fim (`?page=99`) responde **200** com `data: []`. Não é erro: simplesmente não há itens ali.

---

## Parte 2: Ordenação, filtros e metadados

`GET /produtos?page=2&limit=3&sort=preco&order=desc&categoria=eletronicos&ativo=true` (resposta real):

```json
{
  "data": [
    { "id": 81,  "sku": "ELE-081", "nome": "Tablet Plus",     "categoria": "eletronicos", "preco": 4652.05, "estoque": 20, "ativo": true, "criadoEm": "2026-01-04T17:00:00.000Z" },
    { "id": 46,  "sku": "ELE-046", "nome": "Smartwatch Plus", "categoria": "eletronicos", "preco": 4619.06, "estoque": 50, "ativo": true, "criadoEm": "2026-01-03T06:00:00.000Z" },
    { "id": 141, "sku": "ELE-141", "nome": "Tablet Plus",     "categoria": "eletronicos", "preco": 4444.13, "estoque": 52, "ativo": true, "criadoEm": "2026-01-07T05:00:00.000Z" }
  ],
  "meta": {
    "totalItems": 26,
    "itemsPerPage": 3,
    "currentPage": 2,
    "totalPages": 9,
    "hasNextPage": true,
    "hasPrevPage": true,
    "links": {
      "self":  "/produtos?page=2&limit=3&sort=preco&order=desc&categoria=eletronicos&ativo=true",
      "first": "/produtos?page=1&limit=3&sort=preco&order=desc&categoria=eletronicos&ativo=true",
      "prev":  "/produtos?page=1&limit=3&sort=preco&order=desc&categoria=eletronicos&ativo=true",
      "next":  "/produtos?page=3&limit=3&sort=preco&order=desc&categoria=eletronicos&ativo=true",
      "last":  "/produtos?page=9&limit=3&sort=preco&order=desc&categoria=eletronicos&ativo=true"
    }
  }
}
```

- **`data`** traz os itens e **`meta`** traz a paginação. O formato é sempre o mesmo, em qualquer listagem.
- `totalItems` e `totalPages` consideram os **filtros aplicados**: são 26 eletrônicos ativos, não os 150 produtos.
- O total também vai no cabeçalho `X-Total-Count`.

### Segurança e validação dos parâmetros

| Tentativa | Resposta |
|---|---|
| `?limit=9999999` (tentar derrubar o banco) | **Forçado para 100**: `"itemsPerPage": 100` |
| `?page=0`, `?page=abc`, `?limit=-5` | **400** `VALIDATION_ERROR` |
| `?sort=preco;DROP TABLE produtos` | **400**: o `sort` só aceita uma lista fechada. O nome da coluna nunca vai da URL direto para o SQL. Os valores dos filtros vão por parâmetros `?` (*prepared statements*), à prova de SQL Injection |
| `?search=%` | Tratado como texto literal (o `%` é escapado no `LIKE`) |
| `?categria=livros` (erro de digitação) | **400** `"categria": "Campo não permitido."`, em vez de ignorar o filtro em silêncio |

```json
GET /produtos?page=0&sort=senha  ->  400
{
  "status": 400,
  "error": "VALIDATION_ERROR",
  "message": "Os dados fornecidos são inválidos.",
  "details": [
    { "field": "page", "message": "O parâmetro page deve ser maior ou igual a 1." },
    { "field": "sort", "message": "O parâmetro sort deve ser um destes: id, nome, preco, estoque, criadoEm." }
  ],
  "timestamp": "2026-11-24T19:32:34.877Z"
}
```

---

## Parte 3: Desafio

### Filtros avançados: intervalo de preço

`GET /produtos?minPrice=100&maxPrice=500` gera `WHERE preco >= 100 AND preco <= 500`. Também funciona com só um dos lados (`?minPrice=3000`). Se `minPrice` for maior que `maxPrice`, a API responde **400**, apontando o campo `maxPrice`. Os filtros mais usados têm índices no banco (`idx_produtos_categoria_preco`, `idx_produtos_preco`).

### Bônus: HATEOAS

O objeto `meta.links` traz as URLs prontas de `self`, `first`, `prev`, `next` e `last`, **preservando os filtros e a ordenação** da requisição. `prev` é `null` na primeira página e `next` é `null` na última. O frontend só precisa seguir o link, sem montar URLs na mão (há um teste que segue o `next` e confere que chega à página 2).

---

## Parte 4: Reflexão

### Por que uma API nunca deve retornar todos os registros do banco de dados de uma vez (ex.: `SELECT *` sem `LIMIT`)? Como um padrão consistente de metadados de paginação melhora a vida do desenvolvedor que consome essa API no frontend?

Hoje a tabela tem 150 produtos, mas sistemas reais crescem para milhões de registros. Um `GET /produtos` sem `LIMIT`:

- **Pode derrubar o servidor por falta de memória (OOM).** Todas as linhas precisam ser carregadas na memória do banco, depois na memória da API (que monta um array gigante) e por fim viram uma string JSON enorme. Algumas requisições simultâneas bastam para esgotar a RAM e o processo cair, derrubando a API para **todos** os usuários.
- **Trava o banco e a rede.** A consulta varre a tabela inteira, segura recursos que outras consultas precisam e transfere megabytes ou gigabytes pela rede a cada chamada. No celular do usuário, isso significa lentidão e consumo do plano de dados.
- **Trava o navegador.** O frontend precisa converter e renderizar milhares de itens de uma vez, e a página congela.
- **Abre brecha para ataque.** Qualquer pessoa pode repetir a chamada pesada em loop e causar uma negação de serviço (DoS). Por isso esta API força o `limit` máximo de 100.
- **Desperdiça recursos.** O usuário vê de 10 a 20 itens por tela. Mandar o resto é pagar processamento e banda por dados que ninguém vai olhar.

Com paginação, o custo de cada requisição é **constante e previsível**, não importa o tamanho da tabela.

O **padrão consistente de metadados** (`data` + `meta`) transforma a paginação em um **contrato**:
- o frontend escreve **um único componente de paginação genérico** (botões "anterior/próxima", "página 2 de 15", "26 resultados") que funciona para produtos, usuários, pedidos ou qualquer listagem futura;
- `totalItems` e `totalPages` dizem quantas páginas desenhar e quando desabilitar o botão "próxima", **sem chutes**;
- com os links **HATEOAS**, o frontend não precisa saber montar a URL nem repetir os filtros. Basta chamar `meta.links.next`. Se a API mudar o formato da URL no futuro, o frontend continua funcionando;
- o mesmo formato também permite **rolagem infinita**: enquanto `hasNextPage` for `true`, buscar `links.next`.

Assim, a API é mais rápida, mais segura e mais barata de manter, e o frontend fica mais simples, reaproveitável e livre de "achismo".
