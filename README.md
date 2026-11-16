# coo-pet 🐟

一个跑在 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 上的桌面宠物插件：一条会走路、会打盹、会帮你搬桌面图标、还会影分身之术的小鱼，同时接入 DSH 的会话体系，让你在桌面对话框里直接和她聊天。

> 基于开源桌面宠物 **大肥鱼桌宠 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion)**（桌面版）修改而来，遵循 **AGPL-3.0-or-later**。鲸鱼贴图随仓库分发已获 Pal-AI-Lab 许可（B 站联系取得，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)）。改动以「桌面化」为核心：全屏透明 Electron 窗、PowerShell 桌面探针、桌面图标搬运与复位、系统级语音快捷键、影分身之术等。

## 功能

### 陪伴与动作
- **自由漫步**：她在桌面上到处溜达、发呆、坐着（可关）
- **作息感**：深夜自动睡长觉，清晨说早安，白天偶尔打小盹
- **被冷落的小情绪**：太久没人理她会蔫 5 分钟
- **安静模式**：手动开关，开启后不再打扰（不漫步、不搬图标）
- **快捷指令**：对话框输入「打开XX」她跑去图标旁戳一下启动；「安静模式」「回地面」「番茄钟」等口令即用
- **换形象 / 换衣服**：8 套形象配色 × 女仆装 / 斗篷 / 水手服，右键即换

### 影分身
右键她 →「影分身」：

- **x1 / x10 / x50**：点多少来多少。每只都是完整的渲染实例，不是贴图快照——真步态、真表情、真睡姿，召唤出来就满屏自己溜达
- **拎起有重量感**：抓起来像拎一只吊着的玩偶，会晃；甩出去走抛物线、落地会弹一下，摔狠了会坐在地上晕一会儿
- **轻点一下 = 戳她**：会晕
- **跟随本体的设置**：原地待着、安静模式、她犯困或 DSH 干活时，分身同样安分；「溜达」开关只管本体，分身照常活动
- 和本体的区别：分身没有碎碎念气泡、不说话，也不碰你的桌面图标
- 右键分身可单独解除；「取消分身」一键全收

### 搬图标（可选）
- 闲下来时会把挡路的桌面图标抱起来挪走
- **搬运间隔**可调（秒/分钟），避免频繁搬动
- **图标复位**：每次搬之前自动存档（保留最近 12 档），一键撤销最近一次，连按可连撤
- 有窗口开着时不搬；DSH 在干活时也不搬

### 消息隔离（核心设计）
四种入口互不串台，谁问谁答：
| 入口 | 回答去向 |
|---|---|
| 桌宠对话框 / 语音 | 桌宠气泡 |
| QQ（dsh-onebot-qq） | QQ |
| B 站任务 | B 站 |
| Web 控制台 | Web |

实现方式是「回合级配对」：桌宠问出去的话会在会话流里产生一条 `user/message`，插件用内容前缀把它精确配对到所属回合，只有该回合的回答才进气泡；其他回合（QQ、后台任务、Web）一概不冒泡。

## 安装

1. 前提：本机已安装并运行 DSH（DeepSeek Harness），且 DSH 环境里有 electron（用于承载桌宠窗口）
2. 在 DSH 里添加插件，填入本仓库地址（`dsh plugin --profile web add github:MASTERBBLE/dsh-coo-pet`），或把整个 `coo-pet` 文件夹放进 DSH 的工作区（例如 `DSH工作区/whale-work/`）
3. 重启 DSH，桌宠出现；托盘/菜单可进入设置页

> 鲸鱼贴图已随仓库分发（已获原作者许可，见 THIRD_PARTY_NOTICES.md），装完即用，无需额外步骤。

### 路径自适应
插件不依赖写死的路径，按以下优先级探测：

| 资源 | 探测顺序 |
|---|---|
| DSH 工作区 | 环境变量 `DSH_HOME` → 按插件自身位置推导 |
| electron | 环境变量 `DSH_ELECTRON` → 工作区 `electron/` → 用户目录 `.dsh/electron/` |
| DSH 本体 | 环境变量 `DSH_EXE` → `%LOCALAPPDATA%\Programs\DeepSeek Harness\` |

### 绑定会话
在桌宠设置页填「绑定会话」（sessionId）：**填谁就接谁，不填不说话**——她不会自己猜会话，也不会把话漏到别处。

## 卸载

删掉 `coo-pet` 文件夹即可，无注册表、无系统服务、无残留。

## 目录结构

```
coo-pet/
├── index.js          # DSH 插件入口：HTTP 服务、气泡回合配对、桌宠进程管理
├── client.js         # 设置页（独立 web 页面）
└── assets/
    ├── desk-main.cjs # 桌宠 Electron 主进程：探针调用、图标快照历史
    ├── desk-probe.ps1# PowerShell 探针：枚举窗口 / 图标位置 / 移动 / 复位
    └── pet/
        ├── desk.html # 桌宠渲染层：动画、行为、气泡、菜单、影分身
        ├── kit/      # 动画引擎（改编自 Coopanion，AGPL 范围）
        ├── whale/    # 鲸鱼贴图包（经权利人许可随仓库分发）
        └── speech/   # 合成音库
```

## 注意事项

- 探针用 PowerShell 只读枚举窗口和图标位置，唯一会"改你东西"的动作是搬图标（可关、可复位）
- 运行时数据（`icon-snapshot*.json`、`settings.json`、日志）在首次运行时自动生成，已在 `.gitignore` 中排除
- 图标快照按图标名精确匹配复位；数量对不上时拒绝按序号兜底（宁可不动，不搬错）

## 问题反馈

- GitHub Issues: https://github.com/MASTERBBLE/dsh-coo-pet/issues （推荐，所有人可见，方便沉淀解决方法）
- QQ: 3967454362 （人、鱼混用，人能看到）

## 来源与致谢

- 鲸鱼形象的动画运行时、骨骼与音库来自 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion)
- 原角色「溟月」：上善无形；DeepSeek 女仆重绘：ZipZipPipe；分层贴图：Pal-AI-Lab
- 特别感谢 Pal-AI-Lab：大肥鱼的模组、外貌、表情和声音都做得非常可爱，也是他们慷慨许可贴图随本仓库分发，这只小鱼才能从网页游到你的桌面上——再次由衷感谢！
- 感谢以上作者。角色贴图的权利声明（不在 AGPL 授权范围内）见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

## License

整体组合程序采用 [AGPL-3.0-or-later](./LICENSE)。基于本项目的二次开发需同样以 AGPL-3.0-or-later 开源。
