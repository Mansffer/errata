import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'
import { api, type CustomFragmentType, type StoryMeta } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/ui/async-view'
import { FRAGMENT_TYPE_ICON_OPTIONS, FragmentTypeIcon } from '@/components/fragments/fragment-type-icons'
import { componentId } from '@/lib/dom-ids'

interface FragmentTypesPanelProps {
  storyId: string
  story: StoryMeta
}

const BUILTIN_TYPES = new Set(['prose', 'character', 'guideline', 'knowledge', 'image', 'icon', 'marker', 'summary'])

function slugifyType(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function titleFromType(type: string) {
  return type
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeDefinition(def: CustomFragmentType): CustomFragmentType {
  const type = slugifyType(def.type)
  return {
    type,
    name: def.name.trim() || titleFromType(type) || 'Custom Fragment',
    description: def.description.trim(),
    icon: def.icon || 'Hash',
    showInSidebar: def.showInSidebar,
  }
}

export function FragmentTypesPanel({ storyId, story }: FragmentTypesPanelProps) {
  const queryClient = useQueryClient()
  const customTypes = story.settings.customFragmentTypes ?? []
  const [drafts, setDrafts] = useState<CustomFragmentType[]>(customTypes)
  const [newType, setNewType] = useState('')

  useEffect(() => {
    setDrafts(story.settings.customFragmentTypes ?? [])
  }, [story.settings.customFragmentTypes])

  const saveMutation = useMutation({
    mutationFn: (customFragmentTypes: CustomFragmentType[]) =>
      api.settings.update(storyId, { customFragmentTypes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story', storyId] })
      queryClient.invalidateQueries({ queryKey: ['fragments', storyId] })
    },
  })

  const normalizedNewType = slugifyType(newType)
  const existingTypes = useMemo(() => new Set(drafts.map((def) => def.type)), [drafts])
  const addDisabled = !normalizedNewType || BUILTIN_TYPES.has(normalizedNewType) || existingTypes.has(normalizedNewType)
  const hasInvalidDraft = drafts.some((def, index) => {
    const normalized = slugifyType(def.type)
    if (!normalized || BUILTIN_TYPES.has(normalized)) return true
    return drafts.some((other, otherIndex) => otherIndex !== index && slugifyType(other.type) === normalized)
  })

  const updateDraft = (index: number, patch: Partial<CustomFragmentType>) => {
    setDrafts((prev) => prev.map((def, i) => i === index ? { ...def, ...patch } : def))
  }

  const addDraft = () => {
    if (addDisabled) return
    setDrafts((prev) => [
      ...prev,
      {
        type: normalizedNewType,
        name: titleFromType(normalizedNewType),
        description: '',
        icon: 'Hash',
        showInSidebar: true,
      },
    ])
    setNewType('')
  }

  const saveDrafts = () => {
    if (hasInvalidDraft) return
    const normalized = drafts.map(normalizeDefinition)
    setDrafts(normalized)
    saveMutation.mutate(normalized)
  }

  return (
    <div className="flex h-full flex-col" data-component-id="fragment-types-panel-root">
      <div className="border-b border-border/50 px-3 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addDraft()
              }
            }}
            placeholder="location"
            className="h-8 bg-transparent text-xs font-mono"
            data-component-id="fragment-types-new-type"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 gap-1.5 text-xs"
            onClick={addDraft}
            disabled={addDisabled}
            data-component-id="fragment-types-add"
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          Use lowercase slugs for types. Existing fragments are not deleted when a definition is removed.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {drafts.length === 0 && (
            <EmptyState
              title="No custom types"
              hint="Add a type like location, faction, timeline, or artifact."
              className="py-10"
            />
          )}

          {drafts.map((def, index) => {
            const normalizedType = slugifyType(def.type)
            const invalidType = !normalizedType || BUILTIN_TYPES.has(normalizedType)
            return (
              <div
                key={`${def.type}-${index}`}
                className="rounded-md border border-border/40 p-3"
                data-component-id={componentId('fragment-type-config', def.type || String(index))}
              >
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div className="min-w-0 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">Type</span>
                        <Input
                          value={def.type}
                          onChange={(e) => updateDraft(index, { type: slugifyType(e.target.value) })}
                          className={`h-8 bg-transparent text-xs font-mono ${invalidType ? 'border-destructive/60' : ''}`}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">Name</span>
                        <Input
                          value={def.name}
                          onChange={(e) => updateDraft(index, { name: e.target.value })}
                          className="h-8 bg-transparent text-xs"
                        />
                      </label>
                    </div>

                    <label className="block space-y-1">
                      <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">Description</span>
                      <Input
                        value={def.description}
                        onChange={(e) => updateDraft(index, { description: e.target.value })}
                        maxLength={250}
                        className="h-8 bg-transparent text-xs"
                      />
                    </label>

                    <div className="flex items-center justify-between gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2">
                        <FragmentTypeIcon icon={def.icon} className="size-4 shrink-0 text-muted-foreground" />
                        <select
                          value={def.icon}
                          onChange={(e) => updateDraft(index, { icon: e.target.value })}
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          {FRAGMENT_TYPE_ICON_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={def.showInSidebar}
                          onCheckedChange={(checked) => updateDraft(index, { showInSidebar: checked === true })}
                        />
                        Sidebar
                      </label>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== index))}
                    title="Remove type definition"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-border/50 p-3">
        <Button
          type="button"
          className="h-8 w-full gap-1.5 text-xs"
          onClick={saveDrafts}
          disabled={saveMutation.isPending || hasInvalidDraft}
          data-component-id="fragment-types-save"
        >
          <Save className="size-3.5" />
          {saveMutation.isPending ? 'Saving...' : 'Save fragment types'}
        </Button>
      </div>
    </div>
  )
}
