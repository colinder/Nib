import { rename, writeFile } from 'fs/promises'

// 임시 파일에 쓴 뒤 교체한다. 쓰는 도중 실패해도 원본이 깨지지 않는다.
export async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.nib-${process.pid}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}
