const pptxgen = require("pptxgenjs");
const fs = require("fs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Demo";
pres.title = "项目沟通会";

// ============================================================
// SLIDE DIMENSIONS
// ============================================================
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.6;
const CX = SLIDE_W / 2;
const CY = SLIDE_H / 2;

// ============================================================
// COLOR PALETTE - Teal Trust
// ============================================================
const C = {
  primary: "028090",
  secondary: "00A896",
  accent: "02C39A",
  dark: "1A3C40",
  text: "2C3E50",
  light: "E8F6F3",
  white: "FFFFFF",
  gray: "95A5A6",
  bg: "F7FDFC",
  warn: "E74C3C",
  good: "27AE60",
  orange: "F39C12",
};

// ============================================================
// CONTAINER SYSTEM
// ============================================================
function createVirtualNode(type, data, parentX = 0, parentY = 0) {
  const opts = data.opts || {};
  const node = {
    type, data,
    absX: parentX + (opts.x || 0),
    absY: parentY + (opts.y || 0),
    w: opts.w || 0, h: opts.h || 0,
    children: []
  };
  node.addShape = function(shapeType, opts = {}) {
    const child = createVirtualNode('shape', { shapeType, opts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addText = function(text, opts = {}) {
    const safeOpts = { fit: "shrink", ...opts };
    const child = createVirtualNode('text', { text, opts: safeOpts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addImage = function(opts = {}) {
    const child = createVirtualNode('image', { opts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addTable = function(tableData, opts = {}) {
    const child = createVirtualNode('table', { tableData, opts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  return node;
}

function flattenNode(node, realSlide, pres) {
  const absOpts = { ...node.data.opts, x: node.absX, y: node.absY };
  if (node.type === 'shape') realSlide.addShape(node.data.shapeType, absOpts);
  else if (node.type === 'text') realSlide.addText(node.data.text, absOpts);
  else if (node.type === 'image') realSlide.addImage(absOpts);
  else if (node.type === 'table') realSlide.addTable(node.data.tableData, absOpts);
  node.children.forEach(child => flattenNode(child, realSlide, pres));
}

const originalAddSlide = pres.addSlide.bind(pres);
pres.addSlide = function(options) {
  const realSlide = originalAddSlide(options);
  const virtualSlide = {
    children: [],
    _realSlide: realSlide,
    set background(val) { realSlide.background = val; },
    get background() { return realSlide.background; },
    addShape: function(shapeType, opts = {}) {
      const node = createVirtualNode('shape', { shapeType, opts }, 0, 0);
      this.children.push(node);
      return node;
    },
    addText: function(text, opts = {}) {
      const safeOpts = { fit: "shrink", ...opts };
      const node = createVirtualNode('text', { text, opts: safeOpts }, 0, 0);
      this.children.push(node);
      return node;
    },
    addImage: function(opts = {}) {
      const node = createVirtualNode('image', { opts }, 0, 0);
      this.children.push(node);
      return node;
    },
    addTable: function(tableData, opts = {}) {
      const node = createVirtualNode('table', { tableData, opts }, 0, 0);
      this.children.push(node);
      return node;
    },
    addChart: function(chartType, data, opts = {}) {
      realSlide.addChart(chartType, data, opts);
    },
    render: function() {
      this.children.forEach(child => flattenNode(child, realSlide, pres));
    }
  };
  return virtualSlide;
};

// ============================================================
// HELPERS
// ============================================================
function addFooter(slide, num) {
  slide.addText(`项目沟通会  |  ${num}`, {
    x: 0.6, y: SLIDE_H - 0.4, w: 3, h: 0.3,
    fontSize: 9, color: C.gray, fontFace: "Calibri"
  });
}

function makeCard(slide, x, y, w, h, title, body, color) {
  const card = slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: C.white },
    shadow: { type: "outer", blur: 6, offset: 2, color: "00000015" },
    rectRadius: 0.1,
  });
  // 左侧色条
  card.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.06, h,
    fill: { color },
  });
  card.addText(title, {
    x: 0.2, y: 0.15, w: w - 0.4, h: 0.35,
    fontSize: 14, bold: true, color, fontFace: "Arial Black",
  });
  card.addText(body, {
    x: 0.2, y: 0.55, w: w - 0.4, h: h - 0.7,
    fontSize: 11, color: C.text, fontFace: "Calibri",
    lineSpacingMultiple: 1.3,
    autoFit: false, fit: "none",
  });
  return card;
}

// ============================================================
// SLIDE 1: 封面
// ============================================================
let s1 = pres.addSlide();
s1.background = { color: C.primary };
// 装饰条
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: 0.08, fill: { color: C.accent } });
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: SLIDE_H - 0.08, w: SLIDE_W, h: 0.08, fill: { color: C.accent } });
// 标题
s1.addText("项目沟通会", {
  x: 1, y: 1.2, w: 8, h: 1.2,
  fontSize: 44, bold: true, color: C.white, fontFace: "Arial Black",
  align: "center",
});
s1.addText("财务管理系统 Demo 阶段总结与待确认事项", {
  x: 1.5, y: 2.5, w: 7, h: 0.6,
  fontSize: 18, color: C.light, fontFace: "Calibri",
  align: "center",
});
// 分隔线
s1.addShape(pres.shapes.RECTANGLE, {
  x: 3.5, y: 3.3, w: 3, h: 0.03, fill: { color: C.accent },
});
s1.addText("2026 年 4 月", {
  x: 1.5, y: 3.6, w: 7, h: 0.5,
  fontSize: 14, color: C.light, fontFace: "Calibri",
  align: "center",
});
s1.render();

// ============================================================
// SLIDE 2: 目录
// ============================================================
let s2 = pres.addSlide();
s2.background = { color: C.bg };
s2.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: 0.06, fill: { color: C.primary } });
s2.addText("会议议题", {
  x: 0.6, y: 0.4, w: 4, h: 0.7,
  fontSize: 32, bold: true, color: C.dark, fontFace: "Arial Black",
});

const agendaItems = [
  { num: "01", title: "程序交付方式", desc: "Web 本地模式 / Web 云服务模式 / 桌面客户端", color: C.primary },
  { num: "02", title: "数据导入方案", desc: "单表导入 vs 模版导入的稳定性与灵活性权衡", color: C.secondary },
  { num: "03", title: "当前进度与待测试项", desc: "已实现功能概览、已知问题与后续计划", color: C.accent },
];

agendaItems.forEach((item, i) => {
  const y = 1.5 + i * 1.2;
  // 编号圆
  s2.addShape(pres.shapes.OVAL, {
    x: 1, y: y, w: 0.6, h: 0.6,
    fill: { color: item.color },
  });
  s2.addText(item.num, {
    x: 1, y: y, w: 0.6, h: 0.6,
    fontSize: 18, bold: true, color: C.white, fontFace: "Arial Black",
    align: "center", valign: "middle",
  });
  // 标题
  s2.addText(item.title, {
    x: 1.9, y: y - 0.05, w: 6, h: 0.35,
    fontSize: 18, bold: true, color: C.dark, fontFace: "Arial Black",
  });
  // 描述
  s2.addText(item.desc, {
    x: 1.9, y: y + 0.3, w: 6, h: 0.3,
    fontSize: 12, color: C.gray, fontFace: "Calibri",
  });
});
addFooter(s2, "目录");
s2.render();

// ============================================================
// SLIDE 3: 程序交付方式
// ============================================================
let s3 = pres.addSlide();
s3.background = { color: C.bg };
s3.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: 0.06, fill: { color: C.primary } });
s3.addText("议题一：程序交付方式", {
  x: 0.6, y: 0.3, w: 6, h: 0.6,
  fontSize: 28, bold: true, color: C.dark, fontFace: "Arial Black",
});
s3.addText("需要确认系统的部署形态，不同方式各有优劣", {
  x: 0.6, y: 0.85, w: 8, h: 0.35,
  fontSize: 12, color: C.gray, fontFace: "Calibri",
});

// 三列卡片
const cardW = 2.7;
const cardH = 3.6;
const cardGap = 0.25;
const cardStartX = 0.6;
const cardY = 1.4;

makeCard(s3, cardStartX, cardY, cardW, cardH,
  "🖥️  Web 本地模式",
  "✅ 优点\n• 无需安装，浏览器直接打开\n• 跨平台（Windows/Mac/Linux）\n• 升级只需替换文件\n\n❌ 缺点\n• 依赖本地运行环境\n• 数据存储在本地，需自行备份\n• 离线使用，无法多人协作",
  C.primary
);

makeCard(s3, cardStartX + cardW + cardGap, cardY, cardW, cardH,
  "☁️  Web 云服务模式",
  "✅ 优点\n• 随时随地访问，多设备同步\n• 数据集中存储，安全可控\n• 支持多人协作\n\n❌ 缺点\n• 需要服务器和运维成本\n• 依赖网络连接\n• 数据隐私需额外保障",
  C.secondary
);

makeCard(s3, cardStartX + (cardW + cardGap) * 2, cardY, cardW, cardH,
  "📦  桌面客户端",
  "✅ 优点\n• 原生性能，体验流畅\n• 数据本地存储，隐私性好\n• 可离线使用\n\n❌ 缺点\n• 需要安装和更新\n• 跨平台适配成本高\n• 无法多人协作",
  C.accent
);

addFooter(s3, "议题一");
s3.render();

// ============================================================
// SLIDE 4: 数据导入方案
// ============================================================
let s4 = pres.addSlide();
s4.background = { color: C.bg };
s4.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: 0.06, fill: { color: C.primary } });
s4.addText("议题二：数据导入方案", {
  x: 0.6, y: 0.3, w: 6, h: 0.6,
  fontSize: 28, bold: true, color: C.dark, fontFace: "Arial Black",
});
s4.addText("选择数据录入方式，影响长期维护成本", {
  x: 0.6, y: 0.85, w: 8, h: 0.35,
  fontSize: 12, color: C.gray, fontFace: "Calibri",
});

// 左右对比
const leftX = 0.6;
const rightX = 5.1;
const compW = 4.3;
const compH = 3.8;

// 方案 A
let cardA = s4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: leftX, y: 1.4, w: compW, h: compH,
  fill: { color: C.white },
  shadow: { type: "outer", blur: 6, offset: 2, color: "00000015" },
  rectRadius: 0.1,
});
cardA.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: compW, h: 0.5, fill: { color: C.primary }, rectRadius: 0.1 });
cardA.addText("方案 A：按数据库单表导入", {
  x: 0.2, y: 0.05, w: compW - 0.4, h: 0.4,
  fontSize: 15, bold: true, color: C.white, fontFace: "Arial Black",
});
cardA.addText(
  "✅ 优点\n• 结构稳定，不受模版变化影响\n• 数据校验严格，质量有保障\n• 长期维护成本低\n\n❌ 缺点\n• 需要手工整理数据到标准格式\n• 初期工作量大\n• 对操作人员有一定技术要求",
  {
    x: 0.25, y: 0.6, w: compW - 0.5, h: compH - 0.8,
    fontSize: 11, color: C.text, fontFace: "Calibri",
    lineSpacingMultiple: 1.3, autoFit: false, fit: "none",
  }
);

// 方案 B
let cardB = s4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: rightX, y: 1.4, w: compW, h: compH,
  fill: { color: C.white },
  shadow: { type: "outer", blur: 6, offset: 2, color: "00000015" },
  rectRadius: 0.1,
});
cardB.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: compW, h: 0.5, fill: { color: C.orange }, rectRadius: 0.1 });
cardB.addText("方案 B：按现有模版导入", {
  x: 0.2, y: 0.05, w: compW - 0.4, h: 0.4,
  fontSize: 15, bold: true, color: C.white, fontFace: "Arial Black",
});
cardB.addText(
  "✅ 优点\n• 直接使用现有 Excel 模版\n• 操作简单，上手快\n• 初期工作量小\n\n❌ 缺点\n• 模版一旦调整，导入逻辑需重写\n• 模版格式不规范会导致数据错误\n• 长期维护成本高，风险大",
  {
    x: 0.25, y: 0.6, w: compW - 0.5, h: compH - 0.8,
    fontSize: 11, color: C.text, fontFace: "Calibri",
    lineSpacingMultiple: 1.3, autoFit: false, fit: "none",
  }
);

// VS 标记
s4.addShape(pres.shapes.OVAL, {
  x: CX - 0.25, y: 2.9, w: 0.5, h: 0.5,
  fill: { color: C.warn },
});
s4.addText("VS", {
  x: CX - 0.25, y: 2.9, w: 0.5, h: 0.5,
  fontSize: 11, bold: true, color: C.white, fontFace: "Arial Black",
  align: "center", valign: "middle",
});

addFooter(s4, "议题二");
s4.render();

// ============================================================
// SLIDE 5: 当前进度与待测试项
// ============================================================
let s5 = pres.addSlide();
s5.background = { color: C.bg };
s5.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: 0.06, fill: { color: C.primary } });
s5.addText("议题三：当前进度与待测试项", {
  x: 0.6, y: 0.3, w: 8, h: 0.6,
  fontSize: 28, bold: true, color: C.dark, fontFace: "Arial Black",
});

// 已完成功能
const doneItems = [
  "会员管理 — CRUD + 导入",
  "教练管理 — 教练/课程/约课/课时费",
  "财务月报 — 支出/收入/纯利/公司账户",
  "常规报表 — 授课日记/日常开支/体验课/请假",
  "数据导入 — CSV/xlsx 通用导入",
];

s5.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 0.6, y: 1.2, w: 4.2, h: 3.8,
  fill: { color: C.white },
  shadow: { type: "outer", blur: 6, offset: 2, color: "00000015" },
  rectRadius: 0.1,
});
s5.addText("✅ 已完成功能", {
  x: 0.8, y: 1.3, w: 3.8, h: 0.4,
  fontSize: 16, bold: true, color: C.good, fontFace: "Arial Black",
});

doneItems.forEach((item, i) => {
  s5.addText(`▸  ${item}`, {
    x: 1.0, y: 1.8 + i * 0.55, w: 3.6, h: 0.45,
    fontSize: 12, color: C.text, fontFace: "Calibri",
  });
});

// 待测试项
const todoItems = [
  "各模块数据增删改查全流程",
  "月份切换与数据筛选",
  "课时费计算与结算逻辑",
  "财务月报继承功能",
  "边界情况（空数据、特殊字符）",
  "数据导入格式兼容性",
];

s5.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 5.2, y: 1.2, w: 4.2, h: 3.8,
  fill: { color: C.white },
  shadow: { type: "outer", blur: 6, offset: 2, color: "00000015" },
  rectRadius: 0.1,
});
s5.addText("🔍 待测试 / 待确认", {
  x: 5.4, y: 1.3, w: 3.8, h: 0.4,
  fontSize: 16, bold: true, color: C.orange, fontFace: "Arial Black",
});

todoItems.forEach((item, i) => {
  s5.addText(`▸  ${item}`, {
    x: 5.6, y: 1.8 + i * 0.55, w: 3.6, h: 0.45,
    fontSize: 12, color: C.text, fontFace: "Calibri",
  });
});

addFooter(s5, "议题三");
s5.render();

// ============================================================
// SLIDE 6: 结束页
// ============================================================
let s6 = pres.addSlide();
s6.background = { color: C.primary };
s6.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: 0.08, fill: { color: C.accent } });
s6.addShape(pres.shapes.RECTANGLE, { x: 0, y: SLIDE_H - 0.08, w: SLIDE_W, h: 0.08, fill: { color: C.accent } });

s6.addText("下一步计划", {
  x: 1, y: 1.0, w: 8, h: 0.8,
  fontSize: 36, bold: true, color: C.white, fontFace: "Arial Black",
  align: "center",
});

const nextSteps = [
  "1. 确认程序交付方式（Web / 客户端）",
  "2. 确认数据导入方案（单表 / 模版）",
  "3. 全面功能测试与 Bug 修复",
  "4. 根据反馈迭代优化",
];

nextSteps.forEach((step, i) => {
  s6.addText(step, {
    x: 2.5, y: 2.0 + i * 0.55, w: 5, h: 0.45,
    fontSize: 16, color: C.light, fontFace: "Calibri",
    align: "center",
  });
});

s6.addShape(pres.shapes.RECTANGLE, {
  x: 3.5, y: 4.4, w: 3, h: 0.03, fill: { color: C.accent },
});
s6.addText("感谢您的反馈与建议", {
  x: 1.5, y: 4.6, w: 7, h: 0.5,
  fontSize: 14, color: C.light, fontFace: "Calibri",
  align: "center",
});
s6.render();

// ============================================================
// SAVE
// ============================================================
const outPath = "/sessions/69e8324fe6cf3c9b2576c7e7/workspace/demo-tauri/项目沟通会.pptx";
pres.writeFile({ fileName: outPath }).then(() => {
  console.log("PPT saved to:", outPath);
}).catch(err => {
  console.error("Error:", err);
});
