//! 常规报表模块：授课日记、日常开支、体验课、请假。

use mysql::prelude::*;
use mysql::Params;
use serde::{Deserialize, Serialize};

use crate::connect_pool;
use crate::load_env_from_parents;

/* ========== 辅助函数 ========== */

fn str_val(s: &str) -> mysql::Value {
    mysql::Value::Bytes(s.as_bytes().to_vec())
}

fn int_val(v: i64) -> mysql::Value {
    mysql::Value::Int(v)
}

fn float_val(v: f64) -> mysql::Value {
    mysql::Value::Float(v as f32)
}

fn opt_int(v: Option<i64>) -> mysql::Value {
    v.map(int_val).unwrap_or(mysql::Value::NULL)
}

fn opt_float(v: Option<f64>) -> mysql::Value {
    v.map(float_val).unwrap_or(mysql::Value::NULL)
}

fn opt_str(v: Option<&str>) -> mysql::Value {
    v.map(str_val).unwrap_or(mysql::Value::NULL)
}

/// 从 Row 中取 Option<T> 类型字段（Row.get 返回 Option<Option<T>>）
fn get_opt<T: mysql::prelude::FromValue>(row: &mysql::Row, idx: usize) -> Option<T> {
    row.get(idx).flatten()
}

/* ========== 授课日记 ========== */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeachingDiaryRow {
    pub id: i64,
    pub coach_id: Option<i64>,
    pub coach_name: String,
    pub course_name: String,
    pub class_date: String,
    pub start_time: Option<String>,
    pub duration: i32,
    pub students: i32,
    pub unit_value: Option<f64>,
    pub remark: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeachingDiaryPayload {
    pub id: Option<i64>,
    pub coach_id: Option<i64>,
    pub coach_name: String,
    pub course_name: String,
    pub class_date: String,
    pub start_time: Option<String>,
    pub duration: i32,
    pub students: i32,
    pub unit_value: Option<f64>,
    pub remark: Option<String>,
}

#[tauri::command]
pub fn list_teaching_diaries(month: Option<String>) -> Result<Vec<TeachingDiaryRow>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let (sql, params) = if let Some(m) = month {
        (
            "SELECT id, coach_id, COALESCE(coach_name,''), COALESCE(course_name,''), \
             DATE_FORMAT(class_date,'%Y-%m-%d'), \
             DATE_FORMAT(start_time,'%H:%i'), \
             duration, students, unit_value, remark \
             FROM teaching_diary WHERE DATE_FORMAT(class_date,'%Y-%m') = ? \
             ORDER BY class_date DESC, coach_name",
            Params::Positional(vec![str_val(&m)]),
        )
    } else {
        (
            "SELECT id, coach_id, COALESCE(coach_name,''), COALESCE(course_name,''), \
             DATE_FORMAT(class_date,'%Y-%m-%d'), \
             DATE_FORMAT(start_time,'%H:%i'), \
             duration, students, unit_value, remark \
             FROM teaching_diary ORDER BY class_date DESC, coach_name LIMIT 200",
            Params::Empty,
        )
    };

    let rows: Vec<TeachingDiaryRow> = conn
        .exec_map(sql, params, |row: mysql::Row| {
            TeachingDiaryRow {
                id: row.get(0).unwrap_or(0),
                coach_id: get_opt(&row, 1),
                coach_name: row.get(2).unwrap_or_default(),
                course_name: row.get(3).unwrap_or_default(),
                class_date: row.get(4).unwrap_or_default(),
                start_time: get_opt(&row, 5),
                duration: row.get(6).unwrap_or(60),
                students: row.get(7).unwrap_or(0),
                unit_value: get_opt(&row, 8),
                remark: get_opt(&row, 9),
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn save_teaching_diary(payload: TeachingDiaryPayload) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    if let Some(id) = payload.id {
        conn.exec_drop(
            "UPDATE teaching_diary SET coach_id=?, coach_name=?, course_name=?, \
             class_date=?, start_time=?, duration=?, students=?, unit_value=?, remark=? \
             WHERE id=?",
            Params::Positional(vec![
                opt_int(payload.coach_id),
                str_val(&payload.coach_name),
                str_val(&payload.course_name),
                str_val(&payload.class_date),
                opt_str(payload.start_time.as_deref()),
                int_val(payload.duration as i64),
                int_val(payload.students as i64),
                opt_float(payload.unit_value),
                opt_str(payload.remark.as_deref()),
                int_val(id),
            ]),
        )
        .map_err(|e| e.to_string())?;
        Ok(format!("已更新授课日记 #{}", id))
    } else {
        conn.exec_drop(
            "INSERT INTO teaching_diary (coach_id, coach_name, course_name, class_date, \
             start_time, duration, students, unit_value, remark) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            Params::Positional(vec![
                opt_int(payload.coach_id),
                str_val(&payload.coach_name),
                str_val(&payload.course_name),
                str_val(&payload.class_date),
                opt_str(payload.start_time.as_deref()),
                int_val(payload.duration as i64),
                int_val(payload.students as i64),
                opt_float(payload.unit_value),
                opt_str(payload.remark.as_deref()),
            ]),
        )
        .map_err(|e| e.to_string())?;
        Ok("已新增授课日记".into())
    }
}

#[tauri::command]
pub fn delete_teaching_diary(id: i64) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;
    conn.exec_drop("DELETE FROM teaching_diary WHERE id=?", Params::Positional(vec![int_val(id)]))
        .map_err(|e| e.to_string())?;
    Ok(format!("已删除授课日记 #{}", id))
}

/* ========== 日常开支 ========== */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyExpenseRow {
    pub id: i64,
    pub expense_date: String,
    pub expense_type: String,
    pub project: String,
    pub amount: f64,
    pub remark: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyExpensePayload {
    pub id: Option<i64>,
    pub expense_date: String,
    pub expense_type: String,
    pub project: String,
    pub amount: f64,
    pub remark: Option<String>,
}

#[tauri::command]
pub fn list_daily_expenses(month: Option<String>) -> Result<Vec<DailyExpenseRow>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let (sql, params) = if let Some(m) = month {
        (
            "SELECT id, DATE_FORMAT(expense_date,'%Y-%m-%d'), COALESCE(expense_type,''), \
             COALESCE(project,''), CAST(COALESCE(amount,0) AS DOUBLE), remark \
             FROM daily_expense WHERE DATE_FORMAT(expense_date,'%Y-%m') = ? \
             ORDER BY expense_date DESC",
            Params::Positional(vec![str_val(&m)]),
        )
    } else {
        (
            "SELECT id, DATE_FORMAT(expense_date,'%Y-%m-%d'), COALESCE(expense_type,''), \
             COALESCE(project,''), CAST(COALESCE(amount,0) AS DOUBLE), remark \
             FROM daily_expense ORDER BY expense_date DESC LIMIT 200",
            Params::Empty,
        )
    };

    let rows: Vec<DailyExpenseRow> = conn
        .exec_map(sql, params, |row: mysql::Row| {
            DailyExpenseRow {
                id: row.get(0).unwrap_or(0),
                expense_date: row.get(1).unwrap_or_default(),
                expense_type: row.get(2).unwrap_or_default(),
                project: row.get(3).unwrap_or_default(),
                amount: row.get(4).unwrap_or(0.0),
                remark: get_opt(&row, 5),
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn save_daily_expense(payload: DailyExpensePayload) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    if let Some(id) = payload.id {
        conn.exec_drop(
            "UPDATE daily_expense SET expense_date=?, expense_type=?, project=?, amount=?, remark=? WHERE id=?",
            Params::Positional(vec![
                str_val(&payload.expense_date),
                str_val(&payload.expense_type),
                str_val(&payload.project),
                float_val(payload.amount),
                opt_str(payload.remark.as_deref()),
                int_val(id),
            ]),
        )
        .map_err(|e| e.to_string())?;
        Ok(format!("已更新日常开支 #{}", id))
    } else {
        conn.exec_drop(
            "INSERT INTO daily_expense (expense_date, expense_type, project, amount, remark) VALUES (?, ?, ?, ?, ?)",
            Params::Positional(vec![
                str_val(&payload.expense_date),
                str_val(&payload.expense_type),
                str_val(&payload.project),
                float_val(payload.amount),
                opt_str(payload.remark.as_deref()),
            ]),
        )
        .map_err(|e| e.to_string())?;
        Ok("已新增日常开支".into())
    }
}

#[tauri::command]
pub fn delete_daily_expense(id: i64) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;
    conn.exec_drop("DELETE FROM daily_expense WHERE id=?", Params::Positional(vec![int_val(id)]))
        .map_err(|e| e.to_string())?;
    Ok(format!("已删除日常开支 #{}", id))
}

/* ========== 体验课 ========== */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialClassRow {
    pub id: i64,
    pub class_date: String,
    pub trial_type: String,
    pub student_name: String,
    pub source: String,
    pub unit_value: Option<f64>,
    pub coach_name: String,
    pub remark: Option<String>,
    pub status: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialClassPayload {
    pub id: Option<i64>,
    pub class_date: String,
    pub trial_type: String,
    pub student_name: String,
    pub source: String,
    pub unit_value: Option<f64>,
    pub coach_name: String,
    pub remark: Option<String>,
    pub status: Option<i32>,
}

#[tauri::command]
pub fn list_trial_classes(month: Option<String>) -> Result<Vec<TrialClassRow>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let (sql, params) = if let Some(m) = month {
        (
            "SELECT id, DATE_FORMAT(class_date,'%Y-%m-%d'), COALESCE(trial_type,''), \
             COALESCE(student_name,''), COALESCE(source,''), unit_value, \
             COALESCE(coach_name,''), remark, status \
             FROM trial_class WHERE DATE_FORMAT(class_date,'%Y-%m') = ? \
             ORDER BY class_date DESC",
            Params::Positional(vec![str_val(&m)]),
        )
    } else {
        (
            "SELECT id, DATE_FORMAT(class_date,'%Y-%m-%d'), COALESCE(trial_type,''), \
             COALESCE(student_name,''), COALESCE(source,''), unit_value, \
             COALESCE(coach_name,''), remark, status \
             FROM trial_class ORDER BY class_date DESC LIMIT 200",
            Params::Empty,
        )
    };

    let rows: Vec<TrialClassRow> = conn
        .exec_map(sql, params, |row: mysql::Row| {
            TrialClassRow {
                id: row.get(0).unwrap_or(0),
                class_date: row.get(1).unwrap_or_default(),
                trial_type: row.get(2).unwrap_or_default(),
                student_name: row.get(3).unwrap_or_default(),
                source: row.get(4).unwrap_or_default(),
                unit_value: get_opt(&row, 5),
                coach_name: row.get(6).unwrap_or_default(),
                remark: get_opt(&row, 7),
                status: row.get(8).unwrap_or(1),
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn save_trial_class(payload: TrialClassPayload) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let status = payload.status.unwrap_or(1);

    if let Some(id) = payload.id {
        conn.exec_drop(
            "UPDATE trial_class SET class_date=?, trial_type=?, student_name=?, source=?, \
             unit_value=?, coach_name=?, remark=?, status=? WHERE id=?",
            Params::Positional(vec![
                str_val(&payload.class_date),
                str_val(&payload.trial_type),
                str_val(&payload.student_name),
                str_val(&payload.source),
                opt_float(payload.unit_value),
                str_val(&payload.coach_name),
                opt_str(payload.remark.as_deref()),
                int_val(status as i64),
                int_val(id),
            ]),
        )
        .map_err(|e| e.to_string())?;
        Ok(format!("已更新体验课 #{}", id))
    } else {
        conn.exec_drop(
            "INSERT INTO trial_class (class_date, trial_type, student_name, source, \
             unit_value, coach_name, remark, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            Params::Positional(vec![
                str_val(&payload.class_date),
                str_val(&payload.trial_type),
                str_val(&payload.student_name),
                str_val(&payload.source),
                opt_float(payload.unit_value),
                str_val(&payload.coach_name),
                opt_str(payload.remark.as_deref()),
                int_val(status as i64),
            ]),
        )
        .map_err(|e| e.to_string())?;
        Ok("已新增体验课".into())
    }
}

#[tauri::command]
pub fn delete_trial_class(id: i64) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;
    conn.exec_drop("DELETE FROM trial_class WHERE id=?", Params::Positional(vec![int_val(id)]))
        .map_err(|e| e.to_string())?;
    Ok(format!("已删除体验课 #{}", id))
}

/* ========== 请假记录 ========== */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoachLeaveRow {
    pub id: i64,
    pub coach_id: Option<i64>,
    pub coach_name: String,
    pub leave_month: String,
    pub leave_days: f64,
    pub remark: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoachLeavePayload {
    pub id: Option<i64>,
    pub coach_id: Option<i64>,
    pub coach_name: String,
    pub leave_month: String,
    pub leave_days: f64,
    pub remark: Option<String>,
}

#[tauri::command]
pub fn list_coach_leaves(month: Option<String>) -> Result<Vec<CoachLeaveRow>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let (sql, params) = if let Some(m) = month {
        (
            "SELECT id, coach_id, COALESCE(coach_name,''), leave_month, \
             CAST(COALESCE(leave_days,0) AS DOUBLE), remark \
             FROM coach_leave WHERE leave_month = ? ORDER BY coach_name",
            Params::Positional(vec![str_val(&m)]),
        )
    } else {
        (
            "SELECT id, coach_id, COALESCE(coach_name,''), leave_month, \
             CAST(COALESCE(leave_days,0) AS DOUBLE), remark \
             FROM coach_leave ORDER BY leave_month DESC, coach_name LIMIT 200",
            Params::Empty,
        )
    };

    let rows: Vec<CoachLeaveRow> = conn
        .exec_map(sql, params, |row: mysql::Row| {
            CoachLeaveRow {
                id: row.get(0).unwrap_or(0),
                coach_id: get_opt(&row, 1),
                coach_name: row.get(2).unwrap_or_default(),
                leave_month: row.get(3).unwrap_or_default(),
                leave_days: row.get(4).unwrap_or(0.0),
                remark: get_opt(&row, 5),
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn save_coach_leave(payload: CoachLeavePayload) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    if let Some(id) = payload.id {
        conn.exec_drop(
            "UPDATE coach_leave SET coach_id=?, coach_name=?, leave_month=?, leave_days=?, remark=? WHERE id=?",
            Params::Positional(vec![
                opt_int(payload.coach_id),
                str_val(&payload.coach_name),
                str_val(&payload.leave_month),
                float_val(payload.leave_days),
                opt_str(payload.remark.as_deref()),
                int_val(id),
            ]),
        )
        .map_err(|e| e.to_string())?;
        Ok(format!("已更新请假记录 #{}", id))
    } else {
        conn.exec_drop(
            "INSERT INTO coach_leave (coach_id, coach_name, leave_month, leave_days, remark) VALUES (?, ?, ?, ?, ?) \
             ON DUPLICATE KEY UPDATE leave_days=VALUES(leave_days), remark=VALUES(remark)",
            Params::Positional(vec![
                opt_int(payload.coach_id),
                str_val(&payload.coach_name),
                str_val(&payload.leave_month),
                float_val(payload.leave_days),
                opt_str(payload.remark.as_deref()),
            ]),
        )
        .map_err(|e| e.to_string())?;
        Ok("已新增请假记录".into())
    }
}

#[tauri::command]
pub fn delete_coach_leave(id: i64) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;
    conn.exec_drop("DELETE FROM coach_leave WHERE id=?", Params::Positional(vec![int_val(id)]))
        .map_err(|e| e.to_string())?;
    Ok(format!("已删除请假记录 #{}", id))
}
