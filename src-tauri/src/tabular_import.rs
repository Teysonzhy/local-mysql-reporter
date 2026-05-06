//! 从 CSV / xlsx 导入行到已有 MySQL 表（首行表头与表列名匹配，不区分大小写）。

use calamine::{open_workbook_auto, Data, Reader};
use csv::ReaderBuilder;
use mysql::prelude::*;
use mysql::{Params, Pool, Value};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use crate::connect_pool;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTabularOptions {
    pub has_header: bool,
    /// 单字符，如 `,` `\t` `;`
    pub csv_delimiter: String,
    /// xlsx 工作表名；空则使用第一张表
    pub sheet_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTabularRequest {
    pub paths: Vec<String>,
    pub table: String,
    pub options: ImportTabularOptions,
}

fn validate_identifier(name: &str, label: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 64 {
        return Err(format!("{label} 长度无效"));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(format!("{label} 只能包含字母、数字与下划线"));
    }
    Ok(())
}

fn csv_delimiter_byte(s: &str) -> Result<u8, String> {
    let mut ch = s.chars();
    match (ch.next(), ch.next()) {
        (Some('\t'), None) => Ok(b'\t'),
        (Some(c), None) => Ok(c as u8),
        _ => Err("CSV 分隔符请填单个字符，制表符用 \\t".into()),
    }
}

fn strip_bom(s: &str) -> &str {
    s.strip_prefix('\u{feff}').unwrap_or(s)
}

fn cell_to_string(d: &Data) -> String {
    match d {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) => {
            if f.fract() == 0.0 {
                format!("{}", *f as i64)
            } else {
                format!("{}", f)
            }
        }
        Data::Int(i) => format!("{}", i),
        Data::Bool(b) => format!("{}", b),
        Data::DateTime(dt) => format!("{}", dt.as_f64()),
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(e) => format!("#ERR {}", e),
    }
}

fn parse_csv(
    path: &Path,
    delimiter: u8,
    has_header: bool,
) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let f = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut rdr = ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(false)
        .flexible(true)
        .from_reader(BufReader::new(f));

    let mut records = rdr
        .records()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("解析 CSV 失败: {e}"))?;

    if records.is_empty() {
        return Err("CSV 无数据行".into());
    }

    let (headers, data_rows) = if has_header {
        let header_rec = records.remove(0);
        let headers: Vec<String> = header_rec
            .iter()
            .map(|s| strip_bom(s.trim()).to_string())
            .collect();
        let data: Vec<Vec<String>> = records
            .iter()
            .map(|r| r.iter().map(|s| s.trim().to_string()).collect())
            .collect();
        (headers, data)
    } else {
        let n = records[0].len();
        let headers: Vec<String> = (0..n).map(|i| format!("col_{}", i + 1)).collect();
        let data: Vec<Vec<String>> = records
            .iter()
            .map(|r| r.iter().map(|s| s.trim().to_string()).collect())
            .collect();
        (headers, data)
    };

    Ok((headers, data_rows))
}

fn parse_xlsx(
    path: &Path,
    sheet_name: Option<&str>,
    has_header: bool,
) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let mut workbook = open_workbook_auto(path).map_err(|e| format!("打开 xlsx 失败: {e}"))?;
    let names = workbook.sheet_names().to_vec();
    if names.is_empty() {
        return Err("工作簿无工作表".into());
    }
    let sheet = match sheet_name {
        Some(s) if !s.is_empty() => {
            if !names.iter().any(|n| n == s) {
                return Err(format!(
                    "找不到工作表「{s}」，已有: {}",
                    names.join(", ")
                ));
            }
            s.to_string()
        }
        _ => names[0].clone(),
    };

    let range = workbook
        .worksheet_range(&sheet)
        .map_err(|e| format!("读取工作表失败: {e}"))?;

    let mut rows_iter = range.rows();
    let (headers, data_rows) = if has_header {
        let first = rows_iter
            .next()
            .ok_or_else(|| "工作表为空".to_string())?;
        let headers: Vec<String> = first
            .iter()
            .map(|c| strip_bom(cell_to_string(c).trim()).to_string())
            .collect();
        let data: Vec<Vec<String>> = rows_iter
            .map(|r| r.iter().map(|c| cell_to_string(c).trim().to_string()).collect())
            .collect();
        (headers, data)
    } else {
        let all: Vec<Vec<String>> = rows_iter
            .map(|r| r.iter().map(|c| cell_to_string(c).trim().to_string()).collect())
            .collect();
        if all.is_empty() {
            return Err("工作表无数据".into());
        }
        let n = all[0].len();
        let headers: Vec<String> = (0..n).map(|i| format!("col_{}", i + 1)).collect();
        (headers, all)
    };

    Ok((headers, data_rows))
}

fn load_tabular_file(
    path: &Path,
    options: &ImportTabularOptions,
) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "csv" => {
            let delim = csv_delimiter_byte(options.csv_delimiter.trim())?;
            parse_csv(path, delim, options.has_header)
        }
        "xlsx" => parse_xlsx(path, options.sheet_name.as_deref(), options.has_header),
        other => Err(format!("不支持的扩展名: {other}（当前支持 csv、xlsx）")),
    }
}

#[derive(Debug, Clone)]
struct TableColumn {
    name: String,
    extra: String,
    nullable: bool,
}

fn fetch_table_columns<Q: mysql::prelude::Queryable>(
    conn: &mut Q,
    table: &str,
) -> Result<Vec<TableColumn>, String> {
    let rows: Vec<(String, String, String)> = conn
        .exec_map(
            "SELECT COLUMN_NAME, EXTRA, IS_NULLABLE \
             FROM INFORMATION_SCHEMA.COLUMNS \
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? \
             ORDER BY ORDINAL_POSITION",
            (table,),
            |(name, extra, null_flag): (String, String, String)| (name, extra, null_flag),
        )
        .map_err(|e| format!("读取表结构失败: {e}"))?;

    if rows.is_empty() {
        return Err(format!("表 `{table}` 不存在或无权访问"));
    }

    Ok(rows
        .into_iter()
        .map(|(name, extra, null_flag)| TableColumn {
            name,
            extra,
            nullable: null_flag.eq_ignore_ascii_case("YES"),
        })
        .collect())
}

fn is_auto_increment(extra: &str) -> bool {
    extra.to_lowercase().contains("auto_increment")
}

/// 对 import_member / import_booking 表，将中文表头映射为英文字段名
fn normalize_header(table_name: &str, header: &str) -> String {
    let h = header.trim().to_lowercase();
    match table_name {
        "import_member" => match h.as_str() {
            "会员卡名称" | "card_name" => "card_name".into(),
            "电话号码" | "phone" => "phone".into(),
            "名称备注" | "name_remark" => "name_remark".into(),
            "教练" | "coach" => "coach".into(),
            "备注" | "remark" => "remark".into(),
            "上月初始课时数" | "prev_init_hours" => "prev_init_hours".into(),
            "本月新增课时数" | "month_new_hours" => "month_new_hours".into(),
            "本月消耗课时数" | "month_used_hours" => "month_used_hours".into(),
            "剩余课时数" | "remain_hours" => "remain_hours".into(),
            "流失说明" | "churn_note" => "churn_note".into(),
            other => other.into(),
        },
        "import_booking" => match h.as_str() {
            "教练" | "coach_name" => "coach_name".into(),
            "课程.名称" | "课程名称" | "course_name" => "course_name".into(),
            "课程.课程详情.上课时间" | "上课时间" | "class_date" => "class_date".into(),
            "课程.课程详情.约课人数" | "约课人数" | "max_students" => "max_students".into(),
            "课程.课程详情.约课人" | "约课人" | "member_name" => "member_name".into(),
            "课程.课程详情.约课会员卡" | "约课会员卡" | "member_card" => "member_card".into(),
            "课程.课程详情.单课价值" | "单课价值" | "course_value" => "course_value".into(),
            "单独计算课时费" | "solo_fee" => "solo_fee".into(),
            other => other.into(),
        },
        _ => h,
    }
}

/// 表头与表列按名匹配（小写）；插入列顺序与 INFORMATION_SCHEMA 顺序一致；自增主键若不在文件中则跳过。
fn build_insert_plan(
    table_cols: &[TableColumn],
    file_headers: &[String],
    table_name: &str,
) -> Result<Vec<String>, String> {
    let mut header_index: HashMap<String, usize> = HashMap::new();
    for (i, h) in file_headers.iter().enumerate() {
        let key = normalize_header(table_name, h);
        if key.is_empty() {
            continue;
        }
        if header_index.insert(key, i).is_some() {
            return Err(format!("文件表头重复: {}", h.trim()));
        }
    }

    let mut insert_cols: Vec<String> = Vec::new();
    for tc in table_cols {
        let key = tc.name.to_lowercase();
        let in_file = header_index.contains_key(&key);
        if is_auto_increment(&tc.extra) && !in_file {
            continue;
        }
        if in_file {
            validate_identifier(&tc.name, "列名")?;
            insert_cols.push(tc.name.clone());
        }
    }

    if insert_cols.is_empty() {
        return Err(
            "没有可插入的列：请保证文件表头与目标表列名一致（自增主键可省略）。".into(),
        );
    }

    Ok(insert_cols)
}

fn row_mysql_values(
    row: &[String],
    insert_cols: &[String],
    header_index: &HashMap<String, usize>,
    table_cols: &[TableColumn],
) -> Result<Vec<Value>, String> {
    let mut out = Vec::with_capacity(insert_cols.len());
    for col in insert_cols {
        let idx = *header_index
            .get(&col.to_lowercase())
            .ok_or_else(|| format!("内部错误: 列 {col}"))?;
        let raw = row.get(idx).map(|s| s.as_str()).unwrap_or("");
        let tc = table_cols
            .iter()
            .find(|c| c.name.eq_ignore_ascii_case(col))
            .ok_or_else(|| format!("列 {col}"))?;

        if raw.is_empty() {
            if is_auto_increment(&tc.extra) {
                out.push(Value::NULL);
                continue;
            }
            if tc.nullable {
                out.push(Value::NULL);
            } else {
                out.push(Value::Bytes(Vec::new()));
            }
        } else {
            out.push(Value::Bytes(raw.as_bytes().to_vec()));
        }
    }
    Ok(out)
}

fn import_one_file(
    pool: &Pool,
    path: &Path,
    table: &str,
    options: &ImportTabularOptions,
    table_cols: &[TableColumn],
) -> Result<usize, String> {
    let (headers, data_rows) = load_tabular_file(path, options)?;
    let insert_cols = build_insert_plan(table_cols, &headers, table)?;

    let mut header_index: HashMap<String, usize> = HashMap::new();
    for (i, h) in headers.iter().enumerate() {
        let key = h.trim().to_lowercase();
        if !key.is_empty() {
            header_index.insert(key, i);
        }
    }

    let placeholders: Vec<&str> = insert_cols.iter().map(|_| "?").collect();
    let col_list: String = insert_cols
        .iter()
        .map(|c| format!("`{}`", c.replace('`', "")))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT IGNORE INTO `{}` ({}) VALUES ({})",
        table.replace('`', ""),
        col_list,
        placeholders.join(", ")
    );

    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;
    let mut tx = conn
        .start_transaction(mysql::TxOpts::default())
        .map_err(|e| format!("开启事务失败: {e}"))?;

    let mut count = 0usize;
    for (line_no, row) in data_rows.iter().enumerate() {
        // 跳过模板说明行（如 "*必填: 教练姓名" 或 "可选: 教练ID(可空)"）
        if let Some(first_cell) = row.first() {
            let trimmed = first_cell.trim();
            if (trimmed.starts_with('*') || trimmed.starts_with("可选")) && trimmed.contains(':') {
                continue;
            }
        }

        let vals = row_mysql_values(row, &insert_cols, &header_index, table_cols)?;
        let params = Params::Positional(vals);
        tx.exec_drop(&sql, params)
            .map_err(|e| format!("第 {} 行写入失败: {e}", line_no + if options.has_header { 2 } else { 1 }))?;
        count += 1;
    }

    tx.commit()
        .map_err(|e| format!("提交事务失败: {e}"))?;

    // import_booking 后处理：如果 class_date 包含时间，拆分到 class_time
    if table == "import_booking" {
        let _ = conn.exec_drop(
            "UPDATE import_booking SET class_time = SUBSTRING(class_date, 12, 5) WHERE class_date LIKE '% %'",
            (),
        );
        let _ = conn.exec_drop(
            "UPDATE import_booking SET class_date = SUBSTRING(class_date, 1, 10) WHERE class_date LIKE '% %'",
            (),
        );
    }

    Ok(count)
}

/// 选择本地 CSV / xlsx 文件（可多选）。
#[tauri::command]
pub fn pick_import_files(app_handle: tauri::AppHandle) -> Result<Option<Vec<String>>, String> {
    use tauri::Manager;

    let mut dialog = rfd::FileDialog::new()
        .add_filter("CSV / Excel", &["csv", "xlsx"])
        .set_title("选择要导入的文件");

    // macOS 上设置 parent window，防止对话框一闪而过
    #[cfg(target_os = "macos")]
    {
        if let Some(win) = app_handle.get_webview_window("main") {
            dialog = dialog.set_parent(&win);
        }
    }

    let paths = dialog.pick_files();

    Ok(paths.map(|ps| {
        ps.into_iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect()
    }))
}

/// 有导入模板的表（白名单），只返回这些表给前端下拉框
#[tauri::command]
pub fn list_user_tables() -> Result<Vec<String>, String> {
    // 返回格式: "表名|中文名"，前端显示中文名，实际导入用表名
    let tables: Vec<String> = vec![
        "import_member|导入会员名册".into(),
        "import_booking|导入约课记录".into(),
        "member|会员表".into(),
        "coach|教练表".into(),
        "course|课程表".into(),
        "booking|约课记录表".into(),
        "coach_fee|课时费记录表".into(),
        "teaching_diary|授课日记".into(),
        "daily_expense|日常开支".into(),
        "trial_class|体验课".into(),
        "coach_leave|请假记录".into(),
    ];
    Ok(tables)
}

/// 将多个文件依次导入同一目标表；每个文件单独事务。
#[tauri::command]
pub fn import_tabular_files(request: ImportTabularRequest) -> Result<String, String> {
    crate::load_env_from_parents();
    if request.paths.is_empty() {
        return Err("未选择文件".into());
    }
    validate_identifier(&request.table, "表名")?;

    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;
    let table_cols = fetch_table_columns(&mut conn, &request.table)?;
    drop(conn);

    let mut lines: Vec<String> = Vec::new();
    lines.push(format!("目标表: `{}`", request.table));

    for p in &request.paths {
        let path = Path::new(p);
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(p);
        match import_one_file(&pool, path, &request.table, &request.options, &table_cols) {
            Ok(n) => lines.push(format!("✓ {} → 已插入 {} 行", name, n)),
            Err(e) => lines.push(format!("✗ {} → {}", name, e)),
        }
    }

    Ok(lines.join("\n"))
}

/* ========== 一键批量导入 ========== */

/// 从文件名提取表名。
/// 支持格式：
///   01_member_会员表.xlsx  → member
///   01_daily_expense_日常开支.xlsx → daily_expense
///   member.xlsx             → member
fn extract_table_from_filename(filename: &str) -> Option<String> {
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);

    let lower = stem.to_lowercase();

    // 已知业务表名列表（按长度降序，优先匹配长的）
    const KNOWN_TABLES: &[&str] = &[
        "teaching_diary",
        "daily_expense",
        "daily_ledger",
        "expense_item",
        "income_item",
        "coach_leave",
        "coach_fee",
        "trial_class",
        "import_member",
        "import_booking",
        "import_job_run_error",
        "import_job_run_file",
        "import_job_run",
        "import_mapping",
        "import_source",
        "table_edit_lock",
        "app_setting",
        "global_setting",
        "member",
        "coach",
        "course",
        "booking",
    ];

    // 在文件名中查找最长匹配的已知表名
    let mut best: Option<&str> = None;
    for &t in KNOWN_TABLES {
        if lower.contains(t) {
            if best.map_or(true, |b: &str| t.len() > b.len()) {
                best = Some(t);
            }
        }
    }
    if let Some(t) = best {
        return Some(t.to_string());
    }

    None
}

/// 选择本地目录。
#[tauri::command]
pub fn pick_import_folder(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri::Manager;

    let mut dialog = rfd::FileDialog::new()
        .set_title("选择导入模板所在目录");

    #[cfg(target_os = "macos")]
    {
        if let Some(win) = app_handle.get_webview_window("main") {
            dialog = dialog.set_parent(&win);
        }
    }

    let path = dialog.pick_folder();
    Ok(path.map(|p| p.to_string_lossy().into_owned()))
}

/// 扫描目录下所有 .csv / .xlsx 文件，根据文件名自动匹配表名，批量导入。
#[tauri::command]
pub fn batch_import_by_folder(
    dir: String,
    has_header: bool,
    csv_delimiter: String,
) -> Result<String, String> {
    crate::load_env_from_parents();

    let dir_path = Path::new(&dir);
    if !dir_path.is_dir() {
        return Err(format!("目录不存在: {}", dir));
    }

    let pool = connect_pool()?;

    // 扫描目录
    let entries: Vec<_> = std::fs::read_dir(dir_path)
        .map_err(|e| format!("读取目录失败: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().is_file()
                && e.path()
                    .extension()
                    .map(|ext| ext == "csv" || ext == "xlsx")
                    .unwrap_or(false)
        })
        .collect();

    if entries.is_empty() {
        return Err("目录下未找到 .csv 或 .xlsx 文件".into());
    }

    let _delim_byte = csv_delimiter_byte(&csv_delimiter)?;
    let options = ImportTabularOptions {
        has_header,
        csv_delimiter: csv_delimiter.clone(),
        sheet_name: None,
    };

    let mut lines: Vec<String> = Vec::new();
    lines.push(format!("扫描目录: {}", dir));
    lines.push(format!("发现 {} 个文件", entries.len()));
    lines.push("".into());

    let mut ok_count = 0;
    let mut err_count = 0;

    for entry in &entries {
        let path = entry.path();
        let filename = entry.file_name().to_string_lossy().into_owned();

        let table = match extract_table_from_filename(&filename) {
            Some(t) => t,
            None => {
                lines.push(format!("⊘ {} → 无法识别表名，跳过", filename));
                err_count += 1;
                continue;
            }
        };

        // 验证表是否存在
        let mut conn = pool.get_conn().map_err(|e| e.to_string())?;
        let sql = format!(
            "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{}' AND TABLE_TYPE = 'BASE TABLE'",
            table
        );
        let exists: bool = conn
            .query_first::<(u8,), _>(sql)
            .map_err(|e| format!("查询表存在性失败: {e}"))?
            .is_some();
        drop(conn);

        if !exists {
            lines.push(format!("⊘ {} → 表 `{}` 不存在，跳过", filename, table));
            err_count += 1;
            continue;
        }

        let table_cols = {
            let mut conn = pool.get_conn().map_err(|e| e.to_string())?;
            fetch_table_columns(&mut conn, &table)?
        };

        match import_one_file(&pool, &path, &table, &options, &table_cols) {
            Ok(n) => {
                lines.push(format!("✓ {} → `{}` 已插入 {} 行", filename, table, n));
                ok_count += 1;
            }
            Err(e) => {
                lines.push(format!("✗ {} → `{}` 失败: {}", filename, table, e));
                err_count += 1;
            }
        }
    }

    lines.push("".into());
    lines.push(format!("导入完成: 成功 {} 个, 跳过/失败 {} 个", ok_count, err_count));

    Ok(lines.join("\n"))
}
