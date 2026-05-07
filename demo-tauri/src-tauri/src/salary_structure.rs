use mysql::prelude::Queryable;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct SalaryRow {
    pub id: Option<i64>,
    pub sort_order: i32,
    pub component: String,
    pub amount: String,
    pub remark: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct SaveSalaryPayload {
    pub id: Option<i64>,
    pub sort_order: Option<i32>,
    pub component: String,
    pub amount: String,
    pub remark: String,
}

fn str_val(s: &str) -> mysql::Value {
    mysql::Value::Bytes(s.as_bytes().to_vec())
}

fn i64_val(v: i64) -> mysql::Value {
    mysql::Value::Int(v)
}

fn i32_val(v: i32) -> mysql::Value {
    mysql::Value::Int(v as i64)
}

/// 查询工资结构列表
#[tauri::command]
pub fn list_salary_structure() -> Result<Vec<SalaryRow>, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let rows: Vec<SalaryRow> = conn
        .exec_map(
            "SELECT id, sort_order, COALESCE(component,''), COALESCE(amount,''), COALESCE(remark,'') \
             FROM salary_structure ORDER BY sort_order, id",
            (),
            |(id, sort_order, component, amount, remark): (i64, i32, String, String, String)| SalaryRow {
                id: Some(id),
                sort_order,
                component,
                amount,
                remark,
            },
        )
        .map_err(|e| format!("查询工资结构失败: {e}"))?;

    Ok(rows)
}

/// 新增或修改工资结构项
#[tauri::command]
pub fn save_salary_structure(payload: SaveSalaryPayload) -> Result<String, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    if let Some(id) = payload.id {
        conn.exec_drop(
            "UPDATE salary_structure SET component=?, amount=?, remark=? WHERE id=?",
            mysql::Params::Positional(vec![
                str_val(&payload.component),
                str_val(&payload.amount),
                str_val(&payload.remark),
                i64_val(id),
            ]),
        )
        .map_err(|e| format!("更新工资结构失败: {e}"))?;
        Ok("已更新".into())
    } else {
        let sort_order = payload.sort_order.unwrap_or(0);
        conn.exec_drop(
            "INSERT INTO salary_structure (sort_order, component, amount, remark) VALUES (?, ?, ?, ?)",
            mysql::Params::Positional(vec![
                i32_val(sort_order),
                str_val(&payload.component),
                str_val(&payload.amount),
                str_val(&payload.remark),
            ]),
        )
        .map_err(|e| format!("新增工资结构失败: {e}"))?;
        Ok("已新增".into())
    }
}

/// 删除工资结构项
#[tauri::command]
pub fn delete_salary_structure(id: i64) -> Result<String, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    conn.exec_drop(
        "DELETE FROM salary_structure WHERE id = ?",
        mysql::Params::Positional(vec![i64_val(id)]),
    )
    .map_err(|e| format!("删除工资结构失败: {e}"))?;
    Ok("已删除".into())
}

/* ========== 教练薪资明细 ========== */

#[derive(Debug, Serialize, Clone)]
pub struct CoachSalaryRow {
    pub id: i64,
    pub coach_id: i64,
    pub salary_item_id: i64,
    pub component: String,
    pub amount: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCoachSalaryPayload {
    pub coach_id: i64,
    pub salary_item_id: i64,
    pub amount: String,
}

/// 查询某教练的薪资明细（JOIN 工资结构表获取名称）
#[tauri::command]
#[allow(dead_code)]
pub fn list_coach_salary(coach_id: i64) -> Result<Vec<CoachSalaryRow>, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 确保表存在
    let _ = conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS coach_salary (\
            id INT AUTO_INCREMENT PRIMARY KEY,\
            coach_id INT NOT NULL,\
            salary_item_id INT NOT NULL,\
            amount VARCHAR(100) NOT NULL DEFAULT '',\
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
            UNIQUE KEY uk_coach_salary (coach_id, salary_item_id)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        (),
    );

    let rows: Vec<CoachSalaryRow> = conn
        .exec_map(
            "SELECT cs.id, cs.coach_id, cs.salary_item_id, \
             COALESCE(ss.component,''), COALESCE(cs.amount,'') \
             FROM coach_salary cs \
             LEFT JOIN salary_structure ss ON ss.id = cs.salary_item_id \
             WHERE cs.coach_id = ? ORDER BY ss.sort_order, ss.id",
            mysql::Params::Positional(vec![i64_val(coach_id)]),
            |(id, coach_id, salary_item_id, component, amount): (i64, i64, i64, String, String)| CoachSalaryRow {
                id,
                coach_id,
                salary_item_id,
                component,
                amount,
            },
        )
        .map_err(|e| format!("查询教练薪资失败: {e}"))?;

    Ok(rows)
}

/// 保存教练薪资项（INSERT ON DUPLICATE KEY UPDATE）
#[tauri::command]
#[allow(dead_code)]
pub fn save_coach_salary(payload: SaveCoachSalaryPayload) -> Result<String, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 如果表不存在则自动创建
    let _ = conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS coach_salary (\
            id INT AUTO_INCREMENT PRIMARY KEY,\
            coach_id INT NOT NULL,\
            salary_item_id INT NOT NULL,\
            amount VARCHAR(100) NOT NULL DEFAULT '',\
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
            UNIQUE KEY uk_coach_salary (coach_id, salary_item_id)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        (),
    );

    conn.exec_drop(
        "INSERT INTO coach_salary (coach_id, salary_item_id, amount) VALUES (?, ?, ?) \
         ON DUPLICATE KEY UPDATE amount = VALUES(amount)",
        mysql::Params::Positional(vec![
            i64_val(payload.coach_id),
            i64_val(payload.salary_item_id),
            str_val(&payload.amount),
        ]),
    )
    .map_err(|e| format!("保存教练薪资失败: {e}"))?;
    Ok("已保存".into())
}

/// 删除教练薪资项
#[tauri::command]
#[allow(dead_code)]
pub fn delete_coach_salary(id: i64) -> Result<String, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    conn.exec_drop(
        "DELETE FROM coach_salary WHERE id = ?",
        mysql::Params::Positional(vec![i64_val(id)]),
    )
    .map_err(|e| format!("删除教练薪资失败: {e}"))?;
    Ok("已删除".into())
}
