# coo-pet - desktop pet plugin for DeepSeek Harness
# Copyright (C) 2026 Masterbble
# Based on the Coopanion desktop pet by Pal-AI-Lab: https://github.com/Pal-AI-Lab/Coopanion
# (get-whale.ps1 fetches the whale art pack from its official release channel; see THIRD_PARTY_NOTICES.md)
# SPDX-License-Identifier: AGPL-3.0-or-later (see LICENSE; third-party notices in THIRD_PARTY_NOTICES.md)

param(
  [ValidateSet('windows', 'icons', 'move', 'restore')]
  [string]$mode = 'windows',
  [int]$index = -1,
  [int]$x = 0,
  [int]$y = 0,
  [string]$from = ''
)

$ErrorActionPreference = 'Stop'

# 输出统一 UTF-8：重定向 stdout 时 PowerShell 默认用系统 GBK 码页，中文图标名会被 desk-main 按 UTF-8 解码成乱码
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public class CooProbe {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string name);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] public static extern IntPtr VirtualAllocEx(IntPtr proc, IntPtr addr, uint size, uint type, uint protect);
  [DllImport("kernel32.dll")] public static extern bool VirtualFreeEx(IntPtr proc, IntPtr addr, uint size, uint type);
  [DllImport("kernel32.dll")] public static extern bool ReadProcessMemory(IntPtr proc, IntPtr addr, IntPtr buf, uint size, out IntPtr read);
  [DllImport("kernel32.dll")] public static extern bool WriteProcessMemory(IntPtr proc, IntPtr addr, IntPtr buf, uint size, out IntPtr wrote);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

  // 读桌面图标名字用：跨进程传给 SysListView32 的条目描述
  [StructLayout(LayoutKind.Sequential)]
  public struct LVITEMW {
    public uint mask; public int iItem, iSubItem, state, stateMask;
    public IntPtr pszText; public int cchTextMax, iImage; public IntPtr lParam;
    public int iIndent, iGroupId, cColumns; public IntPtr puColumns;
  }

  public class WinInfo {
    public string title; public string cls; public int x, y, w, h;
  }

  // 枚举全部走 C#：PowerShell 的脚本块委托被原生回调调用时作用域行为不可靠
  // （变量丢失 / 异常被吞），所以过滤和收集全部在 C# 里完成，PS 只拿结果。
  public static System.Collections.Generic.List<WinInfo> ListWindows() {
    var list = new System.Collections.Generic.List<WinInfo>();
    EnumWindows((h, l) => {
      try {
        if (!IsWindowVisible(h)) return true;
        if (IsIconic(h)) return true;                       // 最小化的不算开着
        int cloak = 0;                                       // 关到托盘 / DWM 隐匿的不算
        try { DwmGetWindowAttribute(h, 14, out cloak, 4); } catch { }
        if (cloak != 0) return true;
        RECT r;
        if (!GetWindowRect(h, out r)) return true;
        int w = r.Right - r.Left, hh = r.Bottom - r.Top;
        if (w < 240 || hh < 160) return true;
        var sb = new System.Text.StringBuilder(256);
        GetWindowTextW(h, sb, 256);
        string title = sb.ToString();
        var cb2 = new System.Text.StringBuilder(256);
        GetClassNameW(h, cb2, 256);
        string cls = cb2.ToString();
        if (title.Length == 0) return true;
        if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd") return true;
        if (cls == "Windows.UI.Core.CoreWindow") return true;
        if (title == "Coo") return true;                     // 自己不算
        list.Add(new WinInfo { title = title, cls = cls, x = r.Left, y = r.Top, w = w, h = hh });
        return true;
      } catch { return true; }
    }, IntPtr.Zero);
    return list;
  }

  public static IntPtr DesktopList() {
    IntPtr progman = FindWindow("Progman", null);
    IntPtr view = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
    if (view == IntPtr.Zero) {
      IntPtr worker = IntPtr.Zero;
      while ((worker = FindWindowEx(IntPtr.Zero, worker, "WorkerW", null)) != IntPtr.Zero) {
        view = FindWindowEx(worker, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (view != IntPtr.Zero) break;
      }
    }
    if (view == IntPtr.Zero) return IntPtr.Zero;
    return FindWindowEx(view, IntPtr.Zero, "SysListView32", null);
  }
}
'@

function Get-Icons {
  $lv = [CooProbe]::DesktopList()
  if ($lv -eq [IntPtr]::Zero) { return @() }
  $count = [CooProbe]::SendMessage($lv, 0x1004, [IntPtr]::Zero, [IntPtr]::Zero).ToInt32()  # LVM_GETITEMCOUNT
  $target = 0
  [void][CooProbe]::GetWindowThreadProcessId($lv, [ref]$target)
  $proc = [CooProbe]::OpenProcess(0x38, $false, $target)  # VM_OPERATION | VM_READ | VM_WRITE
  if ($proc -eq [IntPtr]::Zero) { return @() }
  $itemSize = [Runtime.InteropServices.Marshal]::SizeOf([type][CooProbe+LVITEMW])
  $bufChars = 260
  $remote = [CooProbe]::VirtualAllocEx($proc, [IntPtr]::Zero, [uint32]($itemSize + $bufChars * 2), 0x1000, 0x04)
  $out = New-Object System.Collections.ArrayList
  if ($remote -ne [IntPtr]::Zero) {
    $posLocal = [Runtime.InteropServices.Marshal]::AllocHGlobal(8)
    $itemLocal = [Runtime.InteropServices.Marshal]::AllocHGlobal($itemSize)
    $textLocal = [Runtime.InteropServices.Marshal]::AllocHGlobal($bufChars * 2)
    for ($i = 0; $i -lt $count; $i++) {
      # 位置：LVM_GETITEMPOSITION 把 POINT 写进远程内存
      $rd = [IntPtr]::Zero
      $px = 0; $py = 0
      [void][CooProbe]::SendMessage($lv, 0x1010, [IntPtr]$i, $remote)  # LVM_GETITEMPOSITION
      if ([CooProbe]::ReadProcessMemory($proc, $remote, $posLocal, [uint32]8, [ref]$rd)) {
        $pt = [Runtime.InteropServices.Marshal]::PtrToStructure($posLocal, [type][CooProbe+POINT])
        $px = $pt.X; $py = $pt.Y
      }
      # 名字：远程塞一个 LVITEMW（pszText 指向紧随其后的缓冲区），LVM_GETITEMTEXTW 回读
      $item = New-Object CooProbe+LVITEMW
      $item.mask = 1  # LVIF_TEXT
      $item.iItem = $i
      $item.iSubItem = 0
      $item.pszText = [IntPtr]($remote.ToInt64() + $itemSize)
      $item.cchTextMax = $bufChars
      [Runtime.InteropServices.Marshal]::StructureToPtr($item, $itemLocal, $false)
      $wr = [IntPtr]::Zero
      [void][CooProbe]::WriteProcessMemory($proc, $remote, $itemLocal, [uint32]$itemSize, [ref]$wr)
      [void][CooProbe]::SendMessage($lv, 0x1073, [IntPtr]$i, $remote)  # LVM_GETITEMTEXTW
      $name = ''
      if ([CooProbe]::ReadProcessMemory($proc, [IntPtr]($remote.ToInt64() + $itemSize), $textLocal, [uint32]($bufChars * 2), [ref]$rd)) {
        $name = [Runtime.InteropServices.Marshal]::PtrToStringUni($textLocal)
      }
      [void]$out.Add([pscustomobject]@{ i = $i; x = $px; y = $py; name = $name })
    }
    [Runtime.InteropServices.Marshal]::FreeHGlobal($posLocal)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($itemLocal)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($textLocal)
    [void][CooProbe]::VirtualFreeEx($proc, $remote, 0, 0x8000)
  }
  [void][CooProbe]::CloseHandle($proc)
  return $out
}

switch ($mode) {
  'windows' {
    # 空列表也要输出 []：PS5.1 里「空数组 | ConvertTo-Json」什么都不输出，上层会把空输出当成坏包；
    # 单窗口时 ConvertTo-Json 输出的是对象不是数组，这里统一拼成 JSON 数组
    $r = [CooProbe]::ListWindows()
    if ($r.Count -eq 0) { '[]' }
    else { '[' + (($r | ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 4 }) -join ',') + ']' }
  }
  'icons' { Get-Icons | ConvertTo-Json -Compress -Depth 4 }
  'move' {
    $lv = [CooProbe]::DesktopList()
    if ($lv -eq [IntPtr]::Zero -or $index -lt 0) { '{"ok":false}' ; break }
    $lparam = (($y -band 0xFFFF) -shl 16) -bor ($x -band 0xFFFF)
    [void][CooProbe]::SendMessage($lv, 0x100F, [IntPtr]$index, [IntPtr]$lparam)  # LVM_SETITEMPOSITION
    '{"ok":true}'
  }
  'restore' {
    # 从快照文件读回 {i,x,y,name} 列表，按名字匹配当前图标写回位置（一键复位用）
    # 为什么按名字：快照里的序号是当时图标的排列序号，explorer 重启 / 排序变化后序号会错位，
    # 按序号回放会把 A 的位置写给 B（用户实测复位没用就是这个原因）
    $lv = [CooProbe]::DesktopList()
    if ($lv -eq [IntPtr]::Zero -or -not $from -or -not (Test-Path $from)) { '{"ok":false,"n":0}' ; break }
    try { $items = Get-Content $from -Raw -Encoding UTF8 | ConvertFrom-Json } catch { '{"ok":false,"n":0}' ; break }
    $cur = Get-Icons
    $used = @{}
    $n = 0; $byName = 0; $byIdx = 0
    foreach ($it in $items) {
      if ($null -eq $it.x -or $null -eq $it.y) { continue }
      $target = $null
      # 第一优先：按名字找当前图标（跳过已匹配过的，避免重名图标互相顶）
      if ($it.name) {
        $want = [string]$it.name
        foreach ($c in $cur) {
          if ($used.ContainsKey([int]$c.i)) { continue }
          if ([string]$c.name -eq $want) { $target = [int]$c.i; $used[$target] = $true; $byName++; break }
        }
      }
      # 兜底：名字对不上（图标被删了/改名了）才退回快照序号
      # 安全闸：只有图标总数一致时序号才可能对齐；数量不一致说明中间有增删，
      # 序号必然错位——这时候宁可不动，也不能把 A 的位置写给 B（实测会全局乱掉）
      if ($null -eq $target -and $null -ne $it.i -and $it.i -ge 0 -and -not $used.ContainsKey([int]$it.i) -and $items.Count -eq $cur.Count) {
        $hit = $cur | Where-Object { [int]$_.i -eq [int]$it.i }
        if ($hit) { $target = [int]$it.i; $used[$target] = $true; $byIdx++ }
      }
      if ($null -eq $target) { continue }
      $lparam = (($it.y -band 0xFFFF) -shl 16) -bor ($it.x -band 0xFFFF)
      [void][CooProbe]::SendMessage($lv, 0x100F, [IntPtr]$target, [IntPtr]$lparam)
      $n++
    }
    ('{"ok":true,"n":' + $n + ',"byName":' + $byName + ',"byIdx":' + $byIdx + ',"items":' + $items.Count + ',"cur":' + $cur.Count + '}')
  }
}
