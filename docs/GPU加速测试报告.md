# PixelForge —— GPU 加速测试报告（实验性 WebGL2 后端）

> 2026-11-03 · 环境：NVIDIA GeForce RTX 5070 Ti（16GB，测试时占用 31%/43°C，非训练负载）·
> Chrome WebGL2（ANGLE Direct3D11）· 26 模板全部参与 · **默认渲染路径仍为 CPU，本后端为实验性预留**

## 结论先行

1. **GPU 加速真实有效**：同一套效果配置、同一种子、同一 Renderer 接口，实验性 WebGL2 后端
   256px 纯渲染平均 **0.053ms/帧**，对照 CPU 平均 **0.979ms/帧** —— **平均加速 18.5×，
   最高 246×**（ambient_fog @512px：CPU 17.9ms → GPU 0.072ms）。
2. **视觉等效已达成**：全部 26 模板与 CPU 输出的平均像素差 **MAE ≤ 3.68（≤1.4% 亮度）**，
   并排对比肉眼无法区分（魔法爆炸/火焰喷泉/雷霆一击抽样确认）。
3. **512px 实时余量**：最重模板 GPU 仅 0.07-0.25ms/帧，即便 512px×预算4000 也有数百倍余量。
4. CPU 路径（含导出）完全不受影响；GPU 后端为独立实验模块，未接入主 UI。

## 架构

`src/core/raster-gpu.js` 实现与 `CpuRaster` 完全相同的 Renderer 接口
（clear/stamp/ring/beam/pixel/composite/pushTransform）：

- **双 FBO**：颜色缓冲 + 加法光缓冲（复刻 CPU 的"颜色+光"双缓冲设计）
- **实例化绘制**：stamp/ring/beam/pixel 全部解析化进片元着色器，
  按状态分段合并为 `drawArraysInstanced` —— 整帧 draw call 通常 < 24 次
- **画家顺序保留**：状态切换处分段，混合语义与 CPU 一致
- **衰减量化复刻**：片元内复刻 CPU 的 64 级查表 F[(t·63)|0]（含 stamp 的 t=(d/r)² 语义）
- **混合语义精确复刻**（关键难点，见下）：加法颜色的 RGB 走光缓冲
  （col·sa·(1+glow) ≡ CPU 的 d+=col·sa 加 L+=col·sa·glow 之和），颜色 FBO 仅累计其 alpha；
  over 类按预乘链累积并在合成时直通化（÷α，与 CPU 的 /oa 逐位一致）
- 不依赖 MRT 扩展（本机 ANGLE 不提供 `EXT_draw_buffers_indexed`，双批次架构绕开）

## 性能数据（256px×预算1000，60帧均值；512px×预算4000，40帧均值）

| 指标 | CPU | GPU（纯渲染） | 加速 |
|---|---|---|---|
| 26 模板平均 | 0.979 ms/帧 | **0.053 ms/帧** | **18.5×** |
| 最小加速（rain_storm） | 0.61 ms | 0.125 ms | 4.8× |
| 最大加速（ambient_fog） | 4.48 ms | 0.037 ms | 122× |

| 512px 重负载 | CPU | GPU | 加速 |
|---|---|---|---|
| ambient_fog | 17.9 ms/帧 | 0.072 ms | **246×** |
| smoke_plume | 12.1 ms/帧 | 0.197 ms | 61× |
| magic_explosion | 3.8 ms/帧 | 0.087 ms | 44× |

含 GPU→CPU 读回（一致性校验用，预览路径无需）约 +0.3-1.9ms。
CPU 瓶颈是逐像素循环（与像素数成正比），GPU 是常数级 —— **分辨率越高收益越大**。

## 像素一致性

- 全 26 模板 MAE（四通道平均绝对差）**≤ 3.68**（即 ≤1.4% 亮度），最小 0（逐位一致）；
  纯加法/纯 over 模板 MAE < 1.7。
- 孤立边缘像素存在最大差（亚像素位置与 8bit 量化差），并排视觉对比无法区分。
- 纯函数式设计下 GPU 与 CPU 共享同一求值层（图层/种子/时间），差异仅在光栅化约定。

## 调试过程记录（供未来维护）

1. 初版 MRT 方案：本机 ANGLE 不提供 `EXT_draw_buffers_indexed` → 回退路径丢失光缓冲（MAE 110）。
2. 重写为双批次双 FBO 后仍 MAE 110 → 逐算子探针定位 **实例属性布局错位**
   （glow 插在 half/p2 之间导致后续字段全部偏移 → 几何垃圾全 discard）。
3. 布局对齐后 MAE 降至 3.4（over 类）/ 仍 22（flash 类）→ 视觉对比发现加法光晕过大：
   straight-alpha 输出配 ONE,ONE 混合把**未加权**颜色加入缓冲。
4. 最终方案：加法 RGB 改走光缓冲（col·sa·(1+glow)），颜色 FBO 只累计 alpha ——
   与 CPU 的 `d += col·sa; L += col·sa·glow` 数学恒等，全部模板 MAE ≤ 3.68。

## 集成建议（未来可选 GPU 模式）

- 预览路径直接可用（composite 已同时呈现到画布），导出路径需将 readPixels 结果
  接入现有 PNG 编码管线（一致性已验证）。
- 建议提供渲染器下拉选择（CPU/WebGL2），默认仍为 CPU；
  GPU 不可用时自动回退（接口已同构，切换仅是替换 `PF.Renderer` 实现）。
- WebGL2 覆盖率不足的环境（旧设备/禁用 GPU）天然由 CPU 路径兜底。

## 复现方式

```bash
node server.js 8347
# 打开 http://127.0.0.1:8347/bench/gpu-bench.html
# 页面自动运行 26 模板 CPU vs GPU 对比 + 512px 重负载 + 像素一致性 diff
```
