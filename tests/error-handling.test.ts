import express from 'express';
import path from 'path';
import request from 'supertest';

import { errorMiddleware, notFoundMiddleware } from '../src/app/middlewares/error.middleware';

function createErrorTestApp()
{
    const testApp = express();
    testApp.set('view engine', 'ejs');
    testApp.set('views', path.join(process.cwd(), 'src', 'views'));
    testApp.get('/api/fail', function ()
    {
        throw new Error('Database connection detail');
    });
    testApp.get('/fail', function ()
    {
        throw new Error('Private template detail');
    });
    testApp.use(notFoundMiddleware);
    testApp.use(errorMiddleware);
    return testApp;
}

describe('Error responses', function ()
{
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(function ()
    {
        process.env.NODE_ENV = originalNodeEnv;
    });

    it('returns JSON for missing API resources', async function ()
    {
        const response = await request(createErrorTestApp()).get('/api/missing');

        expect(response.status).toBe(404);
        expect(response.type).toContain('json');
        expect(response.body).toEqual({ message: 'Resource not found' });
    });

    it('hides API error details outside development', async function ()
    {
        process.env.NODE_ENV = 'production';
        const response = await request(createErrorTestApp()).get('/api/fail');

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ message: 'Internal Server Error' });
    });

    it('returns the API error message in development', async function ()
    {
        process.env.NODE_ENV = 'development';
        const response = await request(createErrorTestApp()).get('/api/fail');

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ message: 'Database connection detail' });
    });

    it('renders the themed 404 page for non-API routes', async function ()
    {
        const response = await request(createErrorTestApp()).get('/missing-page');

        expect(response.status).toBe(404);
        expect(response.type).toContain('html');
        expect(response.text).toContain('Page not found');
        expect(response.text).toContain('Return home');
    });

    it('always hides error details on non-API 500 pages', async function ()
    {
        process.env.NODE_ENV = 'development';
        const response = await request(createErrorTestApp()).get('/fail');

        expect(response.status).toBe(500);
        expect(response.type).toContain('html');
        expect(response.text).toContain('Internal Server Error');
        expect(response.text).not.toContain('Private template detail');
    });
});
