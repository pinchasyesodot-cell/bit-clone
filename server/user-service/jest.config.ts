export default {
    testEnvironment: "node",
    setupFiles: ["<rootDir>/test/setup-env.ts"],
    extensionsToTreatAsEsm: [".ts"],
    moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
    transform: {
        "^.+\\.ts$": ["@swc/jest", { jsc: { target: "es2022" } }],
    },
};
