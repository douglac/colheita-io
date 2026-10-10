import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

// Lista as imagens que existem em public/art: o cliente baixa só o que existe, 1 pedido por arquivo
// (antes eram 2: um HEAD para testar e o download).
export async function GET() {
  const root = path.join(process.cwd(), 'public', 'art')
  const files: string[] = []
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (/\.(png|jpe?g)$/.test(e.name)) files.push('/art/' + path.relative(root, p).split(path.sep).join('/'))
    }
  }
  await walk(root).catch(() => {})
  return NextResponse.json(files, { headers: { 'cache-control': 'public, max-age=60' } })
}
