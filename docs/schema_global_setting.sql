-- ============================================================
-- 全局设置表 — 存储全局常量（如备注）
-- 数据库：financial_reporting
-- ============================================================

DROP TABLE IF EXISTS global_setting;

CREATE TABLE IF NOT EXISTS global_setting (
  setting_key   VARCHAR(50)  NOT NULL PRIMARY KEY COMMENT '设置键名',
  setting_value TEXT         NULL     COMMENT '设置值',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='全局设置';

-- 初始化备注
INSERT INTO global_setting (setting_key, setting_value) 
VALUES ('global_remark', '') 
ON DUPLICATE KEY UPDATE setting_value = setting_value;
