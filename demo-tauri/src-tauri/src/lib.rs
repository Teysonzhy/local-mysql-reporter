mod tabular_import;
mod ledger;
mod member;
mod coach;
mod routine;
mod reports;
mod salary_structure;
mod import_data;

use mysql::prelude::*;
use mysql::{OptsBuilder, Pool};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DbHealth {
    ok: bool,
    mysql_version: Option<String>,
    database: String,
    message: String,
}

/// 从当前工作目录向上查找 `.env` 并加载。
/// 注意：不能因环境里已有 `MYSQL_USER` 就跳过加载，否则会出现「using password: NO」。
pub(crate) fn load_env_from_parents() {
    let mut dir = match std::env::current_dir() {
        Ok(d) => Some(d),
        Err(_) => None,
    };
    for _ in 0..12 {
        if let Some(ref d) = dir {
            let env_path = d.join(".env");
            if env_path.is_file() {
                let _ = dotenvy::from_path(&env_path);
                return;
            }
            let mut next = d.clone();
            if !next.pop() {
                break;
            }
            dir = Some(next);
        }
    }
    let _ = dotenvy::dotenv();
}

pub(crate) fn connect_pool() -> Result<Pool, String> {
    load_env_from_parents();

    let host = std::env::var("MYSQL_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("MYSQL_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3306);
    let user = std::env::var("MYSQL_USER").unwrap_or_else(|_| "coco".to_string());
    let password = std::env::var("MYSQL_PASSWORD").unwrap_or_default();
    let database = std::env::var("MYSQL_DATABASE").unwrap_or_else(|_| "financial_reporting".to_string());

    if password.is_empty() {
        return Err(
            "MYSQL_PASSWORD 为空：请在仓库根目录（与 docs 同级）或 demo-tauri 目录放置 .env，并设置 MYSQL_PASSWORD=你的密码；保存后重启本应用。"
                .to_string(),
        );
    }

    let opts = OptsBuilder::default()
        .user(Some(user))
        .pass(Some(password))
        .ip_or_hostname(Some(host))
        .tcp_port(port)
        .db_name(Some(database));

    Pool::new(opts).map_err(|e| format!("创建连接池失败: {e}"))
}

/// 测试数据库连接并返回 MySQL 版本（JSON 字符串便于前端展示）。
#[tauri::command]
fn db_health() -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| format!("获取连接失败: {e}"))?;

    let version: Option<String> = conn
        .query_first("SELECT VERSION()")
        .map_err(|e| format!("查询版本失败: {e}"))?;

    let database = std::env::var("MYSQL_DATABASE").unwrap_or_else(|_| "financial_reporting".to_string());

    let payload = DbHealth {
        ok: true,
        mysql_version: version,
        database: database.clone(),
        message: format!("已连接数据库 `{database}`。"),
    };

    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

/// 列出 `table_edit_lock` 中的记录（文本）。
#[tauri::command]
fn list_table_edit_locks() -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| format!("获取连接失败: {e}"))?;

    let rows: Vec<(String, String, Option<String>, i8)> = conn
        .query_map(
            "SELECT table_name, CAST(locked_at AS CHAR), lock_reason, locked_from_ui \
             FROM table_edit_lock ORDER BY table_name",
            |(table_name, locked_at, lock_reason, locked_from_ui): (
                String,
                String,
                Option<String>,
                i8,
            )| { (table_name, locked_at, lock_reason, locked_from_ui) },
        )
        .map_err(|e| format!("查询 table_edit_lock 失败: {e}"))?;

    if rows.is_empty() {
        return Ok("table_edit_lock：暂无记录。".to_string());
    }

    let mut lines: Vec<String> = Vec::new();
    lines.push(String::from("table_edit_lock："));
    for (name, at, reason, from_ui) in rows {
        lines.push(format!(
            "- {name} | locked_at={at} | reason={} | from_ui={from_ui}",
            reason.unwrap_or_else(|| "-".to_string())
        ));
    }
    Ok(lines.join("\n"))
}

/// 业务表行数预览（演示用）。
#[tauri::command]
fn preview_business_counts() -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| format!("获取连接失败: {e}"))?;

    let tables = [
        "member", "coach", "course",
        "daily_ledger", "expense_item", "income_item",
        "daily_expense", "teaching_diary", "trial_class", "coach_leave",
    ];

    let mut lines: Vec<String> = Vec::new();
    lines.push(String::from("业务表行数："));
    for t in &tables {
        let sql = format!("SELECT COUNT(*) FROM `{}`", t);
        match conn.query_first::<(i64,), _>(&sql) {
            Ok(Some((c,))) => lines.push(format!("- {}: {}", t, c)),
            _ => lines.push(format!("- {}: (表不存在)", t)),
        }
    }
    Ok(lines.join("\n"))
}

mod file_export;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            db_health,
            list_table_edit_locks,
            preview_business_counts,
            tabular_import::pick_import_files,
            tabular_import::list_user_tables,
            tabular_import::import_tabular_files,
            tabular_import::pick_import_folder,
            tabular_import::batch_import_by_folder,
            ledger::save_ledger,
            ledger::load_ledger,
            ledger::list_ledger_months,
            ledger::generate_ledger_data,
            ledger::inherit_ledger,
            ledger::load_global_remark,
            ledger::save_global_remark,
            ledger::generate_monthly_report,
            reports::fetch_report_dataset,
            reports::seed_demo_financial_data,
            reports::overview_stats,
            member::list_members,
            member::list_member_hours,
            member::get_member,
            member::create_member,
            member::update_member,
            member::delete_member,
            member::import_members_from_file,
            coach::list_coaches,
            coach::save_coach,
            coach::delete_coach,
            coach::list_courses,
            coach::save_course,
            coach::delete_course,
            routine::list_teaching_diaries,
            routine::save_teaching_diary,
            routine::delete_teaching_diary,
            routine::list_daily_expenses,
            routine::save_daily_expense,
            routine::delete_daily_expense,
            routine::list_trial_classes,
            routine::save_trial_class,
            routine::delete_trial_class,
            routine::list_coach_leaves,
            routine::save_coach_leave,
            routine::delete_coach_leave,
            file_export::write_file_base64,
            salary_structure::list_salary_structure,
            salary_structure::save_salary_structure,
            salary_structure::delete_salary_structure,
            salary_structure::list_coach_salary,
            salary_structure::save_coach_salary,
            salary_structure::delete_coach_salary,
            import_data::import_member_data,
            import_data::import_booking_data,
            import_data::load_import_to_member,
            import_data::load_import_to_coach_course,
            import_data::load_coach_stats,
            import_data::list_coach_stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
