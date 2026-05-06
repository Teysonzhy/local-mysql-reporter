import { isTauriShell, safeInvoke } from "./invoke";
import { initLedger } from "./ledger-ui";
import { initMembers } from "./member-ui";
import { initCoaches } from "./coach-ui";
import { initRoutine } from "./routine-ui";
import { initOverview } from "./overview-ui";
import { initCoachStats } from "./coach-stats-ui";

const pageTitle = document.querySelector<HTMLHeadingElement>("#page-title")!;
const pageDesc = document.querySelector<HTMLParagraphElement>("#page-desc")!;
const shellBanner = document.querySelector<HTMLDivElement>("#shell-banner")!;
const out = document.querySelector<HTMLPreElement>("#out")!;
const outputStatus = document.querySelector<HTMLSpanElement>("#output-status")!;

const pageCopy: Record<string, { title: string; desc: string }> = {
  overview: { title: "概览", desc: "环境与后续功能入口" },
  database: { title: "数据连接", desc: "验证 MySQL 与 invoke 通道" },
  import: { title: "导入数据", desc: "CSV / xlsx 导入到已有表" },
  reports: { title: "报表概览", desc: "可视化图表分析" },
  ledger: { title: "财务月报", desc: "每月收支登记与纯利统计" },
  "coach-stats": { title: "教练统计", desc: "按月查看教练课时数与课时费汇总" },
  members: { title: "会员管理", desc: "会员信息维护与课时管理" },
  coaches: { title: "教练管理", desc: "教练信息、课时安排与课时费结算" },
  "routine-teaching": { title: "授课日记", desc: "记录每日授课情况" },
  "routine-expense": { title: "日常开支", desc: "记录日常支出明细" },
  "routine-trial": { title: "体验课", desc: "记录体验课信息" },
  "routine-leave": { title: "请假", desc: "记录教练请假天数" },
};

function setOutputStatus(text: string, busy: boolean) {
  outputStatus.textContent = text;
  outputStatus.classList.toggle("badge--muted", !busy);
  if (busy) {
    outputStatus.style.background = "#dbeafe";
    outputStatus.style.color = "#1e40af";
  } else {
    outputStatus.style.background = "";
    outputStatus.style.color = "";
  }
}

function log(msg: string) {
  out.textContent = msg;
}

function showPanel(id: string) {
  const meta = pageCopy[id] ?? pageCopy.overview;
  pageTitle.textContent = meta.title;
  pageDesc.textContent = meta.desc;

  document.querySelectorAll("[data-panel-content]").forEach((el) => {
    const section = el as HTMLElement;
    const match = section.getAttribute("data-panel-content") === id;
    section.toggleAttribute("hidden", !match);
  });

  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.classList.toggle(
      "is-active",
      (btn as HTMLElement).dataset.panel === id
    );
  });

  // 自动展开包含当前 panel 的父级子菜单
  const parentMap: Record<string, string> = {
    reports: "reports",
    ledger: "reports",
    "coach-stats": "reports",
    "routine-hours": "reports",
    "routine-teaching": "routine",
    "routine-expense": "routine",
    "routine-trial": "routine",
    "routine-leave": "routine",
  };
  const parentKey = parentMap[id];
  if (parentKey) {
    // 展开直接父级
    const sub = document.getElementById(`nav-sub-${parentKey}`);
    if (sub) {
      sub.hidden = false;
      const toggle = document.querySelector(`[data-nav-toggle="${parentKey}"]`);
      if (toggle) toggle.setAttribute("aria-expanded", "true");
    }
    // 如果是常规报表子项，还需要展开 reports 父级
    if (parentKey === "routine") {
      const reportsSub = document.getElementById("nav-sub-reports");
      if (reportsSub) {
        reportsSub.hidden = false;
        const reportsToggle = document.querySelector('[data-nav-toggle="reports"]');
        if (reportsToggle) reportsToggle.setAttribute("aria-expanded", "true");
      }
    }
  }

  if (id === "import" && isTauriShell()) {
    void loadImportTables();
  }
}

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = (btn as HTMLElement).dataset.panel;
    if (id) {
      showPanel(id);
    }
  });
});

// 子菜单展开/折叠
document.querySelectorAll("[data-nav-toggle]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const key = (btn as HTMLElement).dataset.navToggle;
    const sub = document.getElementById(`nav-sub-${key}`);
    if (sub) {
      const expanded = !sub.hidden;
      sub.hidden = expanded;
      btn.setAttribute("aria-expanded", String(!expanded));
    }
  });
});

function setDbButtonsDisabled(disabled: boolean) {
  document.querySelectorAll("#panel-database .btn").forEach((b) => {
    (b as HTMLButtonElement).disabled = disabled;
  });
}

async function runDbAction(
  label: string,
  cmd: () => Promise<string>
): Promise<void> {
  setOutputStatus("请求中…", true);
  setDbButtonsDisabled(true);
  log(`${label}…`);
  try {
    const text = await cmd();
    log(text);
    setOutputStatus("完成", false);
  } catch (e) {
    log(String(e));
    setOutputStatus("失败", false);
  } finally {
    setDbButtonsDisabled(false);
  }
}

document.querySelector("#btn-ping")!.addEventListener("click", () =>
  runDbAction("测试连接", () => safeInvoke<string>("db_health"))
);

document.querySelector("#btn-locks")!.addEventListener("click", () =>
  runDbAction("读取锁表", () => safeInvoke<string>("list_table_edit_locks"))
);

document.querySelector("#btn-counts")!.addEventListener("click", () =>
  runDbAction("业务表行数", () => safeInvoke<string>("preview_business_counts"))
);

if (!isTauriShell()) {
  shellBanner.classList.remove("is-hidden");
  shellBanner.textContent =
    "当前在普通浏览器中打开，invoke 不可用。请使用 Tauri 桌面窗口：在 demo-tauri 目录执行 npm run tauri dev（或两终端流程中的 npm run dev:tauri）。";
  log("");
  setOutputStatus("未连接壳", false);
} else {
  shellBanner.classList.add("is-hidden");
  log("就绪。使用左侧导航切换页面；在「数据连接」中测试数据库。");
  setOutputStatus("空闲", false);
}

const importTableSelect = document.querySelector<HTMLSelectElement>("#import-table")!;

/* 表名 → 中文映射 */
const TABLE_LABELS: Record<string, string> = {
  import_member: "导入会员名册",
  import_booking: "导入约课记录",
  member: "会员表",
  coach: "教练表",
  course: "课程表",
  booking: "约课记录表",
  coach_fee: "课时费记录表",
  teaching_diary: "授课日记",
  daily_expense: "日常开支",
  trial_class: "体验课",
  coach_leave: "请假记录",
};

const importFileList = document.querySelector<HTMLUListElement>("#import-file-list")!;
const importOut = document.querySelector<HTMLPreElement>("#import-out")!;
const importStatus = document.querySelector<HTMLSpanElement>("#import-status")!;

let importSelectedPaths: string[] = [];

function setImportStatus(text: string, busy: boolean) {
  importStatus.textContent = text;
  importStatus.classList.toggle("badge--muted", !busy);
  if (busy) {
    importStatus.style.background = "#dbeafe";
    importStatus.style.color = "#1e40af";
  } else {
    importStatus.style.background = "";
    importStatus.style.color = "";
  }
}

function delimChar(key: string): string {
  switch (key) {
    case "tab":
      return "\t";
    case "semi":
      return ";";
    default:
      return ",";
  }
}

async function loadImportTables(): Promise<void> {
  importTableSelect.innerHTML = '<option value="">加载中…</option>';
  try {
    const raw = await safeInvoke<string[]>("list_user_tables");
    importTableSelect.innerHTML = "";
    if (raw.length === 0) {
      importTableSelect.innerHTML =
        '<option value="">（无可用表，请先执行 schema.sql）</option>';
      return;
    }
    for (const item of raw) {
      const [tableName, label] = item.includes("|") ? item.split("|") : [item, item];
      const opt = document.createElement("option");
      opt.value = tableName;
      opt.textContent = label || (TABLE_LABELS[tableName] ?? tableName);
      importTableSelect.appendChild(opt);
    }
  } catch (e) {
    importTableSelect.innerHTML = '<option value="">加载失败</option>';
    importOut.textContent = String(e);
  }
}

function renderImportFileList() {
  importFileList.innerHTML = "";
  if (importSelectedPaths.length === 0) {
    const li = document.createElement("li");
    li.textContent = "未选择文件";
    importFileList.appendChild(li);
    return;
  }
  for (const p of importSelectedPaths) {
    const li = document.createElement("li");
    li.textContent = p;
    importFileList.appendChild(li);
  }
}

document.querySelector("#btn-refresh-tables")!.addEventListener("click", () => {
  void loadImportTables();
});

document.querySelector("#btn-pick-files")!.addEventListener("click", async () => {
  if (!isTauriShell()) {
    return;
  }
  setImportStatus("选择文件…", true);
  try {
    const paths = await safeInvoke<string[] | null>("pick_import_files");
    importSelectedPaths = paths ?? [];
    renderImportFileList();
    setImportStatus(importSelectedPaths.length ? "已选择文件" : "空闲", false);
  } catch (e) {
    importOut.textContent = String(e);
    setImportStatus("失败", false);
  }
});

/* ========== 一键批量导入 ========== */

const batchDirInput = document.querySelector<HTMLInputElement>("#batch-import-dir")!;
const batchStatus = document.querySelector<HTMLSpanElement>("#batch-import-status")!;

document.querySelector("#btn-pick-folder")!.addEventListener("click", async () => {
  if (!isTauriShell()) return;
  try {
    const dir = await safeInvoke<string | null>("pick_import_folder");
    if (dir) {
      batchDirInput.value = dir;
    }
  } catch (e) {
    importOut.textContent = String(e);
  }
});

document.querySelector("#btn-run-batch-import")!.addEventListener("click", async () => {
  if (!isTauriShell()) return;
  const dir = batchDirInput.value.trim();
  if (!dir) {
    importOut.textContent = "请先选择模板目录。";
    return;
  }

  const hasHeader = (document.querySelector<HTMLInputElement>("#batch-has-header")!).checked;
  const delimKey = (document.querySelector<HTMLSelectElement>("#batch-csv-delim")!).value;

  batchStatus.textContent = "导入中…";
  batchStatus.style.background = "#dbeafe";
  batchStatus.style.color = "#1e40af";
  document.querySelectorAll("#panel-import .btn").forEach((b) => {
    (b as HTMLButtonElement).disabled = true;
  });

  try {
    const text = await safeInvoke<string>("batch_import_by_folder", {
      dir,
      hasHeader,
      csvDelimiter: delimChar(delimKey),
    });
    importOut.textContent = text;
    batchStatus.textContent = "完成";
  } catch (e) {
    importOut.textContent = String(e);
    batchStatus.textContent = "失败";
  } finally {
    batchStatus.style.background = "";
    batchStatus.style.color = "";
    document.querySelectorAll("#panel-import .btn").forEach((b) => {
      (b as HTMLButtonElement).disabled = false;
    });
  }
});

renderImportFileList();

document.querySelector("#btn-run-import")!.addEventListener("click", async () => {
  if (!isTauriShell()) {
    return;
  }
  const table = importTableSelect.value.trim();
  if (!table) {
    importOut.textContent = "请选择目标表。";
    return;
  }
  if (importSelectedPaths.length === 0) {
    importOut.textContent = "请先选择 CSV 或 xlsx 文件。";
    return;
  }

  const hasHeader = (
    document.querySelector<HTMLInputElement>("#import-has-header")!
  ).checked;
  const delimKey =
    document.querySelector<HTMLSelectElement>("#import-csv-delim")!.value;
  const sheetRaw =
    document.querySelector<HTMLInputElement>("#import-sheet")!.value.trim();
  const sheetName = sheetRaw.length > 0 ? sheetRaw : null;

  setImportStatus("导入中…", true);
  document.querySelectorAll("#panel-import .btn").forEach((b) => {
    (b as HTMLButtonElement).disabled = true;
  });

  try {
    const text = await safeInvoke<string>("import_tabular_files", {
      request: {
        paths: importSelectedPaths,
        table,
        options: {
          hasHeader,
          csvDelimiter: delimChar(delimKey),
          sheetName,
        },
      },
    });
    const label = TABLE_LABELS[table] ?? table;
    importOut.textContent = `目标表: ${label} (${table})\n${text}`;
    setImportStatus("完成", false);
  } catch (e) {
    importOut.textContent = String(e);
    setImportStatus("失败", false);
  } finally {
    document.querySelectorAll("#panel-import .btn").forEach((b) => {
      (b as HTMLButtonElement).disabled = false;
    });
  }
});

renderImportFileList();

initLedger();
initMembers();
initCoaches();
initRoutine();
initOverview();
initCoachStats();

showPanel("overview");
