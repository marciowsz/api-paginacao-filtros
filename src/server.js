const { createApp } = require('./app');
const logger = require('./utils/logger');

const PORT = Number(process.env.PORT) || 3000;

// Rede de segurança: um erro inesperado fora de uma requisição é registrado,
// mas não derruba a API silenciosamente.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { stack: reason?.stack ?? String(reason) });
});

createApp().listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
