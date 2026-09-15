import { defineConfig } from 'vitest/config';

export default defineConfig(
{
    test:
    {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**'],
        coverage:
        {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/**/*.ts'],
            exclude:
            [
                'src/db/migrations/**',
                'src/main/**'
            ],
            thresholds:
            {
                lines: 24,
                branches: 18,
                functions: 22,
                statements: 24
            }
        }
    }
});
