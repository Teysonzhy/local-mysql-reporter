# local-mysql-reporter

本地桌面应用（**Tauri**）：从本机目录导入 **CSV / .xlsx** 到 **MySQL**，维护报表定义并执行查询与受控写入；支持「手工编辑后锁表」语义（见设计文档）。

## 文档索引

| 文件 | 说明 |
|------|------|
| [docs/DESIGN.md](docs/DESIGN.md) | 已确认需求、架构、锁表与同步约定 |
| [docs/DATABASE.md](docs/DATABASE.md) | 库名 `financial_reporting`、账号初始化步骤 |
| [docs/schema.sql](docs/schema.sql) | 元数据表 + 业务表草案（含自增主键） |
| [docs/API.md](docs/API.md) | 以 **Tauri invoke** 为主的契约说明 |

## 配置

1. 复制 `.env.example` 为 `.env`，填写 **本地 MySQL 密码**（**勿提交** `.env`）。
2. 按 `DATABASE.md` 创建数据库与用户并导入 `docs/schema.sql`。

## 演示工程（Tauri）

目录：`demo-tauri/`。用于验证 **invoke + MySQL**；运行方式见 [demo-tauri/README.md](demo-tauri/README.md)（需本机安装 **Rust** 与 **MySQL**，并配置根目录 `.env`）。

## 本地迭代

- 以 `docs/` 下文件为单一事实来源；演示确认后再扩展正式功能与安装包打包。

## 安全提示

- 数据库密码、生产连接串 **仅放在本机**（`.env` 或系统凭据），**不要**写入 Git。
