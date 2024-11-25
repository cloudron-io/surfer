const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            ecmaVersion: 13,
            sourceType: "commonjs"
        },
        rules: {
            semi: "error",
            "prefer-const": "error"
        }
    }
];

