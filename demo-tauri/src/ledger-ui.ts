/**
 * 日常登记页面 — 交互逻辑
 * 功能：加载/保存登记数据、支出/收入多行表格编辑、自动合计
 */

import { isTauriShell, safeInvoke } from "./invoke";
import { exportTablesToXlsx } from "./export-xlsx";

/* ---------- 类型 ---------- */

interface ExpenseRow {
  category: string;
  person: string;
  itemDesc: string;
  description: string;
  amount: number;
}

interface IncomeRow {
  category: string;
  subject: string;
  itemDesc: string;
  content: string;
  amount: number;
}

interface LedgerData {
  id: number;
  ledgerMonth: string;
  remark: string;
  netProfit: number | null;
  totalClassPrice: number | null;
  trialClassPrice: number | null;
  coachSalary: number | null;
  cashOutflow: number | null;
  refundFee: number | null;
  companyAccount: string;
  prevBalance: number | null;
  courseSales: number | null;
  otherIncome: number | null;
  expenditure: number | null;
  bankTransfer: number | null;
  expenses: ExpenseRow[];
  incomes: IncomeRow[];
}

/* ---------- 等级选项 ---------- */



/* ---------- DOM 引用 ---------- */

const $date = () => {
  const y = (document.querySelector<HTMLSelectElement>("#ledger-year")?.value) ?? "";
  const m = (document.querySelector<HTMLSelectElement>("#ledger-month")?.value) ?? "";
  return `${y}-${m.padStart(2, "0")}`;
};
const $setDate = (val: string) => {
  const parts = val.split("-");
  if (parts.length >= 2) {
    const yearSel = document.querySelector<HTMLSelectElement>("#ledger-year");
    const monthSel = document.querySelector<HTMLSelectElement>("#ledger-month");
    if (yearSel) yearSel.value = parts[0];
    if (monthSel) monthSel.value = String(parseInt(parts[1], 10));
  }
};
const $status = () => document.querySelector<HTMLSpanElement>("#ledger-status")!;
const $out = () => document.querySelector<HTMLPreElement>("#ledger-out")!;
const $expTbody = () => document.querySelector<HTMLTableSectionElement>("#expense-tbody")!;
const $incTbody = () => document.querySelector<HTMLTableSectionElement>("#income-tbody")!;
const $expSum = () => document.querySelector<HTMLTableCellElement>("#expense-sum")!;
const $incSum = () => document.querySelector<HTMLTableCellElement>("#income-sum")!;

/* ---------- 工具函数 ---------- */

function currentMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmtNum(n: number): string {
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setStatus(text: string, busy: boolean): void {
  const el = $status();
  el.textContent = text;
  el.classList.toggle("badge--muted", !busy);
  if (busy) {
    el.style.background = "#dbeafe";
    el.style.color = "#1e40af";
  } else {
    el.style.background = "";
    el.style.color = "";
  }
}

function setButtonsDisabled(disabled: boolean): void {
  document.querySelectorAll("#panel-ledger .btn").forEach((b) => {
    (b as HTMLButtonElement).disabled = disabled;
  });
}

/* ---------- 支出表格 ---------- */

function createExpenseRow(data?: Partial<ExpenseRow>): HTMLTableRowElement {
  const tr = document.createElement("tr");

  // 序号
  const tdNum = document.createElement("td");
  tdNum.className = "ledger-row-num";
  tr.appendChild(tdNum);

  // 分类
  tr.appendChild(createTextInput(data?.category ?? "", "category"));
  // 人员
  tr.appendChild(createTextInput(data?.person ?? "", "person"));
  // 事项
  tr.appendChild(createTextInput(data?.itemDesc ?? "", "itemDesc"));
  // 描述
  tr.appendChild(createTextInput(data?.description ?? "", "description"));

  // 金额
  const tdAmt = document.createElement("td");
  tdAmt.dataset.col = "amount";
  const amtInput = document.createElement("input");
  amtInput.type = "text";
  amtInput.className = "ledger-cell-input ledger-cell-input--num";
  amtInput.dataset.col = "amount";
  amtInput.value = data?.amount ? String(data.amount) : "";
  amtInput.addEventListener("input", () => recalcExpenseSum());
  tdAmt.appendChild(amtInput);
  tr.appendChild(tdAmt);

  // 删除按钮
  const tdDel = document.createElement("td");
  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.className = "ledger-btn-del";
  btnDel.textContent = "×";
  btnDel.title = "删除此行";
  btnDel.addEventListener("click", () => {
    // 收集当前所有行数据（排除小计行）
    const allRows = collectExpenseRowsFromDOM();
    // 找到被删行在 allRows 中的索引
    const idx = findRowIndex(tr, $expTbody());
    if (idx >= 0) allRows.splice(idx, 1);
    // 重新渲染分组
    $expTbody().innerHTML = "";
    renderExpenseGrouped(allRows);
    recalcExpenseSum();
    scheduleAutoSave();
  });
  tdDel.appendChild(btnDel);
  tr.appendChild(tdDel);

  return tr;
}

/* ---------- 支出分组渲染（rowspan 合并 + 小计） ---------- */

function renderExpenseGrouped(expenses: ExpenseRow[]): void {
  const tbody = $expTbody();

  // 按分类分组（保持原始顺序）
  const groups: { category: string; rows: ExpenseRow[] }[] = [];
  for (const exp of expenses) {
    const cat = exp.category || "未分类";
    const last = groups[groups.length - 1];
    if (last && last.category === cat) {
      last.rows.push(exp);
    } else {
      groups.push({ category: cat, rows: [exp] });
    }
  }

  let globalIdx = 0;
  for (const group of groups) {
    const catCount = group.rows.length;

    // 在分类内按人员分组
    const personGroups: { person: string; rows: ExpenseRow[] }[] = [];
    for (const exp of group.rows) {
      const p = exp.person || "";
      const last = personGroups[personGroups.length - 1];
      if (last && last.person === p) {
        last.rows.push(exp);
      } else {
        personGroups.push({ person: p, rows: [exp] });
      }
    }

    // 先创建所有 tr 并收集引用
    const groupTrs: HTMLTableRowElement[] = [];
    for (const pg of personGroups) {
      for (let i = 0; i < pg.rows.length; i++) {
        const tr = createExpenseRow(pg.rows[i]);
        globalIdx++;
        const numCell = tr.querySelector(".ledger-row-num");
        if (numCell) numCell.textContent = String(globalIdx);
        tbody.appendChild(tr);
        groupTrs.push(tr);
      }
    }

    // 分类 rowspan：第一行跨整个分类组
    if (catCount > 1) {
      const catTd = groupTrs[0].querySelector<HTMLTableCellElement>('td[data-col="category"]');
      if (catTd) {
        catTd.rowSpan = catCount;
        catTd.style.verticalAlign = "middle";
        catTd.style.fontWeight = "600";
        catTd.style.background = "#f0f7fa";
      }
      for (let i = 1; i < catCount; i++) {
        const td = groupTrs[i].querySelector<HTMLTableCellElement>('td[data-col="category"]');
        if (td) td.remove();
      }
    }

    // 人员 rowspan：在分类组内按人员分组
    let rowOffset = 0;
    for (const pg of personGroups) {
      if (pg.rows.length > 1) {
        const personTd = groupTrs[rowOffset].querySelector<HTMLTableCellElement>('td[data-col="person"]');
        if (personTd) {
          personTd.rowSpan = pg.rows.length;
          personTd.style.verticalAlign = "middle";
          personTd.style.fontWeight = "600";
        }
        for (let i = 1; i < pg.rows.length; i++) {
          const td = groupTrs[rowOffset + i].querySelector<HTMLTableCellElement>('td[data-col="person"]');
          if (td) td.remove();
        }
      }
      rowOffset += pg.rows.length;
    }

    // 分类小计行
    if (catCount > 1 || groups.length > 1) {
      const subtotal = group.rows.reduce((s, r) => s + r.amount, 0);
      const subTr = document.createElement("tr");
      subTr.className = "expense-subtotal-row";
      subTr.innerHTML = `
        <td colspan="5" style="text-align:left;font-weight:600;color:#028090;padding-left:8px">${escHtml(group.category)} 小计</td>
        <td class="num-col" style="font-weight:600;color:#028090">${fmtNum(subtotal)}</td>
        <td></td>`;
      tbody.appendChild(subTr);
    }
  }
}

/** 从 DOM 中收集当前所有支出行数据（跳过小计行） */
function collectExpenseRowsFromDOM(): ExpenseRow[] {
  const rows = $expTbody().querySelectorAll("tr:not(.expense-subtotal-row)");
  const result: ExpenseRow[] = [];
  let lastCategory = "";
  let lastPerson = "";
  rows.forEach((tr) => {
    const getText = (col: string) => {
      const el = tr.querySelector<HTMLInputElement>(`input[data-col="${col}"]`);
      return el ? el.value.trim() : "";
    };
    // rowspan 合并后，后续行没有 category/person td，继承上一行的值
    const catInput = tr.querySelector<HTMLInputElement>('input[data-col="category"]');
    const cat = catInput ? catInput.value.trim() : lastCategory;
    if (cat) lastCategory = cat;
    const personInput = tr.querySelector<HTMLInputElement>('input[data-col="person"]');
    const person = personInput ? personInput.value.trim() : lastPerson;
    if (person) lastPerson = person;
    result.push({
      category: cat,
      person,
      itemDesc: getText("itemDesc"),
      description: getText("description"),
      amount: parseNum(getText("amount")),
    });
  });
  return result;
}

/** 找到 tr 在 tbody 的非小计行中的索引 */
function findRowIndex(tr: HTMLTableRowElement, tbody: HTMLTableSectionElement): number {
  const allTrs = tbody.querySelectorAll("tr:not(.expense-subtotal-row)");
  for (let i = 0; i < allTrs.length; i++) {
    if (allTrs[i] === tr) return i;
  }
  return -1;
}

function createTextInput(value: string, col?: string): HTMLTableCellElement {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ledger-cell-input";
  input.value = value;
  if (col) {
    input.dataset.col = col;
    td.dataset.col = col;
  }
  td.appendChild(input);
  return td;
}

function renumberExpenseRows(): void {
  const rows = $expTbody().querySelectorAll("tr");
  rows.forEach((tr, i) => {
    const numCell = tr.querySelector(".ledger-row-num");
    if (numCell) numCell.textContent = String(i + 1);
  });
}

function recalcExpenseSum(): void {
  const rows = $expTbody().querySelectorAll("tr");
  let sum = 0;
  rows.forEach((tr) => {
    const amtInput = tr.querySelector<HTMLInputElement>('input[data-col="amount"]');
    if (amtInput) sum += parseNum(amtInput.value);
  });
  $expSum().textContent = fmtNum(sum);
}

function collectExpenseRows(): ExpenseRow[] {
  const rows = $expTbody().querySelectorAll("tr:not(.expense-subtotal-row)");
  const result: ExpenseRow[] = [];
  let lastCategory = "";
  let lastPerson = "";
  rows.forEach((tr) => {
    const getText = (col: string) => {
      const el = tr.querySelector<HTMLInputElement>(`input[data-col="${col}"]`);
      return el ? el.value.trim() : "";
    };
    const catInput = tr.querySelector<HTMLInputElement>('input[data-col="category"]');
    const cat = catInput ? catInput.value.trim() : lastCategory;
    if (cat) lastCategory = cat;
    const personInput = tr.querySelector<HTMLInputElement>('input[data-col="person"]');
    const person = personInput ? personInput.value.trim() : lastPerson;
    if (person) lastPerson = person;
    result.push({
      category: cat,
      person,
      itemDesc: getText("itemDesc") || (tr.querySelectorAll("input")[0]?.value.trim() ?? ""),
      description: getText("description") || (tr.querySelectorAll("input")[1]?.value.trim() ?? ""),
      amount: parseNum(getText("amount") || (tr.querySelectorAll("input")[2]?.value ?? "")),
    });
  });
  return result;
}

/* ---------- 收入表格 ---------- */

function createIncomeRow(data?: Partial<IncomeRow>): HTMLTableRowElement {
  const tr = document.createElement("tr");

  // 序号
  const tdNum = document.createElement("td");
  tdNum.className = "ledger-row-num";
  tr.appendChild(tdNum);

  // 分类
  tr.appendChild(createTextInput(data?.category ?? "", "category"));
  // 科目
  tr.appendChild(createTextInput(data?.subject ?? "", "subject"));
  // 事项
  tr.appendChild(createTextInput(data?.itemDesc ?? "", "itemDesc"));
  // 内容
  tr.appendChild(createTextInput(data?.content ?? "", "content"));

  // 金额
  const tdAmt = document.createElement("td");
  tdAmt.dataset.col = "amount";
  const amtInput = document.createElement("input");
  amtInput.type = "text";
  amtInput.className = "ledger-cell-input ledger-cell-input--num";
  amtInput.dataset.col = "amount";
  amtInput.value = data?.amount ? String(data.amount) : "";
  amtInput.addEventListener("input", () => recalcIncomeSum());
  tdAmt.appendChild(amtInput);
  tr.appendChild(tdAmt);

  // 删除按钮
  const tdDel = document.createElement("td");
  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.className = "ledger-btn-del";
  btnDel.textContent = "×";
  btnDel.title = "删除此行";
  btnDel.addEventListener("click", () => {
    tr.remove();
    renumberIncomeRows();
    recalcIncomeSum();
    scheduleAutoSave();
  });
  tdDel.appendChild(btnDel);
  tr.appendChild(tdDel);

  return tr;
}

/* ---------- 收入分组渲染（rowspan 合并 + 小计） ---------- */

function renderIncomeGrouped(incomes: IncomeRow[]): void {
  const tbody = $incTbody();

  // 按分类分组
  const groups: { category: string; rows: IncomeRow[] }[] = [];
  for (const inc of incomes) {
    const cat = inc.category || "未分类";
    const last = groups[groups.length - 1];
    if (last && last.category === cat) {
      last.rows.push(inc);
    } else {
      groups.push({ category: cat, rows: [inc] });
    }
  }

  let globalIdx = 0;
  for (const group of groups) {
    const count = group.rows.length;

    for (let i = 0; i < count; i++) {
      const tr = createIncomeRow(group.rows[i]);
      globalIdx++;
      const numCell = tr.querySelector(".ledger-row-num");
      if (numCell) numCell.textContent = String(globalIdx);
      tbody.appendChild(tr);
    }

    // 设置分类 rowspan
    const startRowIdx = tbody.querySelectorAll("tr:not(.income-subtotal-row)").length - count;
    const allTrs = tbody.querySelectorAll("tr:not(.income-subtotal-row)");
    if (count > 1) {
      const catTd = (allTrs[startRowIdx] as HTMLTableRowElement)?.querySelector('td[data-col="category"]');
      if (catTd) {
        (catTd as HTMLTableCellElement).rowSpan = count;
        (catTd as HTMLTableCellElement).style.verticalAlign = "middle";
        (catTd as HTMLTableCellElement).style.fontWeight = "600";
        (catTd as HTMLTableCellElement).style.background = "#f0f7fa";
      }
      for (let i = 1; i < count; i++) {
        const td = (allTrs[startRowIdx + i] as HTMLTableRowElement)?.querySelector('td[data-col="category"]');
        if (td) td.remove();
      }
    }

    // 分类小计行
    if (count > 1 || groups.length > 1) {
      const subtotal = group.rows.reduce((s, r) => s + r.amount, 0);
      const subTr = document.createElement("tr");
      subTr.className = "income-subtotal-row";
      subTr.innerHTML = `
        <td colspan="5" style="text-align:left;font-weight:600;color:#028090;padding-left:8px">${escHtml(group.category)} 小计</td>
        <td class="num-col" style="font-weight:600;color:#028090">${fmtNum(subtotal)}</td>
        <td></td>`;
      tbody.appendChild(subTr);
    }
  }
}

function renumberIncomeRows(): void {
  const rows = $incTbody().querySelectorAll("tr");
  rows.forEach((tr, i) => {
    const numCell = tr.querySelector(".ledger-row-num");
    if (numCell) numCell.textContent = String(i + 1);
  });
}

function recalcIncomeSum(): void {
  const rows = $incTbody().querySelectorAll("tr");
  let sum = 0;
  rows.forEach((tr) => {
    const amtInput = tr.querySelector<HTMLInputElement>('input[data-col="amount"]');
    if (amtInput) sum += parseNum(amtInput.value);
  });
  $incSum().textContent = fmtNum(sum);
}

function collectIncomeRows(): IncomeRow[] {
  const rows = $incTbody().querySelectorAll("tr:not(.income-subtotal-row)");
  const result: IncomeRow[] = [];
  let lastCategory = "";
  rows.forEach((tr) => {
    const getText = (col: string) => {
      const el = tr.querySelector<HTMLInputElement>(`input[data-col="${col}"]`);
      return el ? el.value.trim() : "";
    };
    const catInput = tr.querySelector<HTMLInputElement>('input[data-col="category"]');
    const cat = catInput ? catInput.value.trim() : lastCategory;
    if (cat) lastCategory = cat;
    result.push({
      category: cat,
      subject: getText("subject"),
      itemDesc: getText("itemDesc"),
      content: getText("content"),
      amount: parseNum(getText("amount")),
    });
  });
  return result;
}

/* ---------- 纯利统计 / 公司账户 读写 ---------- */

function getStatField(field: string): number | null {
  const el = document.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
  if (!el) return null;
  const v = el.value.trim();
  if (v === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function setStatField(field: string, value: number | null): void {
  const el = document.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
  if (!el) return;
  el.value = value !== null ? String(value) : "";
}

function getTextField(field: string): string {
  const el = document.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
  return el ? el.value.trim() : "";
}

function setTextField(field: string, value: string): void {
  const el = document.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
  if (el) el.value = value;
}

/* ---------- 收集完整 payload ---------- */

function collectPayload(): Record<string, unknown> {
  return {
    ledgerMonth: $date(),
    remark: "",
    netProfit: getStatField("netProfit"),
    totalClassPrice: getStatField("totalClassPrice"),
    trialClassPrice: getStatField("trialClassPrice"),
    coachSalary: getStatField("coachSalary"),
    cashOutflow: getStatField("cashOutflow"),
    refundFee: getStatField("refundFee"),
    companyAccount: getTextField("companyAccount"),
    prevBalance: getStatField("prevBalance"),
    courseSales: getStatField("courseSales"),
    otherIncome: getStatField("otherIncome"),
    expenditure: getStatField("expenditure"),
    bankTransfer: getStatField("bankTransfer"),
    expenses: collectExpenseRows(),
    incomes: collectIncomeRows(),
  };
}

/* ---------- 填充表单 ---------- */

function fillForm(data: LedgerData): void {
  $setDate(data.ledgerMonth);

  setStatField("netProfit", data.netProfit);
  setStatField("totalClassPrice", data.totalClassPrice);
  setStatField("trialClassPrice", data.trialClassPrice);
  setStatField("coachSalary", data.coachSalary);
  setStatField("cashOutflow", data.cashOutflow);
  setStatField("refundFee", data.refundFee);

  setTextField("companyAccount", data.companyAccount);
  setStatField("prevBalance", data.prevBalance);
  setStatField("courseSales", data.courseSales);
  setStatField("otherIncome", data.otherIncome);
  setStatField("expenditure", data.expenditure);
  setStatField("bankTransfer", data.bankTransfer);

  // 支出明细（按分类分组 + rowspan 合并 + 小计）
  $expTbody().innerHTML = "";
  renderExpenseGrouped(data.expenses);
  recalcExpenseSum();

  // 收入明细（按分类分组 + rowspan 合并 + 小计）
  $incTbody().innerHTML = "";
  renderIncomeGrouped(data.incomes);
  recalcIncomeSum();
}

function resetForm(): void {
  $setDate(currentMonth());

  const statFields = [
    "netProfit", "totalClassPrice", "trialClassPrice",
    "coachSalary", "cashOutflow", "refundFee",
    "prevBalance", "courseSales", "otherIncome",
    "expenditure", "bankTransfer",
  ];
  for (const f of statFields) setStatField(f, null);
  setTextField("companyAccount", "");

  $expTbody().innerHTML = "";
  $incTbody().innerHTML = "";
  $expSum().textContent = "0.00";
  $incSum().textContent = "0.00";
  $out().textContent = "";
}

/* ---------- 自动保存（防抖） ---------- */

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoSave(): void {
  if (!isTauriShell()) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  setStatus("编辑中…", false);
  autoSaveTimer = setTimeout(async () => {
    autoSaveTimer = null;
    const dateVal = $date();
    if (!dateVal) return;
    try {
      await safeInvoke<string>("save_ledger", {
        payload: collectPayload(),
      });
      setStatus("已自动保存", false);
    } catch (e) {
      $out().textContent = String(e);
      setStatus("自动保存失败", false);
    }
  }, 800);
}

/* ---------- 加载 ---------- */

async function loadLedger(): Promise<void> {
  if (!isTauriShell()) return;

  const dateVal = $date();
  if (!dateVal) {
    $out().textContent = "请先选择登记日期。";
    return;
  }

  setStatus("加载中…", true);
  setButtonsDisabled(true);

  try {
    const data = await safeInvoke<LedgerData | null>("load_ledger", { ledgerMonth: dateVal });
    if (data) {
      fillForm(data);
      $out().textContent = `已加载 ${dateVal} 的登记记录（ID=${data.id}）。`;
      setStatus("已加载", false);
    } else {
      resetForm();
      $setDate(dateVal);
      $out().textContent = `${dateVal} 暂无登记记录，可新建。`;
      setStatus("无记录", false);
    }
  } catch (e) {
    $out().textContent = String(e);
    setStatus("加载失败", false);
  } finally {
    setButtonsDisabled(false);
  }
}

/* ---------- 初始化 ---------- */

export function initLedger(): void {
  // 填充年月下拉框
  const yearSel = document.querySelector<HTMLSelectElement>("#ledger-year");
  const monthSel = document.querySelector<HTMLSelectElement>("#ledger-month");
  if (yearSel && monthSel) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    yearSel.innerHTML = "";
    for (let y = curYear - 3; y <= curYear + 3; y++) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = `${y}`;
      if (y === curYear) opt.selected = true;
      yearSel.appendChild(opt);
    }
    monthSel.innerHTML = "";
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement("option");
      opt.value = String(m);
      opt.textContent = `${m}`;
      if (m === curMonth) opt.selected = true;
      monthSel.appendChild(opt);
    }
  }

  // 添加支出行
  document.querySelector("#btn-exp-add")!.addEventListener("click", () => {
    $expTbody().appendChild(createExpenseRow());
    renumberExpenseRows();
  });

  // 添加收入行
  document.querySelector("#btn-inc-add")!.addEventListener("click", () => {
    $incTbody().appendChild(createIncomeRow());
    renumberIncomeRows();
  });

  // 自动保存：监听所有输入变化
  const panel = document.querySelector("#panel-ledger")!;
  panel.addEventListener("input", () => scheduleAutoSave());
  panel.addEventListener("change", () => scheduleAutoSave());

  // 查询
  document.querySelector("#btn-ledger-load")!.addEventListener("click", () => {
    void loadLedger();
  });

  // 加载（从业务表加工数据写入月报）
  document.querySelector("#btn-ledger-generate")!.addEventListener("click", async () => {
    if (!isTauriShell()) return;
    const monthVal = $date();
    if (!monthVal) { $out().textContent = "请先选择月份。"; return; }
    setStatus("加载中…", true);
    try {
      const msg = await safeInvoke<string>("generate_ledger_data", { targetMonth: monthVal });
      setStatus("已加载", false);
      $out().textContent = msg || "加载完成";
      // 加载完成后自动查询填充表单
      void loadLedger();
    } catch (e) {
      setStatus("加载失败", false);
      $out().textContent = String(e);
    }
  });

  // 生成月报
  document.querySelector("#btn-ledger-report")!.addEventListener("click", async () => {
    if (!isTauriShell()) return;
    const dateVal = $date();
    if (!dateVal) {
      $out().textContent = "请先选择月份。";
      return;
    }
    setStatus("生成月报中…", true);
    try {
      const result = await safeInvoke<string>("generate_monthly_report", { ledgerMonth: dateVal });
      $out().textContent = result;
      setStatus("月报已生成", false);
    } catch (e) {
      $out().textContent = String(e);
      setStatus("生成失败", false);
    }
  });

  // 初始添加一行空行
  $expTbody().appendChild(createExpenseRow());
  $incTbody().appendChild(createIncomeRow());
  renumberExpenseRows();
  renumberIncomeRows();

  // 导出 Excel
  document.querySelector("#btn-ledger-export")?.addEventListener("click", () => {
    const expTable = document.querySelector("#expense-table") as HTMLTableElement | null;
    const incTable = document.querySelector("#income-table") as HTMLTableElement | null;
    if (expTable && incTable) {
      const month = (document.querySelector("#ledger-month") as HTMLSelectElement)?.value ?? "";
      exportTablesToXlsx([
        { el: expTable, sheetName: "支出明细", filename: "支出明细" },
        { el: incTable, sheetName: "收入明细", filename: "收入明细" },
      ], `财务月报_${month}`, { skipCols: [-1] });
    }
  });
}
