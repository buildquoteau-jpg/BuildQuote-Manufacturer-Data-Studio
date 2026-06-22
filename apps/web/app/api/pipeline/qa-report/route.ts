import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'
import path from 'path'
import fs from 'fs/promises'

export async function GET(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const manufacturerId = req.nextUrl.searchParams.get('manufacturerId')
  if (!manufacturerId) return NextResponse.json({ error: 'manufacturerId required' }, { status: 400 })

  // Look up the manufacturer slug
  const supabase = await createStudioServiceClient()
  const { data: mfr } = await supabase
    .from('data_studio_manufacturers')
    .select('slug')
    .eq('id', manufacturerId)
    .single()

  const slug = (mfr as any)?.slug
  if (!slug) return NextResponse.json({ report: null })

  const repoRoot = path.resolve(process.cwd(), '..', '..')
  const reportPath = path.join(repoRoot, '.local', 'qa-reports', `${slug}_latest.json`)

  try {
    const content = await fs.readFile(reportPath, 'utf-8')
    const report = JSON.parse(content)
    return NextResponse.json({ report })
  } catch {
    return NextResponse.json({ report: null })
  }
}
