/**
 * 常规报表模块 UI：授课日记、日常开支、体验课、请假
 */
import { isTauriShell, safeInvoke } from "./invoke";
import { exportTableToXlsx } from "./export-xlsx";

/* ========== 通用工具 ========== */

function escHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ========== 通用 CRUD 模式 ========== */

interface CrudConfig<T, P> {
  listCmd: string;
  saveCmd: string;
  deleteCmd: string;
  tbodyId: string;
  statusId: string;
  outId: string;
  monthParam: string; // "month" or null
  fields: { key: string; label: string; type: "text" | "number" | "date" | "time" | "select"; options?: { value: string; label: string }[] }[];
  renderRow: (r: T) => string;
  toPayload: (form: Record<string, string>) => P;
  toForm: (r: T) => Record<string, string>;
}

function initCrud<T, P>(config: CrudConfig<T, P>) {
  const $tbody = () => document.querySelector<HTMLTableSectionElement>(`#${config.tbodyId}`)!;
  const $status = () => document.querySelector<HTMLSpanElement>(`#${config.statusId}`)!;
  const $out = () => document.querySelector<HTMLPreElement>(`#${config.outId}`)!;
  const $modal = () => document.querySelector<HTMLDivElement>(`#${config.tbodyId.replace("-tbody", "-modal")}`)!;
  const $modalTitle = () => document.querySelector<HTMLHeadingElement>(`#${config.tbodyId.replace("-tbody", "-modal-title")}`)!;

  function setStatus(text: string, busy: boolean) {
    $status().textContent = text;
    $status().classList.toggle("badge--muted", !busy);
    if (busy) {
      $status().style.background = "#dbeafe";
      $status().style.color = "#1e40af";
    } else {
      $status().style.background = "";
      $status().style.color = "";
    }
  }

  function getFormValues(): Record<string, string> {
    const vals: Record<string, string> = {};
    config.fields.forEach((f) => {
      const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#f-${config.tbodyId}-${f.key}`);
      vals[f.key] = el ? el.value : "";
    });
    return vals;
  }

  function setFormValues(vals: Record<string, string>) {
    config.fields.forEach((f) => {
      const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#f-${config.tbodyId}-${f.key}`);
      if (el) el.value = vals[f.key] ?? "";
    });
  }

  async function loadList(month?: string) {
    if (!isTauriShell()) return;
    setStatus("加载中...", true);
    try {
      const params: Record<string, string> = {};
      if (month && config.monthParam) params[config.monthParam] = month;
      const rows = await safeInvoke<T[]>(config.listCmd, params);
      renderTable(rows);
      setStatus(`共 ${rows.length} 条`, false);
      $out().textContent = "";
    } catch (e) {
      $out().textContent = String(e);
      setStatus("加载失败", false);
    }
  }

  function renderTable(rows: T[]) {
    const tbody = $tbody();
    if (rows.length === 0) {
      const cols = config.fields.length + 2; // +id + actions
      tbody.innerHTML = `<tr><td colspan="${cols}" class="member-empty">暂无数据</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = config.renderRow(r);
      tbody.appendChild(tr);
    }
    // 绑定操作按钮
    tbody.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action!;
        const id = parseInt(btn.dataset.id!, 10);
        if (action === "edit") {
          const row = rows.find((r) => (r as any).id === id);
          if (row) {
            $modalTitle().textContent = "修改";
            setFormValues(config.toForm(row));
            // 存储 id
            const idInput = document.querySelector<HTMLInputElement>(`#f-${config.tbodyId}-id`);
            if (idInput) idInput.value = String(id);
            $modal().hidden = false;
          }
        } else if (action === "delete") {
          if (!window.confirm("确定删除？")) return;
          try {
            const msg = await safeInvoke<string>(config.deleteCmd, { id });
            $out().textContent = msg;
            await loadList();
          } catch (e) {
            $out().textContent = String(e);
          }
        }
      });
    });
  }

  function openAddModal() {
    $modalTitle().textContent = "新增";
    setFormValues({});
    const idInput = document.querySelector<HTMLInputElement>(`#f-${config.tbodyId}-id`);
    if (idInput) idInput.value = "";
    $modal().hidden = false;
  }

  async function handleSave() {
    if (!isTauriShell()) return;
    const vals = getFormValues();
    const payload = config.toPayload(vals);
    setStatus("保存中...", true);
    try {
      const msg = await safeInvoke<string>(config.saveCmd, { payload });
      $out().textContent = msg;
      $modal().hidden = true;
      await loadList();
    } catch (e) {
      $out().textContent = String(e);
      setStatus("保存失败", false);
    }
  }

  // 绑定事件
  const addBtn = document.querySelector(`#btn-${config.tbodyId.replace("-tbody", "-add")}`);
  if (addBtn) addBtn.addEventListener("click", openAddModal);

  const saveBtn = document.querySelector(`#btn-${config.tbodyId.replace("-tbody", "-save")}`);
  if (saveBtn) saveBtn.addEventListener("click", () => void handleSave());

  const cancelBtn = document.querySelector(`#btn-${config.tbodyId.replace("-tbody", "-cancel")}`);
  if (cancelBtn) cancelBtn.addEventListener("click", () => { $modal().hidden = true; });

  const closeBtn = document.querySelector(`#btn-${config.tbodyId.replace("-tbody", "-modal-close")}`);
  if (closeBtn) closeBtn.addEventListener("click", () => { $modal().hidden = true; });

  $modal().addEventListener("click", (e) => {
    if (e.target === $modal()) $modal().hidden = true;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$modal().hidden) $modal().hidden = true;
  });

  return { loadList };
}

/* ========== 授课日记 ========== */

interface TeachingDiaryRow {
  id: number;
  coachName: string;
  courseName: string;
  classDate: string;
  startTime: string | null;
  duration: number;
  students: number;
  unitValue: number | null;
  remark: string | null;
}

const teachingConfig: CrudConfig<TeachingDiaryRow, any> = {
  listCmd: "list_teaching_diaries",
  saveCmd: "save_teaching_diary",
  deleteCmd: "delete_teaching_diary",
  tbodyId: "td-tbody",
  statusId: "td-status",
  outId: "td-out",
  monthParam: "month",
  fields: [
    { key: "coachName", label: "教练", type: "text" },
    { key: "courseName", label: "课程", type: "text" },
    { key: "classDate", label: "上课日期", type: "date" },
    { key: "startTime", label: "上课时间", type: "time" },
    { key: "duration", label: "时长(分钟)", type: "number" },
    { key: "students", label: "学员数", type: "number" },
    { key: "unitValue", label: "单课价值", type: "number" },
    { key: "remark", label: "备注", type: "text" },
  ],
  renderRow: (r) => `
    <td>${r.id}</td>
    <td>${escHtml(r.coachName)}</td>
    <td>${escHtml(r.courseName)}</td>
    <td>${escHtml(r.classDate)}</td>
    <td class="num-col">${r.duration}</td>
    <td class="num-col">${r.students}</td>
    <td class="num-col">${r.unitValue != null ? r.unitValue : "—"}</td>
    <td>
      <div class="member-actions">
        <button type="button" class="btn btn--edit" data-action="edit" data-id="${r.id}">修改</button>
        <button type="button" class="btn btn--del" data-action="delete" data-id="${r.id}">删除</button>
      </div>
    </td>`,
  toPayload: (form) => ({
    coachName: form.coachName,
    courseName: form.courseName,
    classDate: form.classDate,
    startTime: form.startTime || null,
    duration: parseInt(form.duration) || 60,
    students: parseInt(form.students) || 0,
    unitValue: form.unitValue ? parseFloat(form.unitValue) : null,
    remark: form.remark || null,
  }),
  toForm: (r) => ({
    coachName: r.coachName,
    courseName: r.courseName,
    classDate: r.classDate,
    startTime: r.startTime ?? "",
    duration: String(r.duration),
    students: String(r.students),
    unitValue: r.unitValue != null ? String(r.unitValue) : "",
    remark: r.remark ?? "",
  }),
};

/* ========== 日常开支 ========== */

interface DailyExpenseRow {
  id: number;
  expenseDate: string;
  expenseType: string;
  project: string;
  amount: number;
  remark: string | null;
}

const expenseConfig: CrudConfig<DailyExpenseRow, any> = {
  listCmd: "list_daily_expenses",
  saveCmd: "save_daily_expense",
  deleteCmd: "delete_daily_expense",
  tbodyId: "de-tbody",
  statusId: "de-status",
  outId: "de-out",
  monthParam: "month",
  fields: [
    { key: "expenseDate", label: "日期", type: "date" },
    { key: "expenseType", label: "支出类型", type: "text" },
    { key: "project", label: "项目明细", type: "text" },
    { key: "amount", label: "支出金额(元)", type: "number" },
    { key: "remark", label: "备注", type: "text" },
  ],
  renderRow: (r) => `
    <td>${r.id}</td>
    <td>${escHtml(r.expenseDate)}</td>
    <td>${escHtml(r.expenseType)}</td>
    <td>${escHtml(r.project)}</td>
    <td class="num-col">${r.amount.toFixed(2)}</td>
    <td>
      <div class="member-actions">
        <button type="button" class="btn btn--edit" data-action="edit" data-id="${r.id}">修改</button>
        <button type="button" class="btn btn--del" data-action="delete" data-id="${r.id}">删除</button>
      </div>
    </td>`,
  toPayload: (form) => ({
    expenseDate: form.expenseDate,
    expenseType: form.expenseType,
    project: form.project,
    amount: parseFloat(form.amount) || 0,
    remark: form.remark || null,
  }),
  toForm: (r) => ({
    expenseDate: r.expenseDate,
    expenseType: r.expenseType,
    project: r.project,
    amount: String(r.amount),
    remark: r.remark ?? "",
  }),
};

/* ========== 体验课 ========== */

interface TrialClassRow {
  id: number;
  classDate: string;
  trialType: string;
  studentName: string;
  source: string;
  unitValue: number | null;
  coachName: string;
  remark: string | null;
  status: number;
}

const trialConfig: CrudConfig<TrialClassRow, any> = {
  listCmd: "list_trial_classes",
  saveCmd: "save_trial_class",
  deleteCmd: "delete_trial_class",
  tbodyId: "tc-tbody",
  statusId: "tc-status",
  outId: "tc-out",
  monthParam: "month",
  fields: [
    { key: "classDate", label: "日期", type: "date" },
    { key: "trialType", label: "体验课类型", type: "text" },
    { key: "studentName", label: "体验课学员", type: "text" },
    { key: "source", label: "来源", type: "text" },
    { key: "unitValue", label: "体验课价值", type: "number" },
    { key: "coachName", label: "教练", type: "text" },
    { key: "status", label: "状态", type: "select", options: [
      { value: "1", label: "待体验" },
      { value: "2", label: "已体验" },
      { value: "3", label: "已转化" },
      { value: "4", label: "已流失" },
    ] },
    { key: "remark", label: "备注", type: "text" },
  ],
  renderRow: (r) => {
    const statusMap: Record<number, string> = { 1: "待体验", 2: "已体验", 3: "已转化", 4: "已流失" };
    return `
    <td>${r.id}</td>
    <td>${escHtml(r.classDate)}</td>
    <td>${escHtml(r.trialType)}</td>
    <td>${escHtml(r.studentName)}</td>
    <td>${escHtml(r.source)}</td>
    <td class="num-col">${r.unitValue != null ? r.unitValue : "—"}</td>
    <td>${escHtml(r.coachName)}</td>
    <td>${statusMap[r.status] ?? r.status}</td>
    <td>
      <div class="member-actions">
        <button type="button" class="btn btn--edit" data-action="edit" data-id="${r.id}">修改</button>
        <button type="button" class="btn btn--del" data-action="delete" data-id="${r.id}">删除</button>
      </div>
    </td>`;
  },
  toPayload: (form) => ({
    classDate: form.classDate,
    trialType: form.trialType,
    studentName: form.studentName,
    source: form.source,
    unitValue: form.unitValue ? parseFloat(form.unitValue) : null,
    coachName: form.coachName,
    status: parseInt(form.status) || 1,
    remark: form.remark || null,
  }),
  toForm: (r) => ({
    classDate: r.classDate,
    trialType: r.trialType,
    studentName: r.studentName,
    source: r.source,
    unitValue: r.unitValue != null ? String(r.unitValue) : "",
    coachName: r.coachName,
    status: String(r.status),
    remark: r.remark ?? "",
  }),
};

/* ========== 请假 ========== */

interface CoachLeaveRow {
  id: number;
  coachName: string;
  leaveMonth: string;
  leaveDays: number;
  remark: string | null;
}

const leaveConfig: CrudConfig<CoachLeaveRow, any> = {
  listCmd: "list_coach_leaves",
  saveCmd: "save_coach_leave",
  deleteCmd: "delete_coach_leave",
  tbodyId: "cl-tbody",
  statusId: "cl-status",
  outId: "cl-out",
  monthParam: "month",
  fields: [
    { key: "coachName", label: "教练", type: "text" },
    { key: "leaveMonth", label: "月份", type: "text" },
    { key: "leaveDays", label: "请假天数", type: "number" },
    { key: "remark", label: "备注", type: "text" },
  ],
  renderRow: (r) => `
    <td>${r.id}</td>
    <td>${escHtml(r.coachName)}</td>
    <td>${escHtml(r.leaveMonth)}</td>
    <td class="num-col">${r.leaveDays}</td>
    <td>
      <div class="member-actions">
        <button type="button" class="btn btn--edit" data-action="edit" data-id="${r.id}">修改</button>
        <button type="button" class="btn btn--del" data-action="delete" data-id="${r.id}">删除</button>
      </div>
    </td>`,
  toPayload: (form) => ({
    coachName: form.coachName,
    leaveMonth: form.leaveMonth,
    leaveDays: parseFloat(form.leaveDays) || 0,
    remark: form.remark || null,
  }),
  toForm: (r) => ({
    coachName: r.coachName,
    leaveMonth: r.leaveMonth,
    leaveDays: String(r.leaveDays),
    remark: r.remark ?? "",
  }),
};

interface MemberHoursRow {
  id: number;
  cardName: string;
  phone: string;
  coach: string;
  prevInitHours: number;
  monthNewHours: number;
  monthUsedHours: number;
  remainHours: number;
}

/* ========== 初始化 ========== */

export function initRoutine(): void {
  try {
    // 填充月份下拉框
    fillMonthSelects("td-year", "td-month");
    fillMonthSelects("de-year", "de-month");
    fillMonthSelects("tc-year", "tc-month");
    fillMonthSelects("cl-year", "cl-month");
    fillMonthSelects("mh-year", "mh-month");

    const td = initCrud(teachingConfig);
    const de = initCrud(expenseConfig);
    const tc = initCrud(trialConfig);
    const cl = initCrud(leaveConfig);

    // 查询按钮
    document.querySelector("#btn-td-query")?.addEventListener("click", () => {
      void td.loadList(getMonthVal("td-year", "td-month"));
    });
    document.querySelector("#btn-de-query")?.addEventListener("click", () => {
      void de.loadList(getMonthVal("de-year", "de-month"));
    });
    document.querySelector("#btn-tc-query")?.addEventListener("click", () => {
      void tc.loadList(getMonthVal("tc-year", "tc-month"));
    });
    document.querySelector("#btn-cl-query")?.addEventListener("click", () => {
      void cl.loadList(getMonthVal("cl-year", "cl-month"));
    });

    // 会员课时统计
    document.querySelector("#btn-mh-load")?.addEventListener("click", async () => {
      const $status = document.querySelector<HTMLSpanElement>("#mh-status")!;
      $status.textContent = "加载中…";
      try {
        const msg = await safeInvoke<string>("load_import_to_member");
        $status.textContent = msg;
        // 加载后自动查询
        document.querySelector<HTMLButtonElement>("#btn-mh-query")?.click();
      } catch (e) {
        $status.textContent = "加载失败";
      }
    });
    document.querySelector("#btn-mh-query")?.addEventListener("click", async () => {
      const $status = document.querySelector<HTMLSpanElement>("#mh-status")!;
      const $tbody = document.querySelector<HTMLTableSectionElement>("#mh-tbody")!;
      const $out = document.querySelector<HTMLPreElement>("#mh-out")!;
      $status.textContent = "查询中…";
      try {
        const rows = await safeInvoke<MemberHoursRow[]>("list_member_hours");
        if (rows.length === 0) {
          $tbody.innerHTML = '<tr><td colspan="8" class="member-empty">暂无会员数据</td></tr>';
        } else {
          $tbody.innerHTML = rows.map(r => `
            <tr>
              <td>${r.id}</td>
              <td>${escHtml(r.cardName)}</td>
              <td>${escHtml(r.phone)}</td>
              <td>${escHtml(r.coach)}</td>
              <td class="num-col">${r.prevInitHours}</td>
              <td class="num-col">${r.monthNewHours}</td>
              <td class="num-col">${r.monthUsedHours}</td>
              <td class="num-col">${r.remainHours}</td>
            </tr>`).join("");
        }
        $status.textContent = `共 ${rows.length} 条`;
        $out.textContent = "";
      } catch (e) {
        $out.textContent = String(e);
        $status.textContent = "查询失败";
      }
    });

    // --- 导出 Excel ---
    document.querySelector("#btn-td-export")?.addEventListener("click", () => {
      const table = document.querySelector("#td-tbody")?.closest("table") as HTMLTableElement | null;
      if (table) exportTableToXlsx(table, "授课日记", { skipCols: [-1] });
    });
    document.querySelector("#btn-de-export")?.addEventListener("click", () => {
      const table = document.querySelector("#de-tbody")?.closest("table") as HTMLTableElement | null;
      if (table) exportTableToXlsx(table, "日常开支", { skipCols: [-1] });
    });
    document.querySelector("#btn-tc-export")?.addEventListener("click", () => {
      const table = document.querySelector("#tc-tbody")?.closest("table") as HTMLTableElement | null;
      if (table) exportTableToXlsx(table, "体验课", { skipCols: [-1] });
    });
    document.querySelector("#btn-cl-export")?.addEventListener("click", () => {
      const table = document.querySelector("#cl-tbody")?.closest("table") as HTMLTableElement | null;
      if (table) exportTableToXlsx(table, "请假记录", { skipCols: [-1] });
    });
    document.querySelector("#btn-mh-export")?.addEventListener("click", () => {
      const table = document.querySelector("#mh-tbody")?.closest("table") as HTMLTableElement | null;
      if (table) exportTableToXlsx(table, "会员课时统计", { skipCols: [-1] });
    });

    console.log("[routine-ui] 初始化完成");
  } catch (e) {
    console.error("[routine-ui] 初始化异常:", e);
  }
}

function fillMonthSelects(yearId: string, monthId: string) {
  const yearSel = document.querySelector<HTMLSelectElement>(`#${yearId}`);
  const monthSel = document.querySelector<HTMLSelectElement>(`#${monthId}`);
  if (!yearSel || !monthSel) return;
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  yearSel.innerHTML = "";
  for (let y = curYear - 2; y <= curYear + 2; y++) {
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

function getMonthVal(yearId: string, monthId: string): string {
  const y = (document.querySelector<HTMLSelectElement>(`#${yearId}`)?.value) ?? "";
  const m = (document.querySelector<HTMLSelectElement>(`#${monthId}`)?.value) ?? "";
  return `${y}-${m.padStart(2, "0")}`;
}
