import Chart from "chart.js/auto";
import { isTauriShell, safeInvoke } from "./invoke";

export type ReportRow = {
  periodCode: string;
  yearNo: number;
  monthNo: number;
  accountCode: string;
  accountName: string;
  amount: number;
};

type DimKey =
  | "periodCode"
  | "yearNo"
  | "monthNo"
  | "accountCode"
  | "accountName";

let rawRows: ReportRow[] = [];
let filteredRows: ReportRow[] = [];
let chartInst: Chart | null = null;

function getDim(row: ReportRow, k: DimKey): string {
  switch (k) {
    case "periodCode":
      return row.periodCode;
    case "yearNo":
      return String(row.yearNo);
    case "monthNo":
      return String(row.monthNo);
    case "accountCode":
      return row.accountCode;
    case "accountName":
      return row.accountName;
  }
}

function applyFilters(): ReportRow[] {
  const yearSel = document.querySelector<HTMLSelectElement>("#rep-filter-year")!;
  const kw = document.querySelector<HTMLInputElement>("#rep-filter-kw")!.value
    .trim()
    .toLowerCase();
  const y = yearSel.value;
  return rawRows.filter((r) => {
    if (y && String(r.yearNo) !== y) {
      return false;
    }
    if (kw && !r.accountName.toLowerCase().includes(kw)) {
      return false;
    }
    return true;
  });
}

function buildPivot(
  rows: ReportRow[],
  rowDim: DimKey,
  colDim: DimKey
): { rowKeys: string[]; colKeys: string[]; get: (rk: string, ck: string) => number } {
  const acc = new Map<string, number>();
  const rs = new Set<string>();
  const cs = new Set<string>();
  for (const r of rows) {
    const rk = getDim(r, rowDim);
    const ck = getDim(r, colDim);
    rs.add(rk);
    cs.add(ck);
    const k = `${rk}\0${ck}`;
    acc.set(k, (acc.get(k) ?? 0) + r.amount);
  }
  const rowKeys = [...rs].sort();
  const colKeys = [...cs].sort();
  return {
    rowKeys,
    colKeys,
    get(rk: string, ck: string) {
      return acc.get(`${rk}\0${ck}`) ?? 0;
    },
  };
}

function renderPivotTable(
  rowDim: DimKey,
  colDim: DimKey,
  pivot: ReturnType<typeof buildPivot>
): void {
  const host = document.querySelector<HTMLDivElement>("#rep-pivot-host")!;
  const { rowKeys, colKeys, get } = pivot;
  const tbl = document.createElement("table");
  tbl.className = "pivot-table";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = `${dimLabel(rowDim)} \\ ${dimLabel(colDim)}`;
  hr.appendChild(corner);
  for (const ck of colKeys) {
    const th = document.createElement("th");
    th.textContent = ck;
    hr.appendChild(th);
  }
  const thSum = document.createElement("th");
  thSum.textContent = "行合计";
  hr.appendChild(thSum);
  thead.appendChild(hr);
  tbl.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const rk of rowKeys) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = rk;
    tr.appendChild(th);
    let rowSum = 0;
    for (const ck of colKeys) {
      const v = get(rk, ck);
      rowSum += v;
      const td = document.createElement("td");
      td.textContent = fmtNum(v);
      td.className = "pivot-cell";
      if (v !== 0) {
        td.dataset.rk = rk;
        td.dataset.ck = ck;
        td.title = "点击查看明细（钻取）";
      }
      tr.appendChild(td);
    }
    const tdR = document.createElement("td");
    tdR.textContent = fmtNum(rowSum);
    tdR.className = "pivot-sum";
    tr.appendChild(tdR);
    tbody.appendChild(tr);
  }
  const trF = document.createElement("tr");
  const thF = document.createElement("th");
  thF.textContent = "列合计";
  trF.appendChild(thF);
  let grand = 0;
  for (const ck of colKeys) {
    let colSum = 0;
    for (const rk of rowKeys) {
      colSum += get(rk, ck);
    }
    grand += colSum;
    const td = document.createElement("td");
    td.textContent = fmtNum(colSum);
    td.className = "pivot-sum";
    trF.appendChild(td);
  }
  const tdG = document.createElement("td");
  tdG.textContent = fmtNum(grand);
  tdG.className = "pivot-sum";
  trF.appendChild(tdG);
  tbody.appendChild(trF);
  tbl.appendChild(tbody);
  host.innerHTML = "";
  host.appendChild(tbl);

  host.querySelectorAll<HTMLTableCellElement>("td.pivot-cell").forEach((td) => {
    td.addEventListener("click", () => {
      const rk = td.dataset.rk;
      const ck = td.dataset.ck;
      if (rk === undefined || ck === undefined) {
        return;
      }
      showDrill(rowDim, colDim, rk, ck);
    });
  });
}

function dimLabel(k: DimKey): string {
  const m: Record<DimKey, string> = {
    periodCode: "期间",
    yearNo: "年",
    monthNo: "月",
    accountCode: "科目编码",
    accountName: "科目名称",
  };
  return m[k];
}

function fmtNum(n: number): string {
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function showDrill(
  rowDim: DimKey,
  colDim: DimKey,
  rk: string,
  ck: string
): void {
  const panel = document.querySelector<HTMLDivElement>("#rep-drill")!;
  const body = document.querySelector<HTMLTableSectionElement>("#rep-drill-body")!;
  const title = document.querySelector<HTMLParagraphElement>("#rep-drill-title")!;
  const rows = filteredRows.filter(
    (r) => getDim(r, rowDim) === rk && getDim(r, colDim) === ck
  );
  title.textContent = `钻取：${dimLabel(rowDim)} = ${rk}，${dimLabel(colDim)} = ${ck}（${rows.length} 条）`;
  body.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.periodCode}</td><td>${r.accountCode}</td><td>${r.accountName}</td><td class="num">${fmtNum(r.amount)}</td>`;
    body.appendChild(tr);
  }
  panel.hidden = false;
}

function aggregateBy(
  rows: ReportRow[],
  key: "periodCode" | "accountName"
): { labels: string[]; values: number[] } {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key === "periodCode" ? r.periodCode : r.accountName;
    m.set(k, (m.get(k) ?? 0) + r.amount);
  }
  const labels = [...m.keys()].sort();
  const values = labels.map((lb) => m.get(lb) ?? 0);
  return { labels, values };
}

function renderChart(kind: "line" | "bar" | "pie"): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#rep-chart")!;
  const basis =
    (document.querySelector<HTMLSelectElement>("#rep-chart-dim")!.value as
      | "period"
      | "account") ?? "period";
  const { labels, values } =
    basis === "period"
      ? aggregateBy(filteredRows, "periodCode")
      : aggregateBy(filteredRows, "accountName");

  if (chartInst) {
    chartInst.destroy();
    chartInst = null;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  if (labels.length === 0) {
    return;
  }

  const pieColors = labels.map(
    (_, i) => `hsl(${(i * 47) % 360} 62% 52%)`
  );

  const common = {
    labels,
    datasets: [
      {
        label: basis === "period" ? "金额（按期间）" : "金额（按科目）",
        data: values,
        borderColor: kind === "pie" ? "#ffffff" : "rgb(37, 99, 235)",
        borderWidth: kind === "pie" ? 2 : 1,
        backgroundColor:
          kind === "pie" ? pieColors : "rgba(37, 99, 235, 0.35)",
      },
    ],
  };

  if (kind === "line") {
    chartInst = new Chart(ctx, {
      type: "line",
      data: common,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } },
      },
    });
  } else if (kind === "bar") {
    chartInst = new Chart(ctx, {
      type: "bar",
      data: common,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } },
      },
    });
  } else {
    chartInst = new Chart(ctx, {
      type: "pie",
      data: common,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "right" } },
      },
    });
  }
}

async function loadData(): Promise<void> {
  const status = document.querySelector<HTMLSpanElement>("#rep-status")!;
  if (!isTauriShell()) {
    status.textContent = "未在壳内";
    document.querySelector<HTMLParagraphElement>("#rep-hint")!.textContent =
      "请在 Tauri 窗口中使用报表。";
    return;
  }
  status.textContent = "加载中…";
  try {
    rawRows = await safeInvoke<ReportRow[]>("fetch_report_dataset");
    filteredRows = applyFilters();
    status.textContent = `已加载 ${rawRows.length} 行`;
    document.querySelector<HTMLParagraphElement>("#rep-hint")!.textContent =
      rawRows.length === 0
        ? "无数据：可先点击「写入演示数据（约 48 条）」或执行 docs/seed_report_demo.sql"
        : `当前筛选后 ${filteredRows.length} 行（用于图表与透视）`;
    refreshPivotAndChart();
  } catch (e) {
    status.textContent = "失败";
    document.querySelector<HTMLParagraphElement>("#rep-hint")!.textContent =
      String(e);
  }
}

function refreshPivotAndChart(): void {
  filteredRows = applyFilters();
  document.querySelector<HTMLParagraphElement>("#rep-hint")!.textContent =
    rawRows.length === 0
      ? "无数据"
      : `当前筛选后 ${filteredRows.length} 行`;
  const rowDim = document.querySelector<HTMLSelectElement>("#rep-pivot-row")!
    .value as DimKey;
  const colDim = document.querySelector<HTMLSelectElement>("#rep-pivot-col")!
    .value as DimKey;
  if (rowDim === colDim) {
    document.querySelector<HTMLDivElement>("#rep-pivot-host")!.innerHTML =
      "<p class=\"warn\">行维度与列维度不能相同。</p>";
  } else {
    const p = buildPivot(filteredRows, rowDim, colDim);
    renderPivotTable(rowDim, colDim, p);
  }
  const kind = document.querySelector<HTMLInputElement>(
    "input[name=\"rep-chart-kind\"]:checked"
  )!.value as "line" | "bar" | "pie";
  renderChart(kind);
  document.querySelector<HTMLDivElement>("#rep-drill")!.hidden = true;
}

export function initReports(): void {
  document.querySelector("#btn-rep-load")!.addEventListener("click", () => {
    void loadData();
  });
  document.querySelector("#btn-rep-seed")!.addEventListener("click", async () => {
    const out = document.querySelector<HTMLPreElement>("#rep-seed-out")!;
    out.textContent = "执行中…";
    try {
      const msg = await safeInvoke<string>("seed_demo_financial_data");
      out.textContent = msg;
      await loadData();
    } catch (e) {
      out.textContent = String(e);
    }
  });
  document.querySelector("#btn-rep-apply")!.addEventListener("click", () => {
    refreshPivotAndChart();
  });
  document.querySelector("#btn-rep-pivot")!.addEventListener("click", () => {
    refreshPivotAndChart();
  });
  document.querySelectorAll("input[name=\"rep-chart-kind\"]").forEach((el) => {
    el.addEventListener("change", () => {
      const kind = (el as HTMLInputElement).value as "line" | "bar" | "pie";
      renderChart(kind);
    });
  });
  document
    .querySelector("#rep-chart-dim")!
    .addEventListener("change", () => {
      const kind = document.querySelector<HTMLInputElement>(
        "input[name=\"rep-chart-kind\"]:checked"
      )!.value as "line" | "bar" | "pie";
      renderChart(kind);
    });

  if (isTauriShell()) {
    void loadData();
  } else {
    document.querySelector<HTMLSpanElement>("#rep-status")!.textContent = "—";
    document.querySelector<HTMLParagraphElement>("#rep-hint")!.textContent =
      "在桌面窗口中打开后可加载数据。";
  }
}
