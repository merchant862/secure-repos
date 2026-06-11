import request from 'supertest';
import app from '../src/app/app';

describe('Application routes', function ()
{
    it('should require admin session auth for admin health response', async function ()
    {
        const response = await request(app).get('/api/admin/health');

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Unauthorized');
    });

    it('should redirect unauthenticated dashboard pages to sign in', async function ()
    {
        const response = await request(app).get('/dashboard');

        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/sign-in?next=%2Fdashboard');
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
