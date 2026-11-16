# Third-party notices

本插件是基于 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion)（大肥鱼桌宠，桌面版）的修改版（桌面化改造：桌面图标搬运、PowerShell 探针、全局透明窗、语音直通、影分身等）。整体组合程序遵循 **AGPL-3.0-or-later**（见 `LICENSE`）。

## Coopanion runtime（AGPL-3.0-or-later）

仓库 `assets/pet/kit/`（body、mesh rig）、`assets/pet/whale/figure.js`、`figure.json`、`model.json`（鲸鱼模型/骨骼）以及 `assets/pet/speech/`（合成音库）改编自 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion)，属 AGPL-3.0-or-later 授权范围。上游的权利声明以 [Coopanion 仓库](https://github.com/Pal-AI-Lab/Coopanion) 公布的为准。

## 鲸鱼贴图与商标（独立权利，不在 AGPL 授权范围内）

`assets/pet/whale/` 下的分层贴图（feat/、outfits/、schemes/ 等 PNG，含各换色形象与服装层）**不受 AGPL 再授权**，随本仓库分发系**已取得原作者许可**：2026 年 11 月通过 B 站（bilibili 私信）联系 Pal-AI-Lab（贴图制作方）并获得随仓库分发的许可，联系记录留存备查。原始权利链（照录上游声明）：

> The textures and thumbnails in `web/upstream/whale/` ... are excluded from upstream's AGPL grant. Original character: 溟月（上善无形）; DeepSeek maid reinterpretation: ZipZipPipe; generated/split artwork: Pal-AI-Lab using OpenAI's image model. Vendor marks belong to their respective owners and do not imply endorsement.
>
> 这些贴图不在本包的 AGPL 授权范围内。原设与各家标志的权利归各自权利人。

即：本仓库随附贴图是经权利人许可的特例，**不代表这些贴图按 AGPL 再授权**——从本仓库再分发或二次使用这些贴图，仍需自行取得权利人许可。

## Electron

桌宠窗口由 DSH 环境提供的 Electron 承载，Electron 及其内含 Chromium 的许可声明归各自权利人，随运行时分发，本仓库不打包。

## DSH（DeepSeek Harness）

本插件是 DSH 的宿主插件，依赖其插件 API（`@deepseek-ai/schemastery`、webServer 注入等）。DSH 本体与本仓库协议无关，属各自权利人。
