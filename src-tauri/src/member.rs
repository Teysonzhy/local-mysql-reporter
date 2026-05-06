//! 会员管理模块：CRUD（列表、新增、修改、删除）+ Excel 导入。

use calamine::{open_workbook_auto, Data, Reader};
use mysql::prelude::*;
use mysql::{Params, Value};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use crate::connect_pool;
use crate::load_env_from_parents;

/* ---------- 数据结构 ---------- */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberPayload {
    pub id: Option<i64>,
    #[serde(default)]
    pub card_name: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub name_remark: String,
    #[serde(default)]
    pub coach: String,
    #[serde(default)]
    pub remark: String,
    #[serde(default)]
    pub prev_init_hours: i32,
    #[serde(default)]
    pub month_new_hours: i32,
    #[serde(default)]
    pub month_used_hours: i32,
    #[serde(default)]
    pub remain_hours: i32,
    #[serde(default)]
    pub churn_note: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberRow {
    pub id: i64,
    pub card_name: String,
    pub phone: String,
    pub name_remark: String,
    pub coach: String,
    pub remark: String,
    pub prev_init_hours: i32,
    pub month_new_hours: i32,
    pub month_used_hours: i32,
    pub remain_hours: i32,
    pub churn_note: String,
}

/* ---------- 辅助函数 ---------- */

fn str_val(s: &str) -> Value {
    Value::Bytes(s.as_bytes().to_vec())
}

fn i64_val(n: i64) -> Value {
    Value::Int(n)
}

fn i32_val(n: i32) -> Value {
    Value::Int(n as i64)
}

/* ---------- 命令 ---------- */

/// 查询全部会员列表。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberFilter {
    pub card_name: Option<String>,
    pub phone: Option<String>,
    pub coach: Option<String>,
    pub remain_min: Option<i32>,
    pub remain_max: Option<i32>,
}

#[tauri::command]
pub fn list_members(filter: Option<MemberFilter>) -> Result<Vec<MemberRow>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let mut where_clauses: Vec<String> = Vec::new();
    let mut params: Vec<mysql::Value> = Vec::new();

    if let Some(ref f) = filter {
        if let Some(ref name) = f.card_name {
            if !name.is_empty() {
                where_clauses.push("card_name LIKE ?".into());
                params.push(mysql::Value::Bytes(format!("%{}%", name).into_bytes()));
            }
        }
        if let Some(ref ph) = f.phone {
            if !ph.is_empty() {
                where_clauses.push("phone LIKE ?".into());
                params.push(mysql::Value::Bytes(format!("%{}%", ph).into_bytes()));
            }
        }
        if let Some(ref co) = f.coach {
            if !co.is_empty() {
                where_clauses.push("coach LIKE ?".into());
                params.push(mysql::Value::Bytes(format!("%{}%", co).into_bytes()));
            }
        }
        if let Some(min) = f.remain_min {
            where_clauses.push("remain_hours >= ?".into());
            params.push(mysql::Value::Int(min as i64));
        }
        if let Some(max) = f.remain_max {
            where_clauses.push("remain_hours <= ?".into());
            params.push(mysql::Value::Int(max as i64));
        }
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let sql = format!(
        "SELECT id, COALESCE(card_name,''), COALESCE(phone,''), \
         COALESCE(name_remark,''), COALESCE(coach,''), COALESCE(remark,''), \
         COALESCE(prev_init_hours,0), COALESCE(month_new_hours,0), \
         COALESCE(month_used_hours,0), COALESCE(remain_hours,0), \
         COALESCE(churn_note,'') \
         FROM member {} ORDER BY id DESC",
        where_sql
    );

    let rows: Vec<MemberRow> = if params.is_empty() {
        conn.query_map(&sql, |(id, card_name, phone, name_remark, coach, remark,
               prev_init_hours, month_new_hours, month_used_hours, remain_hours, churn_note): (
                i64, String, String, String, String, String,
                i32, i32, i32, i32, String,
            )| MemberRow {
                id, card_name, phone, name_remark, coach, remark,
                prev_init_hours, month_new_hours, month_used_hours, remain_hours, churn_note,
            })
            .map_err(|e| format!("查询会员列表失败: {e}"))?
    } else {
        conn.exec_map(&sql, mysql::Params::Positional(params), |(id, card_name, phone, name_remark, coach, remark,
               prev_init_hours, month_new_hours, month_used_hours, remain_hours, churn_note): (
                i64, String, String, String, String, String,
                i32, i32, i32, i32, String,
            )| MemberRow {
                id, card_name, phone, name_remark, coach, remark,
                prev_init_hours, month_new_hours, month_used_hours, remain_hours, churn_note,
            })
            .map_err(|e| format!("查询会员列表失败: {e}"))?
    };

    Ok(rows)
}

/// 根据 ID 获取单个会员。
#[tauri::command]
pub fn get_member(member_id: i64) -> Result<Option<MemberRow>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let rows: Vec<MemberRow> = conn
        .exec_map(
            "SELECT id, COALESCE(card_name,''), COALESCE(phone,''), \
             COALESCE(name_remark,''), COALESCE(coach,''), COALESCE(remark,''), \
             COALESCE(prev_init_hours,0), COALESCE(month_new_hours,0), \
             COALESCE(month_used_hours,0), COALESCE(remain_hours,0), \
             COALESCE(churn_note,'') \
             FROM member WHERE id = ?",
            Params::Positional(vec![i64_val(member_id)]),
            |(id, card_name, phone, name_remark, coach, remark,
               prev_init_hours, month_new_hours, month_used_hours, remain_hours, churn_note): (
                i64, String, String, String, String, String,
                i32, i32, i32, i32, String,
            )| MemberRow {
                id,
                card_name,
                phone,
                name_remark,
                coach,
                remark,
                prev_init_hours,
                month_new_hours,
                month_used_hours,
                remain_hours,
                churn_note,
            },
        )
        .map_err(|e| format!("查询会员失败: {e}"))?;

    Ok(rows.into_iter().next())
}

/// 新增会员。
#[tauri::command]
pub fn create_member(payload: MemberPayload) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    conn.exec_drop(
        "INSERT INTO member (card_name, phone, name_remark, coach, remark, \
         prev_init_hours, month_new_hours, month_used_hours, remain_hours, churn_note) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        Params::Positional(vec![
            str_val(&payload.card_name),
            str_val(&payload.phone),
            str_val(&payload.name_remark),
            str_val(&payload.coach),
            str_val(&payload.remark),
            i32_val(payload.prev_init_hours),
            i32_val(payload.month_new_hours),
            i32_val(payload.month_used_hours),
            i32_val(payload.remain_hours),
            str_val(&payload.churn_note),
        ]),
    )
    .map_err(|e| format!("新增会员失败: {e}"))?;

    let new_id = conn.last_insert_id() as i64;
    Ok(format!("已新增会员（ID={}，卡名={}）", new_id, payload.card_name))
}

/// 修改会员。
#[tauri::command]
pub fn update_member(payload: MemberPayload) -> Result<String, String> {
    load_env_from_parents();
    let id = payload.id.ok_or_else(|| "缺少会员 ID".to_string())?;
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    conn.exec_drop(
        "UPDATE member SET card_name=?, phone=?, name_remark=?, coach=?, remark=?, \
         prev_init_hours=?, month_new_hours=?, month_used_hours=?, remain_hours=?, churn_note=? \
         WHERE id=?",
        Params::Positional(vec![
            str_val(&payload.card_name),
            str_val(&payload.phone),
            str_val(&payload.name_remark),
            str_val(&payload.coach),
            str_val(&payload.remark),
            i32_val(payload.prev_init_hours),
            i32_val(payload.month_new_hours),
            i32_val(payload.month_used_hours),
            i32_val(payload.remain_hours),
            str_val(&payload.churn_note),
            i64_val(id),
        ]),
    )
    .map_err(|e| format!("修改会员失败: {e}"))?;

    Ok(format!("已更新会员（ID={}）", id))
}

/// 删除会员。
#[tauri::command]
pub fn delete_member(member_id: i64) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    conn.exec_drop(
        "DELETE FROM member WHERE id = ?",
        Params::Positional(vec![i64_val(member_id)]),
    )
    .map_err(|e| format!("删除会员失败: {e}"))?;

    Ok(format!("已删除会员（ID={}）", member_id))
}

/* ---------- 会员 Excel 导入 ---------- */

/// 中文表头 → 数据库列名映射
fn member_header_map() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();
    m.insert("会员卡名称", "card_name");
    m.insert("电话号码", "phone");
    m.insert("名称备注", "name_remark");
    m.insert("教练", "coach");
    m.insert("备注", "remark");
    m.insert("上月初始课时数", "prev_init_hours");
    m.insert("本月新增课时数", "month_new_hours");
    m.insert("本月消耗课时数", "month_used_hours");
    m.insert("剩余课时数", "remain_hours");
    m.insert("流失说明", "churn_note");
    m
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

/// 从 Excel 文件导入会员数据（支持中文表头）。
#[tauri::command]
pub fn import_members_from_file(file_path: String) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let path = Path::new(&file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    if ext != "xlsx" && ext != "csv" {
        return Err(format!("不支持的文件格式: .{ext}，请使用 .xlsx 或 .csv"));
    }

    // 读取文件
    let (headers, data_rows) = if ext == "xlsx" {
        let mut workbook = open_workbook_auto(path)
            .map_err(|e| format!("打开 Excel 失败: {e}"))?;
        let names = workbook.sheet_names().to_vec();
        if names.is_empty() {
            return Err("工作簿无工作表".into());
        }
        let range = workbook
            .worksheet_range(&names[0])
            .map_err(|e| format!("读取工作表失败: {e}"))?;
        let mut rows_iter = range.rows();
        let first = rows_iter
            .next()
            .ok_or_else(|| "工作表为空".to_string())?;
        let hdrs: Vec<String> = first.iter().map(|c| cell_to_string(c).trim().to_string()).collect();
        let rows: Vec<Vec<String>> = rows_iter
            .map(|r| r.iter().map(|c| cell_to_string(c).trim().to_string()).collect())
            .collect();
        (hdrs, rows)
    } else {
        // CSV 简单解析
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("读取 CSV 失败: {e}"))?;
        let mut lines = content.lines();
        let first = lines.next().ok_or_else(|| "CSV 为空".to_string())?;
        let hdrs: Vec<String> = first.split(',').map(|s| s.trim().to_string()).collect();
        let rows: Vec<Vec<String>> = lines
            .filter(|l| !l.trim().is_empty())
            .map(|l| l.split(',').map(|s| s.trim().to_string()).collect())
            .collect();
        (hdrs, rows)
    };

    // 建立表头索引：中文 → 列位置
    let header_map = member_header_map();
    let mut col_index: HashMap<&str, usize> = HashMap::new();
    for (i, h) in headers.iter().enumerate() {
        if let Some(&col_name) = header_map.get(h.as_str()) {
            col_index.insert(col_name, i);
        }
    }

    // 检查至少有 card_name
    if !col_index.contains_key("card_name") {
        return Err(format!(
            "未找到「会员卡名称」列。当前表头: {}",
            headers.join(", ")
        ));
    }

    // 定义插入列顺序
    let insert_cols = [
        "card_name", "phone", "name_remark", "coach", "remark",
        "prev_init_hours", "month_new_hours", "month_used_hours", "remain_hours", "churn_note",
    ];

    let placeholders: Vec<&str> = insert_cols.iter().map(|_| "?").collect();
    let sql = format!(
        "INSERT INTO member ({}) VALUES ({})",
        insert_cols.join(", "),
        placeholders.join(", ")
    );

    let mut tx = conn
        .start_transaction(mysql::TxOpts::default())
        .map_err(|e| format!("开启事务失败: {e}"))?;

    let mut count = 0usize;
    let mut skipped = 0usize;

    for (line_no, row) in data_rows.iter().enumerate() {
        let row_no = line_no + 2; // +1 表头, +1 从1开始

        // 跳过会员卡名称为空的行
        let card_name = col_index
            .get("card_name")
            .and_then(|&i| row.get(i))
            .map(|s| s.as_str())
            .unwrap_or("");
        if card_name.is_empty() {
            skipped += 1;
            continue;
        }

        let get_val = |col: &str| -> Value {
            let s = col_index
                .get(col)
                .and_then(|&i| row.get(i).map(|s| s.as_str()))
                .unwrap_or("");
            Value::Bytes(s.as_bytes().to_vec())
        };

        let get_i32 = |col: &str| -> Value {
            let s = col_index
                .get(col)
                .and_then(|&i| row.get(i).map(|s| s.as_str()))
                .unwrap_or("0");
            let n: i64 = s.parse().unwrap_or(0);
            Value::Int(n)
        };

        let vals: Vec<Value> = vec![
            get_val("card_name"),
            get_val("phone"),
            get_val("name_remark"),
            get_val("coach"),
            get_val("remark"),
            get_i32("prev_init_hours"),
            get_i32("month_new_hours"),
            get_i32("month_used_hours"),
            get_i32("remain_hours"),
            get_val("churn_note"),
        ];

        tx.exec_drop(&sql, Params::Positional(vals))
            .map_err(|e| format!("第 {row_no} 行写入失败: {e}"))?;
        count += 1;
    }

    tx.commit()
        .map_err(|e| format!("提交事务失败: {e}"))?;

    Ok(format!(
        "导入完成：成功 {} 条，跳过 {} 条（卡名为空）",
        count, skipped
    ))
}

/// 会员课时统计（查询全部会员的课时字段）
#[allow(dead_code)]
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberHoursRow {
    pub id: i64,
    pub card_name: String,
    pub phone: String,
    pub coach: String,
    pub prev_init_hours: i32,
    pub month_new_hours: i32,
    pub month_used_hours: i32,
    pub remain_hours: i32,
}

#[allow(dead_code)]
#[tauri::command]
pub fn list_member_hours() -> Result<Vec<MemberHoursRow>, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let rows: Vec<MemberHoursRow> = conn
        .query_map(
            "SELECT id, COALESCE(card_name,''), COALESCE(phone,''), \
             COALESCE(coach,''), \
             COALESCE(prev_init_hours,0), COALESCE(month_new_hours,0), \
             COALESCE(month_used_hours,0), COALESCE(remain_hours,0) \
             FROM member ORDER BY id DESC",
            |(id, card_name, phone, coach,
               prev_init_hours, month_new_hours, month_used_hours, remain_hours): (
                i64, String, String, String,
                i32, i32, i32, i32,
            )| MemberHoursRow {
                id, card_name, phone, coach,
                prev_init_hours, month_new_hours, month_used_hours, remain_hours,
            },
        )
        .map_err(|e| format!("查询会员课时失败: {e}"))?;

    Ok(rows)
}
