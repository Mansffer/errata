import { useCallback, useEffect, useState } from 'react'
import { bind, setEnabled as setCuelumeEnabled } from 'cuelume'

export const INTERACTION_SOUNDS_STORAGE_KEY = 'errata-interaction-sounds'

const INTERACTION_SOUNDS_EVENT = 'errata-interaction-sounds-change'

interface StorageReader {
  getItem: (key: string) => string | null
}

function getBrowserStorage(): StorageReader | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readInteractionSoundsPreference(
  storage: StorageReader | null = getBrowserStorage(),
): boolean {
  if (!storage) return true
  try {
    return storage.getItem(INTERACTION_SOUNDS_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function useInteractionSounds(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabledState] = useState(readInteractionSoundsPreference)

  useEffect(() => {
    const handleChange = (event: Event) => {
      setEnabledState((event as CustomEvent<boolean>).detail)
    }
    window.addEventListener(INTERACTION_SOUNDS_EVENT, handleChange)
    return () => window.removeEventListener(INTERACTION_SOUNDS_EVENT, handleChange)
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    try {
      localStorage.setItem(INTERACTION_SOUNDS_STORAGE_KEY, String(next))
    } catch {
      // The preference still applies for this session when storage is blocked.
    }
    window.dispatchEvent(new CustomEvent<boolean>(INTERACTION_SOUNDS_EVENT, { detail: next }))
  }, [])

  return [enabled, setEnabled]
}

export function InteractionSoundsController() {
  const [enabled] = useInteractionSounds()

  useEffect(() => {
    setCuelumeEnabled(enabled)
  }, [enabled])

  useEffect(() => {
    bind()
  }, [])

  return null
}
