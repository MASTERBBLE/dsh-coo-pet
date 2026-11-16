// coo-pet — desktop pet plugin for DeepSeek Harness
// Copyright (C) 2026 Masterbble
// Based on the desktop pet Coopanion by Pal-AI-Lab: https://github.com/Pal-AI-Lab/Coopanion
// SPDX-License-Identifier: AGPL-3.0-or-later (see LICENSE; third-party notices in THIRD_PARTY_NOTICES.md)

// 桌面页的桥：页面是 ES module，拿不到 require，所以这里挂一个 window.cooDesk
const { ipcRenderer } = require('electron')

const listeners = new Set()

ipcRenderer.on('coo-origin', (_event, payload) => {
  for (const fn of listeners) {
    try {
      fn(payload)
    } catch {
      /* ignore */
    }
  }
})

window.cooDesk = {
  hit(next) {
    try {
      ipcRenderer.send('coo-hit', next !== false)
    } catch {
      /* ignore */
    }
  },
  hitbox(box) {
    try {
      ipcRenderer.send('coo-hitbox', box)
    } catch {
      /* ignore */
    }
  },
  menu(open) {
    try {
      ipcRenderer.send('coo-menu', open === true)
    } catch {
      /* ignore */
    }
  },
  anchor(payload) {
    try {
      ipcRenderer.send('coo-anchor', payload)
    } catch {
      /* ignore */
    }
  },
  drag(flag) {
    try {
      ipcRenderer.send('coo-drag', flag === true)
    } catch {
      /* ignore */
    }
  },
  close() {
    try {
      ipcRenderer.send('coo-close')
    } catch {
      /* ignore */
    }
  },
  chatFocus(on) {
    return ipcRenderer.invoke('coo-chat-focus', on === true)
  },
  world() {
    return ipcRenderer.invoke('coo-world')
  },
  onOrigin(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  windows() {
    return ipcRenderer.invoke('coo-windows')
  },
  icons() {
    return ipcRenderer.invoke('coo-icons')
  },
  launch(name) {
    return ipcRenderer.invoke('coo-launch', String(name || ''))
  },
  moveIcon(payload) {
    return ipcRenderer.invoke('coo-move-icon', payload)
  },
  snapshotIcons() {
    return ipcRenderer.invoke('coo-icons-snapshot')
  },
  restoreIcons() {
    return ipcRenderer.invoke('coo-icons-restore')
  },
  restoreIconsAll() {
    return ipcRenderer.invoke('coo-icons-restore-all')
  },
  restartDsh() {
    return ipcRenderer.invoke('coo-restart-dsh')
  },
  hotkey(spec) {
    try {
      ipcRenderer.send('coo-hotkey', String(spec || ''))
    } catch {
      /* ignore */
    }
  },
  onHot(fn) {
    const handler = (_event, detail) => {
      try {
        fn(detail)
      } catch {
        /* ignore */
      }
    }
    ipcRenderer.on('coo-hot', handler)
    return () => ipcRenderer.removeListener('coo-hot', handler)
  },
}
