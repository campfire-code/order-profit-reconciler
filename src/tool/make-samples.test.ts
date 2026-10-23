// 生成 samples/ 里的示例文件（只在设置了 MAKE_SAMPLES=1 时运行）。数据是虚构的，列名只是常见写法的示例。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { sampleFiles } from './samples';

it.runIf(process.env.MAKE_SAMPLES === '1')('生成示例文件', async () => {
  for (const [name, data] of await sampleFiles()) writeFileSync(`samples/${name}`, data);
});
