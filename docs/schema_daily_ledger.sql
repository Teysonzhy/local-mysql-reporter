-- ============================================================
-- 财务月报模块 — 表结构
-- 数据库：financial_reporting
-- ============================================================

-- 如果已有旧表 daily_ledger，先执行迁移：
-- ALTER TABLE daily_ledger CHANGE COLUMN ledger_date ledger_month VARCHAR(7) NOT NULL COMMENT '月份(YYYY-MM)';
-- ALTER TABLE daily_ledger DROP INDEX uk_date, ADD UNIQUE KEY uk_month (ledger_month);

-- 1. 月报主表（每条记录代表一个月的报表）
CREATE TABLE IF NOT EXISTS daily_ledger (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_month  VARCHAR(7)   NOT NULL COMMENT '月份（YYYY-MM）',
  remark        TEXT         NULL     COMMENT '文本/备注',
  -- 纯利统计
  net_profit        DECIMAL(14,2) DEFAULT NULL COMMENT '纯利',
  total_class_price DECIMAL(14,2) DEFAULT NULL COMMENT '总耗课价格',
  trial_class_price DECIMAL(14,2) DEFAULT NULL COMMENT '体验课价格',
  coach_salary      DECIMAL(14,2) DEFAULT NULL COMMENT '教练工资',
  cash_outflow      DECIMAL(14,2) DEFAULT NULL COMMENT '现金流支出',
  refund_fee        DECIMAL(14,2) DEFAULT NULL COMMENT '退课手续费',
  -- 公司账户
  company_account   VARCHAR(100) DEFAULT NULL COMMENT '公司账户',
  prev_balance      DECIMAL(14,2) DEFAULT NULL COMMENT '上月余额',
  course_sales      DECIMAL(14,2) DEFAULT NULL COMMENT '售课金额',
  other_income      DECIMAL(14,2) DEFAULT NULL COMMENT '其他收入',
  expenditure       DECIMAL(14,2) DEFAULT NULL COMMENT '支出',
  bank_transfer     DECIMAL(14,2) DEFAULT NULL COMMENT '转入银行卡',
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_month (ledger_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='财务月报主表';

-- 2. 支出明细表
CREATE TABLE IF NOT EXISTS expense_item (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_id     BIGINT       NOT NULL COMMENT '关联 daily_ledger.id',
  sort_order    INT          NOT NULL DEFAULT 0 COMMENT '排序序号',
  category      VARCHAR(50)  DEFAULT NULL COMMENT '分类（如工资、现金流）',
  person        VARCHAR(100) DEFAULT NULL COMMENT '人员',
  item_desc     VARCHAR(200) DEFAULT NULL COMMENT '事项',
  description   VARCHAR(500) DEFAULT NULL COMMENT '描述',
  amount        DECIMAL(14,2) DEFAULT NULL COMMENT '金额',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ledger (ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支出明细';

-- 3. 收入明细表
CREATE TABLE IF NOT EXISTS income_item (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_id     BIGINT       NOT NULL COMMENT '关联 daily_ledger.id',
  sort_order    INT          NOT NULL DEFAULT 0 COMMENT '排序序号',
  category      VARCHAR(50)  DEFAULT NULL COMMENT '分类（如售课、耗课、其他）',
  subject       VARCHAR(100) DEFAULT NULL COMMENT '科目',
  item_desc     VARCHAR(200) DEFAULT NULL COMMENT '事项',
  content       VARCHAR(500) DEFAULT NULL COMMENT '内容',
  amount        DECIMAL(14,2) DEFAULT NULL COMMENT '金额',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ledger (ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='收入明细';
