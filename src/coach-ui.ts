/**
 * 教练管理页面 — 交互逻辑
 * 功能：教练信息管理、课时安排
 */

import { isTauriShell, safeInvoke } from "./invoke";
import { exportTableToXlsx } from "./export-xlsx";

/* ---------- 类型 ---------- */

interface CoachRow {
  id: number;
  name: string;
  phone: string;
  position: string;
  storeName: string;
  hourlyRate: number | null;
  shareRatio: number | null;
  status: number;
  qualification: string;
}

interface CourseRow {
  id: number;
  coachId: number;
  coachName: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  duration: number;
  maxStudents: number;
  courseValue: number | null;
  status: number;
  memberName: string;
  memberCard: string;
  bookingTime: string;
  bookingStatus: number;
  soloFee: number | null;
  feeStatus: number;
  feeAmount: number | null;
  feeDate: string;
}

/* ---------- 状态变量 ---------- */

/* ---------- DOM 引用 ---------- */

const $coachTbody = () => document.querySelector<HTMLTableSectionElement>("#coach-tbody")!;
const $courseTbody = () => document.querySelector<HTMLTableSectionElement>("#course-tbody")!;
const $status = () => document.querySelector<HTMLSpanElement>("#coach-status")!;
const $out = () => document.querySelector<HTMLPreElement>("#coach-out")!;

// 教练弹窗
const $coachModal = () => document.querySelector<HTMLDivElement>("#coach-modal")!;
const $coachModalTitle = () => document.querySelector<HTMLHeadingElement>("#coach-modal-title")!;

// 课程弹窗
const $courseModal = () => document.querySelector<HTMLDivElement>("#course-modal")!;
const $courseModalTitle = () => document.querySelector<HTMLHeadingElement>("#course-modal-title")!;

// 月份输入
const $courseYear = () => document.querySelector<HTMLSelectElement>("#coach-course-year")!;
const $courseMonth = () => document.querySelector<HTMLSelectElement>("#coach-course-month")!;

/* ---------- 教练表单字段 ---------- */

const coachFieldIds = {
  id: "#cf-id",
  name: "#cf-name",
  phone: "#cf-phone",
  position: "#cf-position",
  store: "#cf-store",
  rate: "#cf-rate",
  ratio: "#cf-ratio",
  status: "#cf-status",
  qual: "#cf-qual",
} as const;

type CoachFieldKey = keyof typeof coachFieldIds;

function getCoachField<K extends CoachFieldKey>(key: K): string {
  const el = document.querySelector<HTMLInputElement>(coachFieldIds[key]);
  return el ? el.value : "";
}

function setCoachField<K extends CoachFieldKey>(key: K, value: string): void {
  const el = document.querySelector<HTMLInputElement>(coachFieldIds[key]);
  if (el) el.value = value;
}

/* ---------- 课程表单字段 ---------- */

const courseFieldIds = {
  id: "#crs-id",
  coachId: "#crs-coach",
  name: "#crs-name",
  start: "#crs-start",
  end: "#crs-end",
  duration: "#crs-duration",
  max: "#crs-max",
  value: "#crs-value",
  status: "#crs-status",
  desc: "#crs-desc",
  memberName: "#crs-member-name",
  memberCard: "#crs-member-card",
  bookingTime: "#crs-booking-time",
  bookingStatus: "#crs-booking-status",
  soloFee: "#crs-solo-fee",
} as const;

type CourseFieldKey = keyof typeof courseFieldIds;

function getCourseField<K extends CourseFieldKey>(key: K): string {
  const el = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(courseFieldIds[key]);
  return el ? el.value : "";
}

function setCourseField<K extends CourseFieldKey>(key: K, value: string): void {
  const el = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(courseFieldIds[key]);
  if (el) el.value = value;
}

/* ---------- 工具函数 ---------- */

function getCourseMonth(): string {
  return `${$courseYear().value}-${$courseMonth().value.padStart(2, "0")}`;
}

/** 填充年份+月份下拉框 */
export function populateMonthSelects(yearSel: HTMLSelectElement, monthSel: HTMLSelectElement): void {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  // 年份：当前年 ± 2
  yearSel.innerHTML = "";
  for (let y = curYear - 2; y <= curYear + 2; y++) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = `${y}`;
    if (y === curYear) opt.selected = true;
    yearSel.appendChild(opt);
  }

  // 月份：1-12
  monthSel.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${m}`;
    if (curYear === curYear && m === curMonth) opt.selected = true;
    monthSel.appendChild(opt);
  }
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

function courseStatusText(status: number): string {
  if (status === 1) return "进行中";
  if (status === 2) return "已结束";
  if (status === 3) return "已取消";
  return String(status);
}

function bookingStatusText(status: number): string {
  if (status === 1) return "已约";
  if (status === 2) return "已签到";
  if (status === 3) return "已取消";
  return String(status);
}

/* ---------- Tab 切换 ---------- */

function switchTab(tabName: string): void {
  // 切换 tab 按钮样式
  document.querySelectorAll<HTMLElement>("[data-coach-tab]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.coachTab === tabName);
  });
  // 切换内容区域
  document.querySelectorAll<HTMLElement>("[data-coach-tab-content]").forEach((panel) => {
    panel.hidden = panel.dataset.coachTabContent !== tabName;
  });
}

/* ========== 1. 教练信息管理 ========== */

function renderCoachTable(rows: CoachRow[]): void {
  const tbody = $coachTbody();
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="member-empty">暂无教练数据，点击「+ 新增教练」添加</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  for (const r of rows) {
    const statusText = r.status === 1 ? "在职" : "离职";
    const statusClass = r.status === 1 ? "badge--ok" : "badge--muted";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${escHtml(r.name)}</td>
      <td>${escHtml(r.phone) || "—"}</td>
      <td>${escHtml(r.position) || "教练"}</td>
      <td>${escHtml(r.storeName) || "—"}</td>
      <td class="num-col">${r.hourlyRate != null ? r.hourlyRate : "—"}</td>
      <td class="num-col">${r.shareRatio != null ? r.shareRatio + "%" : "—"}</td>
      <td><span class="badge ${statusClass}">${statusText}</span></td>
      <td>
        <div class="member-actions">
          <button type="button" class="btn btn--edit" data-action="edit-coach" data-id="${r.id}">修改</button>
          <button type="button" class="btn btn--del" data-action="delete-coach" data-id="${r.id}">删除</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // 绑定操作按钮事件
  tbody.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action!;
      const id = parseInt(btn.dataset.id!, 10);
      if (action === "edit-coach") {
        await handleEditCoach(id);
      } else if (action === "delete-coach") {
        await handleDeleteCoach(id);
      }
    });
  });
}

async function loadCoaches(): Promise<void> {
  if (!isTauriShell()) return;
  setStatus("加载教练中...", true);
  try {
    const rows = await safeInvoke<CoachRow[]>("list_coaches");
    renderCoachTable(rows);
    setStatus(`共 ${rows.length} 位教练`, false);
    $out().textContent = "";
  } catch (e) {
    $out().textContent = String(e);
    setStatus("加载教练失败", false);
  }
}

function openCoachModal(mode: "add" | "edit", data?: CoachRow): void {
  // 清空表单
  for (const key of Object.keys(coachFieldIds)) {
    setCoachField(key as CoachFieldKey, "");
  }

  if (mode === "add") {
    $coachModalTitle().textContent = "新增教练";
    document.querySelector("#coach-salary-section")!.setAttribute("hidden", "");
  } else if (mode === "edit" && data) {
    $coachModalTitle().textContent = "修改教练";
    setCoachField("id", String(data.id));
    setCoachField("name", data.name);
    setCoachField("phone", data.phone);
    setCoachField("position", data.position || "教练");
    setCoachField("store", data.storeName);
    setCoachField("rate", data.hourlyRate != null ? String(data.hourlyRate) : "");
    setCoachField("ratio", data.shareRatio != null ? String(data.shareRatio) : "");
    setCoachField("status", String(data.status));
    setCoachField("qual", data.qualification);
    // 显示薪资结构区域并加载数据
    document.querySelector("#coach-salary-section")!.removeAttribute("hidden");
    void loadCoachSalary(data.id);
  }

  $coachModal().hidden = false;
}

function closeCoachModal(): void {
  $coachModal().hidden = true;
}

async function handleEditCoach(id: number): Promise<void> {
  if (!isTauriShell()) return;
  setStatus("加载中...", true);
  try {
    const rows = await safeInvoke<CoachRow[]>("list_coaches");
    const coach = rows.find((r) => r.id === id);
    if (coach) {
      openCoachModal("edit", coach);
      setStatus("", false);
    } else {
      $out().textContent = `未找到教练（ID=${id}）`;
      setStatus("未找到", false);
    }
  } catch (e) {
    $out().textContent = String(e);
    setStatus("失败", false);
  }
}

async function handleSaveCoach(): Promise<void> {
  if (!isTauriShell()) return;

  const name = getCoachField("name").trim();
  if (!name) {
    $out().textContent = "教练姓名不能为空。";
    return;
  }

  const idVal = getCoachField("id").trim();
  const payload = {
    id: idVal ? parseInt(idVal, 10) : null,
    name,
    phone: getCoachField("phone").trim(),
    position: getCoachField("position").trim() || "教练",
    storeName: getCoachField("store").trim(),
    hourlyRate: parseFloat(getCoachField("rate")) || 0,
    shareRatio: parseFloat(getCoachField("ratio")) || 0,
    status: parseInt(getCoachField("status")) || 1,
    qualification: getCoachField("qual").trim(),
  };

  setStatus("保存中...", true);
  try {
    const msg = await safeInvoke<string>("save_coach", { payload });
    $out().textContent = msg;
    closeCoachModal();
    await loadCoaches();
  } catch (e) {
    $out().textContent = String(e);
    setStatus("保存失败", false);
  }
}

async function handleDeleteCoach(id: number): Promise<void> {
  if (!isTauriShell()) return;
  if (!window.confirm(`确定要删除该教练（ID=${id}）吗？此操作不可撤销。`)) {
    return;
  }

  setStatus("删除中...", true);
  try {
    const msg = await safeInvoke<string>("delete_coach", { coachId: id });
    $out().textContent = msg;
    await loadCoaches();
  } catch (e) {
    $out().textContent = String(e);
    setStatus("删除失败", false);
  }
}

/* ========== 2. 课时安排 ========== */

function renderCourseTable(rows: CourseRow[]): void {
  const tbody = $courseTbody();
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="member-empty">暂无课时数据</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${escHtml(r.coachName)}</td>
      <td>${escHtml(r.name)}</td>
      <td>${escHtml(r.startTime)}</td>
      <td class="num-col">${r.duration}</td>
      <td>${escHtml(r.memberName) || "—"}</td>
      <td>${escHtml(r.memberCard) || "—"}</td>
      <td>${bookingStatusText(r.bookingStatus)}</td>
      <td class="num-col">${r.courseValue != null ? r.courseValue : "—"}</td>
      <td>${courseStatusText(r.status)}</td>
      <td>
        <div class="member-actions">
          <button type="button" class="btn btn--edit" data-action="edit-course" data-id="${r.id}">修改</button>
          <button type="button" class="btn btn--del" data-action="delete-course" data-id="${r.id}">删除</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // 绑定操作按钮事件
  tbody.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action!;
      const id = parseInt(btn.dataset.id!, 10);
      if (action === "edit-course") {
        await handleEditCourse(id);
      } else if (action === "delete-course") {
        await handleDeleteCourse(id);
      }
    });
  });
}

async function loadCourses(month?: string): Promise<void> {
  if (!isTauriShell()) return;
  const monthVal = month || getCourseMonth();
  if (!monthVal) {
    $out().textContent = "请先选择月份。";
    return;
  }
  const coachFilter = (document.querySelector("#course-filter-coach") as HTMLSelectElement)?.value || "";
  const courseFilter = (document.querySelector("#course-filter-name") as HTMLSelectElement)?.value || "";
  console.log("[coach-ui] loadCourses monthVal =", monthVal, "coach=", coachFilter, "course=", courseFilter);
  setStatus("加载课时中...", true);
  try {
    const rows = await safeInvoke<CourseRow[]>("list_courses", {
      month: monthVal,
      coachName: coachFilter || null,
      courseName: courseFilter || null,
    });
    console.log("[coach-ui] list_courses 返回", rows.length, "条:", rows.slice(0, 2));
    renderCourseTable(rows);
    setStatus(`共 ${rows.length} 条课时`, false);
    $out().textContent = "";
  } catch (e) {
    console.error("[coach-ui] loadCourses 失败:", e);
    $out().textContent = String(e);
    setStatus("加载课时失败", false);
  }
}

async function populateCoachSelect(): Promise<void> {
  if (!isTauriShell()) return;
  try {
    const coaches = await safeInvoke<CoachRow[]>("list_coaches");
    const sel = document.querySelector<HTMLSelectElement>("#crs-coach")!;
    sel.innerHTML = '<option value="">-- 请选择教练 --</option>';
    for (const c of coaches) {
      const opt = document.createElement("option");
      opt.value = String(c.id);
      opt.textContent = `${c.name}（${c.storeName || "无门店"}）`;
      sel.appendChild(opt);
    }
  } catch {
    // 忽略加载教练列表失败
  }
}

function openCourseModal(mode: "add" | "edit", data?: CourseRow): void {
  // 清空表单
  for (const key of Object.keys(courseFieldIds)) {
    setCourseField(key as CourseFieldKey, "");
  }

  if (mode === "add") {
    $courseModalTitle().textContent = "新增课时";
  } else if (mode === "edit" && data) {
    $courseModalTitle().textContent = "修改课时";
    setCourseField("id", String(data.id));
    setCourseField("coachId", String(data.coachId));
    setCourseField("name", data.name);
    setCourseField("start", data.startTime);
    setCourseField("end", data.endTime);
    setCourseField("duration", String(data.duration));
    setCourseField("max", String(data.maxStudents));
    setCourseField("value", data.courseValue != null ? String(data.courseValue) : "");
    setCourseField("status", String(data.status));
    setCourseField("desc", data.description);
    // 约课相关字段
    setCourseField("memberName", data.memberName || "");
    setCourseField("memberCard", data.memberCard || "");
    setCourseField("bookingTime", data.bookingTime || "");
    setCourseField("bookingStatus", String(data.bookingStatus));
    setCourseField("soloFee", data.soloFee != null ? String(data.soloFee) : "");
  }

  // 加载教练列表填充下拉框
  void populateCoachSelect();

  // 如果编辑模式，等教练列表加载后设置选中值
  if (mode === "edit" && data) {
    setTimeout(() => {
      setCourseField("coachId", String(data.coachId));
    }, 100);
  }

  $courseModal().hidden = false;
}

function closeCourseModal(): void {
  $courseModal().hidden = true;
}

async function handleEditCourse(id: number): Promise<void> {
  if (!isTauriShell()) return;
  const monthVal = getCourseMonth();
  setStatus("加载中...", true);
  try {
    const rows = await safeInvoke<CourseRow[]>("list_courses", { month: monthVal, coachName: null, courseName: null });
    const course = rows.find((r) => r.id === id);
    if (course) {
      openCourseModal("edit", course);
      setStatus("", false);
    } else {
      $out().textContent = `未找到课时（ID=${id}）`;
      setStatus("未找到", false);
    }
  } catch (e) {
    $out().textContent = String(e);
    setStatus("失败", false);
  }
}

async function handleSaveCourse(): Promise<void> {
  if (!isTauriShell()) return;

  const name = getCourseField("name").trim();
  if (!name) {
    $out().textContent = "课程名称不能为空。";
    return;
  }

  const idVal = getCourseField("id").trim();
  const payload = {
    id: idVal ? parseInt(idVal, 10) : null,
    coachId: parseInt(getCourseField("coachId")) || null,
    name,
    startTime: getCourseField("start").trim(),
    endTime: getCourseField("end").trim(),
    duration: parseInt(getCourseField("duration")) || 0,
    maxStudents: parseInt(getCourseField("max")) || 0,
    courseValue: parseFloat(getCourseField("value")) || 0,
    status: parseInt(getCourseField("status")) || 1,
    description: getCourseField("desc").trim(),
    memberName: getCourseField("memberName").trim(),
    memberCard: getCourseField("memberCard").trim(),
    bookingTime: getCourseField("bookingTime").trim(),
    bookingStatus: parseInt(getCourseField("bookingStatus")) || 0,
    soloFee: parseFloat(getCourseField("soloFee")) || 0,
  };

  setStatus("保存中...", true);
  try {
    const msg = await safeInvoke<string>("save_course", { payload });
    $out().textContent = msg;
    closeCourseModal();
    await loadCourses();
  } catch (e) {
    $out().textContent = String(e);
    setStatus("保存失败", false);
  }
}

async function handleDeleteCourse(id: number): Promise<void> {
  if (!isTauriShell()) return;
  if (!window.confirm(`确定要删除该课时（ID=${id}）吗？此操作不可撤销。`)) {
    return;
  }

  setStatus("删除中...", true);
  try {
    const msg = await safeInvoke<string>("delete_course", { courseId: id });
    $out().textContent = msg;
    await loadCourses();
  } catch (e) {
    $out().textContent = String(e);
    setStatus("删除失败", false);
  }
}

/* ========== 教练薪资结构 ========== */

interface CoachSalaryRow {
  id: number;
  coachId: number;
  salaryItemId: number;
  component: string;
  amount: string;
}

interface SalaryStructureItem {
  id?: number;
  component: string;
  amount: string;
  remark: string;
}

// 缓存当前编辑的教练 ID
let _editingCoachId: number | null = null;

async function loadCoachSalary(coachId: number): Promise<void> {
  _editingCoachId = coachId;
  const tbody = document.querySelector("#coach-salary-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  let rows: CoachSalaryRow[];
  let allItems: SalaryStructureItem[];
  try {
    [rows, allItems] = await Promise.all([
      safeInvoke<CoachSalaryRow[]>("list_coach_salary", { coachId }),
      safeInvoke<SalaryStructureItem[]>("list_salary_structure", {}),
    ]);
  } catch (e) {
    console.error("[coach-salary] 加载失败:", e);
    return;
  }

  // 建立 salaryItemId -> amount 的映射
  const amountMap = new Map<number, { id: number; amount: string }>();
  rows.forEach((r) => amountMap.set(r.salaryItemId, { id: r.id, amount: r.amount }));

  // 渲染所有工资结构项（每行都可编辑）
  allItems.forEach((item) => {
    const existing = amountMap.get(item.id ?? 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escHtml(item.component)}</td>
      <td><input class="ledger-cell-input" data-item-id="${item.id}" data-cs-id="${existing?.id ?? 0}" value="${escHtml(existing?.amount ?? "")}" style="width:130px" placeholder="金额"></td>
      <td>${existing ? `<button type="button" class="btn btn--sm btn--danger cs-del" data-id="${existing.id}">删除</button>` : ""}</td>`;
    tbody.appendChild(tr);
  });

  // 绑定输入框失焦保存
  tbody.querySelectorAll<HTMLInputElement>("input[data-item-id]").forEach((input) => {
    input.addEventListener("change", async () => {
      const itemId = parseInt(input.dataset.itemId || "0", 10);
      const amount = input.value;
      try {
        await safeInvoke<string>("save_coach_salary", {
          payload: { coachId, salaryItemId: itemId, amount },
        });
        // 保存成功后刷新（更新删除按钮状态）
        if (_editingCoachId) void loadCoachSalary(_editingCoachId);
      } catch (e) {
        console.error("[coach-salary] 保存失败:", e);
      }
    });
  });

  // 绑定删除
  tbody.querySelectorAll(".cs-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = parseInt((btn as HTMLElement).dataset.id || "0", 10);
      try {
        await safeInvoke<string>("delete_coach_salary", { id });
        if (_editingCoachId) void loadCoachSalary(_editingCoachId);
      } catch (e) {
        console.error("[coach-salary] 删除失败:", e);
      }
    });
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ========== 初始化 ========== */

export function initCoaches(): void {
  // 自动加载教练列表（放在最前面，确保一定执行）
  void loadCoaches();

  try {
    console.log("[coach-ui] initCoaches 开始");
    // 填充年份+月份下拉框
    populateMonthSelects($courseYear(), $courseMonth());
    console.log("[coach-ui] 月份下拉框初始化完成");

    // Tab 切换
    document.querySelectorAll<HTMLElement>("[data-coach-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.dataset.coachTab!);
      });
    });

    // --- 教练信息 ---
    document.querySelector("#btn-coach-add")!.addEventListener("click", () => {
      openCoachModal("add");
    });
    document.querySelector("#btn-coach-load")!.addEventListener("click", async () => {
      const $status = document.querySelector<HTMLSpanElement>("#coach-status")!;
      $status.textContent = "加载中…";
      try {
        const msg = await safeInvoke<string>("load_import_to_coach_course");
        $status.textContent = msg;
        void loadCoaches();
      } catch (e) {
        $status.textContent = "加载失败";
      }
    });
    document.querySelector("#btn-coach-save")!.addEventListener("click", () => {
      void handleSaveCoach();
    });
    document.querySelector("#btn-coach-modal-close")!.addEventListener("click", closeCoachModal);
    document.querySelector("#btn-coach-cancel")!.addEventListener("click", closeCoachModal);
    // 新增薪资项按钮：在表格末尾插入选择行
    document.querySelector("#btn-add-coach-salary")!.addEventListener("click", async () => {
      console.log("[coach-salary] 新增薪资项 clicked, coachId=", _editingCoachId);
      try {
        if (!_editingCoachId) { console.warn("[coach-salary] _editingCoachId is null"); return; }
        const tbody = document.querySelector("#coach-salary-tbody");
        if (!tbody) return;
        // 如果已有选择行则不重复添加
        if (tbody.querySelector(".cs-picker-row")) return;
        const allItems = await safeInvoke<SalaryStructureItem[]>("list_salary_structure", {});
        console.log("[coach-salary] allItems=", allItems);
        const existing = await safeInvoke<CoachSalaryRow[]>("list_coach_salary", { coachId: _editingCoachId });
        const existingIds = new Set(existing.map((r) => r.salaryItemId));
        const available = allItems.filter((item) => !existingIds.has(item.id ?? 0));
        console.log("[coach-salary] available=", available);
        if (available.length === 0) {
          console.log("[coach-salary] 所有薪资项已配置完毕");
          return;
        }
        const tr = document.createElement("tr");
        tr.className = "cs-picker-row";
        tr.innerHTML = `
          <td>
            <select class="input" id="cs-picker-select" style="width:100%">
              <option value="">-- 请选择薪资项 --</option>
              ${available.map((a) => `<option value="${a.id}">${escHtml(a.component)}</option>`).join("")}
            </select>
          </td>
          <td><input class="ledger-cell-input" id="cs-picker-amount" value="" style="width:130px" placeholder="金额"></td>
          <td><button type="button" class="btn btn--sm btn--primary" id="cs-picker-confirm">确认</button>
              <button type="button" class="btn btn--sm btn--danger" id="cs-picker-cancel" style="margin-left:4px">取消</button></td>`;
        tbody.appendChild(tr);
        document.querySelector("#cs-picker-confirm")!.addEventListener("click", async () => {
          const sel = document.querySelector<HTMLSelectElement>("#cs-picker-select");
          const amt = document.querySelector<HTMLInputElement>("#cs-picker-amount");
          if (!sel || !sel.value) return;
          await safeInvoke<string>("save_coach_salary", {
            payload: { coachId: _editingCoachId!, salaryItemId: parseInt(sel.value, 10), amount: amt?.value ?? "" },
          });
          void loadCoachSalary(_editingCoachId!);
        });
        document.querySelector("#cs-picker-cancel")!.addEventListener("click", () => {
          tr.remove();
        });
      } catch (e) {
        console.error("[coach-salary] 新增薪资项出错:", e);
      }
    });
    $coachModal().addEventListener("click", (e) => {
      if (e.target === $coachModal()) closeCoachModal();
    });

    // --- 课时安排 ---
    // 加载教练筛选下拉
    const $coachFilter = document.querySelector<HTMLSelectElement>("#course-filter-coach")!;
    const $courseFilter = document.querySelector<HTMLSelectElement>("#course-filter-name")!;
    async function loadCourseFilters(): Promise<void> {
      try {
        const coaches = await safeInvoke<CoachRow[]>("list_coaches");
        $coachFilter.innerHTML = '<option value="">全部</option>';
        coaches.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.name;
          opt.textContent = c.name;
          $coachFilter.appendChild(opt);
        });
        // 加载课程名下拉
        const courses = await safeInvoke<CourseRow[]>("list_courses", { month: getCourseMonth() || "", coachName: null, courseName: null });
        const names = [...new Set(courses.map((c) => c.name).filter(Boolean))];
        $courseFilter.innerHTML = '<option value="">全部</option>';
        names.forEach((n) => {
          const opt = document.createElement("option");
          opt.value = n;
          opt.textContent = n;
          $courseFilter.appendChild(opt);
        });
      } catch (e) {
        console.error("[coach-ui] loadCourseFilters 失败:", e);
      }
    }
    void loadCourseFilters();

    document.querySelector("#btn-course-add")!.addEventListener("click", () => {
      openCourseModal("add");
    });
    document.querySelector("#btn-course-query")!.addEventListener("click", () => {
      void loadCourses();
    });
    document.querySelector("#btn-course-save")!.addEventListener("click", () => {
      void handleSaveCourse();
    });
    document.querySelector("#btn-course-modal-close")!.addEventListener("click", closeCourseModal);
    document.querySelector("#btn-course-cancel")!.addEventListener("click", closeCourseModal);
    $courseModal().addEventListener("click", (e) => {
      if (e.target === $courseModal()) closeCourseModal();
    });

    // --- 导出 Excel ---
    document.querySelector("#btn-coach-export")?.addEventListener("click", () => {
      const table = document.querySelector("#coach-tbody")?.closest("table") as HTMLTableElement | null;
      if (table) exportTableToXlsx(table, "教练列表", { skipCols: [-1] });
    });
    document.querySelector("#btn-course-export")?.addEventListener("click", () => {
      const table = document.querySelector("#course-tbody")?.closest("table") as HTMLTableElement | null;
      if (table) exportTableToXlsx(table, "课程列表", { skipCols: [-1] });
    });

    // ESC 关闭所有弹窗
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$courseModal().hidden) {
        closeCourseModal();
      } else if (!$coachModal().hidden) {
        closeCoachModal();
      }
    });

    console.log("[coach-ui] initCoaches 完成");
  } catch (e) {
    console.error("[coach-ui] initCoaches 异常:", e);
  }
}
