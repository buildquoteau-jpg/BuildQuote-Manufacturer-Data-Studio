'use client'

// Client-side shopping list state — ported from BuildQuote v6's
// ShoppingListProvider, minus the RFQ-draft context (that stays a
// BuildQuote-app concern). No Supabase reads or writes anywhere in here.
//
// Persistence is opt-in: pass `storageKey` to mirror the list into
// localStorage (what the public v6 app does with `bq_shopping_list`).
// Without it the list is purely in-memory — right for the Studio preview,
// where a manufacturer checking their card shouldn't leave residue behind.

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { ShoppingListItem } from './types'

type ShoppingListContextType = {
  shoppingList: ShoppingListItem[]
  addItems: (items: ShoppingListItem[]) => void
  removeItem: (id: string) => void
  updateQty: (id: string, qty: number) => void
  updateName: (id: string, name: string) => void
  updateUom: (id: string, uom: string) => void
  clearList: () => void
  // Bumped every time items are added, carrying how many — the cart bar
  // watches this to play its "items landed here" pulse. tick 0 = never added.
  addFlash: { tick: number; count: number }
}

const ShoppingListContext = createContext<ShoppingListContextType | null>(null)

export function useShoppingList() {
  const ctx = useContext(ShoppingListContext)
  if (!ctx) throw new Error('useShoppingList must be used inside ShoppingListProvider')
  return ctx
}

export function ShoppingListProvider({ children, storageKey }: {
  children: ReactNode
  storageKey?: string
}) {
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([])
  const [addFlash, setAddFlash] = useState<{ tick: number; count: number }>({ tick: 0, count: 0 })

  // Load from localStorage on mount (only when persistence is enabled)
  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setShoppingList(JSON.parse(saved))
    } catch (err) {
      // Corrupt or unavailable storage — start empty rather than break the card.
      console.warn('[ShoppingList] could not restore the saved list:', err)
    }
  }, [storageKey])

  // Persist to localStorage on change
  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(shoppingList))
    } catch (err) {
      // Private mode / quota exceeded — the list still works for this session.
      console.warn('[ShoppingList] could not persist the list:', err)
    }
  }, [shoppingList, storageKey])

  function addItems(items: ShoppingListItem[]) {
    setShoppingList(prev => {
      const updated = [...prev]
      for (const item of items) {
        const existing = updated.find(i => i.name === item.name && i.sku === item.sku)
        if (existing) {
          existing.qty += item.qty
        } else {
          updated.push(item)
        }
      }
      return updated
    })
    setAddFlash(f => ({ tick: f.tick + 1, count: items.length }))
  }

  function removeItem(id: string) {
    setShoppingList(prev => prev.filter(i => i.id !== id))
  }

  function updateQty(id: string, qty: number) {
    if (qty <= 0) { removeItem(id); return }
    setShoppingList(prev => prev.map(i => i.id === id ? { ...i, qty } : i))
  }

  function updateName(id: string, name: string) {
    setShoppingList(prev => prev.map(i => i.id === id ? { ...i, name } : i))
  }

  function updateUom(id: string, uom: string) {
    setShoppingList(prev => prev.map(i => i.id === id ? { ...i, uom } : i))
  }

  function clearList() {
    setShoppingList([])
  }

  return (
    <ShoppingListContext.Provider value={{
      shoppingList, addItems, removeItem, updateQty, updateName, updateUom, clearList, addFlash,
    }}>
      {children}
    </ShoppingListContext.Provider>
  )
}
