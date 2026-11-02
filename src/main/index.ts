import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { pathToFileURL } from 'url'
import { writeAtomic } from './fs.ts'

// 이미지 표시용 읽기 전용 프로토콜. 이미지 확장자만 내려 준다 (렌더러가 임의 파일을 읽지 못하게).
protocol.registerSchemesAsPrivileged([{ scheme: 'nib-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.avif'])

type OpenedFile = { path: string; content: string }
// dirty: 저장하지 않은 변경 있음, blank: 경로 없는 빈 새 문서(열기 시 재사용 대상)
type WinState = { dirty: boolean; blank: boolean }

// 대화상자로 사용자가 고른 경로만 저장을 허용한다 (렌더러가 임의 경로에 쓰지 못하게).
const allowed = new Set<string>()
const filters = [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]

const states = new Map<number, WinState>() // key: webContents.id
const pending = new Map<number, OpenedFile>() // 새 창이 시작할 때 읽을 파일
const openPaths = new Map<string, BrowserWindow>() // 같은 파일을 두 창에서 열지 않기 위함

function stateOf(win: BrowserWindow): WinState {
  return states.get(win.webContents.id) ?? { dirty: false, blank: true }
}

ipcMain.on('state:set', (e, s: WinState) => states.set(e.sender.id, s))
ipcMain.on('path:set', (e, path: string | null) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  for (const [p, w] of openPaths) if (w === win) openPaths.delete(p)
  if (path) openPaths.set(path, win)
})
ipcMain.handle('init:get', (e) => {
  const f = pending.get(e.sender.id) ?? null
  pending.delete(e.sender.id)
  return f
})

ipcMain.handle('file:save', async (e, path: string | null, content: string) => {
  if (!path) {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender)!, {
      defaultPath: join(app.getPath('documents'), '무제.md'),
      nameFieldLabel: '별도 저장:',
      message: '변경 사항을 저장할 이름과 위치를 정하세요.',
      filters
    })
    if (r.canceled) return null
    path = r.filePath
    allowed.add(path)
  }
  if (!allowed.has(path)) throw new Error('허용되지 않은 경로')
  await writeAtomic(path, content)
  return path
})

// 새 문서 닫기 시트에서 고를 수 있는 위치. 렌더러는 여기 있는 폴더(또는 직접 고른 폴더)에만 저장할 수 있다.
const allowedDirs = new Set<string>()
ipcMain.handle('dirs:get', () => {
  const list = [['문서', 'documents'], ['데스크탑', 'desktop'], ['다운로드', 'downloads'], ['홈', 'home']] as const
  return list.map(([label, name]) => {
    const path = app.getPath(name)
    allowedDirs.add(path)
    return { label, path }
  })
})
ipcMain.handle('dir:pick', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, { properties: ['openDirectory', 'createDirectory'] })
  if (r.canceled) return null
  allowedDirs.add(r.filePaths[0])
  return r.filePaths[0]
})
ipcMain.handle('file:saveTo', async (e, dir: string, name: string, content: string) => {
  if (!allowedDirs.has(dir) || !name || /[\\/]/.test(name)) throw new Error('허용되지 않은 경로')
  const path = join(dir, extname(name) ? name : `${name}.md`)
  if (existsSync(path)) {
    const r = dialog.showMessageBoxSync(BrowserWindow.fromWebContents(e.sender)!, { type: 'warning', message: `"${basename(path)}" 파일이 이미 있습니다. 바꾸시겠습니까?`, buttons: ['바꾸기', '취소'], defaultId: 1, cancelId: 1 })
    if (r === 1) return null
  }
  allowed.add(path)
  await writeAtomic(path, content)
  return path
})

// 0: 저장, 1: 저장 안 함, 2: 취소 (경로가 있는 문서). 경로 없는 새 문서는 렌더러의 '새 문서' 시트가 맡는다.
const askUnsaved = (win: BrowserWindow): number =>
  dialog.showMessageBoxSync(win, { type: 'warning', message: '저장하지 않은 변경 사항이 있습니다.', buttons: ['저장', '저장 안 함', '취소'], defaultId: 0, cancelId: 2 })

// 외부 열기는 http(s)/mailto만 허용 (file:, javascript: 등 차단).
ipcMain.on('open-external', (_e, url: string) => {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
})

ipcMain.on('close-now', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  states.set(e.sender.id, { dirty: false, blank: false })
  win.close()
})

// 열기: 현재 창이 빈 새 문서면 재사용, 아니면 새 창. 이미 열린 파일이면 그 창으로 이동.
async function openFlow(): Promise<void> {
  const cur = BrowserWindow.getFocusedWindow()
  const r = await (cur ? dialog.showOpenDialog(cur, { properties: ['openFile'], filters }) : dialog.showOpenDialog({ properties: ['openFile'], filters }))
  if (r.canceled) return
  const path = r.filePaths[0]
  const existing = openPaths.get(path)
  if (existing && !existing.isDestroyed()) return existing.focus()
  allowed.add(path)
  const file = { path, content: await readFile(path, 'utf8') }
  if (cur && stateOf(cur).blank) cur.webContents.send('file:load', file)
  else createWindow(file)
}

const mac = process.platform === 'darwin'
const send = (action: string) => BrowserWindow.getFocusedWindow()?.webContents.send('menu', action)
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { label: '설정…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: '파일',
      submenu: [
        { label: '새 문서', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: '열기…', accelerator: 'CmdOrCtrl+O', click: () => openFlow() },
        { type: 'separator' },
        { label: '저장', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: '다른 이름으로 저장…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { type: 'separator' },
        { role: 'close' },
        ...(mac ? [] : [{ type: 'separator' as const }, { label: '설정…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') }, { role: 'quit' as const }])
      ]
    },
    { role: 'editMenu' },
    // viewMenu 기본 항목의 확대/축소(Cmd+0/=/-)는 제목 단축키와 충돌하므로 뺀다.
    { label: '보기', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { label: '도움말', role: 'help', submenu: [{ label: '사용법 및 단축키', accelerator: 'F1', click: () => send('help') }] }
  ])
)

function createWindow(file?: OpenedFile): void {
  const cur = BrowserWindow.getFocusedWindow()
  const [x, y] = cur ? cur.getPosition() : [undefined, undefined]
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    ...(x !== undefined && y !== undefined ? { x: x + 28, y: y + 28 } : {}),
    // macOS: 기본 제목 표시줄을 숨기고 앱 안에 제목줄을 그린다 (제목 가운데 정렬, 수정 표시 색). 신호등 버튼은 유지.
    ...(mac ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 12 } } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const id = win.webContents.id
  if (file) pending.set(id, file)
  win.on('close', (e) => {
    if (!stateOf(win).dirty) return
    e.preventDefault()
    if (![...openPaths.values()].includes(win)) return win.webContents.send('ask-new')
    const choice = askUnsaved(win)
    if (choice === 1) {
      states.set(id, { dirty: false, blank: false })
      win.close()
    } else if (choice === 0) win.webContents.send('save-and-close')
  })
  win.on('closed', () => {
    states.delete(id)
    pending.delete(id)
    for (const [p, w] of openPaths) if (w === win) openPaths.delete(p)
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  protocol.handle('nib-file', (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname)
    if (process.platform === 'win32') p = p.replace(/^\/([A-Za-z]:)/, '$1')
    if (!IMAGE_EXT.has(extname(p).toLowerCase())) return new Response('forbidden', { status: 403 })
    return net.fetch(pathToFileURL(p).toString())
  })
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('window-all-closed', () => app.quit())
