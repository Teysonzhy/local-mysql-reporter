/**
 * Tauri `beforeDevCommand` 钩子。
 * 设置 TAURI_SKIP_BEFORE_DEV=1 时不启动第二个 Vite（用于：终端 1 已手动 `npm run dev`）。
 */
const { spawn } = require("child_process");

if (process.env.TAURI_SKIP_BEFORE_DEV === "1") {
  console.log(
    "[demo] TAURI_SKIP_BEFORE_DEV=1 → 跳过启动 Vite（请确保已有进程监听 devUrl 端口）"
  );
  process.exit(0);
}

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
