/*
 * coo-pet — desktop pet plugin for DeepSeek Harness
 * Copyright (C) 2026 Masterbble
 * Based on the desktop pet Coopanion by Pal-AI-Lab: https://github.com/Pal-AI-Lab/Coopanion
 * SPDX-License-Identifier: AGPL-3.0-or-later (see LICENSE; third-party notices in THIRD_PARTY_NOTICES.md)
 */
/**
 * Coo 桌面模式（Electron 主进程）—— 全屏透明层版本。
 *
 * 用法：electron desk-main.cjs --url=http://127.0.0.1:PORT/dsh-coo-pet/desk.html
 *
 * 窗口铺满整个工作区、**从不移动**（挪透明窗要重合成，正是卡顿的来源）。
 * 页面自己按世界坐标画全部内容；窗口只负责承载和鼠标穿透。
 * 鼠标：整窗默认穿透，页面报命中框，主进程轮询光标决定要不要接管。
 * 另提供只读探针：可见窗口矩形（坐边沿）和桌面图标位置（坐图标 / 拖图标）。
 *
 * 鼠标租约（照 dsh-pet 的 mouse-lease 补的保险丝）：
 * - 页面的每条消息都算一次「心跳」；只有心跳在 LEASE_MS 内，才允许拦鼠标；
 * - 页面死了/卡死了：丢掉 dragging/menuOpen/hitBox，强制穿透——全屏玻璃
 *   永远不可能再扣住鼠标不放；
 * - 同一个判定最多 REASSERT_MS 就重申一次（重新调 setIgnoreMouseEvents），
 *   系统把窗口状态弄丢时能自愈。
 */
const { app, BrowserWindow, screen, ipcMain, globalShortcut, session } = require('electron')
const { execFile } = require('node:child_process')
const fs = require('node:fs')

// 麦克风/语音识别权限放行：桌宠窗口要用浏览器语音识别本地开麦。
// （识别在她自己的窗口里跑——主窗口里的麦克风桥会被后台节流，主窗口一藏起来语音就哑）
try {
  const micOk = (permission) => permission === 'media' || permission === 'speech' || permission === 'audioCapture'
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(micOk(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => micOk(permission))
} catch {
  /* 旧版 Electron 没有这些 API 就跳过 */
}
const path = require('node:path')

const arg = (name, fallback) => {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const url = arg('url', '')
const PROBE = path.join(__dirname, 'desk-probe.ps1')
const IS_WIN = process.platform === 'win32'

app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// Windows 的遮挡检测会把这块全屏透明窗当成「被盖住」，然后停掉它的绘制
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

let win = null
let ignore = true
let hitBoxes = [] // 命中框列表：本体 + 影分身 + 菜单/输入框（光标落在任一框里就接管鼠标）
let dragging = false
let menuOpen = false
let cursorTimer = null
let origin = { x: 0, y: 0 }
let world = { x: 0, y: 0, w: 0, h: 0 }

/* ---------- 鼠标租约 ---------- */
/** 页面心跳的保鲜期：超过这么久没听到页面说话，就不许再拦鼠标。 */
const LEASE_MS = 1500
/** 同一个判定隔这么久就重申一次（重新调 setIgnoreMouseEvents，自愈丢状态）。 */
const REASSERT_MS = 2000
let lastBeat = 0
let lastIgnore = null
let lastApplyAt = 0

/** 页面的每条消息都算一次心跳。 */
function beat() {
  lastBeat = Date.now()
}

const LOG = path.join(app.getPath('temp'), 'coo-desk.log')
function log(line) {
  try {
    require('node:fs').appendFileSync(LOG, new Date().toISOString() + ' ' + line + '\n')
  } catch {
    /* ignore */
  }
}

function setIgnore(next, force = false) {
  const now = Date.now()
  // 判定没变时只在 REASSERT_MS 到点后重申（自愈）；force 跳过去重与节流
  if (!force && lastIgnore === next && now - lastApplyAt < REASSERT_MS) return
  if (lastIgnore !== next) log('ignore -> ' + next)
  lastIgnore = next
  lastApplyAt = now
  if (!win || win.isDestroyed()) return
  ignore = next
  win.setIgnoreMouseEvents(next)
}

function workArea() {
  return screen.getPrimaryDisplay().workArea
}

/* DPI 换算：Win32 探针给的是物理像素，窗口里是逻辑像素（CSS）。
   125% 缩放时两者差 25%——图标/窗口坐标必须在边界上统一换算，不然她永远走不到目标旁边。 */
let SF = 1
function refreshScale() {
  try {
    SF = screen.getPrimaryDisplay().scaleFactor || 1
  } catch {
    SF = 1
  }
}
const toCss = (v) => Math.round(v / SF)
const toPhys = (v) => Math.round(v * SF)
const toCssRects = (data) =>
  (Array.isArray(data) ? data : []).map((it) => ({
    ...it,
    x: toCss(Number(it.x) || 0),
    y: toCss(Number(it.y) || 0),
    ...(typeof it.w === 'number' ? { w: toCss(it.w) } : {}),
    ...(typeof it.h === 'number' ? { h: toCss(it.h) } : {}),
  }))

function sendOrigin() {
  if (!win || win.isDestroyed()) return
  win.webContents.send('coo-origin', { origin, world })
}

/** 窗口不再跟随，只记下她的位置（留给探针 / 以后要做取景窗时用） */
function moveView(anchor) {
  if (!anchor) return
  lastAnchor = anchor
  // 诊断：她大幅挪窝时记一行（自由地面下 y 会变，固定地面下 y 恒定）
  const l = lastAnchorLog
  if (!l || Math.abs(anchor.x - l.x) > 40 || Math.abs(anchor.y - l.y) > 40) {
    lastAnchorLog = { x: anchor.x, y: anchor.y }
    log('anchor ' + Math.round(anchor.x) + ',' + Math.round(anchor.y))
  }
}

let lastAnchor = null
let lastAnchorLog = null

function startCursorWatch() {
  if (cursorTimer) clearInterval(cursorTimer)
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return
    const now = Date.now()
    // 心跳断了：页面死了或卡死了。全屏玻璃绝不允许扣着鼠标，丢状态强制穿透。
    if (now - lastBeat >= LEASE_MS) {
      if (dragging || menuOpen || hitBoxes.length) {
        log('lease expired: no page heartbeat for ' + Math.round(now - lastBeat) + 'ms, force pass-through')
      }
      dragging = false
      menuOpen = false
      hitBoxes = []
      setIgnore(true, true)
      return
    }
    if (dragging || menuOpen) {
      setIgnore(false)
      return
    }
    const point = screen.getCursorScreenPoint()
    if (!hitBoxes.length) {
      setIgnore(true)
      return
    }
    const inside = hitBoxes.some(
      (b) =>
        point.x >= b.x &&
        point.x <= b.x + b.w &&
        point.y >= b.y &&
        point.y <= b.y + b.h
    )
    setIgnore(!inside)
  }, 90)
}

let lastWinLog = null
function probe(mode, extra = [], timeout = 8000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PROBE, '-mode', mode, ...extra],
      { windowsHide: true, timeout },
      (error, stdout) => {
        if (error) {
          if (mode === 'windows') log('probe windows FAIL: ' + String(error.message || error).slice(0, 120))
          resolve({ ok: false, error: String(error.message || error) })
          return
        }
        const text = String(stdout || '').trim()
        if (!text) {
          // 空输出≠桌面干净：按失败处理，闸门保持关闭（有窗口开着就不许碰图标）
          if (mode === 'windows') log('probe windows EMPTY-OUTPUT (fail-closed)')
          resolve({ ok: false, error: 'empty probe output' })
          return
        }
        try {
          const parsed = JSON.parse(text)
          if (mode === 'windows') {
            const n = Array.isArray(parsed) ? parsed.length : -1
            const sig = 'ok n=' + n
            if (sig !== lastWinLog) {
              lastWinLog = sig
              log('probe windows ' + sig + (n > 0 ? ' [' + parsed.slice(0, 3).map((w) => w.cls).join(',') + ']' : ''))
            }
          }
          resolve({ ok: true, data: parsed })
        } catch (parseError) {
          if (mode === 'windows') log('probe windows PARSE-FAIL: ' + text.slice(0, 120))
          resolve({ ok: false, error: String(parseError.message || parseError) })
        }
      }
    )
  })
}

// 语音录音走 WebAudio：快捷键/鼠标键经 IPC 触发，不算页面用户手势，
// 不放开自动播放策略的话 AudioContext 会被创建成 suspended、一个字节都录不到
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(() => {
  if (!url) {
    app.quit()
    return
  }
  const work = workArea()
  refreshScale()
  screen.on('display-metrics-changed', refreshScale)
  world = { x: 0, y: 0, w: Math.round(work.width), h: Math.round(work.height) }
  origin = { x: 0, y: 0 }
  win = new BrowserWindow({
    x: Math.round(work.x),
    y: Math.round(work.y),
    width: world.w,
    height: world.h,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    // Windows：置顶窗不声明成 toolbar，Chromium 会以为被别的程序挡住而停画
    ...(IS_WIN ? { type: 'toolbar' } : {}),
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, 'desk-preload.cjs'),
      contextIsolation: false,
      nodeIntegration: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  }
  setIgnore(true)
  win.once('ready-to-show', () => {
    win.showInactive()
    sendOrigin()
    log('shown ' + JSON.stringify(win.getBounds()) + ' world ' + JSON.stringify(world))
  })
  win.webContents.on('did-finish-load', () => sendOrigin())
  win.loadURL(url)
  startCursorWatch()
  cleanupRestartTask()
  win.on('closed', () => {
    if (cursorTimer) clearInterval(cursorTimer)
    cursorTimer = null
    stopMouseWatch()
    win = null
    app.quit()
  })
})

app.on('before-quit', () => stopMouseWatch())

ipcMain.on('coo-anchor', (_event, payload) => {
  beat()
  const item = payload || {}
  const x = Number(item.x)
  const y = Number(item.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  moveView({ x, y })
})

ipcMain.on('coo-hitbox', (_event, box) => {
  beat()
  // 页面送来的是框列表：本体、影分身、菜单/输入框各一个（老版本是单框，兼容）
  const list = Array.isArray(box) ? box : box ? [box] : []
  hitBoxes = list
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      // 世界坐标即屏幕 DIP（窗口贴在工作区左上角且 origin 为 0）
      x: Math.round((Number(item.x) || 0) + world.x),
      y: Math.round((Number(item.y) || 0) + world.y),
      w: Math.round(Number(item.w) || 0),
      h: Math.round(Number(item.h) || 0),
    }))
    .filter((item) => item.w > 0 && item.h > 0)
})

ipcMain.on('coo-drag', (_event, flag) => {
  beat()
  dragging = flag === true
  if (dragging) setIgnore(false)
})

ipcMain.on('coo-hit', (_event, hit) => {
  beat()
  // 菜单开着时鼠标必须一直被我们接住，否则点「外面」关不掉菜单
  if (menuOpen) return
  setIgnore(!hit)
})
ipcMain.on('coo-menu', (_event, open) => {
  beat()
  menuOpen = open === true
  if (menuOpen) setIgnore(false)
})
ipcMain.on('coo-close', () => app.quit())

// 一键重启 DSH：脚本若由本进程直接拉起，会挂在 DSH 进程树下，被脚本自己的 taskkill /T 连树杀掉。
// 踩过的坑：WMI 在部分环境静默失败；explorer+vbs 在 wscript 被禁的机器上无声失败；
// schtasks /Create 默认"用电池不启动"，笔记本电池供电时任务卡 Queued 永不执行。
// 现方案：spawn powershell（探针同款通道，本环境必通）注册一个"电池可用、错过补跑"的计划任务
// 并立即 Start——任务由 Task Scheduler 服务代跑，彻底脱离 DSH 进程树；新桌宠启动时清理残留任务。
ipcMain.handle('coo-restart-dsh', () => {
  try {
    const { execFile } = require('node:child_process')
    const script = path.join(__dirname, 'restart-dsh.cmd')
    const psCmd =
      `$t = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(10)); ` +
      `$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3); ` +
      `$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c \"' + '${script.replace(/'/g, "''")}' + '\"'); ` +
      `Register-ScheduledTask -TaskName coo-restart-dsh -Trigger $t -Settings $s -Action $a -Force | Out-Null; ` +
      `Start-ScheduledTask -TaskName coo-restart-dsh`
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd],
      { windowsHide: true, timeout: 20000 },
      (err, so, se) => {
        log('restart-dsh register: ' + (err ? 'ERR ' + String(err.message || err).slice(0, 200) + ' ' + String(se || '').trim().slice(0, 200) : 'ok'))
      }
    )
    log('restart-dsh via scheduled-task (battery-safe)')
    return true
  } catch (error) {
    log('restart-dsh FAIL:', String(error && error.message ? error.message : error))
    return false
  }
})

// 启动时清理上一次重启留下的计划任务（任务触发时间设在 +10 分钟，
// 正常路径 1-2 秒内就执行完了；清不掉的兜底触发也早于新桌宠启动完成，不构成重启循环）
function cleanupRestartTask() {
  const { execFile } = require('node:child_process')
  execFile('schtasks.exe', ['/Delete', '/TN', 'coo-restart-dsh', '/F'], { windowsHide: true, timeout: 8000 }, () => {})
}

// 全屏透明窗是 focusable:false，拿不到键盘；语音快捷键只能走系统级注册
// 鼠标侧键（mouse3 中键 / mouse4 后退 / mouse5 前进）globalShortcut 不支持，
// 用 PowerShell 轮询 GetAsyncKeyState 盯状态变化，down/up 都回给页面（按住说话松开结束）
const MOUSE_VK = { 3: 0x04, 4: 0x05, 5: 0x06 } // VK_MBUTTON / VK_XBUTTON1 / VK_XBUTTON2
let mouseWatch = null

function stopMouseWatch() {
  if (mouseWatch) {
    try { mouseWatch.kill() } catch { /* ignore */ }
    mouseWatch = null
  }
}

function startMouseWatch(button) {
  stopMouseWatch()
  const vk = MOUSE_VK[button]
  if (!vk) return
  const script =
    "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern short GetAsyncKeyState(int k);' -Name U -Namespace W; " +
    `$prev=$false; while($true){ $d=[W.U]::GetAsyncKeyState(${vk}); $down=(($d -band 0x8000) -ne 0); ` +
    "if($down -ne $prev){ if($down){Write-Output 'down'}else{Write-Output 'up'} }; $prev=$down; Start-Sleep -m 40 }"
  try {
    mouseWatch = execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
      () => {}
    )
    let buf = ''
    mouseWatch.stdout.on('data', (chunk) => {
      buf += String(chunk)
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line === 'down' || line === 'up') {
          log('mouse-hot ' + line)
          if (win && !win.isDestroyed()) win.webContents.send('coo-hot', { state: line })
        }
      }
    })
    mouseWatch.on('exit', () => {
      mouseWatch = null
    })
  } catch (error) {
    log('mouse-watch FAIL: ' + String(error && error.message ? error.message : error))
    mouseWatch = null
  }
}

function registerHotkey(spec) {
  try {
    globalShortcut.unregisterAll()
  } catch {
    /* ignore */
  }
  const raw = String(spec || '').trim()
  const mouseMatch = /^mouse([345])$/i.exec(raw)
  if (mouseMatch) {
    startMouseWatch(Number(mouseMatch[1]))
    return
  }
  stopMouseWatch()
  if (!raw) return
  const parts = raw.split('+').map((s) => s.trim()).filter(Boolean)
  const key = (parts.pop() || '').toUpperCase()
  const mods = parts.map((p) => {
    const l = p.toLowerCase()
    if (l === 'ctrl' || l === 'control') return 'Control'
    if (l === 'alt') return 'Alt'
    if (l === 'shift') return 'Shift'
    if (l === 'meta' || l === 'win') return 'Super'
    return ''
  })
  const accel = [...mods.filter(Boolean), key].join('+')
  try {
    globalShortcut.register(accel, () => {
      if (win && !win.isDestroyed()) win.webContents.send('coo-hot')
    })
  } catch {
    /* 组合键不合法就忽略 */
  }
}

ipcMain.on('coo-hotkey', (_event, spec) => {
  beat()
  registerHotkey(spec)
})

ipcMain.handle('coo-world', () => ({ world, origin, view: { w: world.w, h: world.h } }))
ipcMain.handle('coo-windows', async () => {
  const out = await probe('windows')
  if (!out.ok) return out
  return { ok: true, data: toCssRects(out.data) }
})
ipcMain.handle('coo-icons', async () => {
  const out = await probe('icons')
  if (!out.ok) return out
  return { ok: true, data: toCssRects(out.data) }
})

// 输入框要打字：窗口平时 focusable:false（不抢焦点），开输入框时临时借一下键盘
ipcMain.handle('coo-chat-focus', (_event, on) => {
  try {
    if (on) {
      win.setFocusable(true)
      win.focus()
      // focusable 切换在 Windows 上会重建窗口句柄，补一下置顶顺序确保真拿到键盘焦点
      win.moveTop()
    } else {
      win.blur()
      win.setFocusable(false)
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
})
ipcMain.handle('coo-move-icon', (_event, payload) => {
  const item = payload || {}
  // 页面给的是 CSS 逻辑像素，LVM_SETITEMPOSITION 要物理像素
  return probe('move', ['-index', String(Number(item.index) || 0), '-x', String(toPhys(Number(item.x) || 0)), '-y', String(toPhys(Number(item.y) || 0))])
})

// 图标快照/复位：她每次抱图标前存一档（历史栈），「图标复位」按名字回写并弹出一档，可连按连撤
const ICON_SNAPSHOT = path.join(__dirname, 'icon-snapshot.json') // 兼容旧版：最新一档的镜像
const ICON_SNAPSHOT_DIR = path.join(__dirname, 'icon-snapshots') // 历史栈目录
const ICON_SNAPSHOT_KEEP = 12 // 最多留 12 档，再早的自动清掉

function snapshotFiles() {
  try {
    return fs
      .readdirSync(ICON_SNAPSHOT_DIR)
      .filter((f) => /^snap-\d+\.json$/.test(f))
      .sort()
  } catch {
    return []
  }
}

ipcMain.handle('coo-icons-snapshot', async () => {
  const out = await probe('icons')
  if (!out.ok) return out
  try {
    fs.mkdirSync(ICON_SNAPSHOT_DIR, { recursive: true })
    const file = path.join(ICON_SNAPSHOT_DIR, `snap-${Date.now()}.json`)
    fs.writeFileSync(file, JSON.stringify(out.data), 'utf8')
    fs.writeFileSync(ICON_SNAPSHOT, JSON.stringify(out.data), 'utf8') // 旧版镜像，兼容外部工具
    // 只留最近 N 档
    const olds = snapshotFiles().slice(0, -ICON_SNAPSHOT_KEEP)
    for (const f of olds) {
      try { fs.unlinkSync(path.join(ICON_SNAPSHOT_DIR, f)) } catch { /* ignore */ }
    }
    return { ok: true, n: Array.isArray(out.data) ? out.data.length : 0, kept: snapshotFiles().length }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
})
ipcMain.handle('coo-icons-restore', async () => {
  // 从最新一档恢复；恢复成功就弹出这一档（下次复位撤的是再上一次搬运），实现连撤
  // 注意 probe 返回 {ok, data}，n/ok 的真实值在 data 里（以前误读 out.n 导致快照永远弹不出，只能重复撤最后一档）
  const snaps = snapshotFiles()
  if (snaps.length) {
    const file = path.join(ICON_SNAPSHOT_DIR, snaps[snaps.length - 1])
    const out = await probe('restore', ['-from', file], 15000)
    const d = (out && out.data) || {}
    if (out && out.ok && (d.n || 0) > 0) {
      try { fs.unlinkSync(file) } catch { /* ignore */ }
    }
    return { ok: !!(out && out.ok), n: d.n || 0, undosLeft: snapshotFiles().length }
  }
  // 没有历史档时退回旧的单快照（不弹出，老行为）
  if (!fs.existsSync(ICON_SNAPSHOT)) return { ok: false, error: 'no snapshot' }
  const out = await probe('restore', ['-from', ICON_SNAPSHOT], 15000)
  const d = (out && out.data) || {}
  return { ok: !!(out && out.ok), n: d.n || 0 }
})

// 一键全复位：把历史栈一档档全部撤光，回到她第一次搬乱前的样子
ipcMain.handle('coo-icons-restore-all', async () => {
  let restored = 0
  let last = null
  for (let i = 0; i < 64; i++) {
    const snaps = snapshotFiles()
    if (!snaps.length) break
    const file = path.join(ICON_SNAPSHOT_DIR, snaps[snaps.length - 1])
    const out = await probe('restore', ['-from', file], 15000)
    const d = (out && out.data) || {}
    log('restore-all: iter ' + i + ' n=' + (d.n || 0))
    last = out
    if (out && out.ok && (d.n || 0) > 0) {
      restored += 1
      try { fs.unlinkSync(file) } catch { /* ignore */ }
    } else {
      break
    }
  }
  log('restore-all: done, restored=' + restored)
  // 历史栈撤光后兜底撤旧版单快照（老升级用户可能只有它）
  if (!restored && fs.existsSync(ICON_SNAPSHOT)) {
    const out = await probe('restore', ['-from', ICON_SNAPSHOT], 15000)
    const d = (out && out.data) || {}
    last = out
    if (out && out.ok && (d.n || 0) > 0) restored = 1
  }
  return { ok: restored > 0, restored, ...((last && last.data) || {}) }
})

// 指令开软件：按名字在开始菜单里找快捷方式（支持模糊匹配），找不到就让 Windows 自己解析
ipcMain.handle('coo-launch', (_event, name) => {
  beat()
  const q = String(name || '').trim()
  if (!q) return { ok: false, error: 'empty' }
  // 特例：explorer 必须裸启动（CreateProcess，无参数）才能真正接管外壳恢复桌面；
  // 走 cmd start / ShellExecute 只会开一个「此电脑」文件窗口
  if (/^explorer(\.exe)?$/i.test(q)) {
    const { spawn } = require('node:child_process')
    spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).unref()
    return { ok: true, app: 'explorer', shell: true }
  }
  const os = require('node:os')
  const fsp = require('node:fs')
  const dirs = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
    // 桌面快捷方式也认：她走到桌面图标旁边戳一下，启动的就是那个图标
    path.join(os.homedir(), 'Desktop'),
    'C:\\Users\\Public\\Desktop',
  ]
  let found = null
  const want = q.toLowerCase()
  const scan = (dir, depth) => {
    if (depth > 5 || found) return
    let list = []
    try { list = fsp.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const d of list) {
      const p = path.join(dir, d.name)
      if (d.isDirectory()) {
        scan(p, depth + 1)
      } else if (/\.lnk$/i.test(d.name)) {
        const base = d.name.replace(/\.lnk$/i, '')
        const b = base.toLowerCase()
        if ((b === want || b.includes(want)) && (!found || base.length < found.base.length)) {
          found = { path: p, base }
        }
      }
    }
  }
  for (const dir of dirs) scan(dir, 0)
  if (found) {
    execFile('cmd.exe', ['/c', 'start', '', found.path], { windowsHide: true }, () => {})
    return { ok: true, app: found.base }
  }
  // 兜底：Windows 的 start 能解析 App Paths / PATH 里的名字（notepad、mspaint 这类）
  execFile('cmd.exe', ['/c', 'start', '', q], { windowsHide: true }, () => {})
  return { ok: true, app: q, guess: true }
})
