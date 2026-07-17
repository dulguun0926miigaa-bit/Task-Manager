import { createServer } from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { initSocket } from './services/socketService.js';

const server = createServer(app);
initSocket(server);

server.listen(env.port, () => {
  console.log(`TaskFlow Pro API listening on port ${env.port}`);
});
