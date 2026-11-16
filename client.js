/*
 * coo-pet — desktop pet plugin for DeepSeek Harness
 * Copyright (C) 2026 Masterbble
 * Based on the desktop pet Coopanion by Pal-AI-Lab: https://github.com/Pal-AI-Lab/Coopanion
 * SPDX-License-Identifier: AGPL-3.0-or-later (see LICENSE; third-party notices in THIRD_PARTY_NOTICES.md)
 */
window.__ModuleLoader__.load({
  id: '@masterbble/dsh-coo-pet',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const BUILD = '0.6.29'
    const STATE_URL = '/dsh-coo-pet/pulse'
    const SETTINGS_URL = '/dsh-coo-pet/prefs'
    const PET = '/dsh-coo-pet/pet'

    const FALLBACK = {
      petName: '你的鱼',
      attachSession: '',
      menuOrder: 'open,input,restart,reset,resetAll,stay,free,duty,actions,look,outfit,clone,none',
      actOff: '',
      look: 'harness',
      outfit: 'maid',
      size: 190,
      opacity: 1,
      speed: 1,
      wander: true,
      answerBubble: true,
      idleBubble: true,
      greet: true,
      display: 'desktop',
      marginBottom: 132,
      voice: true,
      voiceMode: 'babble',
      voiceName: '',
      voiceRate: 1.05,
      voicePitch: 1.15,
      hotkey: 'Alt+V',
      hotkeyOn: true,
      sfx: true,
      idleLines: '',
      idleEvery: 20,
      idleUnit: 'min',
      actIcons: false,
      actSit: false,
      carryEvery: 0,
      carryUnit: 'min',
    }

    const SCHEME_LABELS = {
      deepseek: 'DeepSeek 蓝',
      harness: 'Harness 灰',
      chatgpt: 'ChatGPT 白',
      claude: 'Claude 橙',
      gemini: 'Gemini 彩',
      qwen: 'Qwen 紫',
      kimi: 'Kimi 蓝',
      minimax: 'MiniMax 粉',
    }

    const OUTFIT_LABELS = { maid: '女仆装', cape: '斗篷', crew: '制服' }

    function idleLinesOf(cfg) {
      const raw = String((cfg && cfg.idleLines) ?? '').trim()
      if (!raw) return []
      const who = String((cfg && cfg.petName) ?? '').trim() || '你的鱼'
      return raw
        .split('\n')
        .map((line) => line.trim().replace(/\{name\}/g, who))
        .filter(Boolean)
    }

    /* ---------------- 音效（WebAudio 现场合成，不带资源文件） ---------------- */


    const styles = `
      .card { background: rgba(20,24,32,0.55); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 13px; }
      .card .sub { font-size: 13px; font-weight: 600; margin-bottom: 8px; opacity: .9; letter-spacing: .02em; }
      .card .grid { display: flex; flex-wrap: wrap; gap: 8px; }
      .card .preview { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
      .card .preview img { width: 56px; height: 56px; object-fit: contain; border-radius: 10px; }
      .card .row { display: flex; align-items: center; gap: 10px; margin: 8px 0; justify-content: space-between; }
      .card .row > label { font-size: 13px; opacity: .8; }
      .card .hint { font-size: 12px; opacity: .55; line-height: 1.6; margin-top: 6px; }
      .card .switch { position: relative; flex: none; width: 38px; height: 20px; border-radius: 10px; background: rgba(255,255,255,0.18); cursor: pointer; transition: background .15s; }
      .card .switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: left .15s; }
      .card .switch.on { background: #34c759; }
      .card .switch.on::after { left: 20px; }
      .card .switch.disabled { cursor: default; }
      .card input[type=text], .card input[type=number], .card select, .card textarea {
        background: rgba(0,0,0,0.28); color: inherit; border: 1px solid rgba(255,255,255,0.14);
        border-radius: 8px; padding: 5px 8px; font-size: 13px; min-width: 120px;
      }
      .card textarea { width: 100%; min-height: 60px; resize: vertical; }
      .card input[type=range] { width: 160px; }
      .card button { background: rgba(255,255,255,0.1); color: inherit; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
      .card button:hover { background: rgba(255,255,255,0.16); }
      .card button.primary { background: #2f6bff; border-color: #2f6bff; color: #fff; }
      .card .mini { padding: 2px 7px; font-size: 12px; line-height: 1.4; }
      .card .gallery { display: flex; flex-wrap: wrap; gap: 10px; }
      .card .look { width: 78px; text-align: center; cursor: pointer; border-radius: 10px; padding: 6px 4px; border: 1px solid transparent; }
      .card .look.on, .card .look[data-active='1'] { border-color: #2f6bff; background: rgba(47,107,255,0.12); }
      .card .look img { width: 64px; height: 64px; object-fit: contain; display: block; margin: 0 auto 4px; }
      .card .look span { font-size: 11px; opacity: .75; }
      .card .pill { font-size: 11px; opacity: .6; margin-left: 8px; }
      .card .line-row { display: flex; gap: 6px; align-items: center; margin: 6px 0; }
      .card .line-row input[type=text] { flex: 1; }
      .card .foot { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
    `
    function schemeOf(cfg) {
      return `${cfg.look}-${cfg.outfit}`
    }

    function thumbOf(kind, id) {
      return `${PET}/asset?p=${encodeURIComponent(`whale/thumbs/${id}.png`)}`
    }

    function reportTo(status, payload) {
      try {
        fetch('/dsh-coo-pet/report', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ status, ...payload }),
        }).catch(() => {})
      } catch {
        /* ignore */
      }
    }

    // 页面跑在 dsh-app:// 私有协议里，跨源请求得用宿主报的 http 源
    const petBase = { value: '' }
    let lastCfg = null
    // 未点「保存」的暂存改动：轮询拉到服务器配置时叠在上面，界面不被 2 秒轮询冲掉
    const pendingOverlay = { current: {} }
    function useSettings() {
      const [base, setBase] = React.useState('')
      const [cfg, setCfg] = React.useState(FALLBACK)
      const [ready, setReady] = React.useState(false)
      const readyRef = React.useRef(false)
      const cfgRef = React.useRef(cfg)
      cfgRef.current = cfg
      lastCfg = cfg
      React.useEffect(() => {
        let alive = true
        let timer = 0
        const apply = (config) => {
          if (!alive || !config) return
          const merged = Object.keys(pendingOverlay.current).length ? { ...config, ...pendingOverlay.current } : config
          setCfg((prev) => (JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged))
        }
        const pull = async () => {
          try {
            const res = await fetch(SETTINGS_URL, { credentials: 'same-origin' })
            if (res.ok) {
              const body = await res.json()
              if (alive && body && body.config) {
                if (typeof body.base === 'string' && body.base !== '') {
                  petBase.value = body.base
                  setBase((prev) => (prev === body.base ? prev : body.base))
                }
                apply(body.config)
                // 首次读到服务器配置：标记「配置就绪」，没就绪前禁止写回（防止把默认值当用户改动存脏）
                if (!readyRef.current) {
                  readyRef.current = true
                  setReady(true)
                }
              }
            }
          } catch {
            /* ignore */
          }
          if (alive) timer = window.setTimeout(pull, 2000)
        }
        const onLocal = (event) => apply(event && event.detail)
        const onStorage = (event) => {
          if (event && event.key === 'dsh-coo-pet:cfg' && event.newValue) {
            try {
              apply(JSON.parse(event.newValue))
            } catch {
              /* ignore */
            }
          }
        }
        window.addEventListener('dsh-coo-pet:cfg', onLocal)
        window.addEventListener('storage', onStorage)
        pull()
        return () => {
          alive = false
          window.clearTimeout(timer)
          window.removeEventListener('dsh-coo-pet:cfg', onLocal)
          window.removeEventListener('storage', onStorage)
        }
      }, [])
      const save = React.useCallback(async (patch, clearKeys) => {
        // 防脏写闸门：从没成功读到服务器配置前（界面是默认值兜底），禁止把任何改动写回
        if (!readyRef.current) {
          console.warn('[coo-pet] save blocked: server config not loaded yet')
          return
        }
        const optimistic = { ...cfgRef.current, ...patch }
        setCfg(optimistic)
        // 通知同页面的其它实例（设置页保存 → 桌宠立刻变），也通知别的窗口
        try {
          window.dispatchEvent(new CustomEvent('dsh-coo-pet:cfg', { detail: optimistic }))
          window.localStorage.setItem('dsh-coo-pet:cfg', JSON.stringify(optimistic))
        } catch {
          /* ignore */
        }
        try {
          const res = await fetch(SETTINGS_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(patch),
          })
          if (res.ok) {
            const body = await res.json()
            if (body && body.config) {
              // 服务器确认落盘了，才清掉这次提交的暂存键；失败则留着，界面不回退、可重试
              if (Array.isArray(clearKeys) && clearKeys.length) {
                const nextOverlay = { ...pendingOverlay.current }
                for (const k of clearKeys) delete nextOverlay[k]
                pendingOverlay.current = nextOverlay
              }
              const merged = Object.keys(pendingOverlay.current).length ? { ...body.config, ...pendingOverlay.current } : body.config
              setCfg(merged)
              try {
                window.dispatchEvent(new CustomEvent('dsh-coo-pet:cfg', { detail: body.config }))
                window.localStorage.setItem('dsh-coo-pet:cfg', JSON.stringify(body.config))
              } catch {
                /* ignore */
              }
            }
          }
        } catch {
          /* ignore */
        }
      }, [])
      return [cfg, save, base, ready]
    }
    function Slider({ label, value, min, max, step, suffix, onChange }) {
      return h(
        'div',
        { className: 'row' },
        h('label', null, label),
        h('input', {
          type: 'range',
          min,
          max,
          step,
          value,
          onChange: (event) => onChange(Number(event.target.value)),
        }),
        h('span', { className: 'val' }, `${value}${suffix ?? ''}`)
      )
    }

    function Toggle({ label, checked, onChange, disabled }) {
      // 扁长腰圆滑块：开时底色变绿、圆点靠右；点一下即切换
      return h(
        'div',
        { className: 'row', style: disabled ? { opacity: 0.45 } : undefined },
        h('label', null, label),
        h('div', {
          className: 'switch' + (checked ? ' on' : '') + (disabled ? ' disabled' : ''),
          role: 'switch',
          'aria-checked': !!checked,
          title: checked ? '开着，点一下关' : '关着，点一下开',
          onClick: () => {
            if (disabled) return
            onChange(!checked)
          },
        })
      )
    }

    function parseHotkey(spec) {
      const text = String(spec || '').trim()
      if (!text) return null
      const parts = text.split('+').map((part) => part.trim()).filter(Boolean)
      if (parts.length === 0) return null
      const out = { alt: false, ctrl: false, shift: false, meta: false, key: '' }
      for (const part of parts) {
        const low = part.toLowerCase()
        if (low === 'alt' || low === 'option') out.alt = true
        else if (low === 'ctrl' || low === 'control') out.ctrl = true
        else if (low === 'shift') out.shift = true
        else if (low === 'cmd' || low === 'meta' || low === 'win') out.meta = true
        else out.key = part.length === 1 ? low : low
      }
      if (!out.key) return null
      return out
    }

    function matchHotkey(event, spec) {
      const parsed = parseHotkey(spec)
      if (!parsed) return false
      if (Boolean(event.altKey) !== parsed.alt) return false
      if (Boolean(event.ctrlKey) !== parsed.ctrl) return false
      if (Boolean(event.shiftKey) !== parsed.shift) return false
      if (Boolean(event.metaKey) !== parsed.meta) return false
      const code = String(event.key || '').toLowerCase()
      const wanted = parsed.key
      if (code === wanted) return true
      if (wanted === 'space' && code === ' ') return true
      if (/^f\d{1,2}$/.test(wanted) && code === wanted) return true
      return false
    }

    /* 系统语音列表：0.6.1 重写时漏了这两个定义，设置页一渲染就 ReferenceError（白屏元凶） */
    function refreshVoices() {
      try {
        const synth = window.speechSynthesis
        if (!synth) return []
        const got = synth.getVoices()
        return got && got.length ? [...got] : []
      } catch {
        return []
      }
    }
    function hookVoices(cb) {
      try {
        const synth = window.speechSynthesis
        if (!synth || !synth.addEventListener) return () => {}
        const onChange = () => {
          try { cb(refreshVoices()) } catch { /* ignore */ }
        }
        synth.addEventListener('voiceschanged', onChange)
        // 立刻给一次：voiceschanged 只在列表变化时触发，首次可能已经就绪
        onChange()
        return () => {
          try { synth.removeEventListener('voiceschanged', onChange) } catch { /* ignore */ }
        }
      } catch {
        return () => {}
      }
    }

    function hotkeyFromEvent(event) {
      const key = String(event.key || '')
      if (!key || key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return ''
      const parts = []
      if (event.ctrlKey) parts.push('Ctrl')
      if (event.altKey) parts.push('Alt')
      if (event.shiftKey) parts.push('Shift')
      if (event.metaKey) parts.push('Meta')
      const named = key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key
      parts.push(named)
      return parts.join('+')
    }

    function CooSettingsInner() {
      const [cfg, saveServer, base, cfgReady] = useSettings()
      const [meta, setMeta] = React.useState({ looks: [], outfits: [], defaults: null })
      const [saved, setSaved] = React.useState('')
      const [voiceList, setVoiceList] = React.useState(() => refreshVoices())
      const [recHotkey, setRecHotkey] = React.useState(false)
      const [pending, setPending] = React.useState({})
      const [dragIdx, setDragIdx] = React.useState(-1)
      const pendingRef = React.useRef(pending)
      pendingRef.current = pending
      const deskMode = cfg.display !== 'none'

      // 暂存：界面立刻变（轮询用 overlay 兜住不回退），点卡片「保存」才写回服务器并同步桌宠
      const save = (patch) => {
        pendingOverlay.current = { ...pendingOverlay.current, ...patch }
        // 同步更新 ref，不等渲染：快速点「保存」时 commitCard 才不会拿到旧值
        pendingRef.current = { ...pendingRef.current, ...patch }
        try {
          window.dispatchEvent(new CustomEvent('dsh-coo-pet:cfg', { detail: { ...cfg, ...patch } }))
        } catch {
          /* ignore */
        }
        setPending(pendingRef.current)
      }
      // 把某张卡暂存的项写回服务器（独立保存，其他卡不受影响）
      // overlay 里的键等 POST 成功后才清掉：期间轮询拿到旧配置也不会把界面打回去
      const commitCard = (keys) => {
        const list = keys || []
        const patch = {}
        for (const k of list) {
          if (Object.prototype.hasOwnProperty.call(pendingRef.current, k)) patch[k] = pendingRef.current[k]
        }
        const ks = Object.keys(patch)
        if (!ks.length) {
          flash('这张卡没有要保存的改动')
          return
        }
        const nextPending = { ...pendingRef.current }
        for (const k of ks) delete nextPending[k]
        pendingRef.current = nextPending
        setPending(nextPending)
        saveServer(patch, ks)
        flash(`已保存 ${ks.length} 项，同步到桌宠`)
      }
      // 下拉列表拖拽排序：按住把手上下拖，拖到哪行就排到哪（暂存，点「保存」生效）
      // 用 window 级指针监听，不依赖元素上的 capture：重排行会移动 DOM 节点，capture 会被打断导致只能拖一格
      const dragFrom = React.useRef(-1)
      const rowEls = React.useRef({})
      const menuIdsRef = React.useRef([])
      const reorderMenu = (from, to) => {
        const cur = menuIdsRef.current
        if (from < 0 || to < 0 || from === to || to >= cur.length) return
        const next = cur.slice()
        const [it] = next.splice(from, 1)
        next.splice(to, 0, it)
        menuIdsRef.current = next // 立即更新，拖动过程中连续换位不丢帧
        save({ menuOrder: next.join(',') })
        dragFrom.current = to
        setDragIdx(to)
      }
      const beginMenuDrag = (index) => {
        dragFrom.current = index
        setDragIdx(index)
        const onMove = (ev) => {
          const from = dragFrom.current
          if (from < 0) return
          const y = ev.clientY
          const ids = menuIdsRef.current
          let hit = -1
          for (let i = 0; i < ids.length; i++) {
            const el = rowEls.current[ids[i]]
            if (!el) continue
            const r = el.getBoundingClientRect()
            if (y >= r.top - 2 && y <= r.bottom + 2) {
              hit = i
              break
            }
          }
          if (hit < 0) {
            // 指针落在行间隙里：取中心最近的行
            let best = Infinity
            for (let i = 0; i < ids.length; i++) {
              const el = rowEls.current[ids[i]]
              if (!el) continue
              const r = el.getBoundingClientRect()
              const d = Math.abs((r.top + r.bottom) / 2 - y)
              if (d < best) {
                best = d
                hit = i
              }
            }
          }
          if (hit >= 0 && hit !== from) reorderMenu(from, hit)
        }
        const onUp = () => {
          dragFrom.current = -1
          setDragIdx(-1)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
      }

      React.useEffect(() => {
        reportTo('settings-ui', { build: BUILD, cards: 8 })
      }, [])

      React.useEffect(() => {
        if (!recHotkey) return undefined
        // 键盘：直接采组合键；鼠标：中键/侧键也收（DOM 键值 → 插件的 mouse3/4/5）
        const mouseName = (button) => (button === 1 ? 'mouse3' : button === 3 ? 'mouse4' : button === 4 ? 'mouse5' : null)
        const onKey = (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'Escape') {
            setRecHotkey(false)
            return
          }
          const spec = hotkeyFromEvent(event)
          if (!spec) return
          save({ hotkey: spec })
          setRecHotkey(false)
          flash(`快捷键改成 ${spec}`)
        }
        const onMouse = (event) => {
          event.preventDefault()
          event.stopPropagation()
          const spec = mouseName(event.button)
          if (!spec) return
          save({ hotkey: spec })
          setRecHotkey(false)
          const zh = { mouse3: '鼠标中键', mouse4: '鼠标后退键', mouse5: '鼠标前进键' }
          flash(`快捷键改成 ${zh[spec]}`)
        }
        window.addEventListener('keydown', onKey, true)
        window.addEventListener('mousedown', onMouse, true)
        window.addEventListener('auxclick', onMouse, true)
        return () => {
          window.removeEventListener('keydown', onKey, true)
          window.removeEventListener('mousedown', onMouse, true)
          window.removeEventListener('auxclick', onMouse, true)
        }
      }, [recHotkey])

      React.useEffect(() => {
        let alive = true
        fetch(SETTINGS_URL, { credentials: 'same-origin' })
          .then((res) => (res.ok ? res.json() : null))
          .then((body) => {
            if (alive && body) setMeta({ looks: body.looks ?? [], outfits: body.outfits ?? [], defaults: body.defaults ?? null })
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [])

      React.useEffect(() => {
        hookVoices((list) => setVoiceList([...list]))
      }, [])

      const flash = (text) => {
        setSaved(text)
        window.setTimeout(() => setSaved(''), 1600)
      }

      const openExternal = (target) => {
        fetch(`${meta.base || ''}/dsh-coo-pet/open`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target }),
        }).catch(() => {})
      }

      const pushSay = (text, mode) => {
        const body = JSON.stringify({ text: String(text || ''), mode: mode || '' })
        fetch(`${petBase.value}/dsh-coo-pet/say`, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body,
        }).catch(() => {})
      }

      const defaults = meta.defaults || FALLBACK

      const cardFooter = (resetKeys) => {
        const keys = resetKeys || []
        const dirty = keys.filter((k) => Object.prototype.hasOwnProperty.call(pending, k))
        return h(
          'div',
          { className: 'row', style: { marginTop: 8 } },
          h(
            'button',
            {
              className: dirty.length ? 'primary' : '',
              onClick: () => commitCard(keys),
            },
            dirty.length ? `保存（${dirty.length} 项未保存）` : '保存'
          ),
          resetKeys && resetKeys.length
            ? h(
                'button',
                {
                  onClick: () => {
                    const patch = {}
                    for (const k of keys) patch[k] = defaults[k]
                    // 恢复初始是明确动作：直接写服务器并清掉这些键的暂存
                    const nextOverlay = { ...pendingOverlay.current }
                    const nextPending = { ...pendingRef.current }
                    for (const k of keys) {
                      delete nextOverlay[k]
                      delete nextPending[k]
                    }
                    pendingOverlay.current = nextOverlay
                    pendingRef.current = nextPending
                    setPending(nextPending)
                    saveServer(patch)
                    flash('这页恢复初始了，已同步到桌宠')
                  },
                },
                '恢复初始'
              )
            : null,
          h('span', { className: 'hint' }, '改动先暂存，点「保存」写回并同步到桌宠'),
          saved ? h('span', { className: 'pill' }, saved) : null
        )
      }

      const card = (resetKeys, ...kids) => h('div', { className: 'card' }, ...kids, cardFooter(resetKeys))

      /* 碎碎念：一条一项，可编辑 / 上下移 / 删除 */
      const linesOf = (text) =>
        String(text || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      const lineList = linesOf(cfg.idleLines)
      const setLineList = (arr) => save({ idleLines: arr.join('\n') })
      const editLine = (index, text) => {
        const next = lineList.slice()
        next[index] = text
        setLineList(next.filter((s) => String(s || '').trim() !== ''))
      }
      const moveLine = (index, delta) => {
        const next = lineList.slice()
        const to = index + delta
        if (to < 0 || to >= next.length) return
        const tmp = next[index]
        next[index] = next[to]
        next[to] = tmp
        setLineList(next)
      }
      const delLine = (index) => {
        const next = lineList.slice()
        next.splice(index, 1)
        setLineList(next)
      }
      const addLine = () => setLineList([...lineList, '新的一句碎碎念'])

      /* 下拉列表：顺序可调（拖拽排序，不提供删除——12 项固定全在，只排序） */
      const MENU_LABELS = {
        open: '打开DSH',
        input: '输入…',
        restart: '重启DSH',
        reset: '图标复位',
        resetAll: '一键全复位',
        clone: '影分身',
        stay: '原地待着',
        free: '自由活动',
        duty: '安静模式',
        actions: '特殊动作',
        look: '换形象',
        outfit: '换衣服',
        none: '藏起来',
      }
      const menuIds = String(cfg.menuOrder || 'open,input,restart,reset,resetAll,stay,free,duty,actions,look,outfit,clone,none')
        .split(',')
        .map((s) => s.trim())
        .filter((id) => Object.hasOwn(MENU_LABELS, id))
      // 新功能项补位：老自定义排序里没有的新项，插到「藏起来」前面（和桌宠侧同一套规则）
      for (const nid of ['resetAll', 'clone']) {
        if (!menuIds.includes(nid)) {
          const i = menuIds.indexOf('none')
          if (i >= 0) menuIds.splice(i, 0, nid)
          else menuIds.push(nid)
        }
      }
      menuIdsRef.current = menuIds

      /* 动作一览已删；「试一下」保留给图标复位按钮用 */
      const tryAct = (id) => {
        window.dispatchEvent(new CustomEvent('dsh-coo-pet:act', { detail: { act: id } }))
        try {
          fetch(`${petBase.value}/dsh-coo-pet/act`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ act: id }),
          }).catch(() => {})
        } catch {
          /* ignore */
        }
      }

      const rowBtn = (label, onClick, key) =>
        h('button', { key: key || label, type: 'button', className: 'mini', onClick }, label)

      const looks = meta.looks.length > 0 ? meta.looks : Object.keys(SCHEME_LABELS).map((id) => ({ id, label: SCHEME_LABELS[id] }))
      const outfits = meta.outfits.length > 0 ? meta.outfits : Object.keys(OUTFIT_LABELS).map((id) => ({ id, label: OUTFIT_LABELS[id] }))

      const zhVoices = voiceList.filter((v) => /^(zh|cmn)/i.test(v.lang))
      const otherVoices = voiceList.filter((v) => !/^(zh|cmn)/i.test(v.lang))

      return h(
        'div',
        { className: 'coo-set' },
        h('style', null, styles),
        !cfgReady
          ? h(
              'div',
              { className: 'card', style: { borderColor: '#dc2626' } },
              h('div', { className: 'sub', style: { color: '#dc2626' } }, '⚠ 还没连上设置服务器'),
              h('div', { className: 'hint' }, '下面显示的是默认值兜底，不是你的真实配置；编辑和保存已暂时锁定，等连接成功（或刷新页面）后再改')
            )
          : null,
        h('h2', null, cfg.petName || '你的鱼'),

        card(
          ['petName', 'size', 'opacity', 'speed', 'answerBubble', 'idleBubble', 'look', 'outfit', 'display'],
          h(
            'div',
            { className: 'row' },
            h('label', null, '姓名'),
            h('input', {
              key: 'pet-name',
              value: cfg.petName || '',
              placeholder: '你的鱼',
              maxLength: 20,
              style: { width: '160px' },
              onChange: (event) => save({ petName: event.target.value }),
            })
          ),

          h(Slider, { label: '大小', value: cfg.size, min: 64, max: 420, step: 2, suffix: 'px', onChange: (v) => save({ size: v }) }),
          h(Slider, { label: '透明度', value: Math.round(cfg.opacity * 100), min: 20, max: 100, step: 5, suffix: '%', onChange: (v) => save({ opacity: v / 100 }) }),
          h(Slider, { label: '动作速度', value: cfg.speed, min: 0.2, max: 3, step: 0.1, suffix: '×', onChange: (v) => save({ speed: v }) }),

          h('div', { className: 'sub' }, '换装'),
          h('div', { className: 'preview' },
            h('img', { src: thumbOf('look', cfg.look), alt: '' }),
            h('div', null,
              h('div', { style: { fontSize: 13, fontWeight: 600 } },
                `鲸鱼娘 · ${SCHEME_LABELS[cfg.look] ?? cfg.look} · ${OUTFIT_LABELS[cfg.outfit] ?? cfg.outfit}`),
              h('div', { className: 'hint' }, `大小 ${cfg.size}px · 透明度 ${Math.round(cfg.opacity * 100)}% · 速度 ×${cfg.speed}`),
              saved ? h('span', { className: 'pill' }, saved) : null
            )
          ),
          h('div', { className: 'sub' }, '会动的鲸鱼娘'),
          h(
            'div',
            { className: 'grid' },
            looks.map((look) =>
              h(
                'div',
                {
                  key: look.id,
                  className: 'look',
                  'data-active': cfg.look === look.id ? '1' : '0',
                  onClick: () => {
                    save({ look: look.id })
                    flash('已切换')
                  },
                },
                h('img', { src: look.thumb ?? thumbOf('look', look.id), alt: '' }),
                h('span', null, look.label)
              )
            )
          ),
          h('div', { className: 'sub' }, '衣服'),
          h(
            'div',
            { className: 'grid' },
            outfits.map((outfit) =>
              h(
                'div',
                {
                  key: outfit.id,
                  className: 'look',
                  'data-active': cfg.outfit === outfit.id ? '1' : '0',
                  onClick: () => {
                    save({ outfit: outfit.id })
                    flash('已换衣服')
                  },
                },
                h('img', { src: outfit.thumb ?? thumbOf('outfit', outfit.id), alt: '' }),
                h('span', null, outfit.label)
              )
            )
          ),
          h(
            'div',
            { className: 'row' },
            h('label', null, '显示'),
            h(
              'select',
              {
                value: cfg.display === 'none' ? 'none' : 'desktop',
                onChange: (event) => save({ display: event.target.value }),
              },
              h('option', { value: 'desktop' }, '在桌面显示'),
              h('option', { value: 'none' }, '藏起来')
            )
          ),
          h(Toggle, { label: '回答气泡', checked: cfg.answerBubble !== false, onChange: (v) => save({ answerBubble: v }) }),
          h(Toggle, { label: '碎碎念气泡', checked: cfg.idleBubble !== false, onChange: (v) => save({ idleBubble: v }) }),
        ),

        card(
          ['attachSession'],
          h(
            'div',
            { className: 'row' },
            h('label', null, '插入会话'),
            h('input', {
              key: 'attach-session',
              value: cfg.attachSession || '',
              placeholder: '填SessionID（留空跟当前会话）',
              maxLength: 200,
              style: { width: '220px' },
              onChange: (event) => save({ attachSession: event.target.value }),
            })
          ),
          h('div', { className: 'hint' }, '填了之后，桌宠对话框和语音输入都发进这个会话，回答显示在她的气泡里并朗读')
        ),

        card(
          ['hotkeyOn', 'hotkey', 'voice', 'voiceMode', 'voiceName', 'voiceRate', 'voicePitch', 'sfx'],
          h('div', { className: 'sub' }, '语音设置'),
          h(Toggle, { label: '说话出声', checked: cfg.voice, onChange: (v) => save({ voice: v }) }),
          h(
            'div',
            { className: 'row' },
            h('label', null, '声音'),
            h(
              'select',
              {
                value: cfg.voiceMode ?? 'babble',
                onChange: (event) => {
                  const mode = event.target.value
                  save({ voiceMode: mode })
                  if (mode === 'tts') pushSay('这样说话能听懂吧', 'tts')
                  else pushSay('咱是这样说话的哦', 'babble')
                  flash('声音已换')
                },
              },
              h('option', { value: 'babble' }, '咿呀声（内置音库）'),
              h('option', { value: 'tts' }, '系统朗读（能听懂）')
            )
          ),
          h(
            'div',
            { className: 'row' },
            h('label', null, '音色'),
            h(
              'select',
              {
                value: cfg.voiceName,
                onChange: (event) => {
                  save({ voiceName: event.target.value })
                  flash('音色已换')
                },
              },
              h('option', { value: '' }, '自动（优先中文女声）'),
              zhVoices.length
                ? h('optgroup', { label: '中文' }, zhVoices.map((v) => h('option', { key: v.name, value: v.name }, `${v.name}`)))
                : null,
              otherVoices.length
                ? h('optgroup', { label: '其它语言' }, otherVoices.map((v) => h('option', { key: v.name, value: v.name }, `${v.name}（${v.lang}）`)))
                : null
            )
          ),
          h(Slider, { label: '语速', value: cfg.voiceRate, min: 0.5, max: 2, step: 0.05, suffix: '×', onChange: (v) => save({ voiceRate: v }) }),
          h(Slider, { label: '音调', value: cfg.voicePitch, min: 0.5, max: 2, step: 0.05, suffix: '', onChange: (v) => save({ voicePitch: v }) }),
          h(Toggle, { label: '音效', checked: cfg.sfx !== false, onChange: (v) => save({ sfx: v }) }),

          h(Toggle, { label: '启用快捷键', checked: cfg.hotkeyOn, onChange: (v) => save({ hotkeyOn: v }) }),
          h(
            'div',
            { className: 'row' },
            h('label', null, '按键'),
            h(
              'button',
              {
                className: recHotkey ? 'primary' : '',
                onClick: () => setRecHotkey((on) => !on),
              },
              recHotkey ? '按哪个键就用哪个…（Esc 取消）' : `${cfg.hotkey || '（没设）'}　修改`
            ),
            h(
              'button',
              {
                onClick: () => {
                  save({ hotkey: '' })
                  flash('快捷键清掉了')
                },
              },
              '清除'
            )
          ),
          h('div', { className: 'hint' }, '点「修改」后按哪个键就定哪个键：键盘任意单键或组合键、鼠标中键/侧键都行。键盘按一下开麦再按一下闭麦；鼠标键按住说话松开结束。')
        ),

        card(
          ['wander', 'actIcons', 'actSit', 'carryEvery', 'carryUnit'],
          h('div', { className: 'sub' }, '动作'),
          deskMode ? null : h('div', { className: 'hint' }, '先把「显示」切成「在桌面显示」，这里才生效'),
          h(Toggle, {
            label: '溜达',
            checked: cfg.wander === true,
            disabled: !deskMode,
            onChange: (v) => save({ wander: v }),
          }),
          h(Toggle, {
            label: '搬运图标',
            checked: cfg.actIcons === true,
            disabled: !deskMode || cfg.display !== 'desktop',
            onChange: (v) => save({ actIcons: v }),
          }),
          h('div', { className: 'hint' }, '搬运图标：桌面无窗口时（包括最小化）她会随意搬运你桌面的图标'),
          h(
            'div',
            { className: 'row', style: { alignItems: 'center' } },
            h('label', null, '搬运间隔'),
            h('input', {
              type: 'number',
              min: 0,
              max: 720,
              value: cfg.carryEvery ?? 0,
              style: { width: '76px' },
              onChange: (event) => save({ carryEvery: Math.max(0, Math.round(Number(event.target.value) || 0)) }),
            }),
            h(
              'select',
              {
                value: cfg.carryUnit === 'sec' ? 'sec' : 'min',
                onChange: (event) => save({ carryUnit: event.target.value === 'sec' ? 'sec' : 'min' }),
              },
              h('option', { value: 'min' }, '分钟'),
              h('option', { value: 'sec' }, '秒')
            )
          ),
          h('div', { className: 'hint' }, '搬运间隔：两次搬图标之间至少隔这么久；填 0 = 不限制'),
          h(
            'div',
            { className: 'row', key: 'reset-pet', style: { alignItems: 'center' } },
            h('span', { style: { minWidth: '96px' } }, '图标复位'),
            rowBtn('一键全复位', () => {
              tryAct('resetAll')
              flash('一键全复位：撤光全部快照，恢复到她第一次搬乱前的样子')
            }, 'reset-pet')
          ),
          h('div', { className: 'hint' }, '图标复位：把她搬乱的桌面图标按名字放回最近一档快照的位置；点一键全部复位可恢复初始状态'),
          h(Toggle, {
            label: '随便坐',
            checked: cfg.actSit === true,
            disabled: !deskMode,
            onChange: (v) => save({ actSit: v }),
          }),
          h('div', { className: 'hint' }, '随便坐：她会坐在桌面图标上，或者坐在任意窗口的边沿上')
        ),

        card(
          ['menuOrder'],
          h('div', { className: 'sub' }, '下拉列表（右键她弹出来的那些）'),
          h('div', { className: 'hint' }, '按住每行右侧的 ⠿ 把手上下拖动排序'),
          ...menuIds.map((id, index) =>
            h(
              'div',
              {
                className: 'row',
                key: 'menu-' + id,
                ref: (el) => {
                  if (el) rowEls.current[id] = el
                  else delete rowEls.current[id]
                },
                style: { alignItems: 'center', opacity: dragIdx === index ? 0.45 : 1, userSelect: 'none' },
              },
              h('span', { style: { minWidth: '140px' } }, (index + 1) + '. ' + (MENU_LABELS[id] || id)),
              h('span', {
                style: {
                  marginLeft: 'auto',
                  cursor: dragIdx === index ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  padding: '2px 10px',
                  fontSize: 16,
                  lineHeight: '22px',
                  touchAction: 'none',
                },
                title: '按住上下拖动排序',
                onPointerDown: (event) => {
                  event.preventDefault()
                  beginMenuDrag(index)
                },
              }, '⠿')
            )
          )
        ),

        card(
          ['greet', 'idleLines', 'idleEvery', 'idleUnit'],
          h('div', { className: 'sub' }, '碎碎念'),
          h(Toggle, { label: '开启碎碎念', checked: cfg.greet, onChange: (v) => save({ greet: v }) }),
          h(
            'div',
            { className: 'row' },
            h('label', null, '隔'),
            h('input', {
              type: 'number',
              min: 1,
              max: 999,
              value: cfg.idleEvery ?? 20,
              style: { width: '76px' },
              onChange: (event) => save({ idleEvery: Number(event.target.value) || 1 }),
            }),
            h(
              'select',
              {
                value: cfg.idleUnit ?? 'min',
                onChange: (event) => save({ idleUnit: event.target.value }),
              },
              h('option', { value: 'sec' }, '秒'),
              h('option', { value: 'min' }, '分钟'),
              h('option', { value: 'hour' }, '小时')
            ),
            h('span', { className: 'hint' }, '说一句'),
          ),
          h('div', { className: 'hint' }, '碎碎念全自定义，一行一句；句子里写 {name} 会换成上面填的姓名，姓名空着就说「你的鱼」；留空她就不说'),
          ...lineList.map((line, index) =>
            h(
              'div',
              { key: 'line-' + index },
              h(
                'div',
                { className: 'row', style: { alignItems: 'center' } },
                h('input', {
                  defaultValue: line,
                  style: { flex: '1', minWidth: '220px' },
                  onBlur: (event) => editLine(index, event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') editLine(index, event.target.value)
                  },
                }),
                rowBtn('↑', () => moveLine(index, -1), 'lu-' + index),
                rowBtn('↓', () => moveLine(index, 1), 'ld-' + index),
                rowBtn('删除', () => delLine(index), 'lx-' + index)
              ),
              /\{name\}/.test(line)
                ? h('div', { className: 'hint', style: { marginLeft: 8, marginTop: -4 } }, '实际会说：' + line.replace(/\{name\}/g, cfg.petName || '你的鱼'))
                : null
            )
          ),
          h(
            'div',
            { className: 'row' },
            h('button', { className: 'primary', onClick: () => { addLine(); flash('加了一条') } }, '新增一条'),
            h('span', { className: 'hint' }, '关掉「开启碎碎念」她就不乱说了')
          )
        ),

      )
    }

    // 同一个页面里可能被重复挂载（热重载/多次 register），只让最早那个实例真的画出来
    const mounts = []


    /* ---------------- 麦克风桥：网页这边只剩这个 -----------------
       注意：cfg 只在设置组件里有，这里用 lastCfg（useSettings 每次渲染都会同步到模块级）；
       base 参数挂载处不传，轮询一律走 root()（petBase 有值用绝对，没有就相对路径 + 先摸一次 /prefs 记下 base） */
    function MicBridge() {
      const recogRef = React.useRef(null)
      const pendingRef = React.useRef(false)

      const root = () => (petBase && petBase.value) || ''

      // 识别文字转发：中间结果和最终文字都发 /voicetext，桌面窗轮询拿去
      // 实时填进她的输入框；最终一句由桌面自己走提交流程（「打开XX」本地指令也在那边拦）
      const postText = (text, final) => {
        fetch(`${root()}/dsh-coo-pet/voicetext`, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ text: String(text || ''), final: final === true }),
        }).catch(() => {})
      }

      const stopMic = () => {
        try {
          recogRef.current?.stop()
        } catch {
          /* ignore */
        }
      }

      const startMic = () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SR) {
          postText('（这个窗口不支持语音识别）', true)
          return
        }
        try {
          const rec = new SR()
          rec.lang = 'zh-CN'
          rec.interimResults = true
          rec.continuous = false
          rec.onresult = (event) => {
            let said = ''
            for (let i = 0; i < event.results.length; i += 1) said += event.results[i][0].transcript
            rec._said = said
            postText(said, false)
          }
          rec.onend = () => {
            recogRef.current = null
            if (pendingRef.current) {
              pendingRef.current = false
              postText(rec._said, true)
            }
          }
          rec.onerror = () => {
            // 出错也要收尾：桌面窗那边等着 final 才收输入框
            recogRef.current = null
            if (pendingRef.current) {
              pendingRef.current = false
              postText(rec._said || '', true)
            }
          }
          rec.start()
          recogRef.current = rec
        } catch {
          /* 麦克风打不开就算了，桌宠照样活着 */
        }
      }

      React.useEffect(() => {
        let alive = true
        let seq = 0
        let timer = 0
        // 先摸一次 base：设置页没开时 petBase 是空的，摸到就记下来给后面的绝对路径用
        fetch(`${root()}/dsh-coo-pet/prefs`, { credentials: 'same-origin' })
          .then((res) => (res.ok ? res.json() : null))
          .then((body) => {
            if (body && typeof body.base === 'string' && body.base) petBase.value = body.base
          })
          .catch(() => {})
        const tick = async () => {
          try {
            const res = await fetch(`${root()}/dsh-coo-pet/voice?since=${seq}`, { credentials: 'same-origin' })
            if (res.ok) {
              const body = await res.json().catch(() => null)
              if (alive && body && typeof body.seq === 'number') {
                seq = body.seq
                const cmd = body.voice
                if (cmd && typeof cmd.on === 'boolean') {
                  if (cmd.on) {
                    pendingRef.current = true
                    if (!recogRef.current) startMic()
                  } else {
                    pendingRef.current = false
                    stopMic()
                  }
                }
              }
            }
          } catch {
            /* offline */
          }
          if (alive) timer = window.setTimeout(tick, 700)
        }
        tick()
        return () => {
          alive = false
          window.clearTimeout(timer)
        }
      }, [])

      return null
    }


    function CooSettings() {
      try {
        return h(CooSettingsInner)
      } catch (error) {
        return h(
          'div',
          { className: 'card' },
          h('div', { className: 'sub' }, '你的鱼 · 设置页出错了'),
          h('div', { className: 'hint' }, String((error && error.message) || error))
        )
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'coo-pet-mic', order: 60, label: '你的鱼·麦克风' }, MicBridge)
        )
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'coo-pet', order: 80, label: '你的鱼' }, CooSettings)
        )
      },
    }
  },
})
