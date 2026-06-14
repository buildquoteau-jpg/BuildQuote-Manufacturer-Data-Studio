import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import path from 'path'
import fs from 'fs/promises'

export async function GET(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const documentId = req.nextUrl.searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

  const repoRoot = path.resolve(process.cwd(), '..', '..')
  const statusFile = path.join(repoRoot, '.local', 'pipeline-status', `${documentId}.json`)

  try {
    const content = await fs.readFile(statusFile, 'utf-8')
    return NextResponse.json(JSON.parse(content))
  } catch {
    return NextResponse.json({ status: 'idle' })
  }
}
