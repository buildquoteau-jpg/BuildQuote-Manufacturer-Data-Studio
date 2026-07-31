'use client'

// Small in-memory link between the Choose screen and the Stockists screen,
// so "Add to list" reflects what was actually picked rather than being a
// disconnected button. Deliberately not the old renderer's
// ShoppingListProvider — no persistence, no cross-page storage key, nothing
// shared with components/system-card-renderer/. In-memory only, same
// precedent as the Studio's own preview mode.
//
// Profiles and components are sets, not single values: the main profile and
// an edge board are different roles, not alternatives to each other, and a
// builder may reasonably want several components — so both follow the same
// RFQ / shopping-list convention (name, spec line, select box), independent
// toggles, not a radio group.

import { createContext, useContext, useState, type ReactNode } from 'react'

type SelectionContextValue = {
  colourName: string | null
  setColourName: (name: string | null) => void
  profileNames: string[]
  toggleProfileName: (name: string) => void
  componentIds: string[]
  toggleComponentId: (id: string) => void
}

const SelectionContext = createContext<SelectionContextValue | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [colourName, setColourName] = useState<string | null>(null)
  const [profileNames, setProfileNames] = useState<string[]>([])
  const [componentIds, setComponentIds] = useState<string[]>([])

  function toggleProfileName(name: string) {
    setProfileNames(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  function toggleComponentId(id: string) {
    setComponentIds(prev => prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id])
  }

  return (
    <SelectionContext.Provider value={{ colourName, setColourName, profileNames, toggleProfileName, componentIds, toggleComponentId }}>
      {children}
    </SelectionContext.Provider>
  )
}

export function useSelection() {
  const ctx = useContext(SelectionContext)
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider')
  return ctx
}
