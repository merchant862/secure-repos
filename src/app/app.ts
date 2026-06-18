import express from 'express';
import path from 'path';

import { router } from './routes';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware';
import { githubWebhookRawBodyMiddleware } from './middlewares/github-webhook-raw.middleware';
import { githubWebhookController } from './controllers/webhook/github-webhook.controller';
import { securityHeadersMiddleware } from './middlewares/security.middleware';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
app.use(securityHeadersMiddleware);

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'src', 'views'));

app.use('/public', express.static(path.join(process.cwd(), 'src', 'public')));

app.post('/webhooks/github', githubWebhookRawBodyMiddleware, githubWebhookController);

app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json(
    {
        limit: '100kb',
        verify: function (req, res, buffer)
        {
            (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
        }
    }
));

app.use(router);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
