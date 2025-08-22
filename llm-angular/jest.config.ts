import type { Config } from 'jest';

const config: Config = {
    preset: 'jest-preset-angular',
    testEnvironment: 'jsdom',
    // No custom resolver; default works with preset

    // ✅ Transform TS and inline/external HTML templates
    transform: {
        '^.+\\.(ts|html)$': [
            'jest-preset-angular',
            { tsconfig: '<rootDir>/tsconfig.spec.json', stringifyContentPathRegex: '\\.(html|svg)$' }
        ],
    },

    // ✅ Force Jest to transpile ESM packages (Angular publishes only ESM now)
    transformIgnorePatterns: [
        'node_modules/(?!.*\\.mjs$)',
    ],

    extensionsToTreatAsEsm: ['.ts'],
    moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
    setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
    testEnvironmentOptions: {
        customExportConditions: ['browser', 'default']
    },

    // ✅ Fix TS path mapping & ESM import endings
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.mjs$': '$1',
        '\\.(css|scss|sass|less)$': '<rootDir>/__mocks__/styleMock.js',
    },

    reporters: [
        'default',
        ['jest-html-reporters', {
            publicPath: './reports',
            filename: 'index.html',
            expand: true,
            pageTitle: 'Angular Unit Tests'
        }]
    ]
};

export default config;
