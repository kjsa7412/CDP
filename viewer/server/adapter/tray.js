// 트레이 아이콘 — 설계서 §5.2 ② · §32 11단계.
//
// npm 트레이 패키지(systray2·trayicon 등)는 플랫폼별 헬퍼 바이너리나 네이티브
// 애드온을 붙인다. §9 에서 "네이티브 모듈은 단일 파일 패키징을 깨뜨린다"고
// 못박았고 그 판단이 SEA 빌드를 성립시켰으므로, 여기서 되돌리지 않는다.
//
// Windows 의 System.Windows.Forms.NotifyIcon 을 PowerShell 로 띄운다. 의존성 0.
//
// **스크립트를 파일로 써서 -File 로 넘긴다.** -EncodedCommand 가 따옴표 문제는
// 없지만 base64 인코딩된 PowerShell 은 EDR 이 난독화로 보는 대표적 신호다.
// 읽을 수 있는 .ps1 이 디스크에 있는 편이 검사받기에 낫다(§7 의 태도와 같다).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

// 아이콘을 파일로 두지 않고 그 자리에서 그린다. SEA 에 에셋을 하나 더
// 넣지 않아도 되고, 무엇보다 exe 옆에 .ico 를 흘리지 않는다.
const PS = String.raw`
param([int]$ParentId, [string]$Tip, [string]$RepoPath)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function New-CtxIcon {
  # 문서 모양 — 파랑 사각형에 흰 줄 셋. 16px 로 줄어도 문서로 읽힌다.
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 47, 111, 219))
  $g.FillRectangle($bg, 3, 2, 26, 28)
  $fg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillRectangle($fg, 8, 9, 16, 3)
  $g.FillRectangle($fg, 8, 15, 16, 3)
  $g.FillRectangle($fg, 8, 21, 10, 3)
  $g.Dispose()
  $ico = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  return $ico
}

$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon = New-CtxIcon
$ni.Text = $Tip
$ni.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$mOpen = $menu.Items.Add('열기')
$mOpen.Font = New-Object System.Drawing.Font($menu.Font, [System.Drawing.FontStyle]::Bold)
$mOpen.add_Click({ [Console]::Out.WriteLine('open'); [Console]::Out.Flush() })

$mFolder = $menu.Items.Add('레포 폴더 열기')
$mFolder.Enabled = [bool]$RepoPath
$mFolder.add_Click({ [Console]::Out.WriteLine('folder'); [Console]::Out.Flush() })

[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

# 탭을 닫으면 90초 뒤 종료된다(§5.2 ⑥). 그것을 끄는 스위치 —
# "트레이에서 계속 실행을 선택한 사용자만 남는다"가 설계서의 문장이다.
$mKeep = New-Object System.Windows.Forms.ToolStripMenuItem '탭 닫아도 계속 실행'
$mKeep.CheckOnClick = $true
$mKeep.add_Click({
  $state = if ($mKeep.Checked) { 'on' } else { 'off' }
  [Console]::Out.WriteLine("keepalive $state"); [Console]::Out.Flush()
})
[void]$menu.Items.Add($mKeep)

[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$mQuit = $menu.Items.Add('종료')
$mQuit.add_Click({ [Console]::Out.WriteLine('quit'); [Console]::Out.Flush() })

$ni.ContextMenuStrip = $menu
$ni.add_MouseDoubleClick({ [Console]::Out.WriteLine('open'); [Console]::Out.Flush() })

# 부모(node/exe)가 사라지면 같이 죽는다. stdin 을 읽으면 UI 스레드가 막히므로
# PID 를 폴링한다. 이게 없으면 아이콘이 유령으로 남는다.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 700
$timer.add_Tick({
  if (-not (Get-Process -Id $ParentId -ErrorAction SilentlyContinue)) {
    $ni.Visible = $false
    $ni.Dispose()
    [System.Windows.Forms.Application]::Exit()
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
$ni.Visible = $false
$ni.Dispose()
`

export function startTray({ dataDir, url, repoPath, repoName, onOpen, onFolder, onQuit, onKeepAlive }) {
  if (process.platform !== 'win32') return null

  let child = null
  const scriptPath = path.join(dataDir, 'tray.ps1')

  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(scriptPath, PS, 'utf8')
  } catch {
    return null // 스크립트를 못 쓰면 트레이 없이 간다. 앱은 정상 동작한다
  }

  // 툴팁은 63자 제한이 있다(NotifyIcon.Text)
  const tip = `cdp — ${repoName || '레포 미지정'}`.slice(0, 60)

  try {
    child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA', // Windows Forms 는 STA 가 필요하다
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', scriptPath,
        '-ParentId', String(process.pid),
        '-Tip', tip,
        '-RepoPath', repoPath || '',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    )
  } catch {
    return null
  }

  let failed = false
  child.on('error', () => {
    failed = true
  })
  // PowerShell 이 정책이나 EDR 에 막히면 stderr 로 떨어진다. 조용히 포기한다 —
  // 트레이는 편의이고, 없다고 앱이 못 돌 이유가 없다.
  child.stderr?.on('data', () => {})

  const rl = readline.createInterface({ input: child.stdout })
  rl.on('line', (line) => {
    const [cmd, arg] = String(line).trim().split(/\s+/)
    if (cmd === 'open') onOpen?.(url)
    else if (cmd === 'folder') onFolder?.(repoPath)
    else if (cmd === 'quit') onQuit?.()
    else if (cmd === 'keepalive') onKeepAlive?.(arg === 'on')
  })

  return {
    get alive() {
      return !!child && !child.killed && !failed
    },
    stop() {
      try {
        rl.close()
        child?.kill()
      } catch {}
    },
  }
}
