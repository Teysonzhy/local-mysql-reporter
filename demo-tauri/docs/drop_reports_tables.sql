-- ============================================================
-- 清理财务概览（原报表模块）相关表
-- 这些表仅用于旧的报表演示功能，已不再使用
-- ============================================================

-- 按外键依赖顺序删除
DROP TABLE IF EXISTS rpt_amount;
DROP TABLE IF EXISTS report_run;
DROP TABLE IF EXISTS report_definition;
DROP TABLE IF EXISTS dim_account;
DROP TABLE IF EXISTS dim_period;
