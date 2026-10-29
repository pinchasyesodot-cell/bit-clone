import type { Config } from "jest";

const config: Config = {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    extensionsToTreatAsEsm: [".ts"],
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
    },
    testMatch: ["**/*.test.ts"],
    setupFiles: ["<rootDir>/test/setup-env.ts"],
    clearMocks: true,
    restoreMocks: true,
};

export default config;
