//! 教练管理模块：教练CRUD、课程管理（含约课与课时费）。

use mysql::prelude::*;
use mysql::{Params, Value};
use serde::{Deserialize, Serialize};

use crate::connect_pool;
use crate::load_env_from_parents;

/* ========== 数据结构 ========== */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoachRow {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub position: String,
    #[serde(default)]
    pub qualification: String,
    #[serde(default)]
    pub store_name: String,
    #[serde(default)]
    pub hourly_rate: Option<f64>,
    #[serde(default)]
    pub share_ratio: Option<f64>,
    #[serde(default)]
    pub status: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoachPayload {
    pub id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub position: String,
    #[serde(default)]
    pub qualification: String,
    #[serde(default)]
    pub store_name: String,
    pub hourly_rate: Option<f64>,
    #[serde(default)]
    pub share_ratio: Option<f64>,
    #[serde(default)]
    pub status: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseRow {
    pub id: i64,
    pub coach_id: i64,
    #[serde(default)]
    pub coach_name: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub start_time: String,
    #[serde(default)]
    pub end_time: String,
    #[serde(default)]
    pub duration: i32,
    #[serde(default)]
    pub max_students: i32,
    #[serde(default)]
    pub course_value: Option<f64>,
    #[serde(default)]
    pub status: i32,
    #[serde(default)]
    pub member_name: String,
    #[serde(default)]
    pub member_card: String,
    #[serde(default)]
    pub booking_time: String,
    #[serde(default)]
    pub booking_status: i32,
    #[serde(default)]
    pub solo_fee: Option<f64>,
    #[serde(default)]
    pub fee_status: i32,
    #[serde(default)]
    pub fee_amount: Option<f64>,
    #[serde(default)]
    pub fee_date: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoursePayload {
    pub id: Option<i64>,
    pub coach_id: i64,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub start_time: String,
    #[serde(default)]
    pub end_time: String,
    #[serde(default)]
    pub duration: i32,
    #[serde(default)]
    pub max_students: i32,
    pub course_value: Option<f64>,
    #[serde(default)]
    pub status: i32,
    #[serde(default)]
    pub member_name: String,
    #[serde(default)]
    pub member_card: String,
    #[serde(default)]
    pub booking_time: String,
    #[serde(default)]
    pub booking_status: i32,
    #[serde(default)]
    pub solo_fee: Option<f64>,
    #[serde(default)]
    pub fee_status: i32,
    #[serde(default)]
    pub fee_amount: Option<f64>,
    #[serde(default)]
    pub fee_date: String,
}

/* ========== 辅助函数 ========== */

fn str_val(s: &str) -> Value {
    Value::Bytes(s.as_bytes().to_vec())
}

fn i64_val(n: i64) -> Value {
    Value::Int(n)
}

fn i32_val(n: i32) -> Value {
    Value::Int(n as i64)
}

fn opt_f64(v: Option<f64>) -> Value {
    match v {
        Some(n) => Value::Float(n as f32),
        None => Value::NULL,
    }
}

/* ========== 教练 CRUD ========== */

#[tauri::command]
pub fn list_coaches() -> Result<Vec<CoachRow>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let rows: Vec<CoachRow> = conn
        .query_map(
            "SELECT id, COALESCE(name,''), COALESCE(phone,''), COALESCE(position,'教练'), COALESCE(qualification,''), \
             COALESCE(store_name,''), CAST(COALESCE(hourly_rate,0) AS DOUBLE), \
             CAST(COALESCE(share_ratio,50) AS DOUBLE), \
             status \
             FROM coach ORDER BY id",
            |(id, name, phone, position, qualification, store_name, hourly_rate, share_ratio, status): (
                i64, String, String, String, String, String, f64, f64, i32,
            )| CoachRow {
                id,
                name,
                phone,
                position,
                qualification,
                store_name,
                hourly_rate: Some(hourly_rate),
                share_ratio: Some(share_ratio),
                status,
            },
        )
        .map_err(|e| format!("查询教练列表失败: {e}"))?;

    Ok(rows)
}

#[tauri::command]
pub fn save_coach(payload: CoachPayload) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let share = payload.share_ratio.unwrap_or(50.0);

    if let Some(id) = payload.id {
        conn.exec_drop(
            "UPDATE coach SET name=?, phone=?, position=?, qualification=?, store_name=?, \
             hourly_rate=?, share_ratio=?, status=? WHERE id=?",
            Params::Positional(vec![
                str_val(&payload.name),
                str_val(&payload.phone),
                str_val(&payload.position),
                str_val(&payload.qualification),
                str_val(&payload.store_name),
                opt_f64(payload.hourly_rate),
                opt_f64(Some(share)),
                i32_val(payload.status),
                i64_val(id),
            ]),
        )
        .map_err(|e| format!("更新教练失败: {e}"))?;
        Ok(format!("已更新教练（ID={}）", id))
    } else {
        conn.exec_drop(
            "INSERT INTO coach (name, phone, position, qualification, store_name, hourly_rate, share_ratio, status) \
             VALUES (?,?,?,?,?,?,?,?)",
            Params::Positional(vec![
                str_val(&payload.name),
                str_val(&payload.phone),
                str_val(&payload.position),
                str_val(&payload.qualification),
                str_val(&payload.store_name),
                opt_f64(payload.hourly_rate),
                opt_f64(Some(share)),
                i32_val(payload.status),
            ]),
        )
        .map_err(|e| format!("新增教练失败: {e}"))?;
        Ok("已新增教练".into())
    }
}

#[tauri::command]
pub fn delete_coach(coach_id: i64) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    conn.exec_drop("DELETE FROM coach WHERE id = ?", Params::Positional(vec![i64_val(coach_id)]))
        .map_err(|e| format!("删除教练失败: {e}"))?;
    Ok(format!("已删除教练（ID={}）", coach_id))
}

/* ========== 课程管理（含约课与课时费） ========== */

#[tauri::command]
pub fn list_courses(month: String, coach_name: Option<String>, course_name: Option<String>) -> Result<Vec<CourseRow>, String> {
    println!("[coach] list_courses month={}, coach={}, course={}", month, coach_name.as_deref().unwrap_or(""), course_name.as_deref().unwrap_or(""));
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT c.id, c.coach_id, COALESCE(co.name,''), COALESCE(c.name,''), \
         COALESCE(c.description,''), DATE_FORMAT(c.start_time,'%Y-%m-%d %H:%M'), \
         COALESCE(DATE_FORMAT(c.end_time,'%Y-%m-%d %H:%i'),''), \
         c.duration, c.max_students, CAST(COALESCE(c.course_value,0) AS DOUBLE), c.status, \
         COALESCE(c.member_name,''), COALESCE(c.member_card,''), \
         COALESCE(DATE_FORMAT(c.booking_time,'%Y-%m-%d %H:%i'),''), \
         c.booking_status, CAST(COALESCE(c.solo_fee,0) AS DOUBLE), \
         c.fee_status, CAST(COALESCE(c.fee_amount,0) AS DOUBLE), \
         COALESCE(DATE_FORMAT(c.fee_date,'%Y-%m-%d'),'') \
         FROM course c LEFT JOIN coach co ON c.coach_id = co.id \
         WHERE DATE_FORMAT(c.start_time,'%Y-%m') = ?"
    );
    let mut params: Vec<mysql::Value> = vec![str_val(&month)];

    if let Some(ref cn) = coach_name {
        if !cn.is_empty() {
            sql.push_str(" AND co.name = ?");
            params.push(str_val(cn));
        }
    }
    if let Some(ref cname) = course_name {
        if !cname.is_empty() {
            sql.push_str(" AND c.name = ?");
            params.push(str_val(cname));
        }
    }

    sql.push_str(" ORDER BY c.start_time");

    let rows: Vec<CourseRow> = conn
        .exec_map(
            &sql,
            Params::Positional(params),
            |row: mysql::Row| {
                CourseRow {
                    id: row.get(0).unwrap_or(0),
                    coach_id: row.get(1).unwrap_or(0),
                    coach_name: row.get(2).unwrap_or_default(),
                    name: row.get(3).unwrap_or_default(),
                    description: row.get(4).unwrap_or_default(),
                    start_time: row.get(5).unwrap_or_default(),
                    end_time: row.get(6).unwrap_or_default(),
                    duration: row.get(7).unwrap_or(0),
                    max_students: row.get(8).unwrap_or(0),
                    course_value: row.get(9).flatten(),
                    status: row.get(10).unwrap_or(0),
                    member_name: row.get(11).unwrap_or_default(),
                    member_card: row.get(12).unwrap_or_default(),
                    booking_time: row.get(13).unwrap_or_default(),
                    booking_status: row.get(14).unwrap_or(0),
                    solo_fee: row.get(15).flatten(),
                    fee_status: row.get(16).unwrap_or(0),
                    fee_amount: row.get(17).flatten(),
                    fee_date: row.get(18).unwrap_or_default(),
                }
            },
        )
        .map_err(|e| format!("查询课程列表失败: {e}"))?;

    Ok(rows)
}

#[tauri::command]
pub fn save_course(payload: CoursePayload) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    if let Some(id) = payload.id {
        conn.exec_drop(
            "UPDATE course SET coach_id=?, name=?, description=?, start_time=?, end_time=?, \
             duration=?, max_students=?, course_value=?, status=?, \
             member_name=?, member_card=?, booking_time=?, booking_status=?, \
             solo_fee=?, fee_status=?, fee_amount=?, fee_date=? WHERE id=?",
            Params::Positional(vec![
                i64_val(payload.coach_id),
                str_val(&payload.name),
                str_val(&payload.description),
                str_val(&payload.start_time),
                str_val(&payload.end_time),
                i32_val(payload.duration),
                i32_val(payload.max_students),
                opt_f64(payload.course_value),
                i32_val(payload.status),
                str_val(&payload.member_name),
                str_val(&payload.member_card),
                str_val(&payload.booking_time),
                i32_val(payload.booking_status),
                opt_f64(payload.solo_fee),
                i32_val(payload.fee_status),
                opt_f64(payload.fee_amount),
                str_val(&payload.fee_date),
                i64_val(id),
            ]),
        )
        .map_err(|e| format!("更新课程失败: {e}"))?;
        Ok(format!("已更新课程（ID={}）", id))
    } else {
        conn.exec_drop(
            "INSERT INTO course (coach_id, name, description, start_time, end_time, duration, max_students, \
             course_value, status, member_name, member_card, booking_time, booking_status, \
             solo_fee, fee_status, fee_amount, fee_date) \
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            Params::Positional(vec![
                i64_val(payload.coach_id),
                str_val(&payload.name),
                str_val(&payload.description),
                str_val(&payload.start_time),
                str_val(&payload.end_time),
                i32_val(payload.duration),
                i32_val(payload.max_students),
                opt_f64(payload.course_value),
                i32_val(payload.status),
                str_val(&payload.member_name),
                str_val(&payload.member_card),
                str_val(&payload.booking_time),
                i32_val(payload.booking_status),
                opt_f64(payload.solo_fee),
                i32_val(payload.fee_status),
                opt_f64(payload.fee_amount),
                str_val(&payload.fee_date),
            ]),
        )
        .map_err(|e| format!("新增课程失败: {e}"))?;
        Ok("已新增课程".into())
    }
}

#[tauri::command]
pub fn delete_course(course_id: i64) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    conn.exec_drop("DELETE FROM course WHERE id = ?", Params::Positional(vec![i64_val(course_id)]))
        .map_err(|e| format!("删除课程失败: {e}"))?;
    Ok(format!("已删除课程（ID={}）", course_id))
}
