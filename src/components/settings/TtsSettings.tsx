import { useEffect, useState } from 'react'
import { Volume2, Download, Check, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useTtsSettings,
  useBrowserVoices,
  isBrowserTtsSupported,
  PIPER_VOICES,
  playFragment,
  stopTts,
  type TtsEngine,
} from '@/lib/tts'

const SAMPLE = 'Hello! Welcome to my website.'

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[0.75rem] font-medium text-foreground/80">{label}</p>
        {description && <p className="mt-0.5 text-[0.625rem] leading-snug text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      aria-label={label}
      aria-pressed={on}
      className={cn('relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors', on ? 'bg-foreground' : 'bg-muted-foreground/20')}
    >
      <span className={cn('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-background transition-[left] duration-150', on ? 'left-[16px]' : 'left-[2px]')} />
    </button>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex h-[26px] overflow-hidden rounded-md border border-border/40">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn('px-2.5 text-[0.6875rem] font-medium transition-colors', value === opt.value ? 'bg-foreground text-background' : 'bg-transparent text-muted-foreground hover:text-foreground/70')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-[0.75rem] font-medium text-foreground/80">{label}</p>
        <span className="font-mono text-[0.625rem] tabular-nums text-muted-foreground">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border/60 accent-foreground"
        aria-label={label}
      />
    </div>
  )
}

const selectClass = 'h-[26px] max-w-[11rem] rounded-md border border-border/40 bg-background px-2 text-[0.6875rem] text-foreground focus:border-foreground/20 focus:outline-none'

function BrowserVoiceRow({ voiceURI, onChange }: { voiceURI: string | null; onChange: (uri: string | null) => void }) {
  const voices = useBrowserVoices()
  return (
    <Row label="Voice" description={isBrowserTtsSupported() ? 'System voices from your browser' : 'No speech voices available in this browser'}>
      <select className={selectClass} value={voiceURI ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={!isBrowserTtsSupported()}>
        <option value="">Default</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>{v.name}{v.lang ? ` (${v.lang})` : ''}</option>
        ))}
      </select>
    </Row>
  )
}

function PiperVoiceRows({ voiceId, onChange }: { voiceId: string; onChange: (id: string) => void }) {
  const [downloaded, setDownloaded] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Check cache status for the selected voice. Loading the module here is fine —
  // the user has opted into the neural engine to reach this control.
  useEffect(() => {
    let cancelled = false
    setDownloaded(null)
    setError(null)
    ;(async () => {
      try {
        const piper = await import('@mintplex-labs/piper-tts-web')
        const stored = await piper.stored()
        if (!cancelled) setDownloaded(stored.includes(voiceId))
      } catch {
        if (!cancelled) setDownloaded(false)
      }
    })()
    return () => { cancelled = true }
  }, [voiceId])

  const handleDownload = async () => {
    setProgress(0)
    setError(null)
    try {
      const piper = await import('@mintplex-labs/piper-tts-web')
      await piper.download(voiceId, (p) => setProgress(p.total ? Math.round((p.loaded / p.total) * 100) : 0))
      setDownloaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setProgress(null)
    }
  }

  const handleRemove = async () => {
    try {
      const piper = await import('@mintplex-labs/piper-tts-web')
      await piper.remove(voiceId)
      setDownloaded(false)
    } catch { /* ignore */ }
  }

  return (
    <>
      <Row label="Voice" description="Neural voices run in your browser. First use downloads a model (~20–60 MB), then it's cached.">
        <select className={selectClass} value={voiceId} onChange={(e) => { stopTts(); onChange(e.target.value) }}>
          {PIPER_VOICES.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </Row>
      <Row label="Model" description={downloaded ? 'Cached and ready to use offline.' : 'Not downloaded yet — downloads on first read.'}>
        {progress !== null ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[0.625rem] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
            {progress}%
          </span>
        ) : downloaded ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[0.6875rem] text-primary"><Check className="size-3.5" />Ready</span>
            <button onClick={handleRemove} title="Remove cached model" className="grid size-6 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ) : (
          <button onClick={handleDownload} className="inline-flex items-center gap-1.5 rounded-md border border-border/40 px-2.5 py-1 text-[0.6875rem] text-foreground/80 transition-colors hover:border-primary/30 hover:bg-primary/[0.04]">
            <Download className="size-3.5" />Download
          </button>
        )}
      </Row>
      {error && <p className="px-3 pb-2 text-[0.625rem] text-destructive">{error}</p>}
    </>
  )
}

export function TtsSettings() {
  const [s, set] = useTtsSettings()

  return (
    <div>
      <label className="mb-2 block text-[0.625rem] uppercase tracking-wider text-muted-foreground">Read aloud</label>
      <div className="divide-y divide-border/20 rounded-lg border border-border/30">
        <Row label="Enable read-aloud" description="Adds a Read aloud action to each passage and a player at the bottom of the screen.">
          <Toggle on={s.enabled} onToggle={() => { if (s.enabled) stopTts(); set({ enabled: !s.enabled }) }} label="Toggle read-aloud" />
        </Row>

        {s.enabled && (
          <>
            <Row label="Engine" description="Browser is instant. Neural sounds far better but downloads a voice model.">
              <Segmented<TtsEngine>
                value={s.engine}
                options={[{ value: 'browser', label: 'Browser' }, { value: 'piper', label: 'Neural' }]}
                onChange={(v) => { stopTts(); set({ engine: v }) }}
              />
            </Row>

            {s.engine === 'browser'
              ? <BrowserVoiceRow voiceURI={s.browserVoiceURI} onChange={(uri) => set({ browserVoiceURI: uri })} />
              : <PiperVoiceRows voiceId={s.piperVoiceId} onChange={(id) => set({ piperVoiceId: id })} />}

            <Slider label="Speed" value={s.rate} min={0.5} max={2} step={0.05} onChange={(v) => set({ rate: v })} format={(v) => `${v.toFixed(2)}×`} />
            {s.engine === 'browser' && (
              <Slider label="Pitch" value={s.pitch} min={0} max={2} step={0.05} onChange={(v) => set({ pitch: v })} format={(v) => v.toFixed(2)} />
            )}
            <Slider label="Volume" value={s.volume} min={0} max={1} step={0.05} onChange={(v) => set({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} />

            <div className="px-3 py-2.5">
              <button
                onClick={() => playFragment('__tts_test__', SAMPLE, 'Voice test', s)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/40 px-2.5 py-1 text-[0.6875rem] text-foreground/80 transition-colors hover:border-primary/30 hover:bg-primary/[0.04]"
              >
                <Volume2 className="size-3.5" />Test voice
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
