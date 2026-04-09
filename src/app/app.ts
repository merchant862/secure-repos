import express from 'express';
import path from 'path';

import { router } from './routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { githubWebhookRawBodyMiddleware } from './middlewares/github-webhook-raw.middleware';
import { githubWebhookController } from './controllers/webhook/github-webhook.controller';
import { sequelize } from '../db/sequelize';
import { initModels } from '../db/models';
import { securityMiddleware } from './middlewares/security.middleware';

const app = express();

initModels(sequelize);

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'src', 'views'));

app.disable('x-powered-by');
app.use(securityMiddleware);

app.use('/public', express.static(path.join(process.cwd(), 'src', 'public')));

app.post('/webhooks/github', githubWebhookRawBodyMiddleware, githubWebhookController);

app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

app.use(router);

app.use(errorMiddleware);

export default app;
