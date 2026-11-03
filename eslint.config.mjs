import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const eslintConfig = [
  { ignores: [".next/**", ".open-next/**", ".sst/**", "node_modules/**", "next-env.d.ts", "sst-env.d.ts", "sst.config.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
]

export default eslintConfig
