interface Window {
  api: {
    pathForFile(f: File): string
    initialFile(): Promise<{ path: string; content: string } | null>
    onLoadFile(cb: (f: { path: string; content: string }) => void): void
    onMenu(cb: (action: string) => void): void
    setState(s: { dirty: boolean; blank: boolean }): void
    setPath(p: string | null): void
    openExternal(url: string): void
    closeNow(): void
    onSaveAndClose(cb: () => void): void
    onAskNew(cb: () => void): void
    getDirs(): Promise<{ label: string; path: string }[]>
    pickDir(): Promise<string | null>
    saveTo(dir: string, name: string, content: string): Promise<string | null>
    saveFile(path: string | null, content: string): Promise<string | null>
  }
}
