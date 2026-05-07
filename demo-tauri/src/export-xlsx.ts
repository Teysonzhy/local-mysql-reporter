/**
 * 通用 xlsx 导出工具
 * 使用 ExcelJS 库，完整支持单元格样式、合并、边框
 * 兼容 Tauri webview 环境
 */
import type ExcelJS from "exceljs";
import { save } from "@tauri-apps/plugin-dialog";
import { safeInvoke } from "./invoke";

/** 动态加载 ExcelJS（避免阻塞主线程） */
async function loadExcelJS(): Promise<typeof ExcelJS> {
  return import("exceljs");
}

/** 将 workbook buffer 写入 Tauri 文件系统 */
async function saveWorkbook(buffer: ArrayBuffer, defaultName: string): Promise<void> {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const filePath = await save({
    defaultPath: `${defaultName}.xlsx`,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (!filePath) return;
  await safeInvoke<string>("write_file_base64", { path: filePath, dataBase64: base64 });
}

/** 边框样式对象 */
const thinBorder = { style: "thin" as const, color: { argb: "FF000000" } };

/** 给单元格设置黑色细边框 */
function setBorder(cell: ExcelJS.Cell): void {
  cell.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
}

/** 从 HTML table 元素创建 worksheet */
async function tableToSheet(wb: ExcelJS.Workbook, tableEl: HTMLTableElement, sheetName: string): Promise<void> {
  const ws = wb.addWorksheet(sheetName);

  // 克隆表格，将 input/select 的值写入 td
  const clone = tableEl.cloneNode(true) as HTMLTableElement;
  clone.querySelectorAll("input, select").forEach((el) => {
    const td = el.closest("td");
    if (td) td.textContent = (el as HTMLInputElement).value || "";
  });

  const thead = clone.querySelector("thead");
  const tbody = clone.querySelector("tbody");
  const tfoot = clone.querySelector("tfoot");
  if (!thead) return;

  // 解析表头
  const headerTr = thead.querySelector("tr");
  if (!headerTr) return;
  const ths = Array.from(headerTr.children);
  const headers: string[] = ths.map((th) => (th as HTMLElement).textContent?.trim() ?? "");

  // 找到操作列索引（包含"×"的列）
  let opCol = -1;
  const allTrs = clone.querySelectorAll("tbody tr, tfoot tr");
  for (const tr of allTrs) {
    const tds = Array.from(tr.children);
    for (let c = 0; c < tds.length; c++) {
      if ((tds[c] as HTMLElement).textContent?.trim() === "×") {
        opCol = c;
        break;
      }
    }
    if (opCol >= 0) break;
  }

  // 构建列索引（跳过操作列）
  const colIndices: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (i !== opCol) colIndices.push(i);
  }

  // 设置列宽
  for (let i = 0; i < colIndices.length; i++) {
    ws.getColumn(i + 1).width = 14;
  }

  // 构建 rowspan/colspan 占位表
  const dataSections: HTMLElement[][] = [];
  if (tbody) dataSections.push(Array.from(tbody.children) as HTMLElement[]);
  if (tfoot) dataSections.push(Array.from(tfoot.children) as HTMLElement[]);
  const allRows = dataSections.flat();
  const totalDataRows = allRows.length;
  const totalCols = colIndices.length;
  const occupied: boolean[][] = Array.from({ length: totalDataRows }, () =>
    Array(totalCols).fill(false),
  );

  // 收集合并信息（先不合并，等写完值后再合并）
  const mergeList: { r1: number; c1: number; r2: number; c2: number }[] = [];

  // 第一遍：扫描 rowspan/colspan，标记 occupied
  for (let ri = 0; ri < totalDataRows; ri++) {
    const tr = allRows[ri];
    let logicalCol = 0;
    const tds = Array.from(tr.children);
    let tdIdx = 0;

    while (logicalCol < totalCols && tdIdx < tds.length) {
      while (logicalCol < totalCols && occupied[ri][logicalCol]) logicalCol++;
      if (logicalCol >= totalCols) break;

      const td = tds[tdIdx] as HTMLElement;
      // 跳过操作列（内容为"×"的 td）
      if (td.textContent?.trim() === "×") { tdIdx++; continue; }

      const rowSpan = parseInt(td.getAttribute("rowspan") || "1", 10) || 1;
      const colSpan = parseInt(td.getAttribute("colspan") || "1", 10) || 1;

      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          const r = ri + dr, c = logicalCol + dc;
          if (r < totalDataRows && c < totalCols) {
            // 只标记后续行（被合并的行），起始行不标记
            if (dr > 0 || dc > 0) occupied[r][c] = true;
          }
        }
      }

      // 收集合并信息（Excel 行号从 1 开始，第 1 行是表头）
      if (rowSpan > 1 || colSpan > 1) {
        mergeList.push({
          r1: ri + 2, c1: logicalCol + 1,
          r2: ri + rowSpan + 1, c2: logicalCol + colSpan,
        });
      }

      logicalCol += colSpan;
      tdIdx++;
    }
  }

  // 写入表头行（第 1 行）
  const headerRow = ws.getRow(1);
  colIndices.forEach((ci, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = headers[ci];
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    setBorder(cell);
  });

  // 第二遍：写入数据行
  for (let ri = 0; ri < totalDataRows; ri++) {
    const tr = allRows[ri];
    const excelRowNum = ri + 2;
    const row = ws.getRow(excelRowNum);

    // 判断是否是小计行
    const isSubtotalRow = tr.classList.contains("expense-subtotal-row") ||
      tr.classList.contains("income-subtotal-row") ||
      (tfoot != null && tr.parentElement === tfoot);

    let logicalCol = 0;
    const tds = Array.from(tr.children);
    let tdIdx = 0;

    while (logicalCol < totalCols && tdIdx < tds.length) {
      while (logicalCol < totalCols && occupied[ri][logicalCol]) {
        const cell = row.getCell(logicalCol + 1);
        cell.value = "";
        setBorder(cell);
        if (isSubtotalRow) {
          cell.font = { bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6EAF8" } };
        }
        logicalCol++;
      }
      if (logicalCol >= totalCols) break;

      const td = tds[tdIdx] as HTMLElement;
      // 跳过操作列（内容为"×"的 td）
      if (td.textContent?.trim() === "×") { tdIdx++; continue; }

      const colSpan = parseInt(td.getAttribute("colspan") || "1", 10) || 1;
      const text = td.textContent?.trim() ?? "";

      const cell = row.getCell(logicalCol + 1);
      cell.value = text;
      setBorder(cell);

      if (isSubtotalRow) {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6EAF8" } };
      }

      logicalCol += colSpan;
      tdIdx++;
    }

    // 补齐尾部空列
    while (logicalCol < totalCols) {
      const cell = row.getCell(logicalCol + 1);
      cell.value = "";
      setBorder(cell);
      if (isSubtotalRow) {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6EAF8" } };
      }
      logicalCol++;
    }

    row.commit();
  }

  // 写完所有值后再执行合并（合并前值已写入左上角单元格）
  for (const m of mergeList) {
    ws.mergeCells(m.r1, m.c1, m.r2, m.c2);
  }
}

/**
 * 导出单个 HTML 表格为 xlsx
 */
export async function exportTableToXlsx(
  tableEl: HTMLTableElement,
  filename: string,
  options?: { skipCols?: number[]; sheetName?: string },
): Promise<void> {
  const { sheetName = "Sheet1" } = options ?? {};
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await tableToSheet(wb, tableEl, sheetName);
  const buffer = await wb.xlsx.writeBuffer();
  await saveWorkbook(buffer, filename);
}

/**
 * 导出多个表格到一个 xlsx 文件的不同 sheet
 */
export async function exportTablesToXlsx(
  tables: { el: HTMLTableElement; sheetName: string; filename: string }[],
  filename: string,
  _options?: { skipCols?: number[] },
): Promise<void> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  for (const { el, sheetName } of tables) {
    await tableToSheet(wb, el, sheetName.slice(0, 31));
  }
  const buffer = await wb.xlsx.writeBuffer();
  await saveWorkbook(buffer, filename);
}
