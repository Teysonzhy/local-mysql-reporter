import { invoke } from "@tauri-apps/api/core";

export function isTauriShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function safeInvoke<T>(
  name: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isTauriShell()) {
    throw new Error(
      "当前不是 Tauri 窗口。\n\n请在 demo-tauri 目录执行：npm run tauri dev\n（不要用浏览器单独打开 localhost:1420）。"
    );
  }
  return invoke<T>(name, args);
}
