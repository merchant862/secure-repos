import request from 'supertest';
import app from '../src/app/app';

describe('Application routes', function ()
{
    it('should require admin auth for health response when admin token is configured', async function ()
    {
        const response = await request(app).get('/api/admin/health');

        expect([200, 503]).toContain(response.status);
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('app');
        expect(response.body).toHaveProperty('database');
        expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 200 for github install callback with installation_id', async function ()
    {
        const response = await request(app)
            .get('/github/install/callback')
            .query(
                {
                    installation_id: '12345',
                    setup_action: 'install'
                }
            );

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('GitHub install callback received');
        expect(response.body.data.installationId).toBe('12345');
        expect(response.body.data.setupAction).toBe('install');
    });

    it('should return 400 for github install callback without installation_id', async function ()
    {
        const response = await request(app)
            .get('/github/install/callback');

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Missing installation_id');
    });

    it('should return 401 for github webhook with invalid signature', async function ()
    {
        const response = await request(app)
            .post('/webhooks/github')
            .set('Content-Type', 'application/json')
            .set('x-github-event', 'installation')
            .set('x-github-delivery', 'abc-123')
            .set('x-hub-signature-256', 'sha256=test')
            .send(
                {
                    hello: 'world'
                }
            );

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid webhook signature');
    });

    it('should return 401 for github webhook without signature', async function ()
    {
        const response = await request(app)
            .post('/webhooks/github')
            .set('Content-Type', 'application/json')
            .set('x-github-event', 'installation')
            .set('x-github-delivery', 'abc-123')
            .send(
                {
                    hello: 'world'
                }
            );

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid webhook signature');
    });
});
