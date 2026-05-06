//! 导入数据模块：import_member / import_booking 表的导入、加载、统计。

use mysql::prelude::Queryable;
use serde::Serialize;

fn str_val(s: &str) -> mysql::Value {
    mysql::Value::Bytes(s.as_bytes().to_vec())
}

/* ========== 导入（先清旧数据再写入） ========== */

/// 导入会员名册：先清空 import_member，再批量插入
#[tauri::command]
pub fn import_member_data(rows: Vec<ImportMemberRow>) -> Result<String, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 确保表存在
    let _ = conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS import_member (\
            id BIGINT AUTO_INCREMENT PRIMARY KEY,\
            card_name VARCHAR(100) NOT NULL DEFAULT '',\
            phone VARCHAR(20) NOT NULL DEFAULT '',\
            name_remark VARCHAR(200) NOT NULL DEFAULT '',\
            coach VARCHAR(100) NOT NULL DEFAULT '',\
            remark VARCHAR(500) NOT NULL DEFAULT '',\
            prev_init_hours INT NOT NULL DEFAULT 0,\
            month_new_hours INT NOT NULL DEFAULT 0,\
            month_used_hours INT NOT NULL DEFAULT 0,\
            remain_hours INT NOT NULL DEFAULT 0,\
            churn_note VARCHAR(500) NOT NULL DEFAULT '',\
            import_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\
            INDEX idx_im_card(card_name),\
            INDEX idx_im_coach(coach)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        (),
    );

    // 清空旧数据
    conn.exec_drop("TRUNCATE TABLE import_member", ())
        .map_err(|e| format!("清空会员导入表失败: {e}"))?;

    // 批量插入
    for r in &rows {
        conn.exec_drop(
            "INSERT INTO import_member (card_name,phone,name_remark,coach,remark,\
             prev_init_hours,month_new_hours,month_used_hours,remain_hours,churn_note) \
             VALUES (?,?,?,?,?,?,?,?,?,?)",
            mysql::Params::Positional(vec![
                str_val(&r.card_name),
                str_val(&r.phone),
                str_val(&r.name_remark),
                str_val(&r.coach),
                str_val(&r.remark),
                mysql::Value::Int(r.prev_init_hours as i64),
                mysql::Value::Int(r.month_new_hours as i64),
                mysql::Value::Int(r.month_used_hours as i64),
                mysql::Value::Int(r.remain_hours as i64),
                str_val(&r.churn_note),
            ]),
        )
        .map_err(|e| format!("插入会员数据失败: {e}"))?;
    }

    Ok(format!("成功导入 {} 条会员名册记录", rows.len()))
}

/// 导入约课记录：先清空 import_booking，再批量插入
#[tauri::command]
pub fn import_booking_data(rows: Vec<ImportBookingRow>) -> Result<String, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 确保表存在
    let _ = conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS import_booking (\
            id BIGINT AUTO_INCREMENT PRIMARY KEY,\
            coach_name VARCHAR(50) NOT NULL DEFAULT '',\
            course_name VARCHAR(100) NOT NULL DEFAULT '',\
            class_date VARCHAR(50) NOT NULL DEFAULT '',\
            class_time VARCHAR(50) NOT NULL DEFAULT '',\
            max_students INT NOT NULL DEFAULT 0,\
            member_name VARCHAR(100) NOT NULL DEFAULT '',\
            member_card VARCHAR(100) NOT NULL DEFAULT '',\
            course_value DECIMAL(14,2) NOT NULL DEFAULT 0,\
            solo_fee DECIMAL(14,2) NOT NULL DEFAULT 0,\
            import_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\
            INDEX idx_ib_coach(coach_name),\
            INDEX idx_ib_date(class_date),\
            INDEX idx_ib_member(member_name)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        (),
    );

    // 清空旧数据
    conn.exec_drop("TRUNCATE TABLE import_booking", ())
        .map_err(|e| format!("清空约课导入表失败: {e}"))?;

    for r in &rows {
        conn.exec_drop(
            "INSERT INTO import_booking (coach_name,course_name,class_date,class_time,\
             max_students,member_name,member_card,course_value,solo_fee) \
             VALUES (?,?,?,?,?,?,?,?,?)",
            mysql::Params::Positional(vec![
                str_val(&r.coach_name),
                str_val(&r.course_name),
                str_val(&r.class_date),
                str_val(&r.class_time),
                mysql::Value::Int(r.max_students as i64),
                str_val(&r.member_name),
                str_val(&r.member_card),
                mysql::Value::Int((r.course_value * 100.0) as i64),
                mysql::Value::Int((r.solo_fee * 100.0) as i64),
            ]),
        )
        .map_err(|e| format!("插入约课数据失败: {e}"))?;
    }

    Ok(format!("成功导入 {} 条约课记录", rows.len()))
}

/* ========== 加载（从 import 表更新业务表） ========== */

/// 从 import_member 加载数据到 member 表
#[tauri::command]
pub fn load_import_to_member() -> Result<String, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 确保 member 表存在
    let _ = conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS member (\
            id BIGINT AUTO_INCREMENT PRIMARY KEY,\
            card_name VARCHAR(100) NOT NULL DEFAULT '',\
            phone VARCHAR(20) NOT NULL DEFAULT '',\
            name_remark VARCHAR(200) NOT NULL DEFAULT '',\
            coach VARCHAR(100) NOT NULL DEFAULT '',\
            remark VARCHAR(500) NOT NULL DEFAULT '',\
            prev_init_hours INT NOT NULL DEFAULT 0,\
            month_new_hours INT NOT NULL DEFAULT 0,\
            month_used_hours INT NOT NULL DEFAULT 0,\
            remain_hours INT NOT NULL DEFAULT 0,\
            churn_note VARCHAR(500) NOT NULL DEFAULT '',\
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
            INDEX idx_phone(phone),\
            INDEX idx_coach(coach)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        (),
    );

    // 清空 member 表
    conn.exec_drop("TRUNCATE TABLE member", ())
        .map_err(|e| format!("清空会员表失败: {e}"))?;

    // 从 import_member 复制到 member
    conn.exec_drop(
        "INSERT INTO member (card_name,phone,name_remark,coach,remark,\
         prev_init_hours,month_new_hours,month_used_hours,remain_hours,churn_note) \
         SELECT card_name,phone,name_remark,coach,remark,\
         prev_init_hours,month_new_hours,month_used_hours,remain_hours,churn_note \
         FROM import_member",
        (),
    )
    .map_err(|e| format!("加载会员数据失败: {e}"))?;

    let count: i64 = conn
        .query_first("SELECT COUNT(*) FROM member")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    Ok(format!("已从导入数据加载 {} 条会员记录", count))
}

/// 从 import_booking 加载教练和课程数据
#[tauri::command]
pub fn load_import_to_coach_course() -> Result<String, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 确保 coach 表存在
    let _ = conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS coach (\
            id BIGINT AUTO_INCREMENT PRIMARY KEY,\
            name VARCHAR(50) NOT NULL DEFAULT '',\
            phone VARCHAR(20) NULL,\
            qualification TEXT NULL,\
            store_name VARCHAR(100) NULL,\
            hourly_rate DECIMAL(14,2) NULL,\
            share_ratio DECIMAL(5,2) DEFAULT 50.00,\
            status TINYINT NOT NULL DEFAULT 1,\
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
            INDEX idx_status(status)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        (),
    );

    // 确保 course 表存在
    let _ = conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS course (\
            id BIGINT AUTO_INCREMENT PRIMARY KEY,\
            coach_id BIGINT NOT NULL DEFAULT 0,\
            name VARCHAR(100) NOT NULL DEFAULT '',\
            description TEXT NULL,\
            start_time DATETIME NULL,\
            end_time DATETIME NULL,\
            duration INT DEFAULT 60,\
            max_students INT DEFAULT 0,\
            course_value DECIMAL(14,2) DEFAULT 0,\
            member_name VARCHAR(100) NOT NULL DEFAULT '',\
            member_card VARCHAR(100) NOT NULL DEFAULT '',\
            solo_fee DECIMAL(14,2) DEFAULT 0,\
            booking_status TINYINT NOT NULL DEFAULT 2,\
            status TINYINT NOT NULL DEFAULT 1,\
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
            INDEX idx_coach(coach_id),\
            INDEX idx_start_time(start_time)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        (),
    );

    // 1. 从 import_booking 提取不重复的教练，插入 coach 表（已存在则跳过）
    conn.exec_drop(
        "INSERT IGNORE INTO coach (name, status) \
         SELECT DISTINCT coach_name, 1 FROM import_booking \
         WHERE coach_name IS NOT NULL AND coach_name != ''",
        (),
    ).map_err(|e| format!("同步教练失败: {e}"))?;

    let coach_count: i64 = conn
        .query_first("SELECT ROW_COUNT()")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    // 2. 从 import_booking 生成课程记录，按教练+课程名+上课时间分组，已存在的跳过
    conn.exec_drop(
        "INSERT IGNORE INTO course (coach_id, name, start_time, duration, max_students, course_value, member_name, member_card, solo_fee, status) \
         SELECT \
           c.id, \
           ib.course_name, \
           CONCAT(ib.class_date, IF(ib.class_time IS NOT NULL AND ib.class_time != '', CONCAT(' ', ib.class_time), ' 00:00')), \
           60, \
           ib.max_students, \
           ib.course_value, \
           ib.member_name, \
           ib.member_card, \
           ib.solo_fee, \
           2 \
         FROM import_booking ib \
         INNER JOIN coach c ON c.name = ib.coach_name \
         WHERE ib.coach_name IS NOT NULL AND ib.coach_name != '' \
           AND ib.class_date IS NOT NULL AND ib.class_date != ''",
        (),
    ).map_err(|e| format!("同步课程失败: {e}"))?;

    let course_count: i64 = conn
        .query_first("SELECT ROW_COUNT()")
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    Ok(format!("已同步 {} 位教练、{} 条课程记录", coach_count, course_count))
}

/* ========== 教练统计报表 ========== */

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CoachStatRow {
    pub coach_name: String,
    pub total_hours: i64,
    pub trial_hours: i64,
    pub normal_hours: i64,
    pub solo_hours: i64,
    pub normal_fee: f64,
    pub solo_fee: f64,
    pub total_fee: f64,
}

/// 加载教练统计数据：从 course + coach + booking 关联计算，写入 coach_stat 表
#[tauri::command]
pub fn load_coach_stats(month: String) -> Result<String, String> {
    println!("[load_coach_stats] 开始加载, month={}", month);
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    // 确保 coach_stat 表存在
    let _ = conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS coach_stat (\
            id BIGINT AUTO_INCREMENT PRIMARY KEY,\
            stat_month VARCHAR(10) NOT NULL COMMENT '统计月份 2026-03',\
            coach_id BIGINT NOT NULL COMMENT '教练ID',\
            coach_name VARCHAR(50) NOT NULL DEFAULT '' COMMENT '教练姓名',\
            total_hours INT DEFAULT 0 COMMENT '总课时数',\
            trial_hours INT DEFAULT 0 COMMENT '体验课课时数',\
            normal_hours INT DEFAULT 0 COMMENT '非体验课课时数',\
            solo_hours INT DEFAULT 0 COMMENT '单独计算课时(单独计算课时+体验课时)',\
            normal_fee DECIMAL(14,2) DEFAULT 0 COMMENT '非体验课课时费',\
            solo_fee DECIMAL(14,2) DEFAULT 0 COMMENT '单独计算课时费',\
            total_fee DECIMAL(14,2) DEFAULT 0 COMMENT '总课时费',\
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
            UNIQUE KEY uk_stat_month_coach (stat_month, coach_id)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教练月度统计'",
        (),
    );

    // 先删除该月旧数据
    conn.exec_drop(
        format!("DELETE FROM coach_stat WHERE stat_month = '{}'", month),
        (),
    ).map_err(|e| format!("清除旧数据失败: {e}"))?;

    // 一次性计算：course + coach + trial_class 关联
    conn.exec_drop(
        format!(
            "INSERT INTO coach_stat (stat_month, coach_id, coach_name, total_hours, trial_hours, normal_hours, solo_hours, normal_fee, solo_fee, total_fee) \
             SELECT \
               '{}', \
               t1.id, \
               t1.coach_name, \
               t1.total_hours, \
               COALESCE(t2.trial_hour, 0), \
               t1.total_hours - COALESCE(t2.trial_hour, 0), \
               t1.solo_hours + COALESCE(t2.trial_hour, 0), \
               t1.total_fee - COALESCE(t2.trial_fee, 0), \
               t1.solo_fee + COALESCE(t2.trial_fee, 0), \
               t1.total_fee + t1.solo_fee \
             FROM ( \
               SELECT \
                 co.id, \
                 co.name AS coach_name, \
                 COUNT(DISTINCT c.id) AS total_hours, \
                 COUNT(DISTINCT IF(c.member_card LIKE '%暑假加油包%', c.id, NULL)) AS solo_hours, \
                 COALESCE(SUM(c.course_value), 0) AS normal_fee, \
                 SUM(DISTINCT IF(c.member_card LIKE '%暑假加油包%', 70, 0)) AS solo_fee, \
                 COALESCE(SUM(c.course_value), 0) AS total_fee \
               FROM course c \
               INNER JOIN coach co ON c.coach_id = co.id \
               WHERE DATE_FORMAT(c.start_time, '%Y-%m') = '{}' \
                 AND c.status != 3 \
               GROUP BY co.id, co.name \
             ) t1 \
             LEFT JOIN ( \
               SELECT coach_name, COUNT(1) AS trial_hour, SUM(unit_value) AS trial_fee \
               FROM trial_class \
               WHERE DATE_FORMAT(class_date, '%Y-%m') = '{}' \
               GROUP BY coach_name \
             ) t2 ON t2.coach_name = t1.coach_name",
            month, month, month
        ),
        (),
    ).map_err(|e| format!("生成教练统计失败: {e}"))?;

    let count: i64 = conn
        .query_first(format!("SELECT COUNT(*) FROM coach_stat WHERE stat_month = '{}'", month))
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    Ok(format!("已生成 {} 位教练的 {} 月统计数据", count, month))
}

/// 按月查询教练统计报表（从 coach_stat 表读取）
#[tauri::command]
pub fn list_coach_stats(month: String) -> Result<Vec<CoachStatRow>, String> {
    crate::load_env_from_parents();
    let pool = crate::connect_pool()?;
    let mut conn = pool.get_conn().map_err(|e| e.to_string())?;

    let rows: Vec<CoachStatRow> = conn
        .exec_map(
            "SELECT \
               coach_name, \
               total_hours, \
               trial_hours, \
               normal_hours, \
               solo_hours, \
               CAST(COALESCE(normal_fee,0) AS DOUBLE), \
               CAST(COALESCE(solo_fee,0) AS DOUBLE), \
               CAST(COALESCE(total_fee,0) AS DOUBLE) \
             FROM coach_stat \
             WHERE stat_month = ? \
             ORDER BY coach_name",
            mysql::Params::Positional(vec![str_val(&month)]),
            |row: mysql::Row| {
                let coach_name: String = row.get(0).unwrap_or_default();
                let total_hours: i64 = row.get(1).unwrap_or(0);
                let trial_hours: i64 = row.get(2).unwrap_or(0);
                let normal_hours: i64 = row.get(3).unwrap_or(0);
                let solo_hours: i64 = row.get(4).unwrap_or(0);
                let normal_fee: f64 = row.get::<f64, _>(5).unwrap_or(0.0);
                let solo_fee: f64 = row.get::<f64, _>(6).unwrap_or(0.0);
                let total_fee: f64 = row.get::<f64, _>(7).unwrap_or(0.0);
                CoachStatRow {
                    coach_name,
                    total_hours,
                    trial_hours,
                    normal_hours,
                    solo_hours,
                    normal_fee,
                    solo_fee,
                    total_fee,
                }
            },
        )
        .map_err(|e| format!("查询教练统计失败: {e}"))?;

    Ok(rows)
}

/* ========== 数据结构 ========== */

#[derive(Debug, serde::Deserialize)]
pub struct ImportMemberRow {
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

#[derive(Debug, serde::Deserialize)]
pub struct ImportBookingRow {
    pub coach_name: String,
    pub course_name: String,
    pub class_date: String,
    pub class_time: String,
    pub max_students: i32,
    pub member_name: String,
    pub member_card: String,
    pub course_value: f64,
    pub solo_fee: f64,
}
