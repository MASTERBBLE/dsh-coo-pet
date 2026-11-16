# 第三方权利声明

本插件是 DSH（DeepSeek Harness）的宿主插件。插件代码以「DSH 插件化改造」为核心原创，但以下第三方内容按其原有授权随仓库分发，特此声明。

## 一、Coopanion 运行时（AGPL-3.0-or-later）

仓库 `assets/pet/kit/`（动画引擎 body、mesh rig）、`assets/pet/whale/figure.js`、`figure.json`、`model.json`（鲸鱼模型/骨骼）、`assets/pet/speech/`（合成音库）改编自 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion)（大肥鱼桌宠，桌面版），遵循 **AGPL-3.0-or-later**（见 `LICENSE`）。基于本项目的二次开发需同样以 AGPL-3.0-or-later 开源。上游权利声明以 [Coopanion 仓库](https://github.com/Pal-AI-Lab/Coopanion) 公布的为准。

## 二、鲸鱼贴图（独立权利，不在 AGPL 授权范围内）

`assets/pet/whale/` 下的分层贴图（`feat/`、`outfits/`、`schemes/` 等 PNG，含各换色形象与服装层）不受 AGPL 再授权，随本仓库分发系已取得权利人许可：2026 年 11 月通过 B 站（bilibili 私信）联系 Pal-AI-Lab（贴图制作方）并获得随仓库分发的许可，联系记录留存备查。

原始权利链（照录上游声明）：

> The textures and thumbnails in `web/upstream/whale/` are excluded from upstream's AGPL grant. Original character: 溟月（上善无形）; DeepSeek maid reinterpretation: ZipZipPipe; generated/split artwork: Pal-AI-Lab using OpenAI's image model. Vendor marks belong to their respective owners and do not imply endorsement.

即：随附贴图是经权利人许可的特例，不代表这些贴图按 AGPL 再授权——从本仓库再分发或二次使用这些贴图，仍需自行取得权利人许可。

## 三、Electron

桌宠窗口由 DSH 环境提供的 Electron 承载，Electron 及其内含 Chromium 的许可声明归各自权利人，随运行时分发，本仓库不打包。

## 四、DSH（DeepSeek Harness）

本插件依赖 DSH 的插件 API（`@deepseek-ai/schemastery`、webServer 注入等）。DSH 本体与本仓库协议无关，属各自权利人。
