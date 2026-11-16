/*
 * coo-pet — desktop pet plugin for DeepSeek Harness
 * Copyright (C) 2026 Masterbble
 * Based on the desktop pet Coopanion by Pal-AI-Lab: https://github.com/Pal-AI-Lab/Coopanion
 * SPDX-License-Identifier: AGPL-3.0-or-later (see LICENSE; third-party notices in THIRD_PARTY_NOTICES.md)
 */
/**
 * Coo pet — Host half.
 *
 * Watches agent status and tool dispatch, keeps a tiny live snapshot in memory,
 * serves it plus its own settings to the Client half over the Harness Web server.
 */

import z from '@deepseek-ai/schemastery'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, extname, join, normalize as normalizePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-coo-pet'

export const inject = ['webServer']

// DSH home 推导：优先 DSH_HOME 环境变量；没设时按 settings.json 实际落点判定——
// 插件可能装在 home\coo-pet（旧结构）或 home\whale-work\coo-pet（现结构），
// 简单取插件上一级会少一层、读写到错误的 settings.json（重启后配置"变回默认"的总根源）
function deriveHome() {
  const pluginDir = normalizePath(fileURLToPath(new URL('..', import.meta.url)))
  const parent = normalizePath(join(pluginDir, '..'))
  if (existsSync(join(parent, 'coo-pet', 'settings.json'))) return parent
  if (existsSync(join(pluginDir, 'coo-pet', 'settings.json'))) return pluginDir
  return parent
}
const HOME = process.env.DSH_HOME ?? deriveHome()
const SETTINGS_FILE = join(HOME, 'coo-pet', 'settings.json')
const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
const PET_ROOT = fileURLToPath(new URL('./assets/pet/', import.meta.url))

const DEFAULTS = {
  petName: '你的鱼',
  menuOrder: 'open,input,restart,reset,stay,free,duty,actions,look,outfit,none',
  menuOrderV2: false,
  menuOrderV3: false,
  menuOrderV4: false,
  attachSession: '',
  actOff: '',
  look: 'deepseek',
  outfit: 'maid',
  size: 190,
  opacity: 1,
  speed: 1,
  wander: false,
  answerBubble: true,
  idleBubble: true,
  greet: true,
  marginBottom: 150,
  voice: true,
  voiceMode: 'babble',
  voiceName: '',
  voiceRate: 1.05,
  voicePitch: 1.15,
  hotkey: 'Alt+V',
  hotkeyOn: true,
  sfx: true,
  display: 'desktop',
  idleLines: '',
  idleEvery: 20,
  idleUnit: 'min',
  actIcons: false,
  actSit: false,
  carryEvery: 0,
  carryUnit: 'min',
}

// 内置鲸鱼娘形象：8 个配色 × 3 套衣服
const SCHEMES = {
  deepseek: 'DeepSeek 蓝',
  harness: 'Harness 灰',
  chatgpt: 'ChatGPT 白',
  claude: 'Claude 橙',
  gemini: 'Gemini 彩',
  qwen: 'Qwen 紫',
  kimi: 'Kimi 蓝',
  minimax: 'MiniMax 粉',
}

const OUTFITS = {
  maid: '女仆装',
  cape: '斗篷',
  crew: '制服',
}

export const Config = z.object({
  petName: z.string().default('你的鱼').description('她的名字：碎碎念里的 {name}、右键列表标题都用它'),
  attachSession: z
    .string()
    .default('')
    .description('插入指定会话：填 Session ID 后，桌宠对话框和语音输入都发进这个会话，回答回流到气泡并朗读；留空跟当前会话'),
  menuOrder: z
    .string()
    .default('open,input,voice,close,web,desktop,both,none')
    .description('右键下拉列表的顺序（逗号分隔：open 打开DSH / input 输入 / restart 重启DSH / reset 图标复位 / stay 原地待着 / free 自由活动 / duty 安静模式 / ground 回地面 / actions 来一个 / look 换形象 / outfit 换衣服 / none 藏起来）'),
  actOff: z.string().default('').description('禁止她自动做的动作（逗号分隔：look,sit,sleep,dance,dizzy）'),
  look: z
    .union([
      z.const('deepseek'),
      z.const('harness'),
      z.const('chatgpt'),
      z.const('claude'),
      z.const('gemini'),
      z.const('qwen'),
      z.const('kimi'),
      z.const('minimax'),
    ])
    .default('harness')
    .description('桌宠形象：鲸鱼娘配色'),
  outfit: z
    .union([z.const('maid'), z.const('cape'), z.const('crew')])
    .default('maid')
    .description('鲸鱼娘的衣服'),
  size: z.number().min(64).max(420).step(2).default(190).description('桌宠高度（像素）'),
  opacity: z.number().min(0.2).max(1).step(0.05).default(1).description('不透明度'),
  speed: z.number().min(0.2).max(3).step(0.1).default(1).description('溜达速度倍率'),
  wander: z.boolean().default(false).description('自己来回溜达'),
  answerBubble: z.boolean().default(true).description('显示回答气泡（插入会话的回答）'),
  idleBubble: z.boolean().default(true).description('显示碎碎念气泡（闲来自言自语）'),
  greet: z.boolean().default(true).description('闲着的时候偶尔自言自语'),
  marginBottom: z.number().min(0).max(400).step(1).default(150).description('离屏幕底部的距离'),
  voice: z.boolean().default(true).description('说话时出声（用系统语音）'),
  voiceMode: z
    .union([z.const('babble'), z.const('tts')])
    .default('babble')
    .description('声音：babble 是内置咿呀音节声，tts 是系统朗读'),
  voiceName: z.string().default('').description('音色（仅 tts 用）：系统语音名，留空自动挑一个中文女声'),
  voiceRate: z.number().min(0.5).max(2).step(0.05).default(1.05).description('语速'),
  voicePitch: z.number().min(0.5).max(2).step(0.05).default(1.15).description('音调（越高越像小孩）'),
  hotkey: z.string().default('Alt+V').description('语音输入快捷键（Alt+V / Ctrl+Shift+M …）'),
  hotkeyOn: z.boolean().default(true).description('启用语音快捷键'),
  sfx: z.boolean().default(true).description('点她、跳起来时的音效'),
  display: z.union([z.const('desktop'), z.const('none')]).default('desktop').description('桌面显示 / 隐藏（网页浮层已下线）'),
  idleLines: z.string().default('').description('碎碎念内容，一行一句（全自定义，留空就不说）'),
  idleEvery: z.number().min(1).max(999).step(1).default(20).description('隔多久说一句碎碎念'),
  idleUnit: z.union([z.const('sec'), z.const('min'), z.const('hour')]).default('min').description('碎碎念时间单位：秒 / 分钟 / 小时'),
  actIcons: z.boolean().default(false).description('拖动图标：她闲下来会把桌面图标挪一挪（仅桌面模式）'),
  actSit: z.boolean().default(false).description('随便坐：她闲下来会坐在桌面图标或窗口边沿上'),
  carryEvery: z.number().default(0).description('两次搬图标的最小间隔；0 = 不限制'),
  carryUnit: z
    .union([z.const('sec'), z.const('min')])
    .default('min')
    .description('搬运间隔的单位：sec 秒 / min 分钟'),
})

const TOOL_LABELS = {
  read: '读文件',
  read_file: '读文件',
  read_multiple_files: '读文件',
  write: '写文件',
  write_file: '写文件',
  edit: '改文件',
  edit_file: '改文件',
  multi_edit: '改文件',
  glob: '找文件',
  grep: '搜代码',
  pwsh: '跑命令',
  bash: '跑命令',
  subagent: '派个小弟',
  subagent_fork: '派个小弟',
  web_search: '上网查',
  web_fetch: '看网页',
  generate_image: '画画',
  edit_image: '修图',
  todo_write: '列清单',
  compress: '整理记忆',
  decompress: '翻记忆',
  search_context: '翻记忆',
  skill: '翻手册',
  workflow: '排流程',
  plugin_manager: '装插件',
  cordis_inspect_list: '看插件',
  cordis_inspect_query: '看插件',
  screen_look: '看屏幕',
  screen_act: '动鼠标',
  schedule_create: '定闹钟',
  ask_user_question: '问 master',
  create_goal: '立目标',
  update_goal: '改目标',
  present: '交作业',
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ogg': 'audio/ogg',
}

function labelOf(tool) {
  if (typeof tool !== 'string' || tool === '') return '忙别的'
  const bare = tool.includes('__') ? tool.slice(tool.lastIndexOf('__') + 2) : tool
  return TOOL_LABELS[bare] ?? TOOL_LABELS[tool] ?? bare.slice(0, 12)
}

function firstStringArg(args) {
  if (args === null || typeof args !== 'object') return ''
  for (const key of ['path', 'file_path', 'pattern', 'query', 'command', 'text', 'name', 'url', 'description']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  for (const value of Object.values(args)) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

function clip(text, limit) {
  const flat = String(text).replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  return `${flat.slice(0, limit)}…`
}

function sendJson(res, code, body) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  // DSH 渲染页（dsh-app://app）用绝对地址轮询时是跨源，没有这个头会被 CORS 拦掉
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

// 二进制版：收 WAV 录音用
async function readBodyRaw(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function normalize(raw) {
  const next = { ...DEFAULTS }
  if (raw && typeof raw === 'object') {
    if (Object.hasOwn(SCHEMES, raw.look ?? '')) next.look = raw.look
    if (Object.hasOwn(OUTFITS, raw.outfit ?? '')) next.outfit = raw.outfit
    if (typeof raw.petName === 'string') next.petName = raw.petName.trim().slice(0, 20) || DEFAULTS.petName
    if (typeof raw.menuOrder === 'string') next.menuOrder = raw.menuOrder.trim().slice(0, 200) || DEFAULTS.menuOrder
    if (raw.menuOrderV2 === true) next.menuOrderV2 = true
    // 一次性迁移：旧排序里没有的固定项（复位/原地/自由/来一个/换形象/换衣服）补到末尾，之后用户删了就不再补
    if (next.menuOrderV2 !== true) {
      const ids = next.menuOrder.split(',').map((s) => s.trim()).filter(Boolean)
      for (const id of ['reset', 'stay', 'free', 'actions', 'look', 'outfit']) {
        if (!ids.includes(id)) ids.push(id)
      }
      next.menuOrder = ids.join(',')
      next.menuOrderV2 = true
    }
    // 二次迁移：重启DSH 上线，补进现有排序（close 后面），老用户删了不再补
    if (raw.menuOrderV3 === true) next.menuOrderV3 = true
    if (next.menuOrderV3 !== true) {
      const ids = next.menuOrder.split(',').map((s) => s.trim()).filter(Boolean)
      if (!ids.includes('restart')) {
        const at = ids.indexOf('close')
        ids.splice(at === -1 ? ids.length : at + 1, 0, 'restart')
      }
      next.menuOrder = ids.join(',')
      next.menuOrderV3 = true
    }
    // 三次迁移：菜单全项可排序上线，「下班了」「回地面」补进现有排序（free 后 / 末尾），老用户删了不再补
    if (raw.menuOrderV4 === true) next.menuOrderV4 = true
    if (next.menuOrderV4 !== true) {
      const ids = next.menuOrder.split(',').map((s) => s.trim()).filter(Boolean)
      if (!ids.includes('duty')) {
        const at = ids.indexOf('free')
        ids.splice(at === -1 ? ids.length : at + 1, 0, 'duty')
      }
      if (!ids.includes('ground')) ids.push('ground')
      next.menuOrder = ids.join(',')
      next.menuOrderV4 = true
    }
    if (typeof raw.attachSession === 'string') next.attachSession = raw.attachSession.trim().slice(0, 200)
    if (typeof raw.actOff === 'string') next.actOff = raw.actOff.trim().slice(0, 200)
    if (typeof raw.voiceName === 'string') next.voiceName = raw.voiceName.trim()
    if (typeof raw.hotkey === 'string') next.hotkey = raw.hotkey.trim().slice(0, 40)
    if (typeof raw.hotkeyOn === 'boolean') next.hotkeyOn = raw.hotkeyOn
  if (typeof raw.idleLines === 'string') next.idleLines = raw.idleLines.slice(0, 4000)
  if (typeof raw.idleEvery === 'number' && isFinite(raw.idleEvery)) next.idleEvery = Math.min(999, Math.max(1, Math.round(raw.idleEvery)))
  if (raw.idleUnit === 'sec' || raw.idleUnit === 'min' || raw.idleUnit === 'hour') next.idleUnit = raw.idleUnit
  if (typeof raw.actIcons === 'boolean') next.actIcons = raw.actIcons
  if (typeof raw.actSit === 'boolean') next.actSit = raw.actSit
  if (typeof raw.carryEvery === 'number' && isFinite(raw.carryEvery)) next.carryEvery = Math.min(720, Math.max(0, Math.round(raw.carryEvery)))
  if (raw.carryUnit === 'sec' || raw.carryUnit === 'min') next.carryUnit = raw.carryUnit
  if (typeof raw.sfx === 'boolean') next.sfx = raw.sfx
  if (raw.display === 'desktop' || raw.display === 'none') next.display = raw.display
  // 老配置里的 web / both 一律并入桌面（网页浮层已下线）
  if (raw.display === 'web' || raw.display === 'both') next.display = 'desktop'
    if (raw.voiceMode === 'babble' || raw.voiceMode === 'tts') next.voiceMode = raw.voiceMode
    const num = (value, min, max, fallback) => {
      const n = Number(value)
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
    }
    next.size = num(raw.size, 64, 420, DEFAULTS.size)
    next.opacity = num(raw.opacity, 0.2, 1, DEFAULTS.opacity)
    next.speed = num(raw.speed, 0.2, 3, DEFAULTS.speed)
    next.marginBottom = num(raw.marginBottom, 0, 400, DEFAULTS.marginBottom)
    next.voiceRate = num(raw.voiceRate, 0.5, 2, DEFAULTS.voiceRate)
    next.voicePitch = num(raw.voicePitch, 0.5, 2, DEFAULTS.voicePitch)
    for (const key of ['wander', 'answerBubble', 'idleBubble', 'greet', 'voice']) {
      if (typeof raw[key] === 'boolean') next[key] = raw[key]
    }
    // 老配置迁移：单一 bubble 开关拆成 回答气泡 / 碎碎念气泡
    if (raw.bubble === false && typeof raw.answerBubble !== 'boolean' && typeof raw.idleBubble !== 'boolean') {
      next.answerBubble = false
      next.idleBubble = false
    }
  }
  return next
}

export function apply(ctx, config = {}) {
  let settings = normalize({ ...config })
  // 上一次应用失败时旧路由可能还挂着，这里兜一层，别把整条插件拖死
  const safeRegister = (route) => {
    try {
      return ctx.webServer.register(route)
    } catch (error) {
      console.warn('[coo-pet] route already registered:', route && route.path, String(error))
      return () => {}
    }
  }
  let report = null
  let lastHost = ''
  let deskBootTimer = null

  /* ---------- 插入会话：捕获回答流，投回气泡 ---------- */
  let answerSeq = 0
  let answerLast = null
  let answerText = ''
  // 气泡门（回合级配对，同 dsh-onebot-qq 的思路）：桌宠对话框/语音问出去的问题（走 /prompt），
  // 会在会话流里看到一条一模一样的 user/message——用内容前缀精确配对到她那一回合，
  // 回合内的回答才进气泡；QQ、后台任务、web 控制台的回答一律不冒泡。
  let petAsk = null // { sid, prefix, at } 桌宠刚问出去的话（等 user/message 配对）
  let petTurnSid = '' // 配对成功的回合所在会话（配对成功→turn/end 之间有效）
  let petTurnAt = 0
  let petAttempt = '' // 这一回合的回答 attemptId（start 帧抓到后精确到流）
  const PET_TURN_MS = 15 * 60 * 1000
  const BUBBLE_START_MS = 20000 // 配对失败时的兑底：问出去 20 秒内出现的第一个新 attempt 算她的
  const wantSession = () => String(settings.attachSession || '').trim()

  // 插入会话的状态：ok = null 没填/未知，true 在列表里见过，false 确认跟丢了
  const attachState = { ok: null, title: '', checkedAt: 0 }
  let attachChecking = false
  const checkAttach = async (force) => {
    const id = wantSession()
    if (!id) {
      attachState.ok = null
      attachState.title = ''
      return
    }
    if (!force && attachState.ok !== null && Date.now() - attachState.checkedAt < 30000) return
    if (attachChecking) return
    attachChecking = true
    try {
      const controller = ctx.get('sessionController')
      let hit = null
      if (controller && typeof controller.listSessions === 'function') {
        const list = await controller.listSessions()
        const arr = Array.isArray(list) ? list : Array.isArray(list && list.sessions) ? list.sessions : []
        hit = arr.find((item) => item && String(item.sessionId ?? item.id ?? item.sessionID ?? '') === id) || null
      }
      // 列表里见到只作「确认还活着」；查不到不算失败——listSessions 往往只返回最近活跃会话，
      // 启动时列表经常为空，误判会开机就喊「跟丢了」。真正的失败只由 prompt 调用报错判定。
      if (controller && hit) {
        attachState.ok = true
        attachState.title = String(hit.title ?? hit.name ?? hit.label ?? '')
        attachState.checkedAt = Date.now()
      } else {
        attachState.checkedAt = Date.now()
      }
    } catch {
      /* 列表读不到就保持现状 */
    } finally {
      attachChecking = false
    }
  }

  const extractSession = (frame) => {
    try {
      const raw = JSON.stringify(frame)
      const m = raw && raw.match(/"(?:sessionId|session_id|session)":\s*"([^"]+)"/)
      return m ? m[1] : ''
    } catch { return '' }
  }

  // 回合配对：监听会话事件，桌宠问出去的那条 user/message 出现时锁定她的回合
  try {
    ctx.on('session/event', (...args) => {
      try {
        const first = args[0]
        const event = args.length > 1 ? args[1] : (first && (first.event || first.payload))
        const type = event && event.type
        if (!type) return
        const holder = args.length > 1 ? first : (event && (event.session || first))
        const sid = String((holder && (holder.id ?? holder.sessionId ?? holder.sessionID)) ?? (event && (event.sessionId ?? event.sessionID)) ?? '')
        const blocksOf = (obj) => {
          const data = (obj && obj.data) || obj || {}
          const message = data.message || data
          const blocks = Array.isArray(message.content) ? message.content : []
          // 只收正文块（type 'text'）：思考（thinking/reasoning）等其它块一律不算回答
          return blocks
            .filter((b) => {
              if (typeof b === 'string') return true
              if (!b || typeof b !== 'object') return false
              const t = b.type
              return (t === undefined || t === 'text') && typeof b.text === 'string'
            })
            .map((b) => (typeof b === 'string' ? b : b.text))
            .join('')
        }
        if (type === 'user/message') {
          // 桌宠刚问出去的那条话出现了：锁定这个会话的当前回合
          if (!petAsk || !sid || sid !== petAsk.sid) return
          const text = blocksOf(event).trim()
          if (!text || !text.startsWith(petAsk.prefix)) return
          petTurnSid = sid
          petTurnAt = Date.now()
          petAttempt = ''
          answerText = ''
          return
        }
        if (type === 'assistant/message') {
          // 她这一回合的最终正文（完整版），覆盖流式累积的片段
          if (!petTurnSid || sid !== petTurnSid) return
          if (Date.now() - petTurnAt > PET_TURN_MS) return
          // 带工具调用的消息是「边想边干」的中间段（如「我先查一下……」），不算回答——
          // 最终结果是不带工具调用的那条正文
          const data = (event && event.data) || event || {}
          const message = data.message || data
          const blocks = Array.isArray(message.content) ? message.content : []
          const hasToolCall = blocks.some((b) => {
            if (!b || typeof b !== 'object') return false
            if (b.type === 'tool_use' || b.type === 'tool-call' || b.type === 'toolCall') return true
            return Boolean(b.toolName || b.tool || (Array.isArray(b.toolCalls) && b.toolCalls.length))
          })
          if (hasToolCall) return
          const text = blocksOf(event).trim()
          if (!text) return
          answerText = text.slice(0, 4000)
          answerSeq += 1
          answerLast = { seq: answerSeq, text: answerText.slice(0, 800), session: sid, at: Date.now() }
          return
        }
        if (type === 'turn/end') {
          // 回合结束：配对失效，之后的回答不再进气泡
          if (petTurnSid && (!sid || sid === petTurnSid)) {
            petTurnSid = ''
            petAsk = null
          }
        }
      } catch { /* ignore */ }
    })
  } catch {
    /* 事件源不存在就跳过 */
  }

  for (const ev of ['agent/assistant-stream']) {
    try {
      ctx.on(ev, (payload) => {
        try {
          // 气泡跟着「她实际问的那个会话」走：对话框/语音问的是谁就接谁的回答，
          // 不再依赖 attachSession——没填绑定会话（跟随控制台当前会话）也能冒泡
          const want = petTurnSid || (petAsk && petAsk.sid) || wantSession()
          if (!want) return
          const turnLive = petTurnSid === want && Date.now() - petTurnAt < PET_TURN_MS
          // 兑底：若回合配对没等到（事件形状变化），退回旧的时间窗判定
          const fallbackLive = !petTurnSid && petAsk && petAsk.sid === want && Date.now() - petAsk.at < BUBBLE_START_MS
          if (!turnLive && !fallbackLive) return
          const frame = payload && payload.frame
          const ftype = frame && frame.type
          const attempt = frame && typeof frame.attemptId === 'string' ? frame.attemptId : ''
          if (ftype === 'start') {
            if (!petAttempt && attempt) {
              petAttempt = attempt
              answerText = ''
            }
            return
          }
          // 工具调用/结果帧：她进入「边想边干」状态——之前累积的中间独白清空，
          // 之后的正文才是给用户的结果
          if (typeof ftype === 'string' && /tool/i.test(ftype)) {
            answerText = ''
            return
          }
          if (ftype !== 'chunk') return
          const sid = extractSession(frame || payload)
          if (sid && sid !== want) return
          // 精确配对：抓到了桌宠的 attempt 就只接它的 chunk；别的 attempt（QQ 等）一律不进气泡
          if (petAttempt && attempt && attempt !== petAttempt) return
          // 只收正文（text-delta），思考流（reasoning-delta）和工具调用一概不进气泡；正文按顺序累积
          const chunk = frame && frame.chunk
          if (!chunk || chunk.type !== 'text-delta') return
          const piece = typeof chunk.text === 'string' ? chunk.text : ''
          if (!piece) return
          answerText = (answerText + piece).slice(0, 4000)
          answerSeq += 1
          answerLast = { seq: answerSeq, text: answerText.slice(0, 800), session: sid || want, at: Date.now() }
          if (sid === want || !sid) attachState.ok = true
        } catch { /* ignore */ }
      })
    } catch {
      /* 事件源不存在就跳过 */
    }
  }

  // 桌面窗要连的地址：优先问 webServer，其次用最近一次请求的 Host
  function realOrigin() {
    const strip = (v) => String(v).replace(/^https?:\/\//, '').replace(/\/+$/, '')
    try {
      const got = ctx.webServer && (ctx.webServer.getOrigin ? ctx.webServer.getOrigin() : ctx.webServer.origin)
      if (typeof got === 'string' && got) return strip(got)
    } catch {
      /* ignore */
    }
    if (lastHost) return strip(lastHost)
    try {
      const addr = ctx.webServer && ctx.webServer.server && ctx.webServer.server.address ? ctx.webServer.server.address() : null
      if (addr && addr.port) return '127.0.0.1:' + addr.port
    } catch {
      /* ignore */
    }
    return '127.0.0.1:54869'
  }
  let lastSay = null
  let actSeq = 0
  let actLast = null
  let saySeq = 0
  let sayLast = null
  let voiceSeq = 0
  let voiceLast = null
  const reports = {}

  readFile(SETTINGS_FILE, 'utf8')
    .then((text) => {
      const raw = JSON.parse(text)
      const next = normalize({ ...settings, ...raw })
      const migrated = next.menuOrder !== String(raw.menuOrder ?? '')
      settings = next
      // 菜单迁移只走内存的话，重启会复活用户删掉的项——迁移过就立刻落盘
      if (migrated) persist().catch(() => {})
    })
    .catch(() => {
      /* 第一次跑，没有文件就是对的 */
    })

  const persist = async () => {
    await mkdir(dirname(SETTINGS_FILE), { recursive: true })
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8')
  }

  const state = { seq: 0, mood: 'idle', status: 'idle', note: '', bubble: null, updatedAt: Date.now() }

  const bump = (patch) => {
    Object.assign(state, patch)
    state.seq += 1
    state.updatedAt = Date.now()
  }

  ctx.on('agent/status', (payload) => {
    const status = payload && payload.status === 'running' ? 'running' : 'idle'
    if (status === 'running') bump({ status, mood: state.mood === 'oops' ? 'oops' : 'think' })
    else bump({ status, mood: 'idle', note: '' })
  })

  ctx.on('tools/pre-execute', (exec, next) => {
    try {
      const tool = exec && (exec.name ?? exec.tool ?? exec.toolName)
      const args = exec && (exec.args ?? exec.arguments ?? exec.input)
      const extra = clip(firstStringArg(args), 28)
      const label = labelOf(tool)
      bump({
        status: 'running',
        mood: 'work',
        note: extra === '' ? label : `${label} · ${extra}`,
        bubble: { text: extra === '' ? label : `${label}：${extra}`, at: Date.now() },
      })
    } catch {
      /* never break dispatch */
    }
    return next()
  })

  ctx.on('tools/result', (exec, result) => {
    try {
      const failed = result && (result.isError === true || result.error !== undefined || result.ok === false)
      if (failed) bump({ mood: 'oops', note: '出错了…' })
    } catch {
      /* ignore */
    }
  })

  const disposers = []

  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/pulse',
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/dsh-coo-pet/pulse', 'http://localhost')
        const since = Number(url.searchParams.get('since') ?? '0')
        sendJson(res, 200, {
          ok: true,
          changed: state.seq !== since,
          seq: state.seq,
          mood: state.mood,
          status: state.status,
          note: state.note,
          bubble: state.bubble,
          updatedAt: state.updatedAt,
        })
      },
    })
  )

  const describe = (req) => {
    // 插入会话状态懒校验：桌面窗 3 秒一轮 prefs，这里节流 30 秒查一次会话列表
    checkAttach().catch(() => {})
    return {
      ok: true,
      config: settings,
      base: `http://${req?.headers?.host ?? '127.0.0.1'}`,
      looks: Object.keys(SCHEMES).map((id) => ({ id, label: SCHEMES[id], thumb: `/dsh-coo-pet/pet/asset?p=${encodeURIComponent(`whale/thumbs/${id}.png`)}` })),
      outfits: Object.keys(OUTFITS).map((id) => ({ id, label: OUTFITS[id], thumb: `/dsh-coo-pet/pet/asset?p=${encodeURIComponent(`whale/thumbs/${id}.png`)}` })),
      defaults: DEFAULTS,
      settingsFile: SETTINGS_FILE,
      attach: { id: wantSession(), ok: attachState.ok, title: attachState.title, checkedAt: attachState.checkedAt },
      busy: state.status === 'running',
      lastActiveAt: state.updatedAt,
      mood: state.mood,
    }
  }

  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/prefs',
      handler: async (req, res) => {
        if (req.method === 'POST') {
          try {
            lastHost = req.headers.host ?? lastHost
            const body = JSON.parse((await readBody(req)) || '{}')
            settings = normalize({ ...settings, ...body })
            await persist()
            state.seq += 1
            state.updatedAt = Date.now()
            syncDesk(settings.display)
sendJson(res, 200, describe(req))
          } catch (error) {
            sendJson(res, 400, { ok: false, error: String(error && error.message ? error.message : error) })
          }
          return
        }
        lastHost = req.headers.host ?? lastHost
        sendJson(res, 200, describe(req))
      },
    })
  )

  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/config',
      handler: async (req, res) => {
        sendJson(res, 200, describe(req))
      },
    })
  )

  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/bubble',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'POST only' })
          return
        }
        try {
          const body = JSON.parse((await readBody(req)) || '{}')
          const text = typeof body.text === 'string' ? body.text.trim() : ''
          if (text === '') {
            sendJson(res, 400, { ok: false, error: 'text 必填' })
            return
          }
          bump({ mood: typeof body.mood === 'string' ? body.mood : 'happy', bubble: { text: clip(text, 90), at: Date.now() } })
          sendJson(res, 200, { ok: true })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error && error.message ? error.message : error) })
        }
      },
    })
  )

  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/test',
      handler: async (req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        try {
          const html = await readFile(join(PET_ROOT, 'test.html'), 'utf8')
          res.end(html)
        } catch (error) {
          res.statusCode = 404
          res.end(`test.html missing: ${String(error)}`)
        }
      },
    })
  )

  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/build',
      handler: async (_req, res) => {
        let version = VERSION
        try {
          version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
        } catch {
          /* 读不到就用启动时那份 */
        }
        sendJson(res, 200, { ok: true, version })
      },
    })
  )
  disposers.push(

    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/report',
      handler: async (req, res) => {
        if (req.method === 'POST') {
          try {
            report = { ...JSON.parse((await readBody(req)) || '{}'), at: Date.now() }
            if (report && report.status) {
              reports[report.status] = report
              if (Object.keys(reports).length > 24) delete reports[Object.keys(reports)[0]]
              // 诊断：每条上报都落一份到日志（报告接口只留每类最新一条，时间线会被冲掉）
              try {
                const { appendFile } = await import('node:fs/promises')
                await appendFile(
                  new URL('./coo-reports.log', import.meta.url),
                  new Date().toISOString() + ' ' + report.status + ' ' + JSON.stringify(report).slice(0, 500) + '\n'
                )
              } catch {
                /* ignore */
              }
            }
          } catch {
            report = { status: 'error', message: 'bad json', at: Date.now() }
          }
          sendJson(res, 200, { ok: true })
          return
        }
        sendJson(res, 200, { ok: true, report, reports, lastSay, config: settings })
      },
    })
  )

  // 动作口：设置页的「试一下」把动作广播给桌面那只
  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/act',
      handler: async (req, res) => {
        if (req.method === 'POST') {
          let body = {}
          try {
            body = JSON.parse((await readBody(req)) || '{}')
          } catch {
            sendJson(res, 400, { ok: false, error: 'bad json' })
            return
          }
          const act = String(body.act ?? '').trim().slice(0, 24)
          if (!act) {
            sendJson(res, 400, { ok: false, error: 'empty' })
            return
          }
          actSeq += 1
          // launch 带名字：语音「打开XX」经 act 队列传给桌面的那只
          actLast = { seq: actSeq, act, name: String(body.name ?? '').trim().slice(0, 60), at: Date.now() }
          sendJson(res, 200, { ok: true, seq: actSeq })
          return
        }
        const since = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('since') ?? 0) || 0
        sendJson(res, 200, { ok: true, seq: actSeq, act: actSeq > since ? actLast : null })
      },
    })
  )

  // 说话口：设置页的「试听」「测试」把一句话送到桌面那只
  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/say',
      handler: async (req, res) => {
        if (req.method === 'POST') {
          let body = {}
          try {
            body = JSON.parse((await readBody(req)) || '{}')
          } catch {
            sendJson(res, 400, { ok: false, error: 'bad json' })
            return
          }
          const text = String(body.text ?? '').trim().slice(0, 200)
          const mode = body.mode === 'tts' ? 'tts' : body.mode === 'babble' ? 'babble' : ''
          if (!text) {
            sendJson(res, 400, { ok: false, error: 'empty' })
            return
          }
          saySeq += 1
          sayLast = { seq: saySeq, text, mode, at: Date.now() }
          sendJson(res, 200, { ok: true, seq: saySeq })
          return
        }
        const since = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('since') ?? 0) || 0
        sendJson(res, 200, { ok: true, seq: saySeq, say: saySeq > since ? sayLast : null })
      },
    })
  )

  // 麦克风开关广播：桌面窗口按快捷键 → 网页浮层那边真正开口
  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/voice',
      handler: async (req, res) => {
        if (req.method === 'POST') {
          let body = {}
          try {
            body = JSON.parse((await readBody(req)) || '{}')
          } catch {
            sendJson(res, 400, { ok: false, error: 'bad json' })
            return
          }
          voiceSeq += 1
          voiceLast = { seq: voiceSeq, on: body.on === true, at: Date.now() }
          sendJson(res, 200, { ok: true, seq: voiceSeq })
          return
        }
        const since = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('since') ?? 0) || 0
        sendJson(res, 200, { ok: true, seq: voiceSeq, voice: voiceSeq > since ? voiceLast : null })
      },
    })
  )

  // 语音识别的文字口：识别中（interim）/最终（final）都发这里，
  // 桌面窗轮询拿去填进她的输入框，最终一句由桌面自己走提交流程（含「打开XX」本地指令）
  let voiceTextSeq = 0
  let voiceTextLast = null
  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/voicetext',
      handler: async (req, res) => {
        if (req.method === 'POST') {
          try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const text = String(body.text ?? '').slice(0, 2000)
            voiceTextSeq += 1
            voiceTextLast = { seq: voiceTextSeq, text, final: body.final === true, at: Date.now() }
            sendJson(res, 200, { ok: true, seq: voiceTextSeq })
          } catch (error) {
            sendJson(res, 400, { ok: false, error: String(error && error.message ? error.message : error) })
          }
          return
        }
        const since = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('since') ?? 0) || 0
        sendJson(res, 200, { ok: true, seq: voiceTextSeq, text: voiceTextSeq > since ? voiceTextLast : null })
      },
    })
  )

  // 本地语音识别口：桌面窗把录到的 WAV（16kHz 单声）POST 上来，
  // 用本机 whisper.cpp（whisper-cli）转写——不联网、不吃 Google 服务。
  // 桌面端录音期间每几秒发一次全量录音（partial=1）当"中间结果"，
  // 松开后再发一次（final）当最终结果。
  const WHISPER_EXE = process.env.DSH_WHISPER
    ?? join(dirname(HOME), 'tools', 'whisper', 'Release', 'whisper-cli.exe')
  const WHISPER_MODEL_DIR = process.env.DSH_AUDIO_MODELS
    ?? join(HOME, 'audio-models')
  const WHISPER_MODEL = join(WHISPER_MODEL_DIR, 'ggml-base.bin')
  // whisper 单进程：忙时不拒请求，改成排队（中间刷新和松手后的最终转写会
  // 几乎同时到达，拒掉忙的那次会把最终结果弄丢）
  let whisperQueue = Promise.resolve()
  const runWhisperQueued = (wav) => {
    const job = whisperQueue.then(() => runWhisper(wav), () => runWhisper(wav))
    whisperQueue = job.then(() => {}, () => {})
    return job
  }
  const runWhisper = async (wav) => {
    if (!existsSync(WHISPER_EXE)) return { ok: false, error: '没找到 whisper-cli（' + WHISPER_EXE + '）' }
    if (!existsSync(WHISPER_MODEL)) return { ok: false, error: '没找到 whisper 模型（' + WHISPER_MODEL + '）' }
    try {
      const tmp = join(WHISPER_MODEL_DIR, '.coo-utterance.wav')
      await writeFile(tmp, wav)
      return await new Promise((resolve) => {
        const child = spawn(WHISPER_EXE, ['-m', WHISPER_MODEL, '-l', 'zh', '-nt', '-np', '-f', tmp], {
          windowsHide: true,
          timeout: 20000,
        })
        let out = ''
        child.stdout.on('data', (d) => { out += String(d) })
        child.on('error', (error) => resolve({ ok: false, error: String((error && error.message) || error) }))
        child.on('close', (code) => {
          // whisper-cli 文本行：去掉空行和 [00:00:00.000] 之类残留
          const text = out
            .split('\n')
            .map((line) => line.replace(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/, '').trim())
            .filter((line) => line && !/^\[/.test(line))
            .join('')
            .trim()
          resolve({ ok: code === 0, text, code })
        })
      })
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error) }
    }
  }
  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/voicerec',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'POST only' })
          return
        }
        const isFinal = new URL(req.url ?? '/', 'http://x').searchParams.get('final') === '1'
        try {
          const wav = await readBodyRaw(req)
          if (!wav || wav.length < 2000) {
            sendJson(res, 200, { ok: false, error: 'empty' })
            return
          }
          const r = await runWhisperQueued(wav)
          sendJson(res, 200, { ok: r.ok, text: r.text ?? '', error: r.error, final: isFinal })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    })
  )

  // 会话列表：设置页「插入会话」的下拉候选（sessionController 的方法名各版本可能不同，逐个试）
  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/sessions',
      handler: async (req, res) => {
        const out = []
        let used = ''
        try {
          const controller = ctx.get('sessionController')
          if (controller) {
            for (const name of ['listSessions', 'list', 'sessions', 'all']) {
              if (typeof controller[name] !== 'function') continue
              used = name
              const got = await controller[name]()
              const arr = Array.isArray(got) ? got : Array.isArray(got && got.sessions) ? got.sessions : []
              for (const item of arr) {
                if (typeof item === 'string') out.push({ id: item })
                else if (item && typeof item === 'object') {
                  const id = item.id ?? item.sessionId ?? item.sessionID
                  if (id) out.push({ id: String(id), title: String(item.title ?? item.name ?? item.label ?? '') })
                }
                if (out.length >= 50) break
              }
              break
            }
          }
        } catch {
          /* 列表拿不到就算了，返回空 */
        }
        sendJson(res, 200, { ok: true, used, sessions: out })
      },
    })
  )

  // 插入会话的回答口：桌面的那只轮询它，把回答放进气泡并朗读
  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/answer',
      handler: async (req, res) => {
        const since = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('since') ?? 0) || 0
        sendJson(res, 200, { ok: true, seq: answerSeq, answer: answerSeq > since ? answerLast : null })
      },
    })
  )

  // 桌宠说话口 → 把一句话送进当前会话
  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/prompt',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method' })
          return
        }
        let body = {}
        try {
          body = JSON.parse((await readBody(req)) || '{}')
        } catch {
          sendJson(res, 400, { ok: false, error: 'bad json' })
          return
        }
        const text = String(body.text ?? '').trim().slice(0, 4000)
        const sessionId = String(body.sessionId ?? '').trim()
        // 只认绑定的会话：填了谁就问谁，不填不说话——绝不猜会话（猜到 IM 专属会话会把回答桥接发走）
        if (!sessionId) {
          sendJson(res, 400, { ok: false, error: '未绑定会话：先在设置里填 Session ID' })
          return
        }
        if (!text) {
          sendJson(res, 400, { ok: false, error: 'empty' })
          return
        }
        const controller = ctx.get('sessionController')
        if (!controller) {
          sendJson(res, 503, { ok: false, error: 'sessionController 不可用' })
          return
        }
        try {
          // 开启气泡门：登记这次提问（目标会话 + 内容前缀），等会话流里出现同样的 user/message 来配对回合
          petAsk = { sid: sessionId || wantSession(), prefix: text.trim().slice(0, 24), at: Date.now() }
          petAttempt = ''
          petTurnSid = ''
          // 投递模式固定 queue（排队）：绝不往正在跑的回合里插话（steer）——
          // 桌宠的会话和 B站任务/写日记共用的会话是同一个，插话会把桌宠的问题混进
          // 她手头的活儿里，同一个回合的回答就可能被带着串台。排队让桌宠的
          // 问题单独成回合、单独被回答；她忙时话先排着，忙完才轮到。
          const request = () => ({
            requestId: `coo-pet-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
            sessionId,
            content: [{ type: 'text', text }],
            clientTimeZone: 'Asia/Shanghai',
          })
          try {
            const list = typeof controller.listSessions === 'function' ? await controller.listSessions() : null
            const arr = Array.isArray(list) ? list : Array.isArray(list && list.sessions) ? list.sessions : []
            const items = arr.filter((item) => item && typeof item === 'object')
              .filter((item) => String(item.sessionId ?? item.id ?? '') === sessionId)
            const hit = items[0]
            // 列表没扫到不算失败，真正的失败由下面 prompt 的报错判定
            if (hit) {
              attachState.ok = true
              attachState.title = String(hit.title ?? hit.name ?? hit.label ?? '')
              attachState.checkedAt = Date.now()
            }
          } catch {
            /* 列表拿不到不影响发送 */
          }
          await controller.prompt({ ...request(), mode: 'queue' }, AbortSignal.timeout(15000))
          lastSay = { text, sessionId, at: Date.now(), ok: true }
          if (sessionId) {
            attachState.ok = true
            attachState.checkedAt = Date.now()
          }
          sendJson(res, 200, { ok: true })
        } catch (error) {
          const message = String(error && error.message ? error.message : error)
          lastSay = { text, sessionId, at: Date.now(), ok: false, message }
          if (sessionId) {
            attachState.ok = false
            attachState.checkedAt = Date.now()
          }
          sendJson(res, 502, { ok: false, error: message })
        }
      },
    })
  )

  const servePetFile = async (res, relative) => {
    const safe = normalizePath(relative).replace(/^([.][.][/\\])+/, '')
    const abs = join(PET_ROOT, safe)
    if (!abs.startsWith(PET_ROOT)) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }
    try {
      const info = await stat(abs)
      if (!info.isFile()) throw new Error('not a file')
      const data = await readFile(abs)
      res.setHeader('Content-Type', MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(data)
    } catch (error) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(`没有这个文件：${safe}`)
    }
  }

  for (const rel of ['kit/body.js', 'kit/rig.js', 'whale/figure.js', 'whale/model.json', 'desk.html']) {
    disposers.push(
      safeRegister({
        kind: 'exact',
        path: `/dsh-coo-pet/pet/${rel}`,
        handler: async (req, res) => servePetFile(res, rel),
      })
    )
  }

  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/pet/asset',
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/dsh-coo-pet/pet/asset', 'http://localhost')
        const rel = url.searchParams.get('p') ?? ''
        if (rel === '') {
          res.statusCode = 400
          res.end('missing p')
          return
        }
        await servePetFile(res, rel)
      },
    })
  )

  // ---- 桌面显示：在桌面上开一个透明小窗（Electron），可以和网页浮层并存 ----
  const DESK_MAIN = fileURLToPath(new URL('./assets/desk-main.cjs', import.meta.url))
const ELECTRON_CANDIDATES = [
  process.env.DSH_ELECTRON,
  join(HOME, 'electron', 'electron.exe'),
  join(process.env.USERPROFILE ?? '', '.dsh', 'electron', 'electron.exe'),
]
  let deskProc = null

  const findElectron = () => {
    for (const candidate of ELECTRON_CANDIDATES) {
      try {
        if (existsSync(candidate)) return candidate
      } catch {
        /* ignore */
      }
    }
    return null
  }

  const spawnDesk = () => {
    if (deskProc) return deskProc
    const exe = findElectron()
    if (!exe) {
      console.warn('[coo-pet] 没找到 electron，桌面显示开不了')
      return null
    }
    const origin = realOrigin()
    const url = `http://${origin}/dsh-coo-pet/pet/desk.html`
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    try {
      deskProc = spawn(exe, [DESK_MAIN, `--url=${url}`], {
        env,
        detached: false,
        stdio: 'ignore',
      })
      deskProc.on('exit', () => {
        deskProc = null
      })
    } catch (error) {
      console.warn('[coo-pet] 桌面窗口起不来:', String(error))
      deskProc = null
    }
    return deskProc
  }

  const syncDesk = (display) => {
    const want = display !== 'none'
    if (want) spawnDesk()
    else if (deskProc) {
      try {
        deskProc.kill()
      } catch {
        /* ignore */
      }
      deskProc = null
    }
  }

  // 记下来，disposer 里要清掉；否则插件关掉后还会蹦出一个没人管的窗口
  deskBootTimer = setTimeout(() => {
    deskBootTimer = null
    syncDesk(settings.display)
  }, 2500)

  disposers.push(
    safeRegister({
      kind: 'exact',
      path: '/dsh-coo-pet/open',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'POST only' })
          return
        }
        let target = ''
        try {
          target = String(JSON.parse((await readBody(req)) || '{}').target ?? '')
        } catch {
          target = ''
        }
        const launch = (file, args = []) => {
          const env = { ...process.env }
          delete env.ELECTRON_RUN_AS_NODE
          const child = spawn(file, args, { env, detached: true, stdio: 'ignore' })
          child.unref()
          return true
        }
        try {
          if (target === 'dsh') {
            // DSH 本体（DeepSeek Harness）：环境变量优先，其次默认安装位置
            const exe = process.env.DSH_EXE
              ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe')
            if (!exe || !existsSync(exe)) throw new Error('没找到 DSH（DeepSeek Harness），可用环境变量 DSH_EXE 指定')
            launch(exe)
          } else if (target === 'folder') {
            launch('explorer.exe', [HOME.replace(/\//g, '\\') + '\\coo-pet'])
          } else if (target === 'desktop') {
            spawnDesk()
          } else if (target === 'settings') {
            launch('explorer.exe', [HOME.replace(/\//g, '\\') + '\\coo-pet\\settings.json'])
          } else {
            throw new Error(`不认识的 target：${target}`)
          }
          sendJson(res, 200, { ok: true })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error && error.message ? error.message : error) })
        }
      },
    })
  )

  ctx.effect(() => () => {
    if (deskBootTimer) {
      clearTimeout(deskBootTimer)
      deskBootTimer = null
    }
    try {
      deskProc?.kill()
    } catch {
      /* ignore */
    }
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  })
}
