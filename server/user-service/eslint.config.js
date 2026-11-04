import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default tseslint.config(
    { ignores: ["dist/", "node_modules/", "coverage/"] },

    js.configs.recommended,
    ...tseslint.configs.recommended,
    eslintPluginPrettierRecommended,

    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.node, ...globals.es2015 },
        },
        rules: {
            "no-console": "off",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
        },
    }
);
