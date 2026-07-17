import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  INTERACTION_SOUNDS_STORAGE_KEY,
  readInteractionSoundsPreference,
} from '../../src/lib/interaction-sounds'

describe('interaction sound preference', () => {
  it('starts enabled when no preference has been saved', () => {
    const storage = { getItem: () => null }

    expect(readInteractionSoundsPreference(storage)).toBe(true)
  })

  it('honors an explicit disabled preference', () => {
    const storage = {
      getItem: (key: string) => key === INTERACTION_SOUNDS_STORAGE_KEY ? 'false' : null,
    }

    expect(readInteractionSoundsPreference(storage)).toBe(false)
  })

  it('falls back to enabled when storage is unavailable', () => {
    const storage = {
      getItem: () => {
        throw new Error('storage blocked')
      },
    }

    expect(readInteractionSoundsPreference(storage)).toBe(true)
  })
})

describe('shared interaction sound coverage', () => {
  it('wires the controller and shared controls declaratively', () => {
    const rootSource = readFileSync('src/routes/__root.tsx', 'utf8')
    const buttonSource = readFileSync('src/components/ui/button.tsx', 'utf8')
    const checkboxSource = readFileSync('src/components/ui/checkbox.tsx', 'utf8')
    const tabsSource = readFileSync('src/components/ui/tabs.tsx', 'utf8')
    const settingsSource = readFileSync('src/components/settings/primitives.tsx', 'utf8')

    expect(rootSource).toContain('<InteractionSoundsController />')
    expect(buttonSource).toContain('data-cuelume-press')
    expect(buttonSource).toContain('data-cuelume-release')
    expect(checkboxSource).toContain('data-cuelume-toggle')
    expect(tabsSource).toContain('data-cuelume-toggle')
    expect(settingsSource).toContain('data-cuelume-toggle')
  })
})
