import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default tseslint.config(
    { ignores: ["dist/", "node_modules/", "coverage/"] },

    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended,

    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.node, ...globals.es2015 },
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["eslint.config.js", "jest.config.ts"],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "no-console": "off",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
        },
    }
);
