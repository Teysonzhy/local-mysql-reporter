//! 报表演示：从 rpt_amount 联结维度表拉取扁平数据；可选执行种子数据。

use mysql::prelude::*;
use serde::Serialize;

use crate::connect_pool;
use crate::load_env_from_parents;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRow {
    pub period_code: String,
    pub year_no: i16,
    pub month_no: i8,
    pub account_code: String,
    pub account_name: String,
    pub amount: f64,
}

/// 联结查询，供前端透视与图表使用。
#[tauri::command]
pub fn fetch_report_dataset() -> Result<Vec<ReportRow>, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let rows: Vec<ReportRow> = conn
        .query_map(
            "SELECT p.period_code, p.year_no, p.month_no, a.account_code, a.account_name, \
             CAST(r.amount_decimal AS DOUBLE) AS amt \
             FROM rpt_amount r \
             INNER JOIN dim_period p ON p.id = r.period_id \
             INNER JOIN dim_account a ON a.id = r.account_id \
             ORDER BY p.period_code, a.account_code",
            |(period_code, year_no, month_no, account_code, account_name, amt): (
                String,
                i16,
                i8,
                String,
                String,
                f64,
            )| ReportRow {
                period_code,
                year_no,
                month_no,
                account_code,
                account_name,
                amount: amt,
            },
        )
        .map_err(|e| format!("查询报表数据失败: {e}"))?;

    Ok(rows)
}

/// 写入演示种子（会清空 rpt_amount / dim_account / dim_period 再插入，与 docs/seed_report_demo.sql 一致）。
#[tauri::command]
pub fn seed_demo_financial_data() -> Result<String, String> {
    load_env_from_parents();
    let pool = connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    conn.query_drop("SET FOREIGN_KEY_CHECKS = 0")
        .map_err(|e| e.to_string())?;
    conn.query_drop("TRUNCATE TABLE rpt_amount")
        .map_err(|e| e.to_string())?;
    conn.query_drop("TRUNCATE TABLE dim_account")
        .map_err(|e| e.to_string())?;
    conn.query_drop("TRUNCATE TABLE dim_period")
        .map_err(|e| e.to_string())?;
    conn.query_drop("SET FOREIGN_KEY_CHECKS = 1")
        .map_err(|e| e.to_string())?;

    conn.query_drop(
        "INSERT INTO dim_period (id, period_code, year_no, month_no, period_start, period_end) VALUES \
         (1,'202401',2024,1,'2024-01-01','2024-01-31'),(2,'202402',2024,2,'2024-02-01','2024-02-29'),\
         (3,'202403',2024,3,'2024-03-01','2024-03-31'),(4,'202404',2024,4,'2024-04-01','2024-04-30'),\
         (5,'202405',2024,5,'2024-05-01','2024-05-31'),(6,'202406',2024,6,'2024-06-01','2024-06-30')",
    )
    .map_err(|e| format!("写入 dim_period 失败: {e}"))?;

    conn.query_drop(
        "INSERT INTO dim_account (id, account_code, account_name, parent_account_id, level_no, sort_order) VALUES \
         (1,'A4100','主营业务收入',NULL,1,10),(2,'A4200','其他业务收入',NULL,1,20),(3,'A5100','主营业务成本',NULL,1,30),\
         (4,'A5200','销售费用',NULL,1,40),(5,'A5300','管理费用',NULL,1,50),(6,'A5400','财务费用',NULL,1,60),\
         (7,'A6100','营业外收入',NULL,1,70),(8,'A6200','营业外支出',NULL,1,80)",
    )
    .map_err(|e| format!("写入 dim_account 失败: {e}"))?;

    conn.query_drop(
        "INSERT INTO rpt_amount (period_id, account_id, amount_decimal, currency_code, biz_natural_key, remark) \
         SELECT p.id, a.id, \
         ROUND((p.id * 10000 + a.id * 137 + MOD(p.id * a.id, 97)) / 100, 2), \
         'CNY', CONCAT('SEED_P', p.id, '_A', a.id), 'seed_report_demo' \
         FROM dim_period p CROSS JOIN dim_account a",
    )
    .map_err(|e| format!("写入 rpt_amount 失败: {e}"))?;

    let n: Option<u64> = conn
        .query_first("SELECT COUNT(*) FROM rpt_amount")
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "已写入演示数据：6 个期间 × 8 个科目 = {} 行 rpt_amount。",
        n.unwrap_or(0)
    ))
}

/* ========== 报表概览 ========== */

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewStats {
    /// 漏斗数据
    pub total_members: i64,
    pub paid_members: i64,
    pub active_members: i64,
    /// 流失分析
    pub churn_members: i64,
    pub churn_reasons: Vec<(String, i64)>,
    /// 课时月趋势（最近12个月）
    pub hours_trend_months: Vec<String>,
    pub hours_trend_new: Vec<i64>,
    pub hours_trend_used: Vec<i64>,
    pub hours_trend_remain: Vec<i64>,
    /// 体验转化
    pub trial_total: i64,
    pub trial_converted: i64,
    pub trial_lost: i64,
    pub trial_pending: i64,
    /// 引流来源
    pub trial_sources: Vec<(String, i64)>,
}

#[tauri::command]
pub fn overview_stats() -> Result<OverviewStats, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 1. 会员漏斗
    let total_members: i64 = conn
        .query_first("SELECT COUNT(*) FROM member")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    let paid_members: i64 = conn
        .query_first("SELECT COUNT(*) FROM member WHERE month_new_hours > 0 OR remain_hours > 0")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    let active_members: i64 = conn
        .query_first("SELECT COUNT(*) FROM member WHERE remain_hours > 0")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    // 2. 流失分析
    let churn_members: i64 = conn
        .query_first("SELECT COUNT(*) FROM member WHERE churn_note IS NOT NULL AND churn_note != ''")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    let churn_reasons: Vec<(String, i64)> = conn
        .query_map(
            "SELECT churn_note, COUNT(*) AS c FROM member \
             WHERE churn_note IS NOT NULL AND churn_note != '' \
             GROUP BY churn_note ORDER BY c DESC LIMIT 10",
            |(note, c): (String, i64)| (note, c),
        )
        .map_err(|e| e.to_string())?;

    // 3. 课时月趋势（最近12个月，从 coach_stat 表获取）
    let hours_trend: Vec<(String, i64, i64, i64)> = conn
        .query_map(
            "SELECT stat_month, \
             COALESCE(SUM(total_hours),0), \
             COALESCE(SUM(normal_hours),0), \
             COALESCE(SUM(trial_hours),0) \
             FROM coach_stat \
             GROUP BY stat_month ORDER BY stat_month DESC LIMIT 12",
            |(m, total_h, normal_h, trial_h): (String, i64, i64, i64)| (m, total_h, normal_h, trial_h),
        )
        .map_err(|e| e.to_string())?;

    let mut hours_trend_months: Vec<String> = Vec::new();
    let mut hours_trend_new: Vec<i64> = Vec::new();
    let mut hours_trend_used: Vec<i64> = Vec::new();
    let mut hours_trend_remain: Vec<i64> = Vec::new();
    for (m, total_h, normal_h, trial_h) in hours_trend.into_iter().rev() {
        hours_trend_months.push(m);
        hours_trend_new.push(total_h);
        hours_trend_used.push(normal_h);
        hours_trend_remain.push(trial_h);
    }

    // 4. 体验转化
    let trial_total: i64 = conn
        .query_first("SELECT COUNT(*) FROM trial_class")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    let trial_converted: i64 = conn
        .query_first("SELECT COUNT(*) FROM trial_class WHERE status = 3")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    let trial_lost: i64 = conn
        .query_first("SELECT COUNT(*) FROM trial_class WHERE status = 4")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    let trial_pending: i64 = conn
        .query_first("SELECT COUNT(*) FROM trial_class WHERE status IN (1,2)")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    // 5. 引流来源
    let trial_sources: Vec<(String, i64)> = conn
        .query_map(
            "SELECT source, COUNT(*) AS c FROM trial_class \
             WHERE source IS NOT NULL AND source != '' \
             GROUP BY source ORDER BY c DESC LIMIT 10",
            |(s, c): (String, i64)| (s, c),
        )
        .map_err(|e| e.to_string())?;

    Ok(OverviewStats {
        total_members,
        paid_members,
        active_members,
        churn_members,
        churn_reasons,
        hours_trend_months,
        hours_trend_new,
        hours_trend_used,
        hours_trend_remain,
        trial_total,
        trial_converted,
        trial_lost,
        trial_pending,
        trial_sources,
    })
}
