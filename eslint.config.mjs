import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: {
                ...globals.node,
            }
        },
        rules: {
            semi: "error",
            "prefer-const": "error"
        }
    }
];
