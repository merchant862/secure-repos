import request from 'supertest';
import { vi } from 'vitest';

import app from '../src/app/app';
import { UserSession } from '../src/db/models';

describe('Application routes', function ()
{
    it('should set browser security headers', async function ()
    {
        const response = await request(app).get('/');

        expect(response.header['content-security-policy']).toContain("frame-ancestors 'none'");
        expect(response.header['content-security-policy']).toContain("'nonce-");
        expect(response.header['x-content-type-options']).toBe('nosniff');
        expect(response.header['x-frame-options']).toBe('DENY');
    });

    it('should render structured data with a CSP nonce on public pages', async function ()
    {
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.text).toContain('type="application/ld+json" nonce="');
        expect(response.text).toContain('"@type":"SoftwareApplication"');
        expect(response.text).toContain('/public/images/og-secure-repos.png');
    });

    it('should redirect alternate production hosts to the configured canonical domain', async function ()
    {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalAppUrl = process.env.APP_URL;

        process.env.NODE_ENV = 'production';
        process.env.APP_URL = 'https://securerepos.com';

        try
        {
            const response = await request(app)
                .get('/faqs?source=test')
                .set('Host', 'www.securerepos.com')
                .set('X-Forwarded-Proto', 'https');

            expect(response.status).toBe(301);
            expect(response.header.location).toBe('https://securerepos.com/faqs?source=test');
        }
        finally
        {
            if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = originalNodeEnv;

            if (originalAppUrl === undefined) delete process.env.APP_URL;
            else process.env.APP_URL = originalAppUrl;
        }
    });

    it('should not self-redirect the canonical host when TLS terminates at a reverse proxy', async function ()
    {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalAppUrl = process.env.APP_URL;

        process.env.NODE_ENV = 'production';
        process.env.APP_URL = 'https://securerepos.com';

        try
        {
            const response = await request(app)
                .get('/')
                .set('Host', 'securerepos.com');

            expect(response.status).toBe(200);
            expect(response.header.location).toBeUndefined();
        }
        finally
        {
            if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = originalNodeEnv;

            if (originalAppUrl === undefined) delete process.env.APP_URL;
            else process.env.APP_URL = originalAppUrl;
        }
    });

    it('should expose robots.txt and sitemap.xml for search engines', async function ()
    {
        const robotsResponse = await request(app).get('/robots.txt');
        const sitemapResponse = await request(app).get('/sitemap.xml');

        expect(robotsResponse.status).toBe(200);
        expect(robotsResponse.type).toContain('text');
        expect(robotsResponse.text).toContain('User-agent: *');
        expect(robotsResponse.text).toContain('Sitemap:');

        expect(sitemapResponse.status).toBe(200);
        expect(sitemapResponse.type).toContain('xml');
        expect(sitemapResponse.text).toContain('<urlset');
        const baseUrl = (process.env.APP_URL || 'https://securerepos.com').replace(/\/$/, '');
        expect(sitemapResponse.text).toContain(`<loc>${baseUrl}/</loc>`);
        expect(sitemapResponse.text).toContain(`<loc>${baseUrl}/faqs</loc>`);
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

    it('should require a scoped token for CLI endpoints', async function ()
    {
        const response = await request(app).get('/api/cli/v1/me');

        expect(response.status).toBe(401);
        expect(response.header['cache-control']).toBe('no-store');
        expect(response.body.message).toContain('CLI access token');
    });

    it('should not accept CLI tokens on account or billing APIs', async function ()
    {
        const sessionLookup = vi.spyOn(UserSession, 'findOne').mockResolvedValue(null);
        const response = await request(app)
            .get('/api/user/billing')
            .set('Authorization', `Bearer srp_cli_${'a'.repeat(43)}`);

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Unauthorized');
        expect(sessionLookup).toHaveBeenCalledOnce();
        sessionLookup.mockRestore();
    });

    it('should only include internal allowlisted paths in sign in next redirects', async function ()
    {
        const response = await request(app).get('/dashboard').query({ next: 'https://169.254.169.254/latest/meta-data' });

        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/sign-in?next=%2Fdashboard%3Fnext%3Dhttps%253A%252F%252F169.254.169.254%252Flatest%252Fmeta-data');
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

    it('should redirect github install callback with installation_id back to onboarding', async function ()
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
        expect(response.header.location).toContain('/onboarding?github=installed');
        expect(response.header.location).toContain('installation_id=12345');
    });

    it('should redirect github install callback without installation_id back to onboarding', async function ()
    {
        const response = await request(app)
            .get('/github/install/callback');

        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/onboarding?github=cancelled');
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
