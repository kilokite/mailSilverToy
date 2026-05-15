import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // dev 时后端独立进程的地址；生产时前端产物会被 mailSilver 同源托管
  const devBackend = env.VITE_DEV_BACKEND ?? 'http://localhost:23879'

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: devBackend, changeOrigin: true },
        '/web_hook': { target: devBackend, changeOrigin: true },
      },
    },
    build: {
      // 把构建产物直接输出到后端的 public 目录，便于后端托管 & 打包一起部署
      outDir: '../mailSilver/public',
      emptyOutDir: true,
    },
  }
})
