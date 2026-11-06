**简体中文** · [English](README.en.md)

# PixelForge · 像素特效工厂

离线制作像素游戏特效：挑选模板、调整配方，在同一条确定性时间轴上预览并导出透明素材。

<img src="assets/readme/hero.svg" width="100%" alt="PixelForge · 像素特效工厂">

[![CI](https://github.com/LINYEANSHU/pixelforge/actions/workflows/ci.yml/badge.svg)](https://github.com/LINYEANSHU/pixelforge/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-54775a.svg)](LICENSE)

## 实际界面

<img src="assets/readme/current-desktop.png" width="100%" alt="PixelForge · 像素特效工厂 — desktop interface">

<details>
<summary>展开手机界面</summary>

<img src="assets/readme/current-mobile.png" width="390" alt="PixelForge · 像素特效工厂 — mobile interface">

</details>

## 快速开始

需要 Node.js 18+，无需安装依赖：

```sh
node server.js 8347
```

访问 `http://127.0.0.1:8347`。Windows 也可双击 `启动PixelForge.bat`；直接打开 `index.html` 或 [单文件版本](dist/pixelforge-standalone.html) 可离线使用。自动启动使用隔离的浏览器配置并禁用 GPU；主预览采用 CPU 光栅化。

首次使用：选择一个模板 → 调整强度、时长或色板 → 暂停并拖动时间轴 → 导出单帧 PNG。

## 从配方到素材

- **29 个模板，8 类效果**：爆炸、火焰、闪电、魔法、烟雾/天气、水冰、命中与 UI 反馈。
- **三种编辑入口**：模板参数、保留锁定项的一键变体、双语文字配方。文字配方使用离线词典和规则，只理解受支持的描述，不调用在线模型。
- **可复现时间轴**：种子和帧决定结果；预览、逐帧定位与导出共用求值路径，以 `t = k/60` 采样。
- **最多四层组合**：每层可设置时间窗、偏移与缩放；配方可收藏、撤销和导入导出。
- **手机也能编辑**：预览、模板和参数顺排；暂停后只在状态变化时重绘，字段随模板与撤销同步更新。

## 导出

| 格式 | 用途 |
|---|---|
| 单帧 PNG | 当前帧，保留透明通道 |
| PNG 序列 ZIP | 帧图片与 `timeline.json` |
| Sprite Sheet | 多页 PNG 与 Aseprite 兼容 JSON |
| APNG | 透明动画 PNG |
| 配方 JSON | 保存种子、图层和参数，稍后复现 |

导出支持进度与取消。HTTP 模式使用 Worker；`file://` 使用 CPU 主线程分片，避免离线 Worker 加载失败。循环不重复首尾帧，精灵表超出页尺寸时分页。

## 验证与开发

```sh
node tests/run-tests.cjs
node build.cjs
```

现有套件 18 项通过，覆盖确定性、预览/导出像素一致、透明通道、分页、配方往返、取消和长循环。`build.cjs` 重建单文件版本。最近交互验证包含手机预览、字段同步及实际 PNG 下载；没有把特定机器帧率当作通用性能承诺。

预览与导出耗时取决于画布、粒子预算和帧数。实验性 WebGL 后端未接入主 UI；本轮未运行 GPU 基准。GIF 和视频导出尚未实现。

## 文档与许可

[导出格式](docs/导出格式.md) · [许可清单](docs/LICENSES.md) · [第三方说明](NOTICE)

项目代码使用 [MIT](LICENSE)。设计概念参考来源及其归属保留在 `NOTICE`。

## 贡献者

- [LINYEANSHU](https://github.com/LINYEANSHU)
