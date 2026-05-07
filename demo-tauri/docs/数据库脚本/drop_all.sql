-- ============================================================
-- 数据库清理脚本（开发/测试用）
-- 警告：执行后将删除所有业务数据！
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS coach_leave;
DROP TABLE IF EXISTS trial_class;
DROP TABLE IF EXISTS daily_expense;
DROP TABLE IF EXISTS teaching_diary;
DROP TABLE IF EXISTS income_item;
DROP TABLE IF EXISTS expense_item;
DROP TABLE IF EXISTS daily_ledger;
DROP TABLE IF EXISTS course;
DROP TABLE IF EXISTS coach;
DROP TABLE IF EXISTS member;
DROP TABLE IF EXISTS global_setting;

SET FOREIGN_KEY_CHECKS = 1;

SELECT '所有业务表已删除' AS result;
