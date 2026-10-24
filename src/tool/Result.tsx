// 单个文件的读取结果：订单表用大字显示实收，下面一根分段条显示佣金、退款、运费各占多少；成本表显示商品数和认到的列
import { Boxes, ReceiptText } from 'lucide-react';
import type { InputItem, ItemResult } from '../kit/types';
import { yuan, type OrderLine } from './core';
import './tool.css';

type Shown = { kind: 'cost'; file: string; how: string } | { kind: 'orders'; lines: OrderLine[]; file: string; how: string };

const fmt = (cents: number) => `¥${yuan(cents).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ResultBody({ result }: { item: InputItem; result: ItemResult }) {
  const d = result.data as Shown | undefined;
  if (!d) return <p className="pr-sub">{result.summary}</p>;
  if (d.kind === 'cost') {
    return (
      <div className="pr-body">
        <div className="pr-head"><span className="pr-tag cost"><Boxes size={14} />成本表</span></div>
        <p className="pr-note">{result.summary?.replace(/^成本表：/, '')}</p>
        <p className="pr-how" title={d.how}>认到的列：{d.how}</p>
      </div>
    );
  }
  const sum = (k: 'income' | 'commission' | 'shipping' | 'refund') => d.lines.reduce((a, l) => a + l[k], 0);
  const income = sum('income');
  const parts = [
    { k: '佣金 / 服务费', v: sum('commission'), c: 'c1' },
    { k: '退款', v: sum('refund'), c: 'c2' },
    { k: '运费', v: sum('shipping'), c: 'c3' },
  ];
  const left = Math.max(0, income - parts.reduce((a, p) => a + p.v, 0));
  const total = Math.max(1, income, parts.reduce((a, p) => a + p.v, 0));
  const orders = new Set(d.lines.map((l) => l.orderId || `${l.rowNo}`)).size;
  const skipped = /跳过已取消 (\d+) 行/.exec(result.summary ?? '')?.[1];
  return (
    <div className="pr-body">
      <div className="pr-head">
        <span className="pr-tag"><ReceiptText size={14} />订单表</span>
        <span className="pr-count"><b className="k-num">{orders}</b> 单 · {d.lines.length} 行</span>
      </div>
      <div className="pr-income"><span>实收合计</span><b className="k-num">{fmt(income)}</b></div>
      <div className="pr-split" role="img" aria-label={`实收 ${fmt(income)}，其中佣金 ${fmt(parts[0].v)}，退款 ${fmt(parts[1].v)}，运费 ${fmt(parts[2].v)}`}>
        {parts.map((p) => p.v > 0 && <i key={p.k} className={p.c} style={{ flex: p.v / total }} />)}
        <i className="rest" style={{ flex: left / total }} />
      </div>
      <ul className="pr-legend">
        {parts.map((p) => <li key={p.k} className={p.c}><span>{p.k}</span><b className="k-num">− {fmt(p.v)}</b></li>)}
        <li className="rest"><span>还没扣成本</span><b className="k-num">{fmt(left)}</b></li>
      </ul>
      {skipped && <p className="pr-note">已跳过取消、关闭的订单 {skipped} 行</p>}
      <p className="pr-how" title={d.how}>认到的列：{d.how}</p>
    </div>
  );
}
