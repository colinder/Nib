import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  initialFile: () => ipcRenderer.invoke('init:get'),
  onLoadFile: (cb: (f: { path: string; content: string }) => void) => ipcRenderer.on('file:load', (_e, f) => cb(f)),
  onMenu: (cb: (action: string) => void) => ipcRenderer.on('menu', (_e, a) => cb(a)),
  setState: (s: { dirty: boolean; blank: boolean }) => ipcRenderer.send('state:set', s),
  setPath: (p: string | null) => ipcRenderer.send('path:set', p),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  closeNow: () => ipcRenderer.send('close-now'),
  onSaveAndClose: (cb: () => void) => ipcRenderer.on('save-and-close', cb),
  onAskNew: (cb: () => void) => ipcRenderer.on('ask-new', cb),
  getDirs: () => ipcRenderer.invoke('dirs:get'),
  pickDir: () => ipcRenderer.invoke('dir:pick'),
  saveTo: (dir: string, name: string, content: string) => ipcRenderer.invoke('file:saveTo', dir, name, content),
  saveFile: (path: string | null, content: string) => ipcRenderer.invoke('file:save', path, content)
})
