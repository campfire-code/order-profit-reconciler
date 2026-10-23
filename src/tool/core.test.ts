import { describe, expect, it } from 'vitest';
import {
  ORDER_SYNONYMS, byProduct, computeProfit, decodeText, detectColumns, findHeaderRow, isCostFile, lookupCost, margin, normHeader,
  parseCostTable, parseCsv, parseOrders, resolveSpec, summarize, toCents, toQty, total, type OrderLine,
} from './core';

const col = (header: string[], k: keyof typeof ORDER_SYNONYMS) => detectColumns(header, ORDER_SYNONYMS)[k].map((i) => header[i]);

describe('表头同义词识别', () => {
  it.each([
    ['orderId', ['订单编号', '商品', '实付'], '订单编号'],
    ['orderId', ['主订单号', '子订单号'], '主订单号'],
    ['orderId', ['订单状态', '订单ID'], '订单ID'],
    ['product', ['商品编码', '宝贝标题'], '宝贝标题'],
    ['sku', ['商品名称', '商家编码'], '商家编码'],
    ['sku', ['SKU ID', '商品名称'], 'SKU ID'],
    ['qty', ['单价', '购买数量'], '购买数量'],
    ['income', ['买家实付金额(元)', '订单金额'], '买家实付金额(元)'],
    ['income', ['商品单价', '实收金额（元）'], '实收金额（元）'],
    ['shipping', ['运费险', '快递费'], '快递费'],
    ['refund', ['退款状态', '退款金额'], '退款金额'],
    ['refund', ['退款原因', '售后退款金额'], '售后退款金额'],
    ['status', ['退款状态', '交易状态'], '交易状态'],
  ] as const)('%s 在 %j 里认出 %s', (k, header, want) => {
    expect(col([...header], k)).toEqual([want]);
  });

  it('佣金类多列一起扣：技术服务费 + 达人佣金，不把「佣金比例」算进去', () => {
    expect(col(['订单号', '技术服务费', '佣金比例', '达人佣金', '实付金额'], 'commission')).toEqual(['技术服务费', '达人佣金']);
  });
  it('有「佣金合计」时只用合计列，避免重复扣', () => {
    expect(col(['平台佣金', '达人佣金', '佣金合计'], 'commission')).toEqual(['佣金合计']);
  });
  it('认不出的字段为空', () => {
    expect(col(['订单号', '商品名称', '实付金额'], 'shipping')).toEqual([]);
  });
  it('表头标准化去掉单位括号和空格', () => {
    expect(normHeader(' 实付金额 （元） ')).toBe('实付金额');
    expect(normHeader('SKU_ID')).toBe('skuid');
  });
  it('手动覆盖优先，并能用 + 相加、用「无」关闭、用列字母', () => {
    const h = ['订单号', '运费', '服务费A', '服务费B', '实付'];
    const m = detectColumns(h, ORDER_SYNONYMS, { commission: '服务费A+服务费B', shipping: '无', income: 'E' });
    expect(m.commission).toEqual([2, 3]);
    expect(m.shipping).toEqual([]);
    expect(m.income).toEqual([4]);
  });
  it('手填的列名不存在时提示表头', () => {
    expect(() => resolveSpec(['订单号', '实付'], '实收')).toThrow('找不到列「实收」，表头是：订单号、实付');
  });
  it('跳过标题行自动找表头', () => {
    const grid = [['抖店结算账单 2026年10月'], [], ['子订单号', '商品名称', '数量', '实付金额'], ['1', '杯子', 1, 10]];
    expect(findHeaderRow(grid, ORDER_SYNONYMS)).toBe(2);
  });
});

describe('金额与数量', () => {
  it.each([
    [12.3, 1230], ['¥1,234.50', 123450], ['-8.8', -880], ['（12.30）', -1230], ['12元', 1200], ['', 0], [null, 0], ['--', 0], ['abc', null], [0.1 + 0.2, 30],
  ] as const)('%j → %j 分', (v, want) => {
    expect(toCents(v)).toBe(want);
  });
  it('数量空值按 1，写错返回 null', () => {
    expect(toQty('')).toBe(1);
    expect(toQty('3件')).toBe(3);
    expect(toQty('x')).toBe(null);
  });
});

describe('成本表', () => {
  it('按编码优先、名称其次查成本；编码不区分大小写和全角', () => {
    const c = parseCostTable([['商品编码', '商品名称', '单件成本'], ['BW-01', '保温杯', 25.5], ['', '帆布包', '12'], ['X', '坏行', '未知']]);
    expect(c.table.count).toBe(2);
    expect(c.badRows).toEqual([4]);
    expect(lookupCost(c.table, 'ｂｗ-01', '')).toBe(2550);
    expect(lookupCost(c.table, 'NONE', '帆布包')).toBe(1200);
    expect(lookupCost(c.table, 'NONE', '台灯')).toBe(null);
  });
  it('没有成本列时报错', () => {
    expect(() => parseCostTable([['商品编码', '售价'], ['A', 1]])).toThrow('找不到成本列');
  });
  it('文件名包含关键字才算成本表', () => {
    expect(isCostFile('商品成本表.xlsx', '成本')).toBe(true);
    expect(isCostFile('淘宝订单.csv', '成本')).toBe(false);
  });
});

describe('订单解析', () => {
  const grid = [
    ['订单编号', '商品名称', '商家编码', '数量', '实付金额', '订单状态', '退款金额', '技术服务费', '达人佣金', '运费'],
    ['1001', '保温杯', 'BW-01', 2, '99.80', '交易成功', '', '3.99', '-5', '6'],
    ['1002', '帆布包', '', 1, '39.9', '交易关闭', '', '', '', ''],
    ['1003', '台灯', 'TD-9', '', 'x', '交易成功', '', '', '', ''],
    ['合计', '', '', '', '139.7', '', '', '', '', ''],
  ];
  it('跳过已关闭订单、合计行，记录写错的行，扣费取绝对值并多列相加', () => {
    const r = parseOrders('淘宝', grid, { skipCancelled: true });
    expect(r.skipped).toBe(1);
    expect(r.badRows).toEqual([4]);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ orderId: '1001', qty: 2, income: 9980, commission: 899, shipping: 600, refund: 0 });
  });
  it('不跳过时保留已关闭订单', () => {
    expect(parseOrders('淘宝', grid, { skipCancelled: false }).lines).toHaveLength(2);
  });
  it('找不到实收列时报错并提示表头', () => {
    expect(() => parseOrders('x', [['订单号', '商品名称', '数量'], ['1', 'a', 1]])).toThrow('找不到实收金额列');
  });
});

describe('利润计算', () => {
  const line = (o: Partial<OrderLine>): OrderLine => ({ source: '店A', rowNo: 2, orderId: '1', product: '保温杯', sku: 'BW', qty: 1, income: 0, commission: 0, shipping: 0, refund: 0, status: '', ...o });
  const cost = parseCostTable([['商品编码', '成本价'], ['BW', 0.1]]).table;

  it('利润 = 实收 − 佣金 − 退款 − 运费 − 成本×数量 − 每单固定成本，无浮点误差', () => {
    const [p] = computeProfit([line({ income: 30, commission: 10, qty: 2 })], cost, 0);
    expect(p.goodsCost).toBe(20);
    expect(p.profit).toBe(0);
    const [q] = computeProfit([line({ income: 10000, commission: 500, refund: 1000, shipping: 800, qty: 3 })], cost, 150);
    expect(q.profit).toBe(10000 - 500 - 1000 - 800 - 30 - 150);
  });
  it('同一订单多行只扣一次每单固定成本；不同来源同订单号分开算', () => {
    const r = computeProfit([line({ rowNo: 2 }), line({ rowNo: 3 }), line({ source: '店B', rowNo: 2 })], cost, 200);
    expect(r.map((x) => x.fixedCost)).toEqual([200, 0, 200]);
  });
  it('缺成本时成本按 0 并标记', () => {
    const [p] = computeProfit([line({ sku: 'NONE', product: '未知', income: 500 })], cost, 0);
    expect(p.unitCost).toBe(null);
    expect(p.profit).toBe(500);
  });
  it('按商品汇总：订单数去重、金额累加、缺成本计数', () => {
    const r = computeProfit([line({ income: 100 }), line({ rowNo: 3, income: 50 }), line({ orderId: '2', sku: 'X', product: '杯垫', income: 9 })], cost, 0);
    const s = summarize(r, byProduct);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ orders: 1, lines: 2, income: 150, goodsCost: 20, profit: 130, missingCost: 0 });
    expect(s[1]).toMatchObject({ missingCost: 1 });
    expect(total(r)).toMatchObject({ orders: 2, income: 159 });
  });
  it('利润率保留四位小数，实收为 0 时为空', () => {
    expect(margin(1, 3)).toBe(0.3333);
    expect(margin(-5, 0)).toBe(null);
  });
});

describe('CSV', () => {
  it('GBK 编码的 CSV 能正确解码', () => {
    const gbk = new Uint8Array([0xb6, 0xa9, 0xb5, 0xa5, 0xba, 0xc5, 0x2c, 0x31]); // 订单号,1
    expect(parseCsv(decodeText(gbk))).toEqual([['订单号', '1']]);
  });
});
