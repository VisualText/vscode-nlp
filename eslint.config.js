// ESLint flat configuration (ESLint 9+).
//
// The `lint` script had been dead since the ESLint 9 bump: no .eslintrc.json was ever
// migrated, so `eslint` exited 2 on "couldn't find an eslint.config.js" and took the
// `pretest` hook down with it.
//
// The rule set is deliberately narrow. This is a 25k-line codebase that has never been
// linted, so turning on the full recommended set would bury a real finding under
// thousands of stylistic ones. What is enabled here are the rules that catch bugs --
// not the ones that express a preference -- and the codebase is clean against them.
// Tighten incrementally: move one rule at a time from the commented block at the
// bottom up into `rules`, fix the fallout, commit.

const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
    {
        // Never lint build output, dependencies, the grammar submodule, or the
        // separately-deployed Cloudflare worker.
        ignores: [
            'dist/**',
            'out-format/**',
            'out-language/**',
            'out-treeview/**',
            'node_modules/**',
            'grammars/**',
            'telemetry-worker/**',
            'tmp/**',
        ],
    },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: 'module',
            parserOptions: {
                // No `project` here on purpose: type-aware linting triples the run time
                // and none of the rules below need type information.
                ecmaFeatures: {},
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            // --- genuine bug catchers -------------------------------------------------
            'no-cond-assign': 'error',           // if (x = y) when == was meant
            'no-dupe-keys': 'error',             // silently dropped object properties
            'no-dupe-else-if': 'error',          // a branch that can never be taken
            'no-duplicate-case': 'error',        // dead switch case
            'no-unsafe-negation': 'error',       // !a in b
            'no-unreachable': 'error',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-self-assign': 'error',
            'no-self-compare': 'error',
            'no-sparse-arrays': 'error',
            'use-isnan': 'error',
            'valid-typeof': 'error',
            'no-fallthrough': 'error',
            'no-async-promise-executor': 'error',
            'require-atomic-updates': 'off',     // too noisy on async VSCode handlers

            // A caught error that is discarded is usually a swallowed failure, but this
            // codebase deliberately ignores plenty of fs errors, so only require that
            // an empty block says so with a comment.
            'no-empty': ['error', { allowEmptyCatch: false }],

            // --- TypeScript-specific --------------------------------------------------
            '@typescript-eslint/no-misused-new': 'error',
            '@typescript-eslint/no-unnecessary-type-constraint': 'error',
            '@typescript-eslint/no-duplicate-enum-values': 'error',
            '@typescript-eslint/prefer-as-const': 'error',

            // Dead code: an unused import, parameter or local. A name starting with
            // an underscore is exempt, which is how something that must exist but
            // is not read says so deliberately -- a parameter satisfying an
            // interface, or the `_line` in textFile.ts whose assignment is what
            // advances the reader.
            // caughtErrors stays off: `catch (err)` without touching err is used
            // throughout, and no-empty already forces such blocks to explain
            // themselves.
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
            }],

            // --- rules the compiler already covers, or that fight the code style ------
            'no-undef': 'off',                   // tsc does this properly for TS
            'no-unused-vars': 'off',             // superseded by the typed rule above
        },

        // Rules worth adopting later, once the existing violations are worked through:
        //   '@typescript-eslint/no-unused-vars'    -- dozens of stale imports/locals
        //   '@typescript-eslint/no-explicit-any'   -- noImplicitAny is already off
        //   'eqeqeq'                               -- widespread == in older modules
        //   'prefer-const'                         -- widespread `let` that never changes
    },
    {
        // Plain-Node build helpers: CommonJS, not TypeScript.
        files: ['scripts/**/*.js', 'eslint.config.js', 'webpack.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
        },
        rules: {
            'no-cond-assign': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
        },
    },
];
