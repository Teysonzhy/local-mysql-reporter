-- ============================================================
-- 财务月报订正：将 2026-04 的数据改为 2026-03
-- ============================================================

-- 1. 先检查当前数据分布
SELECT ledger_month, COUNT(*) AS cnt FROM daily_ledger GROUP BY ledger_month;

-- 2. 如果已存在 2026-03 的记录，先删除（或备份后删除）
-- DELETE FROM income_item WHERE ledger_id IN (SELECT id FROM daily_ledger WHERE ledger_month = '2026-03');
-- DELETE FROM expense_item WHERE ledger_id IN (SELECT id FROM daily_ledger WHERE ledger_month = '2026-03');
-- DELETE FROM daily_ledger WHERE ledger_month = '2026-03';

-- 3. 将 2026-04 改为 2026-03
UPDATE daily_ledger SET ledger_month = '2026-03' WHERE ledger_month = '2026-04';

-- 4. 验证
SELECT ledger_month, COUNT(*) AS cnt FROM daily_ledger GROUP BY ledger_month;
