import { isTauriShell, safeInvoke } from "./invoke";
import { populateMonthSelects } from "./coach-ui";

interface CoachStatRow {
  coachName: string;
  totalHours: number;
  trialHours: number;
  normalHours: number;
  soloHours: number;
  normalFee: number;
  soloFee: number;
  totalFee: number;
}

function getCsMonth(): string {
  const y = (document.querySelector("#cs-year") as HTMLSelectElement)?.value;
  const m = (document.querySelector("#cs-month") as HTMLSelectElement)?.value;
  if (!y || !m) return "";
  return `${y}-${m.padStart(2, "0")}`;
}

async function loadCoachStats(): Promise<void> {
  if (!isTauriShell()) return;
  const month = getCsMonth();
  const $status = document.querySelector<HTMLSpanElement>("#cs-status")!;
  const $tbody = document.querySelector<HTMLTableSectionElement>("#cs-tbody")!;
  if (!month) { $status.textContent = "请选择月份"; return; }
  $status.textContent = "查询中…";
  $tbody.innerHTML = "";
  try {
    const rows = await safeInvoke<CoachStatRow[]>("list_coach_stats", { month });
    if (rows.length === 0) {
      $tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">暂无数据，请先导入约课记录</td></tr>`;
      $status.textContent = "无数据";
      return;
    }
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escHtml(r.coachName)}</td>
        <td>${r.totalHours}</td>
        <td>${r.trialHours}</td>
        <td>${r.normalHours}</td>
        <td>${r.soloHours ?? 0}</td>
        <td>${(r.normalFee ?? 0).toFixed(2)}</td>
        <td>${(r.soloFee ?? 0).toFixed(2)}</td>
        <td>${(r.totalFee ?? 0).toFixed(2)}</td>`;
      $tbody.appendChild(tr);
    });
    $status.textContent = `共 ${rows.length} 位教练`;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    $status.textContent = `查询失败: ${errMsg}`;
    console.error("[coach-stats] 查询失败:", e);
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function initCoachStats(): void {
  populateMonthSelects(
    document.querySelector("#cs-year") as HTMLSelectElement,
    document.querySelector("#cs-month") as HTMLSelectElement,
  );

  document.querySelector("#btn-cs-load")?.addEventListener("click", async () => {
    const month = getCsMonth();
    const $status = document.querySelector<HTMLSpanElement>("#cs-status")!;
    if (!month) { $status.textContent = "请选择月份"; return; }
    $status.textContent = "加载中…";
    try {
      const msg = await safeInvoke<string>("load_coach_stats", { month });
      $status.textContent = msg;
      void loadCoachStats();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      $status.textContent = `加载失败: ${errMsg}`;
      console.error("[coach-stats] 加载失败:", e);
    }
  });

  document.querySelector("#btn-cs-query")?.addEventListener("click", () => {
    void loadCoachStats();
  });

  document.querySelector("#btn-cs-export")?.addEventListener("click", () => {
    const table = document.querySelector("#cs-tbody")?.closest("table") as HTMLTableElement | null;
    if (table) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).exportTableToXlsx?.(table, "教练统计", { skipCols: [] });
    }
  });

  // 不自动查询，等用户点击加载后再查询
}
