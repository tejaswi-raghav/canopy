import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [
  { ignores: ["out/**", ".next/**", "e2e/**", "node_modules/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
];
