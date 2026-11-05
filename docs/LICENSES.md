# PixelForge 许可清单

## 本项目代码

MIT License. Copyright (c) 2026 LINYEANSHU. 完整许可文本见仓库根目录 `LICENSE`。

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 参考项目（未复用代码）

- **patch-gg/pixelfx** — https://github.com/patch-gg/pixelfx
  - 许可：MIT（Copyright (c) 2026 Patch; Copyright (c) 2026 Hugo Duprez）
  - 固定参考提交：`a84159688af3ca37a4be05a0d422b94451b2e24e`（2026-10-31, "pixelfx 0.3.0"）
  - 参考范围：**仅设计概念**——颜色缓冲 + 加法光缓冲的双层合成思路、全种子化确定性、Aseprite 风格 sprite sheet 元数据组织。
  - 未复用：任何源码文件、其 `gallery/fonts` 字体（该字体为 Patch 所有、不在其 MIT 覆盖内）。本项目全部代码自研，字体仅使用系统字体栈（Segoe UI / Microsoft YaHei / PingFang SC 等）。
  - 遵照其 NOTICE 的精神明确说明：本项目**未采用** pixelfx 所参考的 Hollow Crown 12 FPS 姿态步进设计；本项目测试场与全部动画均为 60FPS 连续时间函数。

## 运行时依赖

无。浏览器端为零依赖纯 ES5+ 脚本；Node 工具链仅用标准库（fs/path/zlib/http/child_process）。

## 字体

仅使用操作系统系统字体（font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", Consolas, monospace），项目不分发任何字体文件。
