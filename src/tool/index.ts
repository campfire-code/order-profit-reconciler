// 工具声明：多平台订单利润对账
import { Calculator as CalculatorAsIcon } from 'lucide-react';
import type { BatchTool, Field, Params, RunContext } from '../kit/types';
import {
  FIELD_LABELS, byProduct, bySource, computeProfit, describeColumns, isCostFile, margin, missingFields, parseCostTable, parseOrders,
  safeName, summarize, total, yuan, type Cell, type CostTable, type FieldKey, type OrderLine, type ProfitLine, type Summary,
} from './core';
import { readSheets, writeXlsx, type ColFmt, type OutSheet } from './xlsx';
import { Empty } from './Empty';
import { ResultBody } from './Result';

type Data = { kind: 'cost'; table: CostTable; file: string; how: string } | { kind: 'orders'; lines: OrderLine[]; file: string; how: string };

const manual = (p: Params) => p.manual === true;
const PLACEHOLDER: Record<FieldKey, string> = {
  orderId: '例如「订单编号」', product: '例如「商品名称」', sku: '例如「商家编码」', qty: '例如「购买数量」',
  income: '例如「买家实付」', commission: '例如「技术服务费+达人佣金」', shipping: '不扣运费就填「无」', refund: '例如「退款金额」', status: '例如「订单状态」',
};
const columnFields: Field[] = (Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => ({
  key: `col_${k}`, label: `${FIELD_LABELS[k]}列`, type: 'text', default: '', placeholder: PLACEHOLDER[k], when: manual,
}));

function overrides(p: Params): Partial<Record<FieldKey, string>> {
  if (!manual(p)) return {};
  return Object.fromEntries((Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => [k, String(p[`col_${k}`] ?? '')]));
}

const money = (c: number) => yuan(c);
const MONEY_COLS = ['实收', '佣金/服务费', '退款', '运费', '商品成本', '每单固定成本', '利润'];

function summaryRows(list: Summary[], firstCols: (s: Summary) => Cell[]): Cell[][] {
  return list.map((s) => [
    ...firstCols(s), s.orders, s.qty, money(s.income), money(s.commission), money(s.refund), money(s.shipping),
    money(s.goodsCost), money(s.fixedCost), money(s.profit), margin(s.profit, s.income), s.missingCost,
  ]);
}
const SUMMARY_HEAD = ['订单数', '数量', ...MONEY_COLS, '利润率', '缺成本行数'];
const SUMMARY_FMT: ColFmt[] = ['int', 'int', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'pct', 'int'];

export function buildWorkbook(lines: ProfitLine[], skippedNote: string, recognized: [string, string, string][] = []): OutSheet[] {
  const detail: OutSheet = {
    name: '订单明细',
    header: ['来源文件', '原表行号', '订单号', '商品名称', '商品编码', '订单状态', '数量', '实收', '佣金/服务费', '退款', '运费', '单件成本', '商品成本', '每单固定成本', '利润', '利润率', '备注'],
    formats: ['text', 'int', 'text', 'text', 'text', 'text', 'int', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'pct', 'text'],
    rows: lines.map((l) => [
      l.source, l.rowNo, l.orderId, l.product, l.sku, l.status, l.qty, money(l.income), money(l.commission), money(l.refund), money(l.shipping),
      l.unitCost == null ? null : money(l.unitCost), money(l.goodsCost), money(l.fixedCost), money(l.profit), margin(l.profit, l.income),
      l.unitCost == null ? '缺成本（按 0 计算，利润偏高）' : '',
    ]),
  };
  const products = summarize(lines, byProduct).sort((a, b) => b.profit - a.profit);
  const firstOf = new Map<string, ProfitLine>();
  for (const l of lines) if (!firstOf.has(byProduct(l)[0])) firstOf.set(byProduct(l)[0], l);
  const byProd: OutSheet = {
    name: '按商品汇总',
    header: ['商品编码', '商品名称', ...SUMMARY_HEAD],
    formats: ['text', 'text', ...SUMMARY_FMT],
    rows: summaryRows(products, (s) => {
      const l = firstOf.get(s.key)!;
      return [l.sku, l.product];
    }),
  };
  const sources = summarize(lines, bySource);
  const t = total(lines);
  const bySrc: OutSheet = {
    name: '按来源文件汇总',
    header: ['来源文件（平台/店铺）', ...SUMMARY_HEAD],
    formats: ['text', ...SUMMARY_FMT],
    rows: [...summaryRows(sources, (s) => [s.label]), ...summaryRows([t], () => ['合计'])],
    boldLast: true,
  };
  const totals: OutSheet = {
    name: '总计',
    header: ['项目', '数值'],
    rowFormats: ['int', 'int', 'int', 'money', 'money', 'money', 'money', 'money', 'money', 'money', undefined, 'int', undefined],
    rows: [
      ['订单数', t.orders], ['订单行数', t.lines], ['商品数量', t.qty],
      ['实收合计（元）', money(t.income)], ['佣金/服务费合计（元）', money(t.commission)], ['退款合计（元）', money(t.refund)],
      ['运费合计（元）', money(t.shipping)], ['商品成本合计（元）', money(t.goodsCost)], ['每单固定成本合计（元）', money(t.fixedCost)],
      ['利润合计（元）', money(t.profit)], ['利润率', margin(t.profit, t.income) == null ? '—' : `${(margin(t.profit, t.income)! * 100).toFixed(1)}%`],
      ['缺成本的订单行', t.missingCost], ['说明', skippedNote || '无'],
    ],
  };
  const cols: OutSheet = { name: '列识别', header: ['文件', '类型', '识别到的列'], rows: recognized };
  return [totals, detail, byProd, bySrc, cols];
}

async function load(ctx: RunContext, path: string, name: string) {
  const sheets = (await readSheets(await ctx.readFile(path), name)).filter((s) => s.grid.some((r) => r.length));
  if (!sheets.length) throw new Error('表格是空的');
  return sheets;
}

const tool: BatchTool = {
  id: 'e11',
  name: '多平台订单利润对账',
  tagline: '拖入各平台导出的订单 / 账单表和一张成本表（文件名带「成本」），自动认列，扣掉佣金、退款、运费、商品成本后算出每单真实利润，导出 Excel。',
  icon: CalculatorAsIcon,
  category: '电商运营',
  type: 'data',
  mode: 'batch',
  resultView: 'list',
  Empty,
  ResultBody,
  concurrency: 1,
  accept: { label: '订单表和成本表', extensions: ['xlsx', 'csv', 'xls'] },
  params: [
    { key: 'costKeyword', label: '成本表文件名包含', type: 'text', default: '成本', help: '文件名带这几个字的表当作成本表（商品编码或名称 + 单件成本），其他都当订单表' },
    { key: 'perOrder', label: '每单包装/快递成本', type: 'number', default: 0, min: 0, max: 1000, step: 0.1, unit: '元', help: '每个订单固定多扣的钱，一单只扣一次' },
    { key: 'skipCancelled', label: '跳过已取消、已关闭的订单', type: 'toggle', default: true },
    { key: 'headerRow', label: '表头在第几行', type: 'number', default: 0, min: 0, max: 50, help: '填 0 自动识别；表格上方有标题行且没认出来时再改' },
    { key: 'manual', label: '手动指定列名', type: 'toggle', default: false, help: '自动认列不对时打开，只填需要改的列；多列相加用 +，不用某列填「无」' },
    ...columnFields,
    { key: 'col_cost', label: '成本表的成本列', type: 'text', default: '', placeholder: '例如「采购价」', when: manual },
    { key: 'outName', label: '导出文件名', type: 'text', default: '利润对账' },
    { key: 'out', label: '保存到', type: 'folder', default: '' },
  ],
  check: (item) => (/\.xls$/i.test(item.name) ? '旧版 .xls 格式不支持，请用 Excel 或 WPS 另存为 .xlsx 后再拖进来' : null),

  async run(item, ctx) {
    const p = ctx.params;
    const sheets = await load(ctx, item.path!, item.name);
    ctx.progress(0.5);
    if (isCostFile(item.name, String(p.costKeyword))) {
      const costOverride = manual(p) && String(p.col_cost).trim() ? { cost: String(p.col_cost) } : {};
      let err: unknown;
      for (const s of sheets) {
        try {
          const c = parseCostTable(s.grid, costOverride);
          if (!c.table.count) throw new Error('成本表里没有数据行');
          const bad = c.badRows.length ? `，第 ${c.badRows.slice(0, 5).join('、')}${c.badRows.length > 5 ? ' 等' : ''} 行成本无法识别已忽略` : '';
          const how = [c.columns.sku.length && `编码=${c.header[c.columns.sku[0]]}`, c.columns.product.length && `名称=${c.header[c.columns.product[0]]}`, `成本=${c.columns.cost.map((i) => c.header[i]).join('+')}`].filter(Boolean).join('，');
          return { summary: `成本表：${c.table.count} 个商品${bad}`, data: { kind: 'cost', table: c.table, file: item.name, how } satisfies Data };
        } catch (e) {
          err ??= e;
        }
      }
      throw err;
    }
    let err: unknown;
    for (const s of sheets) {
      try {
        const r = parseOrders(item.name.replace(/\.[^.]+$/, ''), s.grid, { headerRow: Number(p.headerRow), overrides: overrides(p), skipCancelled: Boolean(p.skipCancelled) });
        if (!r.lines.length) throw new Error(r.skipped ? `全部 ${r.skipped} 行都是已取消 / 已关闭的订单` : '表头下面没有订单数据');
        const miss = missingFields(r.columns).filter((f) => f !== '商品编码' && f !== '商品名称');
        const parts = [`订单 ${r.lines.length} 行`];
        if (r.skipped) parts.push(`跳过已取消 ${r.skipped} 行`);
        if (r.badRows.length) parts.push(`第 ${r.badRows.slice(0, 5).join('、')}${r.badRows.length > 5 ? ' 等' : ''} 行金额无法识别已跳过`);
        if (miss.length) parts.push(`没认出：${miss.join('、')}（按 0 计）`);
        const how = `表头在第 ${r.headerRow} 行；${describeColumns(r.columns, r.header, FIELD_LABELS)}${miss.length ? `；没认出：${miss.join('、')}` : ''}`;
        return { summary: parts.join('，'), data: { kind: 'orders', lines: r.lines, file: item.name, how } satisfies Data };
      } catch (e) {
        err ??= e;
      }
    }
    throw err;
  },

  async afterAll(results, ctx) {
    const data = results.map((r) => r.result.data as Data | undefined).filter((d): d is Data => !!d);
    const lines = data.flatMap((d) => (d.kind === 'orders' ? d.lines : []));
    if (!lines.length) throw new Error('没有订单表：除了成本表，还要拖入至少一张平台导出的订单 / 账单表');
    const costs = data.filter((d): d is Extract<Data, { kind: 'cost' }> => d.kind === 'cost').map((d) => d.table);
    let cost: CostTable | null = null;
    if (costs.length) {
      cost = { bySku: new Map(), byName: new Map(), count: 0 };
      for (const c of costs) {
        c.bySku.forEach((v, k) => cost!.bySku.set(k, v));
        c.byName.forEach((v, k) => cost!.byName.set(k, v));
        cost.count += c.count;
      }
    }
    const perOrder = Math.round(Number(ctx.params.perOrder || 0) * 100);
    const profit = computeProfit(lines, cost, perOrder);
    const t = total(profit);
    const notes: string[] = [];
    if (!cost) notes.push(`没有拖入成本表（文件名需包含「${ctx.params.costKeyword}」），商品成本全部按 0 计算`);
    if (perOrder) notes.push(`每单固定成本 ${yuan(perOrder).toFixed(2)} 元，一单只扣一次`);
    const path = await ctx.join(ctx.outputDir, `${safeName(String(ctx.params.outName).trim() || '利润对账')}.xlsx`);
    await ctx.writeFile(path, await writeXlsx(buildWorkbook(profit, notes.join('；'), data.map((d) => [d.file, d.kind === 'cost' ? '成本表' : '订单表', d.how]))));
    const m = margin(t.profit, t.income);
    const tail = [`${t.orders} 单，利润 ${yuan(t.profit).toFixed(2)} 元${m == null ? '' : `（利润率 ${(m * 100).toFixed(1)}%）`}`];
    if (!cost) tail.push('没有成本表，成本按 0 计算');
    else if (t.missingCost) tail.push(`${t.missingCost} 行缺成本，已在明细里标出`);
    return `已导出 ${path}：${tail.join('，')}`;
  },
};

export default tool;
