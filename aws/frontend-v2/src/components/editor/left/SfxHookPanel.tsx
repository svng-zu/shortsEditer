import { useEditor } from '../../../contexts/EditorContext'

export default function SfxHookPanel() {
  const { hookSfx, setHookSfx, selectedRaw } = useEditor()

  if (!selectedRaw) return null

  const addCustomSfx = () => {
    setHookSfx(prev => ({
      ...prev,
      customSfx: [...prev.customSfx, { time: 0, sfx_id: prev.sfxList[0]?.id || '', volume: 0.8 }],
    }))
  }

  const removeCustomSfx = (idx: number) => {
    setHookSfx(prev => ({ ...prev, customSfx: prev.customSfx.filter((_, i) => i !== idx) }))
  }

  const updateCustomSfx = (idx: number, patch: Partial<{ time: number; sfx_id: string; volume: number }>) => {
    setHookSfx(prev => ({
      ...prev,
      customSfx: prev.customSfx.map((s, i) => i === idx ? { ...s, ...patch } : s),
    }))
  }

  return (
    <section className="glass-panel p-5 rounded-xl space-y-4">
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2 mb-2">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined">spatial_audio_off</span>
          <h2 className="text-title-md font-semibold">SFX &amp; Hook</h2>
        </div>
        <input type="checkbox" checked={hookSfx.useHook}
          className="w-10 h-5 rounded-full bg-surface-container-highest text-primary border-none focus:ring-0 cursor-pointer"
          onChange={e => setHookSfx(prev => ({ ...prev, useHook: e.target.checked }))} />
      </div>

      {hookSfx.useHook && (
        <div className="space-y-3">
          {/* Hook SFX Selection */}
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block">Hook Sound</label>
            <select
              className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary p-2 text-label-md appearance-none"
              value={hookSfx.hookSfxId || ''}
              onChange={e => setHookSfx(prev => ({ ...prev, hookSfxId: e.target.value || null }))}
            >
              <option value="">None</option>
              {hookSfx.sfxList.map(s => (
                <option key={s.id} value={s.id}>{s.description || s.file}</option>
              ))}
            </select>
          </div>

          {/* Hook Volume */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-code-sm text-on-surface-variant">Hook Volume</span>
              <span className="text-code-sm font-mono text-primary">{hookSfx.hookSfxVolume.toFixed(1)}</span>
            </div>
            <input type="range" min={0} max={2} step={0.1}
              className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
              value={hookSfx.hookSfxVolume}
              onChange={e => setHookSfx(prev => ({ ...prev, hookSfxVolume: Number(e.target.value) }))} />
          </div>
        </div>
      )}

      {/* Custom SFX Timeline Entries */}
      <div className="space-y-2">
        {hookSfx.customSfx.map((sfx, i) => (
          <div key={i} className="flex items-center justify-between p-2 bg-surface-container-lowest rounded-lg border border-outline-variant/30">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <select
                className="bg-transparent border-none text-label-sm text-on-surface focus:ring-0 p-0 w-24"
                value={sfx.sfx_id}
                onChange={e => updateCustomSfx(i, { sfx_id: e.target.value })}
              >
                {hookSfx.sfxList.map(s => (
                  <option key={s.id} value={s.id}>{s.description || s.file}</option>
                ))}
              </select>
              <input type="number" step={0.1} min={0}
                className="bg-transparent border-none text-code-sm text-on-surface-variant focus:ring-0 p-0 w-14"
                value={sfx.time} onChange={e => updateCustomSfx(i, { time: Number(e.target.value) })} />
              <span className="text-code-sm text-on-surface-variant">s</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-primary text-[18px] cursor-pointer">play_circle</span>
              <button onClick={() => removeCustomSfx(i)}
                className="material-symbols-outlined text-error text-[18px] cursor-pointer">close</button>
            </div>
          </div>
        ))}
        <button onClick={addCustomSfx}
          className="w-full border-2 border-dashed border-outline-variant/50 p-2 rounded-lg text-label-sm text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all">
          + Add Entry
        </button>
      </div>
    </section>
  )
}
