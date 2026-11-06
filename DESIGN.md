---
name: PixelForge 特效工厂
description: 橄榄绿工作台与炉火铜色强调，让像素特效占据中心
colors:
  ground: "#181c18"
  panel: "#22291f"
  panel-2: "#2c3428"
  panel-3: "#3a4535"
  ink: "#eeecdc"
  dim: "#b7c2a9"
  accent: "#dfb47b"
  accent-2: "#9cb9a0"
  good: "#accbad"
  warn: "#e5be7e"
  danger: "#f0a59a"
  line: "#485440"
typography:
  body:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif"
    fontSize: "13px"
rounded:
  card: "6px"
  chip: "10px"
spacing:
  rail: "10px"
  mobile-inline: "12px"
components:
  category-active:
    backgroundColor: "{colors.accent}"
    padding: "3px 8px"
    rounded: "10px"
  recipe-group:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    padding: "10px"
    rounded: "6px"
---

# Design System: PixelForge 特效工厂

## Overview

橄榄绿工作台以炉火铜色标记选择与操作，中心像素预览为主角；模板与配方保留紧凑密度，复杂预览选项收进披露区。

记录依据：`styles.css` 与 2026-11-06 已实现的界面调整；这里只描述当前视觉与响应式行为。

## Colors

四档橄榄绿承载工作台层级，暖浅字与绿调辅助字承担文字，铜色用于当前分类、选中与焦点。预览保留棋盘透明背景与特效自身的数据色。

## Typography

系统中文无衬线字族，正文 13px，品牌 16px / 700；桌面次级标签约 11px，手机参数与表单增大。Consolas / Courier New 用于读数与代码。

## Layout

桌面为模板库 224px、弹性预览与配方列 300px；≤1120px 两侧为 184px / 296px。≤900px 预览移至上方，下面两列为模板与配方，页面纵向滚动。≤600px 按预览、模板、配方依次单列；预览区高 420px，模板为两行、96px 宽横向滚动卡片；时间线可换行。≤380px 隐藏品牌副题，预览区高 380px。预览通过最近邻 CSS 尺寸适配空间，保留源画布整数像素。

## Elevation & Depth

栏位和配方组使用细橄榄边与明度层级；预览画布保留投影，选中模板用铜色边与细环。

## Shapes

模板与折叠配方组使用 6px 圆角，分类默认 10px、手机为 8px。

## Components

模板、分类、锁定、色板与收藏均为键盘可操作控件，选中态使用铜色。预览选项使用原生披露区，Escape 或点击外部可关闭。减少动态效果设置压缩过渡；棋盘格只用于透明画布判读。

## Do's and Don'ts

- Do 保留最近邻像素预览和手机预览优先的顺序。
- Don't 把棋盘透明指示当作装饰，也不要增加界面霓虹。
