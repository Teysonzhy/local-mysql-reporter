-- 教练薪资明细表（关联教练 + 工资结构项）
CREATE TABLE IF NOT EXISTS coach_salary (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  coach_id      INT NOT NULL COMMENT '教练ID',
  salary_item_id INT NOT NULL COMMENT '工资结构项ID（关联 salary_structure.id）',
  amount        VARCHAR(100) NOT NULL DEFAULT '' COMMENT '薪资额度',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coach_salary (coach_id, salary_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教练薪资明细表';
