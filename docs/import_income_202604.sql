USE financial_reporting;

-- 确保 2026-04 月报主表存在
INSERT INTO daily_ledger (ledger_month) VALUES ('2026-04')
ON DUPLICATE KEY UPDATE ledger_month = ledger_month;

SET @lid = (SELECT id FROM daily_ledger WHERE ledger_month = '2026-04');

-- 收入明细 — 售课
INSERT INTO income_item (ledger_id, sort_order, project, subject, item_desc, content, amount) VALUES
(@lid, 1, '售课', '续课', '', '售课日记中获取', 0),
(@lid, 2, '售课', '新会员(不包含美团券的团课)', '', '售课日记中获取', 0),
(@lid, 3, '售课', '介绍送课', '', '售课日记中明确属于转介绍的', 0),
(@lid, 4, '售课', '体验课程', '', '单独填写', 0),

-- 收入明细 — 耗课
(@lid, 5, '耗课', '总耗课价格(不包含体验)', '', '课时费报表中获取', 0),
(@lid, 6, '耗课', '总耗课数(包含体验课)', '', '课时费报表中获取', 0),

-- 收入明细 — 其他
(@lid, 7, '其他', '银行卡和支付宝利息', '', '单独填写', 0),
(@lid, 8, '其他', '转课(其他店)', '', '售课日记中获取', 0);
