/**
 * System Card V2 — protected design experiment. No auth, no DB (same
 * pattern as /system-card-preview). Real Apex PLUS / Evalast data lives in
 * data/system-card-v2-apex-plus-seed.ts. The existing System Card
 * (components/system-card-renderer/, /cards/[mfr]/[slug]) is untouched by
 * this route.
 */

import { SystemCardV2Experience } from '@/components/system-card-v2/SystemCardV2Experience'
import { EVALAST_MANUFACTURER, APEX_PLUS_SYSTEM } from '@/data/system-card-v2-apex-plus-seed'

export default function SystemCardV2ApexPlusPage() {
  return <SystemCardV2Experience manufacturer={EVALAST_MANUFACTURER} system={APEX_PLUS_SYSTEM} />
}
