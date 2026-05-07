-- ============================================================
-- 常规报表模块（授课日记 / 日常开支 / 体验课 / 请假）
-- ============================================================

-- 1. 授课日记
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 日常开支
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 体验课
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 请假记录
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
