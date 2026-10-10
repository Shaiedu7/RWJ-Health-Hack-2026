import tseslint from "typescript-eslint";
import awscdk from "eslint-plugin-awscdk";

export default tseslint.config(
  { ignores: ["node_modules/**", "review/**"] },
  ...tseslint.configs.strict,
  {
    files: ["bin/**/*.ts", "lib/patients-stack.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    plugins: { awscdk },
    rules: { ...awscdk.configs.recommended.rules },
  },
);
