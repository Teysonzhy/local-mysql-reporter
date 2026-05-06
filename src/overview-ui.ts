import { Chart, registerables } from "chart.js";
Chart.register(...registerables);

import { safeInvoke, isTauriShell } from "./invoke";

/* ========== 类型 ========== */

interface OverviewStats {
  totalMembers: number;
  paidMembers: number;
  activeMembers: number;
  churnMembers: number;
  churnReasons: [string, number][];
  hoursTrendMonths: string[];
  hoursTrendNew: number[];
  hoursTrendUsed: number[];
  hoursTrendRemain: number[];
  trialTotal: number;
  trialConverted: number;
  trialLost: number;
  trialPending: number;
  trialSources: [string, number][];
}

/* ========== 图表实例 ========== */

let chartFunnel: Chart | null = null;
let chartHoursTrend: Chart | null = null;
let chartChurn: Chart | null = null;
let chartTrial: Chart | null = null;
let chartSource: Chart | null = null;

const COLORS = [
  "#028090", "#27ae60", "#f39c12", "#e74c3c", "#9b59b6",
  "#1abc9c", "#e67e22", "#3498db", "#2ecc71", "#e84393",
];

/* ========== 初始化 ========== */

export function initOverview(): void {
  document.querySelector("#btn-overview-refresh")?.addEventListener("click", () => {
    void loadOverview();
  });

  // 工资结构
  void loadSalaryStructure();
  document.querySelector("#btn-add-salary")?.addEventListener("click", () => {
    addSalaryRow();
  });

  // 激励等级 - 加载/保存/新增/删除
  loadGradeTable();
  document.querySelector("#btn-add-grade")?.addEventListener("click", () => {
    addGradeRow();
  });
  document.querySelector("#btn-save-grade")?.addEventListener("click", () => {
    saveGradeTable();
    showSaveTip("btn-save-grade");
  });

  // 账务计算公式 - 加载/保存
  loadFormula();
  document.querySelector("#btn-save-formula")?.addEventListener("click", () => {
    saveFormula();
    showSaveTip("btn-save-formula");
  });
}

/* ========== 激励等级 ========== */

interface GradeRow {
  grade: string;
  range: string;
  salary: string;
  ratio: string;
}

function loadGradeTable(): void {
  const saved = localStorage.getItem("grade_table");
  let rows: GradeRow[] = [];
  if (saved) {
    try { rows = JSON.parse(saved); } catch { /* ignore */ }
  }
  // 如果没有保存过数据，使用默认 3 行
  if (rows.length === 0) {
    rows = [
      { grade: "I级", range: "1-89", salary: "1500", ratio: "28" },
      { grade: "II级", range: "90-129", salary: "1700", ratio: "35" },
      { grade: "III级", range: "130+", salary: "2000", ratio: "40" },
    ];
  }
  const tbody = document.querySelector("#grade-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><input class="ledger-cell-input" data-col="grade" value="${escHtml(r.grade)}" style="width:70px"></td>
      <td><input class="ledger-cell-input" data-col="range" value="${escHtml(r.range)}" style="width:150px"></td>
      <td><input class="ledger-cell-input ledger-cell-input--num" data-col="salary" value="${escHtml(r.salary)}" style="width:110px"></td>
      <td><input class="ledger-cell-input ledger-cell-input--num" data-col="ratio" value="${escHtml(r.ratio)}" style="width:110px"><span style="margin-left:4px;color:var(--text-muted)">%</span></td>
      <td><button type="button" class="btn btn--sm btn--danger grade-del">删除</button></td>`;
    tbody.appendChild(tr);
  });

  // 绑定删除
  tbody.querySelectorAll(".grade-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      (btn as HTMLElement).closest("tr")?.remove();
      // 重新编号
      Array.from(tbody.children).forEach((tr, i) => {
        (tr as HTMLElement).querySelector("td")!.textContent = String(i + 1);
      });
    });
  });
}

function addGradeRow(): void {
  const tbody = document.querySelector("#grade-tbody");
  if (!tbody) return;
  const idx = tbody.children.length + 1;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${idx}</td>
    <td><input class="ledger-cell-input" data-col="grade" value="" style="width:70px" placeholder="等级"></td>
    <td><input class="ledger-cell-input" data-col="range" value="" style="width:150px" placeholder="课时范围"></td>
    <td><input class="ledger-cell-input ledger-cell-input--num" data-col="salary" value="" style="width:110px" placeholder="工资"></td>
    <td><input class="ledger-cell-input ledger-cell-input--num" data-col="ratio" value="" style="width:110px" placeholder="比例"><span style="margin-left:4px;color:var(--text-muted)">%</span></td>
    <td><button type="button" class="btn btn--sm btn--danger grade-del">删除</button></td>`;
  tbody.appendChild(tr);

  tr.querySelector(".grade-del")!.addEventListener("click", () => {
    tr.remove();
    Array.from(tbody.children).forEach((row, i) => {
      (row as HTMLElement).querySelector("td")!.textContent = String(i + 1);
    });
  });

  tr.querySelector<HTMLInputElement>(`[data-col="grade"]`)?.focus();
}

function saveGradeTable(): void {
  const tbody = document.querySelector("#grade-tbody");
  if (!tbody) return;
  const rows: GradeRow[] = [];
  Array.from(tbody.children).forEach((tr) => {
    const get = (col: string) => (tr as HTMLTableRowElement).querySelector<HTMLInputElement>(`input[data-col="${col}"]`)?.value ?? "";
    rows.push({ grade: get("grade"), range: get("range"), salary: get("salary"), ratio: get("ratio") });
  });
  localStorage.setItem("grade_table", JSON.stringify(rows));
}

/* ========== 账务计算公式 ========== */

function loadFormula(): void {
  const saved = localStorage.getItem("formula_text");
  const el = document.querySelector<HTMLTextAreaElement>("#formula-text");
  if (el && saved) el.value = saved;
}

function saveFormula(): void {
  const el = document.querySelector<HTMLTextAreaElement>("#formula-text");
  if (el) localStorage.setItem("formula_text", el.value);
}

/* ========== 保存提示 ========== */

function showSaveTip(btnId: string): void {
  const btn = document.querySelector<HTMLButtonElement>(`#${btnId}`);
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = "已保存 ✓";
  btn.style.color = "#27ae60";
  setTimeout(() => { btn.textContent = orig; btn.style.color = ""; }, 1500);
}

/* ========== 工资结构 ========== */

interface SalaryRow {
  id?: number;
  sort_order: number;
  component: string;
  amount: string;
  remark: string;
}

async function loadSalaryStructure(): Promise<void> {
  const rows = await safeInvoke<SalaryRow[]>("list_salary_structure", {});
  const tbody = document.querySelector("#salary-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><input class="ledger-cell-input" data-col="component" value="${escHtml(r.component)}" style="width:150px"></td>
      <td><input class="ledger-cell-input" data-col="amount" value="${escHtml(r.amount)}" style="width:130px"></td>
      <td><input class="ledger-cell-input" data-col="remark" value="${escHtml(r.remark)}" style="width:100%"></td>
      <td>
        <button type="button" class="btn btn--sm btn--primary salary-save" data-id="${r.id ?? 0}">保存</button>
        <button type="button" class="btn btn--sm btn--danger salary-del" data-id="${r.id ?? 0}" style="margin-left:4px">删除</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // 绑定保存事件
  tbody.querySelectorAll(".salary-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tr = (btn as HTMLElement).closest("tr")!;
      const id = parseInt((btn as HTMLElement).dataset.id || "0", 10);
      const payload: SalaryRow = {
        id: id || undefined,
        sort_order: 0,
        component: tr.querySelector<HTMLInputElement>(`[data-col="component"]`)?.value ?? "",
        amount: tr.querySelector<HTMLInputElement>(`[data-col="amount"]`)?.value ?? "",
        remark: tr.querySelector<HTMLInputElement>(`[data-col="remark"]`)?.value ?? "",
      };
      await safeInvoke<string>("save_salary_structure", { payload });
      void loadSalaryStructure();
    });
  });

  // 绑定删除事件
  tbody.querySelectorAll(".salary-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = parseInt((btn as HTMLElement).dataset.id || "0", 10);
      if (!id) return;
      if (!confirm("确定删除此项？")) return;
      await safeInvoke<string>("delete_salary_structure", { id });
      void loadSalaryStructure();
    });
  });
}

function addSalaryRow(): void {
  const tbody = document.querySelector("#salary-tbody");
  if (!tbody) return;
  const idx = tbody.children.length + 1;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${idx}</td>
    <td><input class="ledger-cell-input" data-col="component" value="" style="width:150px" placeholder="薪资构成"></td>
    <td><input class="ledger-cell-input" data-col="amount" value="" style="width:130px" placeholder="薪资额度"></td>
    <td><input class="ledger-cell-input" data-col="remark" value="" style="width:100%" placeholder="备注"></td>
    <td>
      <button type="button" class="btn btn--sm btn--primary salary-save" data-id="0">保存</button>
      <button type="button" class="btn btn--sm btn--danger salary-del" data-id="0" style="margin-left:4px">删除</button>
    </td>`;
  tbody.appendChild(tr);

  // 绑定保存
  tr.querySelector(".salary-save")!.addEventListener("click", async () => {
    const payload: SalaryRow = {
      sort_order: 0,
      component: tr.querySelector<HTMLInputElement>(`[data-col="component"]`)?.value ?? "",
      amount: tr.querySelector<HTMLInputElement>(`[data-col="amount"]`)?.value ?? "",
      remark: tr.querySelector<HTMLInputElement>(`[data-col="remark"]`)?.value ?? "",
    };
    await safeInvoke<string>("save_salary_structure", { payload });
    void loadSalaryStructure();
  });

  // 绑定删除（新增行无 id，直接移除 DOM）
  tr.querySelector(".salary-del")!.addEventListener("click", () => {
    tr.remove();
  });

  // 聚焦到第一个输入框
  tr.querySelector<HTMLInputElement>(`[data-col="component"]`)?.focus();
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ========== 加载数据并渲染 ========== */

async function loadOverview(): Promise<void> {
  if (!isTauriShell()) return;
  const $status = document.querySelector<HTMLSpanElement>("#overview-status")!;
  $status.textContent = "加载中…";

  try {
    const data = await safeInvoke<OverviewStats>("overview_stats");

    // KPI
    document.querySelector("#kpi-total-members")!.textContent = String(data.totalMembers);
    document.querySelector("#kpi-paid-members")!.textContent = String(data.paidMembers);
    document.querySelector("#kpi-active-members")!.textContent = String(data.activeMembers);
    document.querySelector("#kpi-churn-members")!.textContent = String(data.churnMembers);

    // 销毁旧图表
    chartFunnel?.destroy();
    chartHoursTrend?.destroy();
    chartChurn?.destroy();
    chartTrial?.destroy();
    chartSource?.destroy();

    renderFunnel(data);
    renderHoursTrend(data);
    renderChurn(data);
    renderTrial(data);
    renderSource(data);

    $status.textContent = "已加载";
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    $status.textContent = `加载失败: ${errMsg}`;
    console.error("[overview]", e);
  }
}

/* ========== 会员漏斗（横向柱状图） ========== */

function renderFunnel(data: OverviewStats): void {
  const ctx = document.querySelector("#chart-funnel") as HTMLCanvasElement;
  if (!ctx) return;
  chartFunnel = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["累计会员", "付费会员", "当前有课时"],
      datasets: [{
        data: [data.totalMembers, data.paidMembers, data.activeMembers],
        backgroundColor: ["#028090", "#27ae60", "#f39c12"],
        borderRadius: 6,
        barPercentage: 0.6,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw} 人`,
          },
        },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: "#eee" } },
        y: { grid: { display: false } },
      },
    },
  });
  // 设置 canvas 高度
  ctx.parentElement!.style.height = "200px";
  chartFunnel.resize();
}

/* ========== 付费课时月趋势（折线图） ========== */

function renderHoursTrend(data: OverviewStats): void {
  const ctx = document.querySelector("#chart-hours-trend") as HTMLCanvasElement;
  if (!ctx) return;
  chartHoursTrend = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.hoursTrendMonths,
      datasets: [
        {
          label: "约课人数",
          data: data.hoursTrendNew,
          borderColor: "#028090",
          backgroundColor: "rgba(2,128,144,0.1)",
          fill: true,
          tension: 0.3,
        },
        {
          label: "消耗课时",
          data: data.hoursTrendUsed,
          borderColor: "#e74c3c",
          backgroundColor: "rgba(231,76,60,0.1)",
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "#eee" } },
      },
    },
  });
  ctx.parentElement!.style.height = "260px";
  chartHoursTrend.resize();
}

/* ========== 会员流失分析（饼图） ========== */

function renderChurn(data: OverviewStats): void {
  const ctx = document.querySelector("#chart-churn") as HTMLCanvasElement;
  if (!ctx) return;

  const labels = data.churnReasons.map(([r]) => r.length > 12 ? r.slice(0, 12) + "…" : r);
  const values = data.churnReasons.map(([, c]) => c);

  chartChurn = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: COLORS.slice(0, labels.length),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw} 人`,
          },
        },
      },
    },
  });
  ctx.parentElement!.style.height = "260px";
  chartChurn.resize();
}

/* ========== 体验转化分析（环形图） ========== */

function renderTrial(data: OverviewStats): void {
  const ctx = document.querySelector("#chart-trial") as HTMLCanvasElement;
  if (!ctx) return;
  chartTrial = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["已转化", "已流失", "待体验/已体验"],
      datasets: [{
        data: [data.trialConverted, data.trialLost, data.trialPending],
        backgroundColor: ["#27ae60", "#e74c3c", "#f39c12"],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = data.trialTotal || 1;
              const pct = ((ctx.raw as number) / total * 100).toFixed(1);
              return `${ctx.raw} 人 (${pct}%)`;
            },
          },
        },
      },
    },
  });
  ctx.parentElement!.style.height = "260px";
  chartTrial.resize();
}

/* ========== 活动引流分析（柱状图） ========== */

function renderSource(data: OverviewStats): void {
  const ctx = document.querySelector("#chart-source") as HTMLCanvasElement;
  if (!ctx) return;
  const labels = data.trialSources.map(([s]) => s);
  const values = data.trialSources.map(([, c]) => c);

  chartSource = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "体验人数",
        data: values,
        backgroundColor: COLORS.slice(0, labels.length),
        borderRadius: 6,
        barPercentage: 0.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw} 人`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "#eee" } },
      },
    },
  });
  ctx.parentElement!.style.height = "240px";
  chartSource.resize();
}
