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

    it('should set browser security headers', async function ()
    {
        const response = await request(app).get('/');

        expect(response.header['content-security-policy']).toContain("frame-ancestors 'none'");
        expect(response.header['x-content-type-options']).toBe('nosniff');
        expect(response.header['x-frame-options']).toBe('DENY');
    });

    it('should reject cross-origin API writes', async function ()
    {
        const response = await request(app)
            .post('/api/contact')
            .set('Origin', 'https://attacker.example')
            .send({ name: 'Test', email: 'test@example.com', message: 'test' });

        expect(response.status).toBe(403);
        expect(response.body.message).toBe('Cross-origin request rejected');
    });

    it('should not expose removed team routes', async function ()
    {
        const response = await request(app).get('/team');
        expect(response.status).toBe(404);
        expect(response.type).toContain('html');
        expect(response.text).toContain('Page not found');
    });

    it('should not expose the removed profile page', async function ()
    {
        const response = await request(app).get('/profile');

        expect(response.status).toBe(404);
        expect(response.text).toContain('Page not found');
    });

    it('should not expose the removed reports page', async function ()
    {
        const pageResponse = await request(app).get('/reports');

        expect(pageResponse.status).toBe(404);
        expect(pageResponse.text).toContain('Page not found');
    });

    it('should not expose the removed in-app pricing page', async function ()
    {
        const response = await request(app).get('/pricing');

        expect(response.status).toBe(404);
        expect(response.text).toContain('Page not found');
    });

    it('should render account controls in the demo topbar without a profile link', async function ()
    {
        const response = await request(app).get('/demo');

        expect(response.status).toBe(200);
        expect(response.text).toContain('owner@example.com');
        expect(response.text).toContain('data-logout-request');
        expect(response.text).not.toContain('href="/profile"');
        expect(response.text).not.toContain('href="/demo/reports"');
        expect(response.text).not.toContain('href="/demo/pricing"');
    });

    it('should not expose temporary error test routes', async function ()
    {
        const response = await request(app).get('/test-500');

        expect(response.status).toBe(404);
        expect(response.type).toContain('html');
        expect(response.text).toContain('Page not found');
    });

    it('should redirect unauthenticated dashboard pages to sign in', async function ()
    {
        const response = await request(app).get('/dashboard');

        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/sign-in?next=%2Fdashboard');
    });

    it('should require authentication for password changes', async function ()
    {
        const response = await request(app)
            .put('/api/user/auth/password')
            .send(
                {
                    currentPassword: 'CurrentPassword123!',
                    newPassword: 'DifferentPassword123!',
                    confirmPassword: 'DifferentPassword123!'
                }
            );

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Unauthorized');
    });

    it('should require authentication for payment method update links', async function ()
    {
        const response = await request(app).post('/api/user/billing/payment-method/update-link');

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Unauthorized');
    });

    it('should only include internal allowlisted paths in sign in next redirects', async function ()
    {
        const response = await request(app).get('/dashboard').query({ next: 'https://169.254.169.254/latest/meta-data' });

        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/sign-in?next=%2Fdashboard%3Fnext%3Dhttps%253A%252F%252F169.254.169.254%252Flatest%252Fmeta-data');
    });

    it('should render admin sign in and protect panel shells', async function ()
    {
        const signInResponse = await request(app).get('/admin/sign-in');
        const panelResponse = await request(app).get('/admin/overview');
        const pricingResponse = await request(app).get('/admin/pricing');

        expect(signInResponse.status).toBe(200);
        expect(signInResponse.text).toContain('Admin sign in');
        expect(panelResponse.status).toBe(302);
        expect(panelResponse.header.location).toBe('/admin/sign-in');
        expect(pricingResponse.status).toBe(302);
        expect(pricingResponse.header.location).toBe('/admin/sign-in');
    });

    it('should render password reset pages', async function ()
    {
        const forgotResponse = await request(app).get('/forgot-password');
        const resetResponse = await request(app).get('/reset-password').query({ token: 'test-token' });

        expect(forgotResponse.status).toBe(200);
        expect(forgotResponse.text).toContain('Reset password');
        expect(resetResponse.status).toBe(200);
        expect(resetResponse.text).toContain('New password');
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
