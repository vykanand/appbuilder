module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2023: true,
    jest: true,
  },

  parser: "@babel/eslint-parser",
  parserOptions: {
    requireConfigFile: false,
    ecmaVersion: 2023,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },

  settings: {
    react: {
      version: "detect",
    },
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".json"],
      },
      alias: {
        map: [
          ["@", "./src"]
        ],
        extensions: [".js", ".jsx"]
      }
    },
  },

  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "airbnb",
    "airbnb/hooks",
    "prettier"
  ],

  plugins: [
    "react",
    "react-hooks",
    "jsx-a11y",
    "unused-imports",
    "import",
    "simple-import-sort",
  ],

  rules: {
    // 🔥 High-quality production rules used at FAANG-level orgs
    "no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "error",
      {
        vars: "all",
        varsIgnorePattern: "^_",
        args: "after-used",
        argsIgnorePattern: "^_",
      },
    ],

    // Best code quality
    "no-console": ["error", { allow: ["warn", "error"] }],
    "no-debugger": "error",
    "prefer-const": "error",
    "no-var": "error",
    "eqeqeq": ["error", "always"],

    // prevent accidental async bugs
    "require-await": "error",
    "no-return-await": "error",

    // React quality
    "react/prop-types": "off", // used only if required
    "react/jsx-uses-react": "off", // React 17+
    "react/react-in-jsx-scope": "off",
    "react/no-array-index-key": "warn",
    "react/jsx-no-useless-fragment": "error",
    "react-hooks/exhaustive-deps": "warn",

    // Import quality
    "import/order": "off",
    "simple-import-sort/imports": "error",
    "simple-import-sort/exports": "error",
    "import/no-unresolved": "error",
    "import/no-duplicates": "error",
    "import/no-cycle": ["error", { maxDepth: 1 }],
    "import/newline-after-import": "error",

    // strict rules for large enterprise codebases
    "no-multiple-empty-lines": ["error", { max: 1 }],
    "curly": "error",
    "no-param-reassign": ["error", { props: false }],
    "no-shadow": "warn",
    "no-use-before-define": ["error", { functions: false }],
    "consistent-return": "error",
    "no-nested-ternary": "warn",

    // Performance-focused
    "react/jsx-no-duplicate-props": "error",
    "react/no-direct-mutation-state": "error",
  },
};
