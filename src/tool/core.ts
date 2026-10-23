// 纯函数：表头识别、金额解析、成本匹配、利润计算与汇总，不依赖界面和本机能力。
// 金额一律换算成「分」（整数）计算，导出时再除以 100，避免浮点误差。

export type Cell = string | number | boolean | Date | null;

// ---------- 表格读取辅助（CSV 解析与编码识别） ----------

/** 文本解码：优先 UTF-8（去掉 BOM），不是合法 UTF-8 时按 GBK 解（Excel 中文版导出的 CSV 常见） */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('gbk').decode(bytes);
  }
}

/** 解析 CSV：支持引号、引号内换行与逗号、两个引号转义，自动识别逗号 / 制表符 / 分号分隔 */
export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const sep = [',', '\t', ';'].map((s) => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------- 列识别 ----------

export type FieldKey = 'orderId' | 'product' | 'sku' | 'qty' | 'income' | 'commission' | 'shipping' | 'refund' | 'status';
export type CostFieldKey = 'sku' | 'product' | 'cost';

export const FIELD_LABELS: Record<FieldKey, string> = {
  orderId: '订单号', product: '商品名称', sku: '商品编码', qty: '数量', income: '实收金额',
  commission: '佣金/服务费', shipping: '运费', refund: '退款金额', status: '订单状态',
};

/** 订单表常见中文表头（按优先级排列：越靠前越优先） */
export const ORDER_SYNONYMS: Record<FieldKey, string[]> = {
  orderId: ['订单号', '订单编号', '主订单号', '主订单编号', '子订单号', '子订单编号', '订单id', '平台订单号', '外部订单号', '原始单号', '交易号', '订单'],
  product: ['商品名称', '商品名', '商品标题', '宝贝标题', '宝贝名称', '产品名称', '货品名称', '商品'],
  sku: ['商品编码', '商家编码', 'sku编码', '商家sku', 'sku', 'skuid', '货品编码', '货号', '规格编码', '商品编号', '外部编码', '款号'],
  qty: ['数量', '购买数量', '商品数量', '宝贝数量', '件数', '销售数量'],
  income: ['实收金额', '商家实收', '商家实收金额', '实付金额', '买家实付', '买家实付金额', '实付款', '实付', '结算金额', '支付金额', '订单金额', '应收金额', '成交金额'],
  commission: ['平台佣金', '佣金', '技术服务费', '平台服务费', '服务费', '平台扣点', '扣点', '手续费', '交易手续费'],
  shipping: ['运费', '快递费', '物流费', '邮费', '运费金额'],
  refund: ['退款金额', '已退款金额', '售后退款金额', '实际退款金额', '退款'],
  status: ['订单状态', '交易状态', '状态'],
};

export const COST_SYNONYMS: Record<CostFieldKey, string[]> = {
  sku: ORDER_SYNONYMS.sku,
  product: ORDER_SYNONYMS.product,
  cost: ['单件成本', '成本单价', '成本价', '单位成本', '成本', '采购价', '进货价', '进价'],
};

/** 金额、数量列不应匹配到「比例」「时间」「状态」这类表头 */
const EXCLUDE: Partial<Record<string, RegExp>> = {
  orderId: /时间|日期|状态|类型|备注|金额/,
  product: /编码|编号|id|数量|金额|价|规格|图片|链接/,
  sku: /名称|标题|数量|金额|价/,
  qty: /金额|价|比例|率/,
  income: /比例|率|时间|日期|状态|方式|单号|编号/,
  commission: /比例|率|时间|日期|状态|方式|单号|编号/,
  shipping: /比例|率|时间|日期|状态|方式|单号|编号|公司|模板|险/,
  refund: /比例|率|时间|日期|状态|方式|单号|编号|原因|说明|类型/,
  status: /时间|日期|原因|退款状态|售后/,
  cost: /比例|率|时间|日期|合计|总/,
};

/** 表头标准化：去空格、去括号里的单位（如「（元）」）、转小写 */
export function normHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s_\-:：*]/g, '')
    .toLowerCase();
}

/** 按同义词找一列：先整列名完全相同，再「表头包含同义词」；返回列序号，找不到为 -1 */
export function findColumn(header: unknown[], synonyms: string[], key: string, taken: Set<number> = new Set()): number {
  const hs = header.map(normHeader);
  for (const s of synonyms) {
    const i = hs.findIndex((h, j) => !taken.has(j) && h === s);
    if (i >= 0) return i;
  }
  const ex = EXCLUDE[key];
  for (const s of synonyms) {
    if (s.length < 2) continue;
    const i = hs.findIndex((h, j) => !taken.has(j) && h.includes(s) && !(ex && ex.test(h)));
    if (i >= 0) return i;
  }
  return -1;
}

/** 可能有多列、需要相加的字段（账单里常有「技术服务费」「达人佣金」等多项扣费） */
const MULTI = new Set(['commission']);

/** 找出所有匹配的列；其中有「合计 / 总」字样的列时只用它，避免重复扣 */
export function findAll(header: unknown[], synonyms: string[], key: string, taken: Set<number> = new Set()): number[] {
  const hs = header.map(normHeader);
  const ex = EXCLUDE[key];
  const hit = hs.map((_, j) => j).filter((j) => !taken.has(j) && hs[j] && synonyms.some((s) => hs[j] === s || (s.length >= 2 && hs[j].includes(s) && !(ex && ex.test(hs[j])))));
  const totalCol = hit.find((j) => /合计|总计|总额|小计/.test(hs[j]));
  return totalCol != null ? [totalCol] : hit;
}

/** 列号字母转序号：A→0、Z→25、AA→26 */
export function letterToIndex(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * 用户手填的列：表头名、列字母（B）或「技术服务费+达人佣金」多列相加；「无」表示不用这一列。
 * 返回列序号数组；找不到某一列时抛错并列出表头。
 */
export function resolveSpec(header: unknown[], spec: string): number[] {
  const parts = spec.split(/[+＋]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1 && /^(无|不用|没有|-)$/.test(parts[0])) return [];
  const hs = header.map((h) => String(h ?? '').trim());
  return parts.map((p) => {
    let i = hs.indexOf(p);
    if (i < 0) i = hs.findIndex((h) => normHeader(h) === normHeader(p));
    if (i < 0 && /^[A-Za-z]{1,3}$/.test(p)) {
      const k = letterToIndex(p);
      if (k < header.length) i = k;
    }
    if (i < 0) throw new Error(`找不到列「${p}」，表头是：${hs.filter(Boolean).slice(0, 15).join('、')}${hs.length > 15 ? '…' : ''}`);
    return i;
  });
}

export type ColumnMap<K extends string> = Record<K, number[]>;

/** 自动识别 + 手动覆盖。overrides 里非空的值优先 */
export function detectColumns<K extends string>(header: unknown[], synonyms: Record<K, string[]>, overrides: Partial<Record<K, string>> = {}): ColumnMap<K> {
  const keys = Object.keys(synonyms) as K[];
  const out = {} as ColumnMap<K>;
  const taken = new Set<number>();
  for (const k of keys) {
    const spec = overrides[k]?.trim();
    if (spec) {
      out[k] = resolveSpec(header, spec);
      out[k].forEach((i) => taken.add(i));
    }
  }
  for (const k of keys) {
    if (out[k]) continue;
    if (MULTI.has(k)) {
      const all = findAll(header, synonyms[k], k, taken);
      out[k] = all;
      all.forEach((i) => taken.add(i));
      continue;
    }
    const i = findColumn(header, synonyms[k], k, taken);
    out[k] = i >= 0 ? [i] : [];
    if (i >= 0) taken.add(i);
  }
  return out;
}

/** 在前 20 行里找表头行：识别出的字段最多的那一行（至少 2 个） */
export function findHeaderRow<K extends string>(grid: Cell[][], synonyms: Record<K, string[]>): number {
  let best = -1;
  let bestScore = 1;
  for (let r = 0; r < Math.min(20, grid.length); r++) {
    const row = grid[r] ?? [];
    if (!row.some((c) => typeof c === 'string' && c.trim())) continue;
    const m = detectColumns(row, synonyms);
    const score = (Object.values(m) as number[][]).filter((v) => v.length).length;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

// ---------- 数值 ----------

/** 金额转成分：支持「¥1,234.50」「-12.3」「(12.30)」「12.3元」；空值为 0，无法识别返回 null */
export function toCents(v: Cell): number | null {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  if (typeof v === 'boolean' || v instanceof Date) return null;
  let s = v.trim().replace(/[¥￥$,，\s元]/g, '');
  if (s === '' || s === '-' || s === '--') return 0;
  let neg = false;
  const paren = /^[(（](.*)[)）]$/.exec(s);
  if (paren) { neg = true; s = paren[1]; }
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return neg ? -n : n;
}

/** 数量：空值按 1 件；无法识别返回 null */
export function toQty(v: Cell): number | null {
  if (v == null || v === '') return 1;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/[,，件个\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** 单元格转文字（订单号、编码等）：数字去掉小数点后多余的 0 */
export function text(v: Cell): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  return String(v).trim();
}

/** 多列相加（分） */
function sumCents(row: Cell[], cols: number[], abs: boolean): number | null {
  let t = 0;
  for (const c of cols) {
    const v = toCents(row[c] ?? null);
    if (v == null) return null;
    t += abs ? Math.abs(v) : v;
  }
  return t;
}

/** 编码 / 商品名匹配用的标准化：去空格、全角转半角、转小写 */
export function normKey(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s+/g, '').toLowerCase();
}

// ---------- 成本表 ----------

export interface CostTable {
  bySku: Map<string, number>;
  byName: Map<string, number>;
  count: number;
}

export interface ParsedCost {
  table: CostTable;
  columns: ColumnMap<CostFieldKey>;
  header: string[];
  /** 成本写错、无法识别的行号（从 1 开始，含表头行） */
  badRows: number[];
}

export function parseCostTable(grid: Cell[][], overrides: Partial<Record<CostFieldKey, string>> = {}): ParsedCost {
  const hr = findHeaderRow(grid, COST_SYNONYMS);
  const hi = hr < 0 ? 0 : hr;
  const header = (grid[hi] ?? []).map(text);
  const columns = detectColumns(header, COST_SYNONYMS, overrides);
  if (!columns.cost.length) throw new Error(`成本表里找不到成本列（例如「单件成本」「成本价」），表头是：${header.filter(Boolean).join('、')}`);
  if (!columns.sku.length && !columns.product.length) throw new Error('成本表里需要有「商品编码 / SKU」或「商品名称」列，用来和订单对上');
  const bySku = new Map<string, number>();
  const byName = new Map<string, number>();
  const badRows: number[] = [];
  let count = 0;
  for (let r = hi + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (!row.some((c) => c != null && String(c).trim() !== '')) continue;
    const cost = sumCents(row, columns.cost, false);
    const sku = columns.sku.length ? normKey(text(row[columns.sku[0]] ?? null)) : '';
    const name = columns.product.length ? normKey(text(row[columns.product[0]] ?? null)) : '';
    if (!sku && !name) continue;
    if (cost == null) { badRows.push(r + 1); continue; }
    if (sku) bySku.set(sku, cost);
    if (name) byName.set(name, cost);
    count++;
  }
  return { table: { bySku, byName, count }, columns, header, badRows };
}

/** 找单件成本（分）：先按商品编码，再按商品名称；都没有返回 null */
export function lookupCost(cost: CostTable | null, sku: string, name: string): number | null {
  if (!cost) return null;
  if (sku) {
    const v = cost.bySku.get(normKey(sku));
    if (v != null) return v;
  }
  if (name) {
    const v = cost.byName.get(normKey(name));
    if (v != null) return v;
  }
  return null;
}

// ---------- 订单表 ----------

export interface OrderLine {
  source: string;
  /** 原表里的行号（从 1 开始） */
  rowNo: number;
  orderId: string;
  product: string;
  sku: string;
  qty: number;
  income: number;
  commission: number;
  shipping: number;
  refund: number;
  status: string;
}

export interface ParsedOrders {
  lines: OrderLine[];
  columns: ColumnMap<FieldKey>;
  header: string[];
  headerRow: number;
  /** 因订单状态被跳过的行数 */
  skipped: number;
  /** 金额写错、无法识别的行号 */
  badRows: number[];
}

export const CANCELLED = /取消|关闭|未付款|待付款|待支付|未支付|已失效/;

/**
 * 解析一张订单 / 账单表。headerRow 为 0 时自动找表头行。
 * 佣金、运费、退款一律按绝对值当作支出（有的账单把扣款写成负数）。
 */
export function parseOrders(source: string, grid: Cell[][], opts: { headerRow?: number; overrides?: Partial<Record<FieldKey, string>>; skipCancelled?: boolean } = {}): ParsedOrders {
  const hi = opts.headerRow && opts.headerRow > 0 ? opts.headerRow - 1 : findHeaderRow(grid, ORDER_SYNONYMS);
  if (hi < 0) throw new Error('没找到表头：前 20 行里没有「订单号」「实付金额」这类列名。请在参数里填「表头在第几行」或手动指定列名');
  const header = (grid[hi] ?? []).map(text);
  const columns = detectColumns(header, ORDER_SYNONYMS, opts.overrides);
  if (!columns.income.length) throw new Error(`找不到实收金额列，表头是：${header.filter(Boolean).slice(0, 15).join('、')}。请打开「手动指定列名」填写`);
  if (!columns.sku.length && !columns.product.length) throw new Error('找不到「商品编码」或「商品名称」列，无法匹配成本。请打开「手动指定列名」填写');
  const lines: OrderLine[] = [];
  const badRows: number[] = [];
  let skipped = 0;
  const first = (row: Cell[], k: FieldKey) => (columns[k].length ? text(row[columns[k][0]] ?? null) : '');
  for (let r = hi + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (!row.some((c) => c != null && String(c).trim() !== '')) continue;
    const orderId = first(row, 'orderId');
    const product = first(row, 'product');
    const sku = first(row, 'sku');
    // 合计行、说明行：没有订单号也没有商品
    if (!orderId && !product && !sku) continue;
    if (/^(合计|总计|小计)/.test(orderId || product)) continue;
    const status = first(row, 'status');
    if (opts.skipCancelled && status && CANCELLED.test(status)) { skipped++; continue; }
    const income = sumCents(row, columns.income, false);
    const commission = sumCents(row, columns.commission, true);
    const shipping = sumCents(row, columns.shipping, true);
    const refund = sumCents(row, columns.refund, true);
    const qty = columns.qty.length ? toQty(row[columns.qty[0]] ?? null) : 1;
    if (income == null || commission == null || shipping == null || refund == null || qty == null) { badRows.push(r + 1); continue; }
    lines.push({ source, rowNo: r + 1, orderId, product, sku, qty, income, commission, shipping, refund, status });
  }
  return { lines, columns, header, headerRow: hi + 1, skipped, badRows };
}

/** 识别结果说明：「订单号=订单编号，实收金额=买家实付…」 */
export function describeColumns<K extends string>(columns: ColumnMap<K>, header: string[], labels: Record<K, string>): string {
  return (Object.keys(labels) as K[])
    .filter((k) => columns[k]?.length)
    .map((k) => `${labels[k]}=${columns[k].map((i) => header[i] || `第${i + 1}列`).join('+')}`)
    .join('，');
}

export function missingFields(columns: ColumnMap<FieldKey>): string[] {
  return (Object.keys(FIELD_LABELS) as FieldKey[]).filter((k) => !columns[k].length).map((k) => FIELD_LABELS[k]);
}

// ---------- 计算 ----------

export interface ProfitLine extends OrderLine {
  /** 单件成本（分），找不到为 null */
  unitCost: number | null;
  goodsCost: number;
  fixedCost: number;
  profit: number;
}

/**
 * 每单利润 = 实收 − 佣金 − 退款 − 运费 − 单件成本×数量 − 每单固定成本。
 * 每单固定成本（包装、快递）按「来源文件 + 订单号」每单只扣一次，算在该订单的第一行；没有订单号时每行算一单。
 */
export function computeProfit(lines: OrderLine[], cost: CostTable | null, perOrderCents: number): ProfitLine[] {
  const seen = new Set<string>();
  return lines.map((l) => {
    const unitCost = lookupCost(cost, l.sku, l.product);
    const goodsCost = unitCost == null ? 0 : Math.round(unitCost * l.qty);
    const key = l.orderId ? `${l.source}\u0000${l.orderId}` : `${l.source}\u0000#${l.rowNo}`;
    const fixedCost = seen.has(key) ? 0 : perOrderCents;
    seen.add(key);
    const profit = l.income - l.commission - l.refund - l.shipping - goodsCost - fixedCost;
    return { ...l, unitCost, goodsCost, fixedCost, profit };
  });
}

export interface Summary {
  key: string;
  label: string;
  orders: number;
  lines: number;
  qty: number;
  income: number;
  commission: number;
  refund: number;
  shipping: number;
  goodsCost: number;
  fixedCost: number;
  profit: number;
  missingCost: number;
}

function emptySummary(key: string, label: string): Summary {
  return { key, label, orders: 0, lines: 0, qty: 0, income: 0, commission: 0, refund: 0, shipping: 0, goodsCost: 0, fixedCost: 0, profit: 0, missingCost: 0 };
}

/** 按某个键汇总，保持首次出现的顺序 */
export function summarize(lines: ProfitLine[], keyOf: (l: ProfitLine) => [string, string]): Summary[] {
  const map = new Map<string, Summary>();
  const orderSets = new Map<string, Set<string>>();
  for (const l of lines) {
    const [key, label] = keyOf(l);
    let s = map.get(key);
    if (!s) { s = emptySummary(key, label); map.set(key, s); orderSets.set(key, new Set()); }
    orderSets.get(key)!.add(l.orderId ? `${l.source}\u0000${l.orderId}` : `${l.source}\u0000#${l.rowNo}`);
    s.lines++;
    s.qty += l.qty;
    s.income += l.income;
    s.commission += l.commission;
    s.refund += l.refund;
    s.shipping += l.shipping;
    s.goodsCost += l.goodsCost;
    s.fixedCost += l.fixedCost;
    s.profit += l.profit;
    if (l.unitCost == null) s.missingCost++;
  }
  for (const [k, s] of map) s.orders = orderSets.get(k)!.size;
  return [...map.values()];
}

export const byProduct = (l: ProfitLine): [string, string] => {
  const k = l.sku ? `sku:${normKey(l.sku)}` : `name:${normKey(l.product)}`;
  return [k, l.product || l.sku];
};
export const bySource = (l: ProfitLine): [string, string] => [l.source, l.source];

export function total(lines: ProfitLine[]): Summary {
  return summarize(lines, () => ['all', '总计'])[0] ?? emptySummary('all', '总计');
}

/** 利润率：利润 ÷ 实收；实收为 0 时返回 null */
export const margin = (profit: number, income: number): number | null => (income > 0 ? Math.round((profit / income) * 10000) / 10000 : null);

/** 分 → 元（数值，保留两位） */
export const yuan = (cents: number) => cents / 100;

/** 文件名里不能出现的字符替换掉 */
export function safeName(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/^\.+/, '_').trim();
  return (cleaned || '未命名').slice(0, 80);
}

/** 文件名是否表示成本表 */
export function isCostFile(name: string, keyword: string): boolean {
  const k = keyword.trim();
  return !!k && name.replace(/\.[^.]+$/, '').includes(k);
}

/** CSV 里的文本数字转成数值；以 0 开头的编号和超过 15 位的长数字（订单号）保持文本 */
export function numeric(v: string): Cell {
  const t = v.trim();
  return /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(t) && t.replace(/[-.]/g, '').length <= 15 ? Number(t) : v;
}
