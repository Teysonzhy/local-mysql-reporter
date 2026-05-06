-- ============================================================
-- 数据加载存储过程
-- 从 import_member / import_booking 临时表加载到业务表
-- ============================================================

DELIMITER $$

/* ----------------------------------------------------------
   1. sp_load_member
   从 import_member 加载到 member 表
   ---------------------------------------------------------- */
DROP PROCEDURE IF EXISTS sp_load_member$$
CREATE PROCEDURE sp_load_member()
BEGIN
  -- 清空 member 表
  TRUNCATE TABLE member;

  -- 从 import_member 复制到 member
  INSERT INTO member (card_name, phone, name_remark, coach, remark,
           prev_init_hours, month_new_hours, month_used_hours, remain_hours, churn_note)
  SELECT card_name, phone, name_remark, coach, remark,
         prev_init_hours, month_new_hours, month_used_hours, remain_hours, churn_note
  FROM import_member;

  SELECT ROW_COUNT() AS loaded_count;
END$$


/* ----------------------------------------------------------
   2. sp_load_coach_course
   从 import_booking 加载到 coach / course 表（course 含 booking 信息）
   ---------------------------------------------------------- */
DROP PROCEDURE IF EXISTS sp_load_coach_course$$
CREATE PROCEDURE sp_load_coach_course()
BEGIN
  DECLARE v_coach_count INT DEFAULT 0;
  DECLARE v_course_count INT DEFAULT 0;

  -- 1. 从 import_booking 提取不重复的教练，插入 coach 表（已存在则跳过）
  INSERT IGNORE INTO coach (name, status)
  SELECT DISTINCT coach_name, 1 FROM import_booking
  WHERE coach_name IS NOT NULL AND coach_name != '';
  SET v_coach_count = ROW_COUNT();

  -- 2. 从 import_booking 生成课程记录，按教练+课程名+上课时间分组，已存在的跳过
  INSERT IGNORE INTO course (coach_id, name, start_time, duration, max_students, course_value, status, member_name, member_card, solo_fee)
  SELECT
    c.id,
    ib.course_name,
    CONCAT(ib.class_date, IF(ib.class_time IS NOT NULL AND ib.class_time != '', CONCAT(' ', ib.class_time), ' 00:00')),
    60,
    ib.max_students,
    ib.course_value,
    2,
    ib.member_name,
    ib.member_card,
    ib.solo_fee
  FROM import_booking ib
  INNER JOIN coach c ON c.name = ib.coach_name
  WHERE ib.coach_name IS NOT NULL AND ib.coach_name != ''
    AND ib.class_date IS NOT NULL AND ib.class_date != '';
  SET v_course_count = ROW_COUNT();

  SELECT v_coach_count AS coach_count, v_course_count AS course_count;
END$$


/* ----------------------------------------------------------
   3. sp_load_coach_stat
   从 course / coach / trial_class / booking 计算教练月度统计
   参数: p_month  格式 '2026-03'
   ---------------------------------------------------------- */
DROP PROCEDURE IF EXISTS sp_load_coach_stat$$
CREATE PROCEDURE sp_load_coach_stat(IN p_month VARCHAR(10))
BEGIN
  -- 先删除该月旧数据
  DELETE FROM coach_stat WHERE stat_month = p_month;

  -- 一次性计算：course + coach + trial_class 关联
  INSERT INTO coach_stat (stat_month, coach_id, coach_name, total_hours, trial_hours, normal_hours, solo_hours, normal_fee, solo_fee, total_fee)
  SELECT
    p_month,
    t1.id,
    t1.coach_name,
    t1.total_hours,
    COALESCE(t2.trial_hour, 0),
    t1.total_hours - COALESCE(t2.trial_hour, 0),
    t1.solo_hours + COALESCE(t2.trial_hour, 0),
    t1.total_fee - COALESCE(t2.trial_fee, 0),
    t1.solo_fee + COALESCE(t2.trial_fee, 0),
    t1.total_fee + t1.solo_fee
  FROM (
    SELECT
      co.id,
      co.name AS coach_name,
      COUNT(DISTINCT c.id) AS total_hours,
      COUNT(DISTINCT IF(c.member_card LIKE '%暑假加油包%', c.id, NULL)) AS solo_hours,
      COALESCE(SUM(c.course_value), 0) AS normal_fee,
      SUM(DISTINCT IF(c.member_card LIKE '%暑假加油包%', 70, 0)) AS solo_fee,
      COALESCE(SUM(c.course_value), 0) AS total_fee
    FROM course c
    INNER JOIN coach co ON c.coach_id = co.id
    WHERE DATE_FORMAT(c.start_time, '%Y-%m') = p_month
      AND c.status != 3
    GROUP BY co.id, co.name
  ) t1
  LEFT JOIN (
    SELECT coach_name, COUNT(1) AS trial_hour, SUM(unit_value) AS trial_fee
    FROM trial_class
    WHERE DATE_FORMAT(class_date, '%Y-%m') = p_month
    GROUP BY coach_name
  ) t2 ON t2.coach_name = t1.coach_name;

  SELECT COUNT(*) AS coach_count FROM coach_stat WHERE stat_month = p_month;
END$$

DELIMITER ;
