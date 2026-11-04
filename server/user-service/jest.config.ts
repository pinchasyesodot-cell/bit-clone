export default {
    testEnvironment: "node",
    extensionsToTreatAsEsm: [".ts"],
    moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
    transform: {
        "^.+\\.ts$": ["@swc/jest", { jsc: { target: "es2022" } }],
    },
};
