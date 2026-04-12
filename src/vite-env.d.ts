/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly BASE_URL: string
  // 更多环境变量可以在这里添加
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}