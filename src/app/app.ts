import express from 'express';
import path from 'path';

import { router } from './routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { githubWebhookRawBodyMiddleware } from './middlewares/github-webhook-raw.middleware';
import { githubWebhookController } from './controllers/webhook/github-webhook.controller';

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'src', 'views'));

app.use('/public', express.static(path.join(process.cwd(), 'src', 'public')));

app.post('/webhooks/github', githubWebhookRawBodyMiddleware, githubWebhookController);

app.use(express.urlencoded({ extended: true }));
app.use(express.json(
    {
        verify: function (req, res, buffer)
        {
            (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
        }
    }
));

app.use(router);

app.use(errorMiddleware);

export default app;
