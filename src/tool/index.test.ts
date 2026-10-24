import { describe, expect, it } from 'vitest';
import tool from './index';
import { readSheets } from './xlsx';
import { sampleFiles } from './samples';
import type { InputItem, ItemResult, Params, RunContext } from '../kit/types';

// 内存文件系统，模拟本机读写
function fakeCtx(files: Map<string, Uint8Array>, params: Params): RunContext {
  return {
    params, outputDir: '/out', signal: new AbortController().signal, progress: () => {},
    readFile: async (p) => files.get(p)!,
    readText: async (p) => new TextDecoder().decode(files.get(p)!),
    writeFile: async (p, d) => void files.set(p, d),
    writeText: async (p, t) => void files.set(p, new TextEncoder().encode(t)),
    mkdir: async () => {},
    join: async (...parts) => parts.join('/'),
    llm: async () => '', sidecar: async () => '', ffmpeg: async () => {}, duration: async () => 0,
  };
}
const defaults = (over: Params = {}): Params => ({ ...Object.fromEntries(tool.params.map((f) => [f.key, f.default])), ...over });
const item = (name: string): InputItem => ({ id: name, name, path: '/in/' + name });

async function runAll(names: string[], params: Params) {
  const files = new Map((await sampleFiles()).map(([n, d]) => ['/in/' + n, d] as [string, Uint8Array]));
  const ctx = fakeCtx(files, params);
  const results: { item: InputItem; result: ItemResult }[] = [];
  for (const n of names) results.push({ item: item(n), result: await tool.run(item(n), ctx) });
  const msg = await tool.afterAll!(results, ctx);
  return { files, results, msg };
}
const ALL = ['淘宝旗舰店-订单.csv', '抖店-十月账单.xlsx', '商品成本表.xlsx'];

describe('示例文件完整流程', () => {
  it('两个平台 + 成本表，每单固定成本 3.5 元', async () => {
    const { files, results, msg } = await runAll(ALL, defaults({ perOrder: 3.5 }));
    expect(results[0].result.summary).toBe('订单 4 行，跳过已取消 1 行，没认出：佣金/服务费、运费（按 0 计）');
    expect(results[1].result.summary).toBe('订单 4 行');
    expect(results[2].result.summary).toBe('成本表：3 个商品');
    expect(msg).toBe('已导出 /out/利润对账.xlsx：8 单，利润 282.85 元（利润率 42.7%），1 行缺成本，已在明细里标出');

    const sheets = await readSheets(files.get('/out/利润对账.xlsx')!, 'x.xlsx');
    expect(sheets.map((s) => s.name)).toEqual(['总计', '订单明细', '按商品汇总', '按来源文件汇总', '列识别']);
    const how = sheets[4].grid;
    expect(how[1][2]).toContain('实收金额=买家实付金额(元)');
    expect(how[2][2]).toContain('表头在第 3 行');
    expect(how[2][2]).toContain('佣金/服务费=技术服务费+达人佣金，运费=快递费');
    expect(how[3][2]).toContain('成本=单件成本');
    const detail = sheets[1].grid;
    expect(detail).toHaveLength(9);
    const row = (id: string) => detail.find((r) => r[2] === id)!;
    // 长订单号保持文本
    expect(row('3712024102300010001').slice(7, 16)).toEqual([119.8, 0, 0, 0, 22.5, 45, 3.5, 71.3, 0.5952]);
    expect(row('6930004')[14]).toBe(-35.3);
    expect(row('3712024102300010005')[16]).toContain('缺成本');
    const src = sheets[3].grid;
    expect(src[1][0]).toBe('淘宝旗舰店-订单');
    expect(src[1][9]).toBe(164.1);
    expect(src[2][9]).toBe(118.75);
    expect(src[3].slice(0, 2)).toEqual(['合计', 8]);
    const prod = sheets[2].grid;
    expect(prod[1].slice(0, 2)).toEqual(['BW-500', '保温杯 500ml']); // 按利润从高到低
    expect(prod[1][10]).toBe(96.6);
  });

  it('没有成本表时照样导出并提醒', async () => {
    const { msg } = await runAll(ALL.slice(0, 2), defaults());
    expect(msg).toContain('没有成本表，成本按 0 计算');
  });

  it('只有成本表时收尾报错', async () => {
    await expect(runAll(['商品成本表.xlsx'], defaults())).rejects.toThrow('没有订单表');
  });

  it('手动指定列：实收已扣佣金时把佣金列设为「无」', async () => {
    const { results } = await runAll(['抖店-十月账单.xlsx'], defaults({ manual: true, col_commission: '无' }));
    expect(results[0].result.summary).toContain('没认出：佣金/服务费');
  });

  it('手动指定的列不存在时提示表头', async () => {
    await expect(runAll(['淘宝旗舰店-订单.csv'], defaults({ manual: true, col_income: '结算金额' }))).rejects.toThrow('找不到列「结算金额」');
  });

  it('旧版 xls 在处理前拦下', () => {
    expect(tool.check!(item('a.xls'))).toContain('另存为 .xlsx');
  });
});
