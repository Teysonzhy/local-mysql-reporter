-- ============================================================
-- 教练管理模块 — 表结构
-- 数据库：financial_reporting
-- ============================================================

-- 1. 教练表
DROP TABLE IF EXISTS coach_fee;
DROP TABLE IF EXISTS booking;
DROP TABLE IF EXISTS course;
DROP TABLE IF EXISTS coach;

CREATE TABLE IF NOT EXISTS coach (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(50)   NOT NULL COMMENT '教练姓名',
  phone           VARCHAR(20)   DEFAULT NULL COMMENT '联系电话',
  position        VARCHAR(20)   DEFAULT '教练' COMMENT '职位（教练/店长）',
  qualification   TEXT          NULL     COMMENT '资质证书',
  store_name      VARCHAR(100)  DEFAULT NULL COMMENT '所属门店',
  hourly_rate     DECIMAL(14,2) DEFAULT NULL COMMENT '课时费单价（元/课时）',
  share_ratio     DECIMAL(5,2)  DEFAULT 50.00 COMMENT '分成比例（百分比，如50表示50%）',
  status          TINYINT       NOT NULL DEFAULT 1 COMMENT '状态（1在职 0离职）',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教练表';

-- 2. 课程表
CREATE TABLE IF NOT EXISTS course (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  coach_id        BIGINT        NOT NULL COMMENT '教练ID',
  name            VARCHAR(100)  NOT NULL COMMENT '课程名称',
  description     TEXT          NULL     COMMENT '课程详情',
  start_time      DATETIME      NOT NULL COMMENT '上课时间',
  end_time        DATETIME      NULL     COMMENT '下课时间',
  duration        INT           DEFAULT 60 COMMENT '课时时长（分钟）',
  max_students    INT           DEFAULT 0 COMMENT '最大约课人数',
  course_value    DECIMAL(14,2) DEFAULT 0 COMMENT '单课价值（元）',
  status          TINYINT       NOT NULL DEFAULT 1 COMMENT '状态（1进行中 2已结束 3已取消）',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coach (coach_id),
  INDEX idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程表';

-- 3. 约课记录表
CREATE TABLE IF NOT EXISTS booking (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_id       BIGINT        NOT NULL COMMENT '课程ID',
  member_id       BIGINT        DEFAULT NULL COMMENT '会员ID',
  member_card     VARCHAR(100)  DEFAULT NULL COMMENT '使用的会员卡',
  member_name     VARCHAR(100)  NOT NULL COMMENT '约课人姓名',
  booking_time    DATETIME      NULL     COMMENT '约课时间',
  status          TINYINT       NOT NULL DEFAULT 1 COMMENT '状态（1已约 2已签到 3已取消）',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_course (course_id),
  INDEX idx_member (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='约课记录表';

-- 4. 课时费记录表
CREATE TABLE IF NOT EXISTS coach_fee (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  coach_id        BIGINT        NOT NULL COMMENT '教练ID',
  course_id       BIGINT        NOT NULL COMMENT '课程ID',
  actual_students INT           NOT NULL DEFAULT 0 COMMENT '实际约课人数',
  course_value    DECIMAL(14,2) DEFAULT 0 COMMENT '单课价值',
  share_ratio     DECIMAL(5,2)  DEFAULT 50.00 COMMENT '分成比例（快照）',
  total_fee       DECIMAL(14,2) DEFAULT 0 COMMENT '总课时费',
  fee_formula     VARCHAR(200)  DEFAULT NULL COMMENT '计算规则说明',
  settle_month    VARCHAR(7)    NOT NULL COMMENT '结算月份（YYYY-MM）',
  status          TINYINT       NOT NULL DEFAULT 1 COMMENT '状态（1待结算 2已结算）',
  settled_at      DATETIME      NULL     COMMENT '结算时间',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coach_month (coach_id, settle_month),
  INDEX idx_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课时费记录表';
