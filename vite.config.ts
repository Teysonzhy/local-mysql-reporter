import { defineConfig } from "vite";

/** 与 `src-tauri/tauri.conf.json` 里 `build.devUrl` 端口保持一致 */
const DEV_PORT = 1420;
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  clearScreen: false,
  server: {
    /** 禁止自动打开系统浏览器；桌面壳由 Tauri 内嵌 WebView 加载本地址 */
    open: false,
    port: DEV_PORT,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: DEV_PORT + 1,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
