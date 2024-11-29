import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue'

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
    },
    ...pluginVue.configs['flat/recommended'],
    // ...pluginVue.configs['flat/vue2-recommended'], // Use this if you are using Vue.js 2.x.
    {
        rules: {
            // override/add rules settings here, such as:
            'vue/html-self-closing': 'off',
            'vue/html-closing-bracket-spacing': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/attributes-order': 'off',
            'vue/max-attributes-per-line': 'off'
        }
    }
];
