import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: [
      "components/ai-elements/**/*.tsx",
      "components/app-sidebar.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["pdfs/**/*.tsx"],
    rules: {
      "jsx-a11y/alt-text": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // SDK dist
    "packages/sdk/dist/**",
    // Generated files
    "lib/**/*.d.ts",
    "lib/**/*.js",
    // Fumadocs generated source
    ".source/**",
    // Workflow DevKit generated routes
    "app/.well-known/workflow/**",
    // Claude Code worktrees (isolated branch copies)
    ".claude/worktrees/**",
    // agent-browser session data (Chrome profile, extensions)
    ".auth/**",
    // Local scratch (gitignored)
    "tmp/**",
  ]),
]);

export default eslintConfig;
