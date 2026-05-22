// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            '.output/**',
            '.tanstack/**',
            '.vinxi/**',
            'src/routeTree.gen.ts',
            '**/*.bak',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: { 'react-hooks': reactHooks },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            // ---- Hooks correctness ----
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // ---- Pragmatic relaxations for a TS app with existing code ----
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-useless-escape': 'warn',
            'no-control-regex': 'off',
            'no-useless-assignment': 'off',
            'preserve-caught-error': 'off',

            // ---- Layer-boundary enforcement ----
            // Forbid importing src/db/** from anywhere outside the persistence
            // layer (src/data + src/db itself + foundational auth modules).
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/db/client', '**/db/schema', '**/db/migrate'],
                            message:
                                'Persistence layer (src/db) must only be imported from src/data, src/db itself, or foundational auth modules.',
                        },
                    ],
                },
            ],
        },
    },

    // Route shells: keep thin (Route definition + page composition only).
    // Bumped to accommodate src/routes/_app/assets.tsx (~1350 lines) — its
    // columns close over mutations so it stays monolithic by design.
    {
        files: ['src/routes/**/*.{ts,tsx}'],
        rules: {
            'max-lines': [
                'warn',
                { max: 1400, skipBlankLines: true, skipComments: true },
            ],
        },
    },

    // Feature components: each should be focused
    {
        files: ['src/features/**/components/*.{ts,tsx}'],
        rules: {
            'max-lines': [
                'warn',
                { max: 800, skipBlankLines: true, skipComments: true },
            ],
        },
    },

    // Allowlist: foundational modules that legitimately need db access
    {
        files: [
            'src/db/**/*.{ts,tsx}',
            'src/data/**/*.{ts,tsx}',
            'src/lib/auth.ts',
            'src/lib/auth-guards.server.ts',
            'src/lib/session.server.ts',
            'src/lib/role-permissions.server.ts',
        ],
        rules: {
            'no-restricted-imports': 'off',
        },
    },

    // Server-only files: relax client-globals checks
    {
        files: ['**/*.server.ts', 'src/lib/server-utils.ts', 'src/data/**/*.ts'],
        languageOptions: {
            globals: { ...globals.node },
        },
    },

    // Tests
    {
        files: ['**/*.test.ts', '**/*.test.tsx'],
        rules: {
            'max-lines': 'off',
        },
    },
)
