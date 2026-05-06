//! 财务月报模块：保存/加载月报数据（主表 + 支出/收入明细）。

use mysql::prelude::*;
use mysql::{Params, Value};
use serde::{Deserialize, Serialize};

use crate::connect_pool;
use crate::load_env_from_parents;

/* ---------- 数据结构 ---------- */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseRow {
    pub id: Option<i64>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub person: String,
    #[serde(default)]
    pub item_desc: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub amount: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeRow {
    pub id: Option<i64>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub item_desc: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub amount: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerPayload {
    pub ledger_month: String,
    #[serde(default)]
    pub remark: String,
    // 纯利统计
    pub net_profit: Option<f64>,
    pub total_class_price: Option<f64>,
    pub trial_class_price: Option<f64>,
    pub coach_salary: Option<f64>,
    pub cash_outflow: Option<f64>,
    pub refund_fee: Option<f64>,
    // 公司账户
    #[serde(default)]
    pub company_account: String,
    pub prev_balance: Option<f64>,
    pub course_sales: Option<f64>,
    pub other_income: Option<f64>,
    pub expenditure: Option<f64>,
    pub bank_transfer: Option<f64>,
    // 明细
    #[serde(default)]
    pub expenses: Vec<ExpenseRow>,
    #[serde(default)]
    pub incomes: Vec<IncomeRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerResponse {
    pub id: i64,
    pub ledger_month: String,
    pub remark: String,
    pub net_profit: Option<f64>,
    pub total_class_price: Option<f64>,
    pub trial_class_price: Option<f64>,
    pub coach_salary: Option<f64>,
    pub cash_outflow: Option<f64>,
    pub refund_fee: Option<f64>,
    pub company_account: String,
    pub prev_balance: Option<f64>,
    pub course_sales: Option<f64>,
    pub other_income: Option<f64>,
    pub expenditure: Option<f64>,
    pub bank_transfer: Option<f64>,
    pub expenses: Vec<ExpenseRow>,
    pub incomes: Vec<IncomeRow>,
}

/* ---------- 辅助 ---------- */

fn opt_f64(v: Option<f64>) -> Value {
    match v {
        Some(n) => Value::Float(n as f32),
        None => Value::NULL,
    }
}

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

/// 保存（新增或更新）一条财务月报记录。
#[tauri::command]
pub fn save_ledger(payload: LedgerPayload) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 检查是否已有该月份的记录
    let existing: Option<i64> = conn
        .exec_first(
            "SELECT id FROM daily_ledger WHERE ledger_month = ?",
            Params::Positional(vec![str_val(&payload.ledger_month)]),
        )
        .map_err(|e| format!("查询月报记录失败: {e}"))?;

    let ledger_id = if let Some(id) = existing {
        // 更新主表
        conn.exec_drop(
            "UPDATE daily_ledger SET remark=?, net_profit=?, total_class_price=?, \
             trial_class_price=?, coach_salary=?, cash_outflow=?, refund_fee=?, \
             company_account=?, prev_balance=?, course_sales=?, other_income=?, \
             expenditure=?, bank_transfer=? WHERE id=?",
            Params::Positional(vec![
                str_val(&payload.remark),
                opt_f64(payload.net_profit),
                opt_f64(payload.total_class_price),
                opt_f64(payload.trial_class_price),
                opt_f64(payload.coach_salary),
                opt_f64(payload.cash_outflow),
                opt_f64(payload.refund_fee),
                str_val(&payload.company_account),
                opt_f64(payload.prev_balance),
                opt_f64(payload.course_sales),
                opt_f64(payload.other_income),
                opt_f64(payload.expenditure),
                opt_f64(payload.bank_transfer),
                i64_val(id),
            ]),
        )
        .map_err(|e| format!("更新主表失败: {e}"))?;

        // 删除旧明细
        conn.exec_drop(
            "DELETE FROM expense_item WHERE ledger_id = ?",
            Params::Positional(vec![i64_val(id)]),
        )
        .map_err(|e| format!("删除旧支出明细失败: {e}"))?;
        conn.exec_drop(
            "DELETE FROM income_item WHERE ledger_id = ?",
            Params::Positional(vec![i64_val(id)]),
        )
        .map_err(|e| format!("删除旧收入明细失败: {e}"))?;

        id
    } else {
        // 插入主表
        conn.exec_drop(
            "INSERT INTO daily_ledger (ledger_month, remark, net_profit, total_class_price, \
             trial_class_price, coach_salary, cash_outflow, refund_fee, \
             company_account, prev_balance, course_sales, other_income, \
             expenditure, bank_transfer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            Params::Positional(vec![
                str_val(&payload.ledger_month),
                str_val(&payload.remark),
                opt_f64(payload.net_profit),
                opt_f64(payload.total_class_price),
                opt_f64(payload.trial_class_price),
                opt_f64(payload.coach_salary),
                opt_f64(payload.cash_outflow),
                opt_f64(payload.refund_fee),
                str_val(&payload.company_account),
                opt_f64(payload.prev_balance),
                opt_f64(payload.course_sales),
                opt_f64(payload.other_income),
                opt_f64(payload.expenditure),
                opt_f64(payload.bank_transfer),
            ]),
        )
        .map_err(|e| format!("插入主表失败: {e}"))?;

        conn.last_insert_id() as i64
    };

    // 自动补齐 category 列（兼容旧数据库）
    let _ = conn.exec_drop(
        "ALTER TABLE expense_item ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT NULL COMMENT '分类' AFTER sort_order",
        (),
    );

    // 删除旧明细
    conn.exec_drop(
        "DELETE FROM expense_item WHERE ledger_id = ?",
        Params::Positional(vec![i64_val(ledger_id)]),
    )
    .map_err(|e| format!("删除旧支出明细失败: {e}"))?;
    conn.exec_drop(
        "DELETE FROM income_item WHERE ledger_id = ?",
        Params::Positional(vec![i64_val(ledger_id)]),
    )
    .map_err(|e| format!("删除旧收入明细失败: {e}"))?;

    // 插入支出明细
    for (i, exp) in payload.expenses.iter().enumerate() {
        conn.exec_drop(
            "INSERT INTO expense_item (ledger_id, sort_order, category, person, item_desc, description, amount) \
             VALUES (?,?,?,?,?,?,?)",
            Params::Positional(vec![
                i64_val(ledger_id),
                i32_val(i as i32),
                str_val(&exp.category),
                str_val(&exp.person),
                str_val(&exp.item_desc),
                str_val(&exp.description),
                opt_f64(exp.amount),
            ]),
        )
        .map_err(|e| format!("插入支出明细失败: {e}"))?;
    }

    // 插入收入明细
    for (i, inc) in payload.incomes.iter().enumerate() {
        conn.exec_drop(
            "INSERT INTO income_item (ledger_id, sort_order, category, subject, item_desc, content, amount) \
             VALUES (?,?,?,?,?,?,?)",
            Params::Positional(vec![
                i64_val(ledger_id),
                i32_val(i as i32),
                str_val(&inc.category),
                str_val(&inc.subject),
                str_val(&inc.item_desc),
                str_val(&inc.content),
                opt_f64(inc.amount),
            ]),
        )
        .map_err(|e| format!("插入收入明细失败: {e}"))?;
    }

    Ok(format!(
        "已保存月报（ID={}, 月份={}，支出{}笔，收入{}笔）",
        ledger_id,
        payload.ledger_month,
        payload.expenses.len(),
        payload.incomes.len()
    ))
}

/* ---------- 全局备注 ---------- */

/// 加载全局备注。
#[tauri::command]
pub fn load_global_remark() -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let val: Option<String> = conn
        .exec_first(
            "SELECT COALESCE(setting_value,'') FROM global_setting WHERE setting_key = 'global_remark'",
            Params::Positional(vec![]),
        )
        .map_err(|e| format!("查询全局备注失败: {e}"))?;

    Ok(val.unwrap_or_default())
}

/// 保存全局备注。
#[tauri::command]
pub fn save_global_remark(remark: String) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    conn.exec_drop(
        "INSERT INTO global_setting (setting_key, setting_value) VALUES ('global_remark', ?) \
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
        Params::Positional(vec![str_val(&remark)]),
    )
    .map_err(|e| format!("保存全局备注失败: {e}"))?;

    Ok("全局备注已保存".into())
}

/// 按月份加载一条月报记录（含明细）。
#[tauri::command]
pub fn load_ledger(ledger_month: String) -> Result<Option<LedgerResponse>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let main_rows: Vec<LedgerResponse> = conn
        .exec_map(
            "SELECT id, COALESCE(ledger_month,''), COALESCE(remark,''), \
             CAST(COALESCE(net_profit,0) AS DOUBLE), CAST(COALESCE(total_class_price,0) AS DOUBLE), \
             CAST(COALESCE(trial_class_price,0) AS DOUBLE), CAST(COALESCE(coach_salary,0) AS DOUBLE), \
             CAST(COALESCE(cash_outflow,0) AS DOUBLE), CAST(COALESCE(refund_fee,0) AS DOUBLE), \
             COALESCE(company_account,''), CAST(COALESCE(prev_balance,0) AS DOUBLE), \
             CAST(COALESCE(course_sales,0) AS DOUBLE), CAST(COALESCE(other_income,0) AS DOUBLE), \
             CAST(COALESCE(expenditure,0) AS DOUBLE), CAST(COALESCE(bank_transfer,0) AS DOUBLE) \
             FROM daily_ledger WHERE ledger_month = ?",
            Params::Positional(vec![str_val(&ledger_month)]),
            |row: mysql::Row| {
                let id: i64 = row.get(0).unwrap_or(0);
                let ledger_month: String = row.get(1).unwrap_or_default();
                let remark: String = row.get(2).unwrap_or_default();
                let net_profit: Option<f64> = row.get(3);
                let total_class_price: Option<f64> = row.get(4);
                let trial_class_price: Option<f64> = row.get(5);
                let coach_salary: Option<f64> = row.get(6);
                let cash_outflow: Option<f64> = row.get(7);
                let refund_fee: Option<f64> = row.get(8);
                let company_account: String = row.get(9).unwrap_or_default();
                let prev_balance: Option<f64> = row.get(10);
                let course_sales: Option<f64> = row.get(11);
                let other_income: Option<f64> = row.get(12);
                let expenditure: Option<f64> = row.get(13);
                let bank_transfer: Option<f64> = row.get(14);
                LedgerResponse {
                    id,
                    ledger_month,
                    remark,
                    net_profit,
                    total_class_price,
                    trial_class_price,
                    coach_salary,
                    cash_outflow,
                    refund_fee,
                    company_account,
                    prev_balance,
                    course_sales,
                    other_income,
                    expenditure,
                    bank_transfer,
                    expenses: vec![],
                    incomes: vec![],
                }
            },
        )
        .map_err(|e| format!("查询月报记录失败: {e}"))?;

    let main = match main_rows.into_iter().next() {
        Some(r) => r,
        None => return Ok(None),
    };

    let lid = main.id;

    // 支出明细
    let expenses: Vec<ExpenseRow> = conn
        .exec_map(
            "SELECT id, sort_order, COALESCE(category,''), COALESCE(person,''), \
             COALESCE(item_desc,''), COALESCE(description,''), \
             CAST(COALESCE(amount,0) AS DOUBLE) FROM expense_item WHERE ledger_id = ? ORDER BY sort_order",
            Params::Positional(vec![i64_val(lid)]),
            |(id, sort_order, category, person, item_desc, description, amount): (
                i64, i32, String, String, String, String, Option<f64>,
            )| ExpenseRow {
                id: Some(id),
                sort_order,
                category,
                person,
                item_desc,
                description,
                amount,
            },
        )
        .map_err(|e| format!("查询支出明细失败: {e}"))?;

    // 收入明细
    let incomes: Vec<IncomeRow> = conn
        .exec_map(
            "SELECT id, sort_order, COALESCE(category,''), COALESCE(subject,''), \
             COALESCE(item_desc,''), COALESCE(content,''), CAST(COALESCE(amount,0) AS DOUBLE) \
             FROM income_item WHERE ledger_id = ? ORDER BY sort_order",
            Params::Positional(vec![i64_val(lid)]),
            |(id, sort_order, category, subject, item_desc, content, amount): (
                i64, i32, String, String, String, String, Option<f64>,
            )| IncomeRow {
                id: Some(id),
                sort_order,
                category,
                subject,
                item_desc,
                content,
                amount,
            },
        )
        .map_err(|e| format!("查询收入明细失败: {e}"))?;

    Ok(Some(LedgerResponse {
        expenses,
        incomes,
        ..main
    }))
}

/// 列出已有月报的月份列表。
#[tauri::command]
pub fn list_ledger_months() -> Result<Vec<String>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let months: Vec<String> = conn
        .query_map(
            "SELECT COALESCE(ledger_month,'') FROM daily_ledger ORDER BY ledger_month DESC",
            |d: String| d,
        )
        .map_err(|e| format!("查询月份列表失败: {e}"))?;

    Ok(months)
}

/// 计算上个月份字符串（YYYY-MM）。
fn prev_month(month: &str) -> String {
    let parts: Vec<&str> = month.split('-').collect();
    if parts.len() != 2 {
        return month.to_string();
    }
    let mut y: i32 = parts[0].parse().unwrap_or(2026);
    let mut m: i32 = parts[1].parse().unwrap_or(1);
    m -= 1;
    if m == 0 {
        m = 12;
        y -= 1;
    }
    format!("{}-{:02}", y, m)
}

/// 加载：从业务表加工数据写入月报（教练工资计算）。
#[tauri::command]
pub fn generate_ledger_data(target_month: String) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 确保 incentive_grade 表存在
    let _ = conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS incentive_grade (\
            id BIGINT AUTO_INCREMENT PRIMARY KEY,\
            grade_name VARCHAR(20) NOT NULL DEFAULT '',\
            range_min INT NOT NULL DEFAULT 0,\
            range_max INT NOT NULL DEFAULT 0,\
            salary DECIMAL(14,2) DEFAULT 0,\
            ratio DECIMAL(5,2) DEFAULT 0,\
            sort_order INT NOT NULL DEFAULT 0,\
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
            UNIQUE KEY uk_grade_name (grade_name)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        (),
    );

    // 1. 确保 daily_ledger 有该月记录
    let existing: Option<i64> = conn
        .exec_first(
            "SELECT id FROM daily_ledger WHERE ledger_month = ?",
            Params::Positional(vec![str_val(&target_month)]),
        )
        .map_err(|e| format!("查询月报失败: {e}"))?;

    let ledger_id = if let Some(id) = existing {
        id
    } else {
        conn.exec_drop(
            "INSERT INTO daily_ledger (ledger_month) VALUES (?)",
            Params::Positional(vec![str_val(&target_month)]),
        )
        .map_err(|e| format!("创建月报记录失败: {e}"))?;
        conn.last_insert_id() as i64
    };

    // 2. 删除旧的教练工资支出明细
    conn.exec_drop(
        "DELETE FROM expense_item WHERE ledger_id = ? AND category = '教练工资'",
        Params::Positional(vec![i64_val(ledger_id)]),
    )
    .map_err(|e| format!("删除旧工资明细失败: {e}"))?;

    // 3. 从 coach_stat + coach_salary 计算每个教练的工资
    let coach_rows: Vec<(String, i64, f64, f64, f64)> = conn
        .exec_map(
            format!(
                "SELECT \
                   cs.coach_name, \
                   cs.total_hours, \
                   CAST(COALESCE(cs.total_fee,0) AS DOUBLE), \
                   COALESCE((SELECT cs2.amount FROM coach_salary cs2 \
                     INNER JOIN salary_structure ss ON ss.id = cs2.salary_item_id \
                     WHERE cs2.coach_id = c.id AND ss.component = '店长补贴'), 0), \
                   COALESCE((SELECT cs2.amount FROM coach_salary cs2 \
                     INNER JOIN salary_structure ss ON ss.id = cs2.salary_item_id \
                     WHERE cs2.coach_id = c.id AND ss.component = '财务补贴'), 0) \
                 FROM coach_stat cs \
                 LEFT JOIN coach c ON c.name = cs.coach_name \
                 WHERE cs.stat_month = '{}'",
                target_month
            ),
            (),
            |row: mysql::Row| {
                let coach_name: String = row.get(0).unwrap_or_default();
                let total_hours: i64 = row.get(1).unwrap_or(0);
                let total_fee: f64 = row.get(2).unwrap_or(0.0);
                let store_manager_subsidy: f64 = row.get(3).unwrap_or(0.0);
                let finance_subsidy: f64 = row.get(4).unwrap_or(0.0);
                (coach_name, total_hours, total_fee, store_manager_subsidy, finance_subsidy)
            },
        )
        .map_err(|e| format!("查询教练统计失败: {e}"))?;

    // 4. 加载激励等级
    let grades: Vec<(String, i64, i64, f64, f64)> = conn
        .exec_map(
            "SELECT grade_name, range_min, range_max, CAST(COALESCE(salary,0) AS DOUBLE), CAST(COALESCE(ratio,0) AS DOUBLE) \
             FROM incentive_grade ORDER BY sort_order, range_min",
            (),
            |row: mysql::Row| {
                let grade_name: String = row.get(0).unwrap_or_default();
                let range_min: i64 = row.get(1).unwrap_or(0);
                let range_max: i64 = row.get(2).unwrap_or(0);
                let salary: f64 = row.get(3).unwrap_or(0.0);
                let ratio: f64 = row.get(4).unwrap_or(0.0);
                (grade_name, range_min, range_max, salary, ratio)
            },
        )
        .map_err(|e| format!("查询激励等级失败: {e}"))?;

    // 5. 匹配等级并计算工资
    let mut total_coach_salary = 0.0;
    let mut sort_order = 0i32;

    for (coach_name, total_hours, total_fee, store_subsidy, finance_subsidy) in &coach_rows {
        // 匹配等级
        let matched = grades.iter().find(|(_, range_min, range_max, _, _)| {
            *total_hours >= *range_min && (*range_max == 0 || *total_hours <= *range_max)
        });

        let (grade_name, base_salary, ratio) = match matched {
            Some((gn, _, _, sal, rat)) => (gn.clone(), *sal, *rat),
            None => ("未匹配".to_string(), 0.0, 0.0),
        };

        let course_fee_performance = total_fee * ratio / 100.0;
        let performance_salary = base_salary;
        let total_salary = base_salary + course_fee_performance + performance_salary + store_subsidy + finance_subsidy;

        // 只写有值的（total_salary > 0）
        if total_salary > 0.0 {
            conn.exec_drop(
                "INSERT INTO expense_item (ledger_id, sort_order, category, person, item_desc, description, amount) \
                 VALUES (?,?,?,?,?,?,?)",
                Params::Positional(vec![
                    i64_val(ledger_id),
                    i32_val(sort_order),
                    str_val("教练工资"),
                    str_val(coach_name),
                    str_val(&format!("{} ({}课时)", grade_name, total_hours)),
                    str_val(&format!(
                        "基础工资={:.2}, 课价绩效={:.2}(总客价{:.2}×{:.0}%), 绩效工资={:.2}, 店长补贴={:.2}, 财务补贴={:.2}",
                        base_salary, course_fee_performance, total_fee, ratio,
                        performance_salary, store_subsidy, finance_subsidy
                    )),
                    opt_f64(Some(total_salary)),
                ]),
            )
            .map_err(|e| format!("写入工资明细失败: {e}"))?;
            sort_order += 1;
        }

        total_coach_salary += total_salary;
    }

    // 6. 更新 daily_ledger.coach_salary
    conn.exec_drop(
        format!(
            "UPDATE daily_ledger SET coach_salary = {} WHERE id = {}",
            total_coach_salary, ledger_id
        ),
        (),
    )
    .map_err(|e| format!("更新教练工资合计失败: {e}"))?;

    Ok(format!(
        "已加载 {} 位教练工资数据，合计 {:.2} 元",
        coach_rows.len(),
        total_coach_salary
    ))
}

/// 继承上月数据到当月（先删除当月已有数据，再从上月复制）。
#[tauri::command]
pub fn inherit_ledger(target_month: String) -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let source_month = prev_month(&target_month);

    // 1. 查询上月数据
    let source_rows: Vec<LedgerResponse> = conn
        .exec_map(
            "SELECT id, COALESCE(ledger_month,''), COALESCE(remark,''), \
             CAST(COALESCE(net_profit,0) AS DOUBLE), CAST(COALESCE(total_class_price,0) AS DOUBLE), \
             CAST(COALESCE(trial_class_price,0) AS DOUBLE), CAST(COALESCE(coach_salary,0) AS DOUBLE), \
             CAST(COALESCE(cash_outflow,0) AS DOUBLE), CAST(COALESCE(refund_fee,0) AS DOUBLE), \
             COALESCE(company_account,''), CAST(COALESCE(prev_balance,0) AS DOUBLE), \
             CAST(COALESCE(course_sales,0) AS DOUBLE), CAST(COALESCE(other_income,0) AS DOUBLE), \
             CAST(COALESCE(expenditure,0) AS DOUBLE), CAST(COALESCE(bank_transfer,0) AS DOUBLE) \
             FROM daily_ledger WHERE ledger_month = ?",
            Params::Positional(vec![str_val(&source_month)]),
            |row: mysql::Row| {
                let id: i64 = row.get(0).unwrap_or(0);
                let ledger_month: String = row.get(1).unwrap_or_default();
                let remark: String = row.get(2).unwrap_or_default();
                let net_profit: Option<f64> = row.get(3);
                let total_class_price: Option<f64> = row.get(4);
                let trial_class_price: Option<f64> = row.get(5);
                let coach_salary: Option<f64> = row.get(6);
                let cash_outflow: Option<f64> = row.get(7);
                let refund_fee: Option<f64> = row.get(8);
                let company_account: String = row.get(9).unwrap_or_default();
                let prev_balance: Option<f64> = row.get(10);
                let course_sales: Option<f64> = row.get(11);
                let other_income: Option<f64> = row.get(12);
                let expenditure: Option<f64> = row.get(13);
                let bank_transfer: Option<f64> = row.get(14);
                LedgerResponse {
                    id,
                    ledger_month,
                    remark,
                    net_profit,
                    total_class_price,
                    trial_class_price,
                    coach_salary,
                    cash_outflow,
                    refund_fee,
                    company_account,
                    prev_balance,
                    course_sales,
                    other_income,
                    expenditure,
                    bank_transfer,
                    expenses: vec![],
                    incomes: vec![],
                }
            },
        )
        .map_err(|e| format!("查询上月数据失败: {e}"))?;

    let source = match source_rows.into_iter().next() {
        Some(r) => r,
        None => return Err(format!("上月（{}）没有数据，无法继承", source_month)),
    };

    // 2. 删除当月已有数据（主表 + 明细）
    let existing_id: Option<i64> = conn
        .exec_first(
            "SELECT id FROM daily_ledger WHERE ledger_month = ?",
            Params::Positional(vec![str_val(&target_month)]),
        )
        .map_err(|e| format!("查询当月数据失败: {e}"))?;

    if let Some(eid) = existing_id {
        conn.exec_drop(
            "DELETE FROM expense_item WHERE ledger_id = ?",
            Params::Positional(vec![i64_val(eid)]),
        )
        .map_err(|e| format!("删除当月支出明细失败: {e}"))?;
        conn.exec_drop(
            "DELETE FROM income_item WHERE ledger_id = ?",
            Params::Positional(vec![i64_val(eid)]),
        )
        .map_err(|e| format!("删除当月收入明细失败: {e}"))?;
        conn.exec_drop(
            "DELETE FROM daily_ledger WHERE id = ?",
            Params::Positional(vec![i64_val(eid)]),
        )
        .map_err(|e| format!("删除当月主表失败: {e}"))?;
    }

    // 3. 插入当月主表（从上月复制）
    conn.exec_drop(
        "INSERT INTO daily_ledger (ledger_month, remark, net_profit, total_class_price, \
         trial_class_price, coach_salary, cash_outflow, refund_fee, \
         company_account, prev_balance, course_sales, other_income, \
         expenditure, bank_transfer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        Params::Positional(vec![
            str_val(&target_month),
            str_val(&source.remark),
            opt_f64(source.net_profit),
            opt_f64(source.total_class_price),
            opt_f64(source.trial_class_price),
            opt_f64(source.coach_salary),
            opt_f64(source.cash_outflow),
            opt_f64(source.refund_fee),
            str_val(&source.company_account),
            opt_f64(source.prev_balance),
            opt_f64(source.course_sales),
            opt_f64(source.other_income),
            opt_f64(source.expenditure),
            opt_f64(source.bank_transfer),
        ]),
    )
    .map_err(|e| format!("插入当月主表失败: {e}"))?;

    let new_id = conn.last_insert_id() as i64;

    // 4. 复制上月支出明细
    let src_expenses: Vec<ExpenseRow> = conn
        .exec_map(
            "SELECT id, sort_order, COALESCE(category,''), COALESCE(person,''), \
             COALESCE(item_desc,''), COALESCE(description,''), \
             CAST(COALESCE(amount,0) AS DOUBLE) FROM expense_item WHERE ledger_id = ? ORDER BY sort_order",
            Params::Positional(vec![i64_val(source.id)]),
            |(id, sort_order, category, person, item_desc, description, amount): (
                i64, i32, String, String, String, String, Option<f64>,
            )| ExpenseRow {
                id: Some(id),
                sort_order,
                category,
                person,
                item_desc,
                description,
                amount,
            },
        )
        .map_err(|e| format!("查询上月支出明细失败: {e}"))?;

    for exp in &src_expenses {
        conn.exec_drop(
            "INSERT INTO expense_item (ledger_id, sort_order, category, person, item_desc, description, amount) \
             VALUES (?,?,?,?,?,?,?)",
            Params::Positional(vec![
                i64_val(new_id),
                i32_val(exp.sort_order),
                str_val(&exp.category),
                str_val(&exp.person),
                str_val(&exp.item_desc),
                str_val(&exp.description),
                opt_f64(exp.amount),
            ]),
        )
        .map_err(|e| format!("复制支出明细失败: {e}"))?;
    }

    // 5. 复制上月收入明细
    let src_incomes: Vec<IncomeRow> = conn
        .exec_map(
            "SELECT id, sort_order, COALESCE(category,''), COALESCE(subject,''), \
             COALESCE(item_desc,''), COALESCE(content,''), CAST(COALESCE(amount,0) AS DOUBLE) \
             FROM income_item WHERE ledger_id = ? ORDER BY sort_order",
            Params::Positional(vec![i64_val(source.id)]),
            |(id, sort_order, category, subject, item_desc, content, amount): (
                i64, i32, String, String, String, String, Option<f64>,
            )| IncomeRow {
                id: Some(id),
                sort_order,
                category,
                subject,
                item_desc,
                content,
                amount,
            },
        )
        .map_err(|e| format!("查询上月收入明细失败: {e}"))?;

    for inc in &src_incomes {
        conn.exec_drop(
            "INSERT INTO income_item (ledger_id, sort_order, category, subject, item_desc, content, amount) \
             VALUES (?,?,?,?,?,?,?)",
            Params::Positional(vec![
                i64_val(new_id),
                i32_val(inc.sort_order),
                str_val(&inc.category),
                str_val(&inc.subject),
                str_val(&inc.item_desc),
                str_val(&inc.content),
                opt_f64(inc.amount),
            ]),
        )
        .map_err(|e| format!("复制收入明细失败: {e}"))?;
    }

    Ok(format!(
        "已从 {} 继承数据到 {}（支出{}笔，收入{}笔）",
        source_month,
        target_month,
        src_expenses.len(),
        src_incomes.len()
    ))
}

/* ========== 生成月报 ========== */

#[tauri::command]
pub fn generate_monthly_report(ledger_month: String) -> Result<String, String> {
    use std::io::Write;

    crate::load_env_from_parents();
    let _pool = crate::connect_pool()?;

    // 加载月报数据
    let data = super::ledger::load_ledger(ledger_month.clone())?
        .ok_or_else(|| format!("{} 暂无月报数据", ledger_month))?;

    // 当前时间（标准库，无需 chrono）
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // 简单格式化：从 epoch 秒数计算 Y-M-D H:M
    let days_since_epoch = (now_secs / 86400) as i64;
    let time_of_day = (now_secs % 86400) as u32;
    let (year, month, day) = days_to_ymd(days_since_epoch);
    let hour = time_of_day / 3600;
    let minute = (time_of_day % 3600) / 60;
    let now_str = format!("{}-{:02}-{:02} {:02}:{:02}", year, month, day, hour, minute);
    // 计算汇总
    let total_expense: f64 = data.expenses.iter().map(|e| e.amount.unwrap_or(0.0)).sum();
    let total_income: f64 = data.incomes.iter().map(|i| i.amount.unwrap_or(0.0)).sum();
    let net_profit = data.net_profit.unwrap_or(0.0);
    let coach_salary = data.coach_salary.unwrap_or(0.0);
    let course_sales = data.course_sales.unwrap_or(0.0);
    let expenditure = data.expenditure.unwrap_or(0.0);
    let bank_transfer = data.bank_transfer.unwrap_or(0.0);
    let other_income = data.other_income.unwrap_or(0.0);
    let prev_balance = data.prev_balance.unwrap_or(0.0);
    let ending_balance = prev_balance + course_sales + other_income - expenditure - bank_transfer;

    // 支出按项目分组汇总
    let mut exp_by_project: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for e in &data.expenses {
        let key = if e.category.is_empty() { "其他".into() } else { e.category.clone() };
        *exp_by_project.entry(key).or_insert(0.0) += e.amount.unwrap_or(0.0);
    }
    let mut exp_sorted: Vec<_> = exp_by_project.into_iter().collect();
    exp_sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // 收入按项目分组汇总
    let mut inc_by_project: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for i in &data.incomes {
        let key = if i.category.is_empty() { "其他".into() } else { i.category.clone() };
        *inc_by_project.entry(key).or_insert(0.0) += i.amount.unwrap_or(0.0);
    }
    let mut inc_sorted: Vec<_> = inc_by_project.into_iter().collect();
    inc_sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // 分析指标
    let salary_ratio = if course_sales > 0.0 { coach_salary / course_sales * 100.0 } else { 0.0 };
    let profit_margin = if total_income > 0.0 { net_profit / total_income * 100.0 } else { 0.0 };
    let exp_ratio = if total_income > 0.0 { total_expense / total_income * 100.0 } else { 0.0 };

    // 生成 HTML 报告
    let net_class = if net_profit < 0.0 { " warn" } else { "" };
    let exp_class = if total_expense > total_income { " warn" } else { "" };

    let mut inc_rows = String::new();
    for i in &data.incomes {
        inc_rows.push_str(&format!(
            "<tr><td>{}</td><td>{}</td><td>{}</td><td class=\"num\">{:.2}</td></tr>\n",
            esc_html(&i.category), esc_html(&i.subject), esc_html(&i.item_desc),
            i.amount.unwrap_or(0.0)
        ));
    }

    let mut inc_analysis = String::new();
    if !inc_sorted.is_empty() {
        inc_analysis.push_str("<table><tr><th>收入类别</th><th class=\"num\">金额</th><th class=\"num\">占比</th></tr>\n");
        for (name, amt) in &inc_sorted {
            let pct = if total_income > 0.0 { amt / total_income * 100.0 } else { 0.0 };
            inc_analysis.push_str(&format!(
                "<tr><td>{}</td><td class=\"num\">{:.2}</td><td class=\"num\">{:.1}%</td></tr>\n",
                esc_html(name), amt, pct
            ));
        }
        inc_analysis.push_str("</table>\n");
    }

    let mut exp_rows = String::new();
    for e in &data.expenses {
        exp_rows.push_str(&format!(
            "<tr><td>{}</td><td>{}</td><td>{}</td><td class=\"num\">{:.2}</td></tr>\n",
            esc_html(&e.category), esc_html(&e.person), esc_html(&e.item_desc),
            e.amount.unwrap_or(0.0)
        ));
    }

    let mut exp_analysis = String::new();
    if !exp_sorted.is_empty() {
        exp_analysis.push_str("<table><tr><th>支出类别</th><th class=\"num\">金额</th><th class=\"num\">占比</th></tr>\n");
        for (name, amt) in &exp_sorted {
            let pct = if total_expense > 0.0 { amt / total_expense * 100.0 } else { 0.0 };
            exp_analysis.push_str(&format!(
                "<tr><td>{}</td><td class=\"num\">{:.2}</td><td class=\"num\">{:.1}%</td></tr>\n",
                esc_html(name), amt, pct
            ));
        }
        exp_analysis.push_str("</table>\n");
    }

    let profit_advice = if profit_margin < 10.0 {
        " <span class=\"warn-text\">利润率偏低，建议关注成本控制。</span>"
    } else if profit_margin > 30.0 {
        " 盈利状况良好。"
    } else {
        ""
    };
    let salary_advice = if salary_ratio > 50.0 {
        " <span class=\"warn-text\">人力成本占比偏高，建议优化排课效率。</span>"
    } else {
        ""
    };
    let exp_advice = if exp_ratio > 80.0 {
        " <span class=\"warn-text\">支出占比过高，需重点关注。</span>"
    } else {
        ""
    };
    let remark_html = if data.remark.is_empty() {
        String::new()
    } else {
        format!("<p>4. <span class=\"highlight\">备注</span>：{}</p>\n", esc_html(&data.remark))
    };

    let html = format!(r##"<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<title>财务月报 - {month}</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", sans-serif; color: #2c3e50; padding: 40px 60px; background: #fff; max-width: 1100px; margin: 0 auto; }}
h1 {{ text-align: center; font-size: 26px; margin-bottom: 4px; color: #1a3c40; letter-spacing: 2px; }}
.subtitle {{ text-align: center; color: #95a5a6; font-size: 13px; margin-bottom: 32px; }}
.section {{ margin-bottom: 30px; }}
.section-title {{ font-size: 15px; font-weight: 700; color: #028090; border-left: 4px solid #028090; padding-left: 10px; margin-bottom: 14px; }}
.kpi-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }}
.kpi-card {{ background: #f0f7fa; border-radius: 8px; padding: 18px 12px; text-align: center; }}
.kpi-label {{ font-size: 12px; color: #7f8c8d; margin-bottom: 8px; }}
.kpi-value {{ font-size: 24px; font-weight: 700; color: #028090; }}
.kpi-value.warn {{ color: #e74c3c; }}
.kpi-value.good {{ color: #27ae60; }}
table {{ width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }}
th {{ background: #028090; color: #fff; padding: 10px 14px; text-align: left; font-weight: 600; font-size: 13px; }}
td {{ padding: 9px 14px; border-bottom: 1px solid #e8ecef; }}
tr:nth-child(even) td {{ background: #f8fafb; }}
.num {{ text-align: right; font-family: "Consolas", "Monaco", monospace; white-space: nowrap; }}
.total-row td {{ font-weight: 700; background: #e8f6f3 !important; border-top: 2px solid #028090; }}
.analysis-box {{ background: #f9fbfc; border: 1px solid #e0e6eb; border-radius: 8px; padding: 18px 22px; }}
.analysis-box p {{ margin-bottom: 10px; line-height: 1.8; font-size: 13px; }}
.analysis-box .highlight {{ color: #028090; font-weight: 600; }}
.analysis-box .warn-text {{ color: #e74c3c; font-weight: 600; }}
.footer {{ margin-top: 36px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #bbb; }}
@media print {{ body {{ padding: 20px 30px; }} }}
</style></head><body>
<h1>财务月报</h1>
<p class="subtitle">报告期间：{month} &nbsp;&bull;&nbsp; 生成时间：{now}</p>

<div class="kpi-grid">
<div class="kpi-card"><div class="kpi-label">纯利润</div><div class="kpi-value{net_cls}">{net_profit:.2}</div></div>
<div class="kpi-card"><div class="kpi-label">总收入</div><div class="kpi-value good">{total_income:.2}</div></div>
<div class="kpi-card"><div class="kpi-label">总支出</div><div class="kpi-value{exp_cls}">{total_expense:.2}</div></div>
<div class="kpi-card"><div class="kpi-label">期末余额</div><div class="kpi-value">{ending_balance:.2}</div></div>
</div>

<div class="section"><div class="section-title">收入明细</div>
<table><tr><th>分类</th><th>科目</th><th>事项</th><th class="num">金额</th></tr>
{inc_rows}<tr class="total-row"><td colspan="3">合计</td><td class="num">{total_income:.2}</td></tr></table>
{inc_analysis}</div>

<div class="section"><div class="section-title">支出明细</div>
<table><tr><th>分类</th><th>人员</th><th>事项</th><th class="num">金额</th></tr>
{exp_rows}<tr class="total-row"><td colspan="3">合计</td><td class="num">{total_expense:.2}</td></tr></table>
{exp_analysis}</div>

<div class="section"><div class="section-title">公司账户</div>
<table><tr><th>项目</th><th class="num">金额</th></tr>
<tr><td>公司账户</td><td class="num">{account}</td></tr>
<tr><td>上月余额</td><td class="num">{prev_balance:.2}</td></tr>
<tr><td>售课金额</td><td class="num">{course_sales:.2}</td></tr>
<tr><td>其他收入</td><td class="num">{other_income:.2}</td></tr>
<tr><td>支出合计</td><td class="num">{expenditure:.2}</td></tr>
<tr><td>转入银行卡</td><td class="num">{bank_transfer:.2}</td></tr>
<tr class="total-row"><td>期末余额</td><td class="num">{ending_balance:.2}</td></tr></table></div>

<div class="section"><div class="section-title">分析与建议</div>
<div class="analysis-box">
<p>1. <span class="highlight">盈利能力</span>：本月纯利润为 <span class="highlight">{net_profit:.2}</span> 元，利润率为 <span class="highlight">{profit_margin:.1}%</span>。{profit_advice}</p>
<p>2. <span class="highlight">人力成本</span>：教练工资支出 <span class="highlight">{coach_salary:.2}</span> 元，占售课收入 <span class="highlight">{salary_ratio:.1}%</span>。{salary_advice}</p>
<p>3. <span class="highlight">收支结构</span>：总支出占总收入 <span class="highlight">{exp_ratio:.1}%</span>。{exp_advice}</p>
{remark_html}</div></div>

<div class="footer">本报告由财务管理系统自动生成</div>
</body></html>"##,
        month = ledger_month,
        now = now_str,
        net_cls = net_class,
        exp_cls = exp_class,
        net_profit = net_profit,
        total_income = total_income,
        total_expense = total_expense,
        ending_balance = ending_balance,
        inc_rows = inc_rows,
        inc_analysis = inc_analysis,
        exp_rows = exp_rows,
        exp_analysis = exp_analysis,
        account = esc_html(&data.company_account),
        prev_balance = prev_balance,
        course_sales = course_sales,
        other_income = other_income,
        expenditure = expenditure,
        bank_transfer = bank_transfer,
        profit_margin = profit_margin,
        coach_salary = coach_salary,
        salary_ratio = salary_ratio,
        exp_ratio = exp_ratio,
        profit_advice = profit_advice,
        salary_advice = salary_advice,
        exp_advice = exp_advice,
        remark_html = remark_html,
    );

    // 保存文件
    let filename = format!("财务月报_{}.html", ledger_month);
    let path = std::env::var("HOME")
        .map(|h| format!("{}/Desktop/{}", h, filename))
        .unwrap_or_else(|_| filename.clone());

    let mut file = std::fs::File::create(&path)
        .map_err(|e| format!("创建文件失败: {e}"))?;
    file.write_all(html.as_bytes())
        .map_err(|e| format!("写入文件失败: {e}"))?;

    // 尝试打开文件
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd").args(["/C", "start", "", &path]).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
    }

    Ok(format!("月报已生成: {}", path))
}

fn esc_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// 从 Unix epoch 天数转换为 (年, 月, 日)
fn days_to_ymd(days: i64) -> (i64, i64, i64) {
    let mut y = 1970i64;
    let mut d = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if d < days_in_year { break; }
        d -= days_in_year;
        y += 1;
    }
    let leap = is_leap(y);
    let md = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0usize;
    while m < 12 && d >= md[m] as i64 {
        d -= md[m] as i64;
        m += 1;
    }
    (y, m as i64 + 1, d + 1)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
