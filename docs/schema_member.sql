-- ============================================================
-- 会员管理模块 — 表结构
-- 数据库：financial_reporting
-- ============================================================

CREATE TABLE IF NOT EXISTS member (
  id                  BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  card_name           VARCHAR(100)  NOT NULL COMMENT '会员卡名称',
  phone               VARCHAR(20)   DEFAULT NULL COMMENT '电话号码',
  name_remark         VARCHAR(200)  DEFAULT NULL COMMENT '名称备注',
  coach               VARCHAR(100)  DEFAULT NULL COMMENT '教练',
  remark              VARCHAR(500)  DEFAULT NULL COMMENT '备注',
  prev_init_hours     INT           DEFAULT 0 COMMENT '上月初始课时数',
  month_new_hours     INT           DEFAULT 0 COMMENT '本月新增课时数',
  month_used_hours    INT           DEFAULT 0 COMMENT '本月消耗课时数',
  remain_hours        INT           DEFAULT 0 COMMENT '剩余课时数',
  churn_note          VARCHAR(500)  DEFAULT NULL COMMENT '流失说明',
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone (phone),
  INDEX idx_coach (coach)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员表';
