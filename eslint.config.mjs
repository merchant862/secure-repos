import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const nodeGlobals =
{
    Buffer: 'readonly',
    clearInterval: 'readonly',
    clearTimeout: 'readonly',
    console: 'readonly',
    module: 'readonly',
    process: 'readonly',
    setInterval: 'readonly',
    setTimeout: 'readonly',
    URL: 'readonly'
};

const browserGlobals =
{
    document: 'readonly',
    fetch: 'readonly',
    FormData: 'readonly',
    Headers: 'readonly',
    localStorage: 'readonly',
    navigator: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    window: 'readonly'
};

export default tseslint.config(
    {
        ignores:
        [
            'coverage/**',
            'dist/**',
            'node_modules/**',
            'packages/**',
            'src/db/config/**',
            'src/db/migrations/**'
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts', 'tests/**/*.ts'],
        languageOptions:
        {
            parserOptions:
            {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            },
            globals: nodeGlobals
        },
        rules:
        {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-control-regex': 'off',
            'no-useless-assignment': 'off',
            'no-useless-escape': 'off',
            'preserve-caught-error': 'off'
        }
    },
    {
        files: ['src/public/js/**/*.js'],
        languageOptions:
        {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals:
            {
                ...browserGlobals,
                alert: 'readonly',
                console: 'readonly',
                confirm: 'readonly',
                EventSource: 'readonly',
                setTimeout: 'readonly'
            }
        },
        rules:
        {
            '@typescript-eslint/no-unused-vars': 'off',
            'no-unused-vars': 'off'
        }
    },
    {
        files: ['scripts/**/*.js', 'tools/**/*.js', '*.js', '*.cjs'],
        languageOptions:
        {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals:
            {
                ...nodeGlobals,
                __dirname: 'readonly',
                exports: 'readonly',
                fetch: 'readonly',
                module: 'readonly',
                require: 'readonly'
            }
        },
        rules:
        {
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-unused-vars': 'off'
        }
    }
);
