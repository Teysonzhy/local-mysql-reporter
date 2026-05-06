-- 导入会员名册表（与客户 Excel 模板一致）
CREATE TABLE IF NOT EXISTS import_member (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  card_name       VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '会员卡名称',
  phone           VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '电话号码',
  name_remark     VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '名称备注',
  coach           VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '教练',
  remark          VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '备注',
  prev_init_hours INT           NOT NULL DEFAULT 0 COMMENT '上月初始课时数',
  month_new_hours INT           NOT NULL DEFAULT 0 COMMENT '本月新增课时数',
  month_used_hours INT          NOT NULL DEFAULT 0 COMMENT '本月消耗课时数',
  remain_hours    INT           NOT NULL DEFAULT 0 COMMENT '剩余课时数',
  churn_note      VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '流失说明',
  import_time     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '导入时间',
  INDEX idx_im_card(card_name),
  INDEX idx_im_coach(coach)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='导入会员名册';

-- 导入约课记录表（与客户 Excel 模板一致，每行一条约课记录）
CREATE TABLE IF NOT EXISTS import_booking (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  coach_name      VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '教练',
  course_name     VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '课程名称',
  class_date      VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '上课日期',
  class_time      VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '上课时间',
  max_students    INT           NOT NULL DEFAULT 0 COMMENT '约课人数',
  member_name     VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '约课人',
  member_card     VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '约课会员卡',
  course_value    DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '单课价值',
  solo_fee        DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '单独计算课时费',
  import_time     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '导入时间',
  INDEX idx_ib_coach(coach_name),
  INDEX idx_ib_date(class_date),
  INDEX idx_ib_member(member_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='导入约课记录';
