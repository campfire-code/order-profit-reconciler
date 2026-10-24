// 示例数据（虚构）：测试和 samples/ 共用，保证 README 验收用例与测试一致
import ExcelJS from 'exceljs';
import { writeXlsx } from './xlsx';

const TAOBAO = `﻿订单编号,商品标题,商家编码,购买数量,买家实付金额(元),订单状态,退款金额
3712024102300010001,保温杯 500毫升,1001,2,119.80,交易成功,0
3712024102300010002,帆布托特包,1002,1,49.90,交易成功,49.90
3712024102300010003,护眼台灯,1003,1,129.00,交易关闭,0
3712024102300010004,保温杯 500毫升,1001,1,59.90,交易成功,0
3712024102300010005,陶瓷马克杯,1004,3,77.70,交易成功,0
`;

async function douyin(): Promise<Uint8Array> {
  // 带标题行的账单：第 1 行标题，第 3 行才是表头
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('结算明细');
  ws.addRow(['抖店订单结算明细（2026年10月）']);
  ws.addRow([]);
  ws.addRow(['子订单号', '商品名称', '商品编码', '数量', '订单实付', '技术服务费', '达人佣金', '快递费', '售后退款金额', '订单状态']);
  const rows: (string | number)[][] = [
    ['6930001', '保温杯 500毫升', '1001', 1, 62, 3.1, 6.2, 0, 0, '已完成'],
    ['6930002', '护眼台灯', '1003', 1, 135, 6.75, 13.5, 0, 0, '已完成'],
    ['6930003', '帆布托特包', '1002', 2, 96, 4.8, 0, 0, 0, '已完成'],
    ['6930004', '保温杯 500毫升', '1001', 1, 62, 3.1, 6.2, 0, 62, '售后完成'],
  ];
  rows.forEach((r) => ws.addRow(r));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export async function sampleFiles(): Promise<[string, Uint8Array][]> {
  return [
    ['淘宝旗舰店-订单.csv', new TextEncoder().encode(TAOBAO)],
    ['抖店-十月账单.xlsx', await douyin()],
    ['商品成本表.xlsx', await writeXlsx([{ name: '成本', header: ['商品编码', '商品名称', '单件成本'], rows: [['1001', '保温杯 500毫升', 22.5], ['1002', '帆布托特包', 11.8], ['1003', '护眼台灯', 48]] }])],
  ];
}
