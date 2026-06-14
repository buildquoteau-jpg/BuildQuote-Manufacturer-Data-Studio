import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'
import Anthropic from '@anthropic-ai/sdk'
import path from 'path'
import fs from 'fs/promises'

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { manufacturerId, manufacturerName, slug } = body ?? {}
  if (!manufacturerId || !manufacturerName || !slug) {
    return NextResponse.json({ error: 'manufacturerId, manufacturerName, slug required' }, { status: 400 })
  }

  const supabase = await createStudioServiceClient()

  // Gather staging data
  const [
    { data: systems },
    { data: profiles },
    { data: components },
  ] = await Promise.all([
    supabase.from('staged_systems').select('id,name,verification_status,hero_image_url,website_url').eq('manufacturer_id', manufacturerId),
    supabase.from('staged_system_profiles').select('staged_system_id,sku,name,description').in('staged_system_id', []),
    supabase.from('staged_components').select('id,name,sku,role').eq('manufacturer_id', manufacturerId),
  ])

  // Get profiles properly joined through systems
  const systemIds = systems?.map(s => s.id) ?? []
  const { data: profilesJoined } = systemIds.length > 0
    ? await supabase.from('staged_system_profiles').select('staged_system_id,sku,name').in('staged_system_id', systemIds)
    : { data: [] }

  // Read hints file
  const repoRoot = path.resolve(process.cwd(), '..', '..')
  const hintsPath = path.join(repoRoot, 'prompts', 'manufacturer-hints', `${slug}.md`)
  const hintsContent = await fs.readFile(hintsPath, 'utf-8').catch(() => '')

  // Build staged data summary
  const systemSummary = (systems ?? []).map(s => {
    const sysProfiles = (profilesJoined ?? []).filter(p => p.staged_system_id === s.id)
    return `- ${s.name}: ${sysProfiles.length} profiles/SKUs, status=${s.verification_status}`
  }).join('\n')

  const componentSummary = (components ?? []).slice(0, 30).map(c => `- ${c.name} (${c.sku ?? 'no SKU'}, role=${c.role})`).join('\n')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `You are a QA specialist reviewing the AI-extracted product data for ${manufacturerName}.

## Hints file (what SHOULD have been extracted):
${hintsContent.slice(0, 4000)}

## What WAS extracted (staging data):
Systems (${systems?.length ?? 0} total):
${systemSummary}

Components (${components?.length ?? 0} total, showing first 30):
${componentSummary}

## Your task:
Compare what was extracted vs what the hints file says should exist. Produce a QA report in this EXACT JSON format (respond with only valid JSON, no markdown wrapper):

{
  "overallScore": <integer 1-10>,
  "summary": "<2-3 sentence overview of extraction quality>",
  "missingSystemsFromHints": ["<system name>", ...],
  "systemsWithNoProfiles": ["<system name>", ...],
  "systemsWithNoComponents": ["<system name>", ...],
  "duplicateNames": ["<system name>", ...],
  "reparseSuggestions": [
    { "system": "<name>", "reason": "<why it needs reparsing>" }
  ],
  "hintsAdjustmentSuggested": <true|false>,
  "hintsAdjustmentNotes": "<specific suggestions to loosen or fix the hints file, or empty string>",
  "rawMarkdown": "<full human-readable report in markdown>"
}`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    let reportData: any = {}
    try {
      reportData = JSON.parse(text)
    } catch {
      // rawMarkdown inside JSON often contains unescaped quotes — extract fields individually
      const extract = (key: string) => {
        const m = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))
        return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : ''
      }
      const extractNum = (key: string) => { const m = text.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`)); return m ? parseInt(m[1]) : 5 }
      const extractBool = (key: string) => { const m = text.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`)); return m ? m[1] === 'true' : false }
      const extractArr = (key: string): string[] => { const m = text.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*?)\\]`)); if (!m) return []; return [...m[1].matchAll(/"([^"]*)"/g)].map(x => x[1]) }
      reportData = {
        overallScore: extractNum('overallScore'),
        summary: extract('summary'),
        missingSystemsFromHints: extractArr('missingSystemsFromHints'),
        systemsWithNoProfiles: extractArr('systemsWithNoProfiles'),
        systemsWithNoComponents: extractArr('systemsWithNoComponents'),
        duplicateNames: extractArr('duplicateNames'),
        reparseSuggestions: [],
        hintsAdjustmentSuggested: extractBool('hintsAdjustmentSuggested'),
        hintsAdjustmentNotes: extract('hintsAdjustmentNotes'),
        rawMarkdown: extract('rawMarkdown') || text,
      }
    }

    const report = {
      ...reportData,
      generatedAt: new Date().toISOString(),
    }

    // Persist report to a local file for later retrieval
    const reportDir = path.join(repoRoot, '.local', 'qa-reports')
    await fs.mkdir(reportDir, { recursive: true })
    await fs.writeFile(
      path.join(reportDir, `${slug}_latest.json`),
      JSON.stringify(report, null, 2),
      'utf-8',
    )

    return NextResponse.json({ ok: true, report })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
