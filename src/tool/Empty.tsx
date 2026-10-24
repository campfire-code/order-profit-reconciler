// 空状态：画出「多个平台的订单表 + 一张成本表 → 扣佣金、退款、运费、成本 → 利润对账表」，数字是真实感的示例
import { Upload } from 'lucide-react';
import './tool.css';

const ORDERS = ['淘宝旗舰店订单', '抖店十月账单', '拼多多十月订单'];
const LINES: [string, string, boolean][] = [['实收', '+ ¥12,860', false], ['佣金', '− ¥643', true], ['退款', '− ¥520', true], ['运费', '− ¥310', true], ['商品成本', '− ¥6,240', true]];

export function Empty({ hover }: { hover: boolean }) {
  return (
    <div className="pr-empty">
      <svg viewBox="0 0 580 240" role="img" aria-label="各平台订单表和成本表一起导入，每单扣掉佣金、退款、运费和商品成本，得到一张利润对账表">
        <g>
          {ORDERS.map((t, i) => (
            <g key={t}>
              <rect x="6" y={8 + i * 46} width="132" height="38" rx="6" className="pr-card" />
              <rect x="6" y={8 + i * 46} width="6" height="38" rx="3" className="pr-bar" />
              <text x="22" y={25 + i * 46} className="pr-tt">{t}</text>
              <text x="22" y={39 + i * 46} className="pr-k">订单 / 账单表</text>
            </g>
          ))}
          <rect x="6" y="150" width="132" height="42" rx="6" className="pr-card hot" />
          <text x="22" y="168" className="pr-tt">商品成本表</text>
          <text x="22" y="183" className="pr-k">商品编码 + 单件成本</text>
        </g>
        <path d="M144 100 H166 M144 171 H156 V130 H166 M160 122 L170 130 L160 138" className="pr-arrow" />
        <g>
          <rect x="172" y="30" width="140" height="150" rx="8" className="pr-step" />
          {LINES.map(([k, v, neg], i) => (
            <g key={k}>
              <text x="184" y={56 + i * 21} className="pr-fk">{k}</text>
              <text x="300" y={56 + i * 21} textAnchor="end" className={neg ? 'pr-fv neg' : 'pr-fv'}>{v}</text>
            </g>
          ))}
          <line x1="184" x2="300" y1="158" y2="158" className="pr-sum" />
          <text x="184" y="173" className="pr-fk strong">每单利润</text>
        </g>
        <path d="M318 105 H346 M338 97 L348 105 L338 113" className="pr-arrow" />
        <g>
          <rect x="354" y="8" width="220" height="184" rx="6" className="pr-card hot" />
          <rect x="354" y="8" width="220" height="24" rx="6" className="pr-top" />
          <text x="366" y="24" className="pr-tt">利润对账.xlsx</text>
          <text x="366" y="50" className="pr-k">利润合计</text>
          <text x="366" y="82" className="pr-big">¥4,147</text>
          <text x="566" y="82" textAnchor="end" className="pr-pct">利润率 32.3%</text>
          {[['淘宝旗舰店', 1860, 100], ['抖店', 1412, 76], ['拼多多', 875, 47]].map(([k, v, w], i) => (
            <g key={k as string}>
              <text x="366" y={112 + i * 22} className="pr-ct">{k}</text>
              <rect x="428" y={104 + i * 22} width="96" height="8" rx="4" className="pr-track" />
              <rect x="428" y={104 + i * 22} width={(Number(w) / 100) * 96} height="8" rx="4" className="pr-fill" />
              <text x="566" y={112 + i * 22} textAnchor="end" className="pr-ct">¥{Number(v).toLocaleString()}</text>
            </g>
          ))}
          <rect x="366" y="170" width="196" height="16" rx="8" className="pr-warn" />
          <text x="464" y="182" textAnchor="middle" className="pr-wt">3 单缺成本，已在明细里标出</text>
        </g>
        <text x="72" y="218" textAnchor="middle" className="pr-cap">一起拖进来</text>
        <text x="242" y="218" textAnchor="middle" className="pr-cap">按公式逐单算</text>
        <text x="464" y="218" textAnchor="middle" className="pr-cap">总计、明细、按商品、按来源</text>
      </svg>
      <h2 className="pr-title">{hover ? '松开鼠标，开始添加' : '把订单表和成本表一起拖进来'}</h2>
      <p className="pr-act"><Upload size={15} />成本表的文件名里要带「成本」两个字，其余文件都当订单表</p>
    </div>
  );
}
