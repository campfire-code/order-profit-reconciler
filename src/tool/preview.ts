// 截图与预览用的示例数据（不会进入正式运行）
import type { Row } from '../kit/runner';

const files: [string, number, Row['status'], string?][] = [
  ['商品成本表.xlsx', 18_000, 'ok', '成本表：126 个商品'],
  ['淘宝旗舰店-十月订单.csv', 412_000, 'ok', '订单 1284 行，跳过已取消 37 行'],
  ['抖店-十月账单.xlsx', 356_000, 'ok', '订单 962 行，佣金=技术服务费+达人佣金'],
  ['拼多多-十月订单.xlsx', 298_000, 'run'],
  ['快手小店-十月订单.xlsx', 120_000, 'wait'],
  ['京东-账单.xls', 88_000, 'err', '旧版 .xls 格式不支持，请用 Excel 或 WPS 另存为 .xlsx 后再拖进来'],
];

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : files.map(([name, size, status, text], i) => {
    const st = state === 'done' && status !== 'err' ? 'ok' : status;
    return {
      item: { id: `p${i}`, name, path: `/示例/${name}`, size },
      status: st,
      progress: st === 'run' ? 0.5 : st === 'ok' ? 1 : 0,
      error: st === 'err' ? text : undefined,
      result: st === 'ok' ? { summary: text ?? '订单 640 行', outputPath: '/示例/输出' } : undefined,
    };
  });

export const params = { perOrder: 3.5 };
