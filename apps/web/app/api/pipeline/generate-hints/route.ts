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

  // Gather existing hints files as few-shot examples
  const repoRoot = path.resolve(process.cwd(), '..', '..')
  const hintsDir = path.join(repoRoot, 'prompts', 'manufacturer-hints')
  const exampleFiles = await fs.readdir(hintsDir).catch(() => [] as string[])
  const examples: string[] = []
  for (const f of exampleFiles.filter(f => f.endsWith('.md') && !f.includes(slug)).slice(0, 3)) {
    const content = await fs.readFile(path.join(hintsDir, f), 'utf-8').catch(() => '')
    if (content) examples.push(`--- Example: ${f} ---\n${content.slice(0, 3000)}`)
  }

  // Fetch manufacturer website URL from supabase if available
  const supabase = await createStudioServiceClient()
  const { data: mfr } = await supabase
    .from('data_studio_manufacturers')
    .select('website_url, slug')
    .eq('id', manufacturerId)
    .single()

  const websiteUrl = mfr?.website_url ?? `https://www.${slug.replace(/-/g, '')}.com.au`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = `You are an expert product data extraction specialist for the Australian building products industry. Your job is to write a manufacturer hints file that will guide an AI parser to extract product catalogue data accurately.

The hints file must follow this exact structure:
1. # Extraction hints — {manufacturer name}
2. ## Manufacturer context (name, website, country of manufacture, product category)
3. ## Systems — {N} distinct product lines (a table listing every product line with name, subcategory, key feature)
4. ## Extraction rules (UOM rules, colour rules, profile naming, component roles)
5. ## Worked examples (1-2 complex product examples showing expected output)

Here are validated examples from other manufacturers to use as reference:

${examples.join('\n\n')}

Be specific, accurate, and exhaustive about the product lines. List every product the manufacturer makes.`

  const userPrompt = `Write a complete hints file for: ${manufacturerName}
Website: ${websiteUrl}

Research their full product range and write the hints file. Focus on:
- Complete list of all product systems/lines with correct names
- Australian-specific products and naming conventions
- UOM (rolls, sheets, length, packs) per product type
- Colour variants if applicable
- Component/accessory roles`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    const content = message.content[0].type === 'text' ? message.content[0].text : ''

    // Save to file
    const filePath = path.join(hintsDir, `${slug}.md`)
    await fs.writeFile(filePath, content, 'utf-8')

    return NextResponse.json({ ok: true, content, path: filePath })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
