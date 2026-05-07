/**
 * 会员管理页面 — 交互逻辑
 * 功能：列表展示、弹窗新增/修改/查看、删除
 */

import { isTauriShell, safeInvoke } from "./invoke";
import { exportTableToXlsx } from "./export-xlsx";

/* ---------- 类型 ---------- */

interface MemberRow {
  id: number;
  cardName: string;
  phone: string;
  nameRemark: string;
  coach: string;
  remark: string;
  prevInitHours: number;
  monthNewHours: number;
  monthUsedHours: number;
  remainHours: number;
  churnNote: string;
}

/* ---------- DOM 引用 ---------- */

const $tbody = () => document.querySelector<HTMLTableSectionElement>("#member-tbody")!;
const $status = () => document.querySelector<HTMLSpanElement>("#member-status")!;
const $out = () => document.querySelector<HTMLPreElement>("#member-out")!;
const $modal = () => document.querySelector<HTMLDivElement>("#member-modal")!;
const $modalTitle = () => document.querySelector<HTMLHeadingElement>("#member-modal-title")!;

const fieldIds = {
  id: "#mf-id",
  cardName: "#mf-card-name",
  phone: "#mf-phone",
  nameRemark: "#mf-name-remark",
  coach: "#mf-coach",
  remark: "#mf-remark",
  prevInitHours: "#mf-prev-hours",
  monthNewHours: "#mf-new-hours",
  monthUsedHours: "#mf-used-hours",
  remainHours: "#mf-remain-hours",
  churnNote: "#mf-churn-note",
} as const;

type FieldKey = keyof typeof fieldIds;

function getField<K extends FieldKey>(key: K): string {
  const el = document.querySelector<HTMLInputElement>(fieldIds[key]);
  return el ? el.value : "";
}

function setField<K extends FieldKey>(key: K, value: string): void {
  const el = document.querySelector<HTMLInputElement>(fieldIds[key]);
  if (el) el.value = value;
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

/* ---------- 弹窗控制 ---------- */

function openModal(mode: "add" | "edit" | "view", data?: MemberRow): void {

  // 清空表单
  for (const key of Object.keys(fieldIds)) {
    setField(key as FieldKey, "");
  }
  setField("remainHours", "0");

  if (mode === "add") {
    $modalTitle().textContent = "新增会员";
  } else if (mode === "edit" && data) {
    $modalTitle().textContent = "修改会员";
    setField("id", String(data.id));
    setField("cardName", data.cardName);
    setField("phone", data.phone);
    setField("nameRemark", data.nameRemark);
    setField("coach", data.coach);
    setField("remark", data.remark);
    setField("remainHours", String(data.remainHours));
    setField("churnNote", data.churnNote);
  } else if (mode === "view" && data) {
    $modalTitle().textContent = "查看会员";
    setField("id", String(data.id));
    setField("cardName", data.cardName);
    setField("phone", data.phone);
    setField("nameRemark", data.nameRemark);
    setField("coach", data.coach);
    setField("remark", data.remark);
    setField("remainHours", String(data.remainHours));
    setField("churnNote", data.churnNote);
  }

  // 查看模式：所有输入框只读
  const inputs = $modal().querySelectorAll<HTMLInputElement>("input");
  inputs.forEach((inp) => {
    inp.readOnly = mode === "view";
    if (mode === "view") {
      inp.style.background = "#f1f5f9";
    } else {
      inp.style.background = "";
    }
  });

  // 保存按钮：查看模式隐藏
  const saveBtn = document.querySelector<HTMLButtonElement>("#btn-member-save")!;
  saveBtn.hidden = mode === "view";

  $modal().hidden = false;
}

function closeModal(): void {
  $modal().hidden = true;
}

/* ---------- 列表渲染 ---------- */

function renderTable(rows: MemberRow[]): void {
  const tbody = $tbody();
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="member-empty">暂无会员数据，点击「+ 新增会员」添加</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${escHtml(r.cardName)}</td>
      <td>${escHtml(r.phone)}</td>
      <td>${escHtml(r.nameRemark)}</td>
      <td>${escHtml(r.coach)}</td>
      <td>${escHtml(r.remark)}</td>
      <td class="num-col">${r.remainHours}</td>
      <td>${escHtml(r.churnNote)}</td>
      <td>
        <div class="member-actions">
          <button type="button" class="btn btn--view" data-action="view" data-id="${r.id}">查看</button>
          <button type="button" class="btn btn--edit" data-action="edit" data-id="${r.id}">修改</button>
          <button type="button" class="btn btn--del" data-action="delete" data-id="${r.id}">删除</button>
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
      if (action === "view" || action === "edit") {
        await handleViewOrEdit(action as "view" | "edit", id);
      } else if (action === "delete") {
        await handleDelete(id);
      }
    });
  });
}

function escHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ---------- 数据操作 ---------- */

function getFilter() {
  const name = (document.querySelector<HTMLInputElement>("#member-filter-name")?.value.trim()) || undefined;
  const phone = (document.querySelector<HTMLInputElement>("#member-filter-phone")?.value.trim()) || undefined;
  const coach = (document.querySelector<HTMLInputElement>("#member-filter-coach")?.value.trim()) || undefined;
  const remainMinRaw = document.querySelector<HTMLInputElement>("#member-filter-remain-min")?.value.trim();
  const remainMaxRaw = document.querySelector<HTMLInputElement>("#member-filter-remain-max")?.value.trim();
  const remainMin = remainMinRaw ? parseInt(remainMinRaw, 10) : undefined;
  const remainMax = remainMaxRaw ? parseInt(remainMaxRaw, 10) : undefined;
  return { cardName: name, phone, coach, remainMin, remainMax };
}

async function loadMembers(filter?: ReturnType<typeof getFilter>): Promise<void> {
  if (!isTauriShell()) return;
  setStatus("加载中…", true);
  try {
    const rows = await safeInvoke<MemberRow[]>("list_members", { filter: filter ?? getFilter() });
    renderTable(rows);
    setStatus(`共 ${rows.length} 条`, false);
    $out().textContent = "";
  } catch (e) {
    $out().textContent = String(e);
    setStatus("加载失败", false);
  }
}

async function handleViewOrEdit(mode: "view" | "edit", id: number): Promise<void> {
  if (!isTauriShell()) return;
  setStatus("加载中…", true);
  try {
    const data = await safeInvoke<MemberRow | null>("get_member", { memberId: id });
    if (data) {
      openModal(mode, data);
      setStatus("", false);
    } else {
      $out().textContent = `未找到会员（ID=${id}）`;
      setStatus("未找到", false);
    }
  } catch (e) {
    $out().textContent = String(e);
    setStatus("失败", false);
  }
}

async function handleSave(): Promise<void> {
  if (!isTauriShell()) return;

  const cardName = getField("cardName").trim();
  if (!cardName) {
    $out().textContent = "会员卡名称不能为空。";
    return;
  }

  const idVal = getField("id").trim();
  const payload = {
    id: idVal ? parseInt(idVal, 10) : null,
    cardName,
    phone: getField("phone").trim(),
    nameRemark: getField("nameRemark").trim(),
    coach: getField("coach").trim(),
    remark: getField("remark").trim(),
    remainHours: parseInt(getField("remainHours")) || 0,
    churnNote: getField("churnNote").trim(),
  };

  setStatus("保存中…", true);
  try {
    let msg: string;
    if (payload.id) {
      msg = await safeInvoke<string>("update_member", { payload });
    } else {
      msg = await safeInvoke<string>("create_member", { payload });
    }
    $out().textContent = msg;
    closeModal();
    await loadMembers();
  } catch (e) {
    $out().textContent = String(e);
    setStatus("保存失败", false);
  }
}

async function handleDelete(id: number): Promise<void> {
  if (!isTauriShell()) return;

  // 简单确认（使用 window.confirm）
  if (!window.confirm(`确定要删除该会员（ID=${id}）吗？此操作不可撤销。`)) {
    return;
  }

  setStatus("删除中…", true);
  try {
    const msg = await safeInvoke<string>("delete_member", { memberId: id });
    $out().textContent = msg;
    await loadMembers();
  } catch (e) {
    $out().textContent = String(e);
    setStatus("删除失败", false);
  }
}

/* ---------- 初始化 ---------- */

export function initMembers(): void {
  // 查询按钮
  document.querySelector("#btn-member-search")!.addEventListener("click", () => {
    void loadMembers();
  });

  // 重置按钮
  document.querySelector("#btn-member-search-reset")!.addEventListener("click", () => {
    (document.querySelector("#member-filter-name") as HTMLInputElement).value = "";
    (document.querySelector("#member-filter-phone") as HTMLInputElement).value = "";
    (document.querySelector("#member-filter-coach") as HTMLInputElement).value = "";
    (document.querySelector("#member-filter-remain-min") as HTMLInputElement).value = "";
    (document.querySelector("#member-filter-remain-max") as HTMLInputElement).value = "";
    void loadMembers({ cardName: undefined, phone: undefined, coach: undefined, remainMin: undefined, remainMax: undefined });
  });

  // 加载导入数据按钮
  document.querySelector("#btn-member-load")!.addEventListener("click", async () => {
    if (!isTauriShell()) return;
    setStatus("加载中…", true);
    try {
      const msg = await safeInvoke<string>("load_import_to_member");
      setStatus(msg, false);
      void loadMembers();
    } catch (e) {
      setStatus("加载失败", false);
    }
  });

  // 刷新按钮
  document.querySelector("#btn-member-refresh")!.addEventListener("click", () => {
    void loadMembers();
  });

  // 弹窗关闭
  document.querySelector("#btn-member-modal-close")!.addEventListener("click", closeModal);
  document.querySelector("#btn-member-cancel")!.addEventListener("click", closeModal);

  // 弹窗保存
  document.querySelector("#btn-member-save")!.addEventListener("click", () => {
    void handleSave();
  });

  // 点击遮罩关闭
  $modal().addEventListener("click", (e) => {
    if (e.target === $modal()) closeModal();
  });

  // ESC 关闭弹窗
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$modal().hidden) closeModal();
  });

  // 自动加载
  if (isTauriShell()) {
    void loadMembers();
  } else {
    setStatus("未在壳内", false);
  }

  // 导出 Excel
  document.querySelector("#btn-member-export")?.addEventListener("click", () => {
    const table = document.querySelector("#member-tbody")?.closest("table") as HTMLTableElement | null;
    if (table) exportTableToXlsx(table, "会员列表", { skipCols: [-1] });
  });
}
