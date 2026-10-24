// 截图与预览用的示例数据（不会进入正式运行）
import type { Row } from '../kit/runner';
import type { OrderLine } from './core';

/** 按行数和合计金额（分）拼出示例订单行，金额均分 */
function fake(source: string, n: number, income: number, commission: number, refund: number, shipping: number): OrderLine[] {
  return Array.from({ length: n }, (_, i) => ({
    source, rowNo: i + 2, orderId: `${source}-${10000 + i}`, product: '保温杯 500毫升', sku: '1001', qty: 1, status: '交易成功',
    income: Math.round(income / n), commission: Math.round(commission / n), refund: Math.round(refund / n), shipping: Math.round(shipping / n),
  }));
}

const files: [string, number, Row['status'], string?, unknown?][] = [
  ['商品成本表.xlsx', 18_000, 'ok', '成本表：126 个商品', { kind: 'cost', file: '商品成本表.xlsx', how: '编码=商品编码，名称=商品名称，成本=单件成本' }],
  ['淘宝旗舰店-十月订单.csv', 412_000, 'ok', '订单 1284 行，跳过已取消 37 行', { kind: 'orders', file: '淘宝旗舰店-十月订单.csv', how: '表头在第 1 行；订单号=订单编号，实收=买家实付金额(元)，退款=退款金额', lines: fake('淘宝', 1284, 12_860_000, 643_000, 520_000, 310_000) }],
  ['抖店-十月账单.xlsx', 356_000, 'ok', '订单 962 行，佣金=技术服务费+达人佣金', { kind: 'orders', file: '抖店-十月账单.xlsx', how: '表头在第 3 行；佣金/服务费=技术服务费+达人佣金，运费=快递费', lines: fake('抖店', 962, 9_480_000, 1_185_000, 380_000, 0) }],
  ['拼多多-十月订单.xlsx', 298_000, 'run', '订单 640 行', { kind: 'orders', file: '拼多多-十月订单.xlsx', how: '表头在第 1 行；订单号=订单编号，实收=买家实付', lines: fake('拼多多', 640, 6_050_000, 242_000, 150_000, 0) }],
  ['快手小店-十月订单.xlsx', 120_000, 'wait', '订单 210 行', { kind: 'orders', file: '快手小店-十月订单.xlsx', how: '表头在第 1 行；订单号=订单编号，实收=订单实付', lines: fake('快手', 210, 2_100_000, 126_000, 60_000, 42_000) }],
  ['京东-账单.xls', 88_000, 'err', '旧版 .xls 格式不支持，请用 Excel 或 WPS 另存为 .xlsx 后再拖进来'],
];

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : files.map(([name, size, status, text, data], i) => {
    const st = state === 'done' && status !== 'err' ? 'ok' : status;
    return {
      item: { id: `p${i}`, name, path: `/示例/${name}`, size },
      status: st,
      progress: st === 'run' ? 0.5 : st === 'ok' ? 1 : 0,
      error: st === 'err' ? text : undefined,
      result: st === 'ok' ? { summary: text ?? '订单 640 行', outputPath: '/示例/输出', data } : undefined,
    };
  });

export const params = { perOrder: 3.5 };
