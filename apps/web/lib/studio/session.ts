/**
 * Deprecated shim.
 *
 * The session helper has moved to @/lib/studio-auth/session.
 * This file re-exports from the new location for backward compatibility.
 *
 * Update any existing imports to point to the new path:
 *   import { getStudioSession } from '@/lib/studio-auth/session'
 */
export {
  getStudioSession,
  type StudioSession,
  type StudioUserProfile,
  type StudioManufacturerMembership,
  type StudioGlobalRole,
} from '../studio-auth/session'
