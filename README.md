# local-mysql-reporter · 演示（Tauri）

用于验证 **Tauri `invoke` → Rust → MySQL** 链路；确认无误后再做正式功能与安装包。

## 环境要求

- **Node.js**（建议 18+）与 **npm**
- **Rust**（[rustup](https://rustup.rs/) 安装后终端里能执行 `cargo`）
- 本机 **MySQL**，已按仓库根目录 `docs/DATABASE.md` 建库，并已执行 `docs/schema.sql`

### 故障排除：`cargo metadata` / `No such file or directory (os error 2)`

说明当前环境**找不到 `cargo`**（未安装 Rust，或 **PATH 里没有 `~/.cargo/bin`**）。Tauri 依赖 `cargo`，必须先解决。

**1. 安装 Rust（macOS / Linux）**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

按提示选默认选项即可。装完后执行：

```bash
source "$HOME/.cargo/env"
```

或**新开一个终端窗口**，再执行：

```bash
which cargo
cargo --version
```

应能打印路径与版本号。

**2. 若终端里正常，但 Cursor 里仍报错**

把 Cargo 加入 PATH（zsh 示例，写入 `~/.zshrc`）：

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

保存后执行 `source ~/.zshrc`，**完全退出并重开 Cursor**，再在集成终端里运行 `npm run tauri dev`。

**3. Windows**

从 [rustup.rs](https://rustup.rs/) 下载安装包，安装完成后新开 **cmd / PowerShell**，确认 `cargo -V` 可用，再在同样环境里跑 Tauri。

## 配置 `.env`

在仓库**根目录**（与 `docs/` 同级）或 **`demo-tauri/`** 下放置 `.env`（可复制根目录 `.env.example`），至少包含：

- `MYSQL_HOST` / `MYSQL_PORT`
- `MYSQL_DATABASE=financial_reporting`
- `MYSQL_USER` / **`MYSQL_PASSWORD`**（必填；若缺失会出现 `Access denied ... (using password: NO)`）

示例：

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=financial_reporting
MYSQL_USER=coco
MYSQL_PASSWORD=你的密码
```

演示进程会从**当前工作目录向上**查找 `.env`。若系统环境里单独设置了 `MYSQL_USER` 但未设置密码，仍须保证 `.env` 被加载且含 `MYSQL_PASSWORD`（已修复旧逻辑导致的「不读 .env」问题）。

## 安装与运行

**必须用 Tauri 拉起窗口**（内含 WebView + Rust 后端），不要只用浏览器打开 Vite：

```bash
cd demo-tauri
npm install
npm run tauri dev
```

### 双终端启动（排查问题时推荐）

```bash
# 终端 1 —— 启动 Vite
cd demo-tauri
npm run dev:vite

# 终端 2 —— 启动 Tauri 桌面壳（等终端 1 就绪后再执行）
cd demo-tauri
npm run dev:tauri
```

首次会拉取 Rust 依赖，耗时可能较长。

### 常见错误：`Cannot read properties of undefined (reading 'invoke')`

原因：在**系统浏览器**里打开了 `http://localhost:1420`（只执行了 `npm run dev`）。此时没有 Tauri 注入的 `window.__TAURI_INTERNALS__`，`invoke` 会报错。

**正确做法**：使用上面命令 **`npm run tauri dev`**，在弹出的**桌面应用窗口**里操作；开发时也不要依赖浏览器标签页测 `invoke`。

### 只看到浏览器网页、没有桌面窗口

常见原因与处理：

1. **其实打开的是 Vite 的地址**  
   终端里会出现 `Local: http://localhost:1420/`（端口与 `vite.config.ts` / `tauri.conf.json` 中 `devUrl` 一致）。那是给 **Tauri 内嵌 WebView** 用的，**不要用 Chrome/Safari 去打开这个链接**当主界面。项目已在 `vite.config.ts` 里设置 `server.open: false`，避免自动弹出浏览器；若仍被其它工具代开，关掉浏览器标签即可。

### 常见错误：`Port 1420 is already in use` / `beforeDevCommand terminated`

说明上一次 **`vite` / `tauri dev` 仍在占用端口**，或别的程序占用了与 `vite.config.ts` 相同的端口（当前演示默认为 **1420**）。

**做法 A（推荐）**：结束占用进程后再启动。

```bash
# macOS / Linux：把下面端口换成终端里报错提示的端口（默认 1420）
lsof -i :1420
# 结束对应 PID（把 <PID> 换成上一步看到的数字）
kill <PID>
```

**做法 B**：改端口时须**同时**修改 `demo-tauri/vite.config.ts` 里的 `DEV_PORT` 与 `src-tauri/tauri.conf.json` 里的 `build.devUrl`，二者必须一致。

2. **首次运行要等 Rust 编译结束**  
   第一次执行 `npm run tauri dev` 可能要几分钟下载依赖并编译。只有 **`cargo` 编译成功** 后，才会出现**带标题栏的原生窗口**（标题类似 `local-mysql-reporter · Demo`）。请先看终端里是否报错（红色）、是否出现 `Finished dev` / 程序已运行 等字样；编译未完成时不会有桌面壳。

3. **窗口在后台或被挡住**  
   用 **Command+Tab（macOS）** 或 **Alt+Tab（Windows）** 看是否有新应用；或点程序坞 / 任务栏里的图标。

4. **必须在 `demo-tauri` 目录执行**  
   ```bash
   cd /path/to/local-mysql-reporter/demo-tauri
   npm run tauri dev
   ```  
   若在仓库根目录误执行，可能只跑了前端或找不到 `src-tauri`。

5. **WSL / 远程无桌面**  
   在 **WSL 纯终端** 或 **SSH 无图形** 环境下，原生窗口往往无法显示；请在 **macOS / Windows 本机桌面** 或 **带图形/WSLg 的环境** 里运行。

若终端里 **`cargo` 报错** 或长时间停在某一步，把**完整终端输出**复制出来便于排查。

### 等了几分钟仍没有「local-mysql-reporter · Demo」窗口

请先区分：**是 Rust 还在编**，还是**已经启动但你看不见窗口**。

**1）首编可能很慢（尤其依赖 `mysql` 时）**  
第一次 `npm run tauri dev` 可能要 **10～20 分钟**（下载 crate、编 openssl 等）。请盯终端是否出现类似 **`Finished`** `dev` **`profile`**、或进程已跑起来；只有 **`cargo run` 成功结束编译并启动**，才会弹窗。若一直停在 **`Blocking waiting for file lock on package cache`**，请关掉其它正在跑 `cargo` 的终端/IDE 任务，再等或按前文 `lsof`/`kill` 处理。

**2）程序坞里的名字可能不是窗口标题**  
macOS 程序坞可能显示 **`local-mysql-reporter-demo`**（来自 `productName`），请用 **Command+Tab** 切到该应用，或看是否多出一个非浏览器的图标。

**3）分两个终端排查（推荐）**  
先只起 Vite，再起 Tauri。**终端 1 不关**时，终端 2 **不要**用 `npm run tauri dev`：它会再次执行 `beforeDevCommand` 去起第二个 Vite，导致 **`Port 1420 is already in use`**。

正确做法：终端 2 **只**用下面的 `npm run dev:tauri`（内部已设置 `TAURI_SKIP_BEFORE_DEV`，不会抢端口）：

```bash
# 终端 1 —— 先启动 Vite（保持运行）
cd demo-tauri
npm run dev:vite
```

看到 `Local: http://localhost:1420/` 后，再开：

```bash
# 终端 2 —— 只编译并启动桌面壳（连接已有 Vite；勿用 npm run tauri dev）
cd demo-tauri
npm install
npm run dev:tauri
```

若终端 2 里出现 **编译错误**（红色），把整段日志复制出来。

**单终端**仍可用：`npm run tauri dev`（会由 `scripts/before-dev.cjs` 正常拉起一个 Vite）。

**4）单独确认 Rust 能否编过**（可选）

```bash
cd demo-tauri/src-tauri
cargo build
```

若这里失败，窗口一定不会出现；把报错贴出即可。

## 界面说明

当前前端为 **应用壳**：左侧导航（概览 / 数据连接 / 导入数据 / 报表）。

- **数据连接**：数据库调试按钮与输出区  
- **导入数据**：选择 CSV / xlsx，指定目标表与选项后批量 `INSERT`（见下）  
- **报表**：占位  

## 导入 CSV / xlsx（已实现）

1. 目标表须**已存在于**当前库；首行表头列名需与表字段名一致（不区分大小写）；自增 `id` 可省略。  
2. **CSV**：可选分隔符 `,` / Tab / `;`。  
3. **xlsx**：默认第一张工作表，也可填工作表名称。  
4. 每个文件在**单独事务**中插入；多文件依次执行。  
5. Rust：`pick_import_files`、`list_user_tables`、`import_tabular_files`（见 `src-tauri/src/tabular_import.rs`）。

## 演示内容（数据连接页）

三个按钮对应 Rust 命令：

| 按钮 | `invoke` 名 | 说明 |
|------|----------------|------|
| 测试数据库连接 | `db_health` | `SELECT VERSION()`，返回 JSON |
| 读取 table_edit_lock | `list_table_edit_locks` | 查询锁表元数据 |
| 业务表行数预览 | `preview_business_counts` | `dim_period` / `dim_account` / `rpt_amount` 行数 |

## 打包说明

当前 `src-tauri/tauri.conf.json` 中 **`bundle.active` 为 `false`**，便于无图标环境下开发。正式发版时再打开 bundle、准备图标并执行 `npm run tauri build`（见 [Tauri 打包文档](https://v2.tauri.app/distribute/)）。
