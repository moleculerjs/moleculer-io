const globals = require("globals");
const pluginN = require("eslint-plugin-n");
const pluginPromise = require("eslint-plugin-promise");
const pluginSecurity = require("eslint-plugin-security");
const pluginPrettier = require("eslint-plugin-prettier/recommended");

module.exports = [
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "commonjs",
			globals: {
				...globals.node,
				...globals.jest
			}
		},
		plugins: {
			n: pluginN,
			promise: pluginPromise,
			security: pluginSecurity
		},
		rules: {
			"no-var": "error",
			"no-console": "error",
			"no-unused-vars": "warn",
			"no-trailing-spaces": "error",
			"security/detect-object-injection": "off",
			"security/detect-non-literal-require": "off",
			"security/detect-non-literal-fs-filename": "off",
			"n/no-unpublished-require": "off"
		}
	},
	pluginPrettier
];
