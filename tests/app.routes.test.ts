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

    it('should only include internal allowlisted paths in sign in next redirects', async function ()
    {
        const response = await request(app).get('/dashboard').query({ next: 'https://169.254.169.254/latest/meta-data' });

        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/sign-in?next=%2Fdashboard%3Fnext%3Dhttps%253A%252F%252F169.254.169.254%252Flatest%252Fmeta-data');
    });

    it('should render admin sign in and panel shells', async function ()
    {
        const signInResponse = await request(app).get('/admin/sign-in');
        const panelResponse = await request(app).get('/admin/overview');
        const pricingResponse = await request(app).get('/admin/pricing');

        expect(signInResponse.status).toBe(200);
        expect(signInResponse.text).toContain('Admin sign in');
        expect(panelResponse.status).toBe(200);
        expect(panelResponse.text).toContain('Overview');
        expect(pricingResponse.status).toBe(200);
        expect(pricingResponse.text).toContain('Create Pricing Plan');
    });

    it('should redirect github install callback with installation_id back to dashboard', async function ()
    {
        const response = await request(app)
            .get('/github/install/callback')
            .query(
                {
                    installation_id: '12345',
                    setup_action: 'install'
                }
            );

        expect(response.status).toBe(302);
        expect(response.header.location).toContain('/dashboard?github=installed');
        expect(response.header.location).toContain('installation_id=12345');
    });

    it('should redirect github install callback without installation_id back to dashboard', async function ()
    {
        const response = await request(app)
            .get('/github/install/callback');

        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/dashboard?github=cancelled');
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
