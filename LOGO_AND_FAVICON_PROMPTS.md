# TruthLens — Logo 与 Favicon 设计提示词

面向文生图 / 矢量工具（如 Midjourney、DALL·E、Ideogram、Recraft 等）。产品定位：**国际涉华信息的可信度分析与风险预警**；品牌名 **TruthLens**（真理 + 透镜）。

---

## 主站 Logo（横版或方形，适合顶栏）

### 中文提示词

极简现代科技感 Logo，品牌名「TruthLens」。概念：光学透镜、信号与噪声分离、可信核验；可融入抽象盾牌或刻度弧线，暗示「评分 / 预警」。图形为主，文字为辅；线条干净、扁平或微渐变。主色需考虑**深红顶栏背景**（约 `#90080e`）上的可读性：图形与字标使用**白色、浅灰或高对比浅色**，避免与真实电视台 / 通讯社台标相似。无杂乱装饰、无 3D 金属质感堆砌。透明或单色底导出。

### English prompt

Minimal modern tech logo for brand "TruthLens": credibility analysis and risk intelligence for international news. Motifs: optical lens, signal-vs-noise, verification shield, subtle gauge arc for scoring. Flat vector or slight gradient; clean strokes. Must read clearly on **dark red navbar** (`#90080e`): use **white / light gray** for mark and wordmark. No cluttered text, no glossy 3D, no imitation of real broadcast network logos. Export as SVG or high-res PNG with transparent background.

### 负面提示（可与主提示一起使用）

`3D metallic, cluttered, photorealistic, CCTV logo, BBC logo, CNN logo, watermark, multiple slogans`

---

## Favicon（浏览器标签页小图标）

### 中文提示词

16×16 至 32×32 像素可读的单色或双色简化图标：抽象小透镜 + 短勾选或一道刻度线，象征「核验 / 可信」。高对比、边缘清晰，缩小后仍能辨认。背景透明或纯色圆角方块。风格与 TruthLens 主 Logo 一致。

### English prompt

Tiny app icon 16–32px readable: abstract lens + small check or tick mark for verification. High contrast, crisp edges, works at favicon size. Transparent or solid rounded square background. Consistent with TruthLens main logo family.

### 导出建议

- **SVG**：`public/favicon.svg`（现代浏览器）。
- **PNG**：多尺寸 32 / 48 / 180（Apple touch）按需；若需经典 `.ico`，可用在线工具从 PNG 合成。
- 替换 [`index.html`](index.html) 中 `<link rel="icon" ...>` 指向你的文件即可。

---

## 可选：仅图形、无字标（用于 favicon / 社交头像）

### English

Standalone symbol only, no text: minimal lens-and-checkmark glyph for TruthLens, flat vector, high contrast for small sizes, transparent background.
