import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = [
  { ignores: [".next/**", ".open-next/**", ".sst/**", "node_modules/**", "next-env.d.ts", "sst-env.d.ts", "sst.config.ts"] },
  ...nextVitals,
  ...nextTs,
]

export default eslintConfig
