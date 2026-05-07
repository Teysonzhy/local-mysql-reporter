-- ============================================================
-- 财务管理系统 - 完整数据库脚本
-- 数据库：financial_reporting
-- 生成时间：2026-04
-- ============================================================

-- 创建数据库（如不存在）
CREATE DATABASE IF NOT EXISTS financial_reporting DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE financial_reporting;

-- ============================================================
-- 1. 会员表
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

-- ============================================================
-- 2. 教练表
-- ============================================================
CREATE TABLE IF NOT EXISTS coach (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(50)   NOT NULL COMMENT '教练姓名',
  position        VARCHAR(50)   NOT NULL DEFAULT '教练' COMMENT '职位',
  phone           VARCHAR(20)   DEFAULT NULL COMMENT '联系电话',
  qualification   TEXT          NULL     COMMENT '资质证书',
  store_name      VARCHAR(100)  DEFAULT NULL COMMENT '所属门店',
  hourly_rate     DECIMAL(14,2) DEFAULT NULL COMMENT '课时费单价（元/课时）',
  share_ratio     DECIMAL(5,2)  DEFAULT 50.00 COMMENT '分成比例（百分比）',
  status          TINYINT       NOT NULL DEFAULT 1 COMMENT '状态（1在职 0离职）',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  UNIQUE KEY uk_coach_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教练表';

-- ============================================================
-- 3. 课程表（含约课记录）
-- ============================================================
CREATE TABLE IF NOT EXISTS course (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  coach_id        BIGINT        NOT NULL COMMENT '教练ID',
  name            VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '课程名称',
  description     TEXT          NULL     COMMENT '课程详情',
  start_time      DATETIME      NOT NULL COMMENT '上课时间',
  end_time        DATETIME      NULL     COMMENT '下课时间',
  duration        INT           DEFAULT 60 COMMENT '课时时长（分钟）',
  max_students    INT           DEFAULT 0 COMMENT '最大约课人数',
  course_value    DECIMAL(14,2) DEFAULT 0 COMMENT '单课价值（元）',
  status          TINYINT       NOT NULL DEFAULT 1 COMMENT '课程状态（1进行中 2已结束 3已取消）',
  member_name     VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '约课人姓名',
  member_card     VARCHAR(100)  DEFAULT NULL COMMENT '使用的会员卡',
  booking_time    DATETIME      NULL     COMMENT '约课时间',
  booking_status  TINYINT       NOT NULL DEFAULT 2 COMMENT '约课状态（1已约 2已签到 3已取消）',
  solo_fee        DECIMAL(14,2) DEFAULT 0 COMMENT '单独计算课时费',
  fee_status      TINYINT       NOT NULL DEFAULT 0 COMMENT '课时费状态（0未结算 1已结算）',
  fee_amount      DECIMAL(14,2) DEFAULT 0 COMMENT '课时费金额',
  fee_date        DATETIME      NULL     COMMENT '课时费结算日期',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coach_time_member (coach_id, name, start_time, member_name),
  INDEX idx_coach (coach_id),
  INDEX idx_start_time (start_time),
  INDEX idx_member_name (member_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程表（含约课记录）';

-- ============================================================
-- 3.5 教练月度统计表
-- ============================================================
CREATE TABLE IF NOT EXISTS coach_stat (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  stat_month      VARCHAR(10)   NOT NULL COMMENT '统计月份 2026-03',
  coach_id        BIGINT        NOT NULL COMMENT '教练ID',
  coach_name      VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '教练姓名',
  total_hours     INT           DEFAULT 0 COMMENT '总课时数',
  trial_hours     INT           DEFAULT 0 COMMENT '体验课课时数',
  normal_hours    INT           DEFAULT 0 COMMENT '非体验课课时数',
  solo_hours      INT           DEFAULT 0 COMMENT '单独计算课时(单独计算课时+体验课时)',
  normal_fee      DECIMAL(14,2) DEFAULT 0 COMMENT '非体验课课时费',
  solo_fee        DECIMAL(14,2) DEFAULT 0 COMMENT '单独计算课时费',
  total_fee       DECIMAL(14,2) DEFAULT 0 COMMENT '总课时费',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_stat_month_coach (stat_month, coach_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教练月度统计';

-- ============================================================
-- 3.6 激励等级表
-- ============================================================
CREATE TABLE IF NOT EXISTS incentive_grade (
  id          BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  grade_name  VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '等级名称（I级/II级/III级）',
  range_min   INT           NOT NULL DEFAULT 0 COMMENT '课时范围下限',
  range_max   INT           NOT NULL DEFAULT 0 COMMENT '课时范围上限（0表示无上限）',
  salary      DECIMAL(14,2) DEFAULT 0 COMMENT '基础工资',
  ratio       DECIMAL(5,2)  DEFAULT 0 COMMENT '课价绩效比例（百分比）',
  sort_order  INT           NOT NULL DEFAULT 0 COMMENT '排序',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_grade_name (grade_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='激励等级';

-- ============================================================
-- 6. 财务月报主表
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_ledger (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_month  VARCHAR(7)   NOT NULL COMMENT '月份（YYYY-MM）',
  remark        TEXT         NULL     COMMENT '文本/备注',
  net_profit        DECIMAL(14,2) DEFAULT NULL COMMENT '纯利',
  total_class_price DECIMAL(14,2) DEFAULT NULL COMMENT '总耗课价格',
  trial_class_price DECIMAL(14,2) DEFAULT NULL COMMENT '体验课价格',
  coach_salary      DECIMAL(14,2) DEFAULT NULL COMMENT '教练工资',
  cash_outflow      DECIMAL(14,2) DEFAULT NULL COMMENT '现金流支出',
  refund_fee        DECIMAL(14,2) DEFAULT NULL COMMENT '退课手续费',
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

-- ============================================================
-- 7. 支出明细表
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_item (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_id     BIGINT       NOT NULL COMMENT '关联 daily_ledger.id',
  sort_order    INT          NOT NULL DEFAULT 0 COMMENT '排序序号',
  project       VARCHAR(100) DEFAULT NULL COMMENT '项目',
  person        VARCHAR(100) DEFAULT NULL COMMENT '人员',
  item_desc     VARCHAR(200) DEFAULT NULL COMMENT '事项',
  description   VARCHAR(500) DEFAULT NULL COMMENT '描述',
  grade         VARCHAR(20)  DEFAULT NULL COMMENT '等级（I级/II级/III级）',
  amount        DECIMAL(14,2) DEFAULT NULL COMMENT '金额',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ledger (ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支出明细';

-- ============================================================
-- 8. 收入明细表
-- ============================================================
CREATE TABLE IF NOT EXISTS income_item (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_id     BIGINT       NOT NULL COMMENT '关联 daily_ledger.id',
  sort_order    INT          NOT NULL DEFAULT 0 COMMENT '排序序号',
  project       VARCHAR(100) DEFAULT NULL COMMENT '项目',
  subject       VARCHAR(100) DEFAULT NULL COMMENT '科目',
  item_desc     VARCHAR(200) DEFAULT NULL COMMENT '事项',
  content       VARCHAR(500) DEFAULT NULL COMMENT '内容',
  amount        DECIMAL(14,2) DEFAULT NULL COMMENT '金额',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ledger (ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='收入明细';

-- ============================================================
-- 9. 授课日记
-- ============================================================
CREATE TABLE IF NOT EXISTS teaching_diary (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  coach_id    BIGINT       NULL,
  coach_name  VARCHAR(50)  NOT NULL DEFAULT '',
  course_name VARCHAR(100) NOT NULL DEFAULT '',
  class_date  DATE         NOT NULL,
  start_time  TIME         NULL,
  duration    INT          NOT NULL DEFAULT 60 COMMENT '时长(分钟)',
  students    INT          NOT NULL DEFAULT 0 COMMENT '学员数',
  unit_value  DECIMAL(14,2) NULL COMMENT '单课价值',
  remark      VARCHAR(500) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_td_date (class_date),
  INDEX idx_td_coach (coach_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='授课日记';

-- ============================================================
-- 10. 日常开支
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_expense (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  expense_date  DATE         NOT NULL,
  expense_type  VARCHAR(100) NOT NULL DEFAULT '' COMMENT '支出类型',
  project       VARCHAR(200) NOT NULL DEFAULT '' COMMENT '项目明细',
  amount        DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '支出金额',
  remark        VARCHAR(500) NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_de_date (expense_date),
  INDEX idx_de_type (expense_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日常开支';

-- ============================================================
-- 11. 体验课
-- ============================================================
CREATE TABLE IF NOT EXISTS trial_class (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  class_date    DATE         NOT NULL,
  trial_type    VARCHAR(100) NOT NULL DEFAULT '' COMMENT '体验课类型',
  student_name  VARCHAR(100) NOT NULL DEFAULT '' COMMENT '体验课学员',
  source        VARCHAR(100) NOT NULL DEFAULT '' COMMENT '来源',
  unit_value    DECIMAL(14,2) NULL COMMENT '体验课价值',
  coach_name    VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '教练',
  remark        VARCHAR(500) NULL,
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1待体验 2已体验 3已转化 4已流失',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_tc_date (class_date),
  INDEX idx_tc_student (student_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='体验课';

-- ============================================================
-- 12. 请假记录
-- ============================================================
CREATE TABLE IF NOT EXISTS coach_leave (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  coach_id    BIGINT       NULL,
  coach_name  VARCHAR(50)  NOT NULL DEFAULT '',
  leave_month VARCHAR(7)   NOT NULL COMMENT 'YYYY-MM',
  leave_days  DECIMAL(4,1) NOT NULL DEFAULT 0 COMMENT '请假天数',
  remark      VARCHAR(500) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_cl_coach_month (coach_name, leave_month),
  INDEX idx_cl_month (leave_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='请假记录';

-- ============================================================
-- 13. 全局设置表
-- ============================================================
CREATE TABLE IF NOT EXISTS global_setting (
  setting_key   VARCHAR(50)  NOT NULL PRIMARY KEY COMMENT '设置键',
  setting_value TEXT         NULL     COMMENT '设置值',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='全局设置';

-- ============================================================
-- 14. 薪资结构表
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_structure (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序',
  component   VARCHAR(100) NOT NULL DEFAULT '' COMMENT '薪资构成项目名称',
  amount      VARCHAR(100) NOT NULL DEFAULT '' COMMENT '薪资额度/说明',
  remark      VARCHAR(500) NOT NULL DEFAULT '' COMMENT '备注',
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='薪资结构表';

-- ============================================================
-- 15. 教练薪资明细表
-- ============================================================
CREATE TABLE IF NOT EXISTS coach_salary (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  coach_id       INT NOT NULL COMMENT '教练ID',
  salary_item_id INT NOT NULL COMMENT '薪资项ID（关联 salary_structure.id）',
  amount         VARCHAR(100) NOT NULL DEFAULT '' COMMENT '薪资额度',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coach_salary (coach_id, salary_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教练薪资明细表';

-- ============================================================
-- 16. 导入临时表 - 会员名册
-- ============================================================
CREATE TABLE IF NOT EXISTS import_member (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  card_name       VARCHAR(100) NOT NULL DEFAULT '',
  phone           VARCHAR(20)  DEFAULT NULL,
  name_remark     VARCHAR(200) DEFAULT NULL,
  coach           VARCHAR(100) DEFAULT NULL,
  remark          VARCHAR(500) DEFAULT NULL,
  prev_init_hours INT          DEFAULT 0,
  month_new_hours INT          DEFAULT 0,
  month_used_hours INT         DEFAULT 0,
  remain_hours    INT          DEFAULT 0,
  churn_note      VARCHAR(500) DEFAULT NULL,
  INDEX idx_card_name (card_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='导入临时表-会员名册';

-- ============================================================
-- 17. 导入临时表 - 约课记录
-- ============================================================
CREATE TABLE IF NOT EXISTS import_booking (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  coach_name   VARCHAR(50)  DEFAULT NULL,
  course_name  VARCHAR(100) DEFAULT NULL,
  class_date   VARCHAR(20)  DEFAULT NULL,
  class_time   VARCHAR(10)  DEFAULT NULL,
  max_students INT          DEFAULT 0,
  member_name  VARCHAR(100) DEFAULT NULL,
  member_card  VARCHAR(100) DEFAULT NULL,
  course_value DECIMAL(14,2) DEFAULT 0,
  solo_fee     DECIMAL(14,2) DEFAULT 0,
  INDEX idx_ib_coach (coach_name),
  INDEX idx_ib_date (class_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='导入临时表-约课记录';

-- ============================================================
-- 初始数据
-- ============================================================

-- 激励等级初始数据
INSERT IGNORE INTO incentive_grade (grade_name, range_min, range_max, salary, ratio, sort_order) VALUES
('I级',   1,   89,  1500, 28, 1),
('II级',  90,  129, 1700, 35, 2),
('III级', 130, 0,   2000, 40, 3);

-- 薪资结构初始数据
INSERT IGNORE INTO salary_structure (sort_order, component, amount, remark) VALUES
(1, '基本工资', '', '根据激励等级自动计算'),
(2, '课价绩效', '', '总客价 × 等级比例'),
(3, '绩效工资', '', '根据激励等级自动计算'),
(4, '店长补贴', '0', '按教练配置'),
(5, '财务补贴', '0', '按教练配置');
