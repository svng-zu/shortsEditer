import { useEditor, SUB_FONT_OPTIONS } from '../../../contexts/EditorContext'

export default function StyleControls() {
  const { title, setTitle, subtitle, setSubtitle, bg, setBg, color, setColor, selectedRaw } = useEditor()

  if (!selectedRaw) return null

  return (
    <section className="glass-panel p-5 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-primary border-b border-outline-variant/20 pb-2 mb-2">
        <span className="material-symbols-outlined">palette</span>
        <h2 className="text-title-md font-semibold">Style Controls</h2>
      </div>

      {/* Font Selection */}
      <div>
        <label className="text-label-sm text-on-surface-variant mb-1 block">Title Font</label>
        <select
          className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary p-2.5 text-label-md appearance-none"
          value={title.titleFont}
          onChange={e => setTitle(prev => ({ ...prev, titleFont: e.target.value }))}
        >
          {SUB_FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {/* Border Controls */}
      <div className="space-y-2">
        <label className="text-label-sm text-on-surface-variant">Title Border</label>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant">
            <input type="color" className="w-6 h-6 rounded-full border-none bg-transparent cursor-pointer"
              value={title.title1BorderColor}
              onChange={e => setTitle(prev => ({ ...prev, title1BorderColor: e.target.value }))} />
            <input type="number" min={0} max={10}
              className="w-12 bg-transparent text-code-sm text-on-surface border-none outline-none"
              value={title.title1BorderWidth}
              onChange={e => setTitle(prev => ({ ...prev, title1BorderWidth: Number(e.target.value) }))} />
          </div>
          <div className="flex items-center gap-2 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant">
            <input type="color" className="w-6 h-6 rounded-full border-none bg-transparent cursor-pointer"
              value={title.title2BorderColor}
              onChange={e => setTitle(prev => ({ ...prev, title2BorderColor: e.target.value }))} />
            <input type="number" min={0} max={10}
              className="w-12 bg-transparent text-code-sm text-on-surface border-none outline-none"
              value={title.title2BorderWidth}
              onChange={e => setTitle(prev => ({ ...prev, title2BorderWidth: Number(e.target.value) }))} />
          </div>
        </div>
      </div>

      {/* Subtitles */}
      <div className="pt-2 border-t border-outline-variant/20 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-label-md text-on-surface">Subtitles</label>
          <input type="checkbox" checked={subtitle.enabled}
            className="w-10 h-5 rounded-full bg-surface-container-highest text-primary border-none focus:ring-0 cursor-pointer"
            onChange={e => setSubtitle(prev => ({ ...prev, enabled: e.target.checked }))} />
        </div>
        {subtitle.enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-sm text-on-surface-variant mb-1 block">Color</label>
                <div className="flex items-center gap-2 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant">
                  <input type="color" className="w-6 h-6 rounded-full border-none bg-transparent cursor-pointer"
                    value={subtitle.color} onChange={e => setSubtitle(prev => ({ ...prev, color: e.target.value }))} />
                  <span className="text-code-sm font-mono opacity-60">{subtitle.color}</span>
                </div>
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant mb-1 block">Size</label>
                <input type="number" min={20} max={80}
                  className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg p-2 text-label-md"
                  value={subtitle.size} onChange={e => setSubtitle(prev => ({ ...prev, size: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="text-label-sm text-on-surface-variant mb-1 block">Subtitle Font</label>
              <select
                className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary p-2 text-label-md appearance-none"
                value={subtitle.font} onChange={e => setSubtitle(prev => ({ ...prev, font: e.target.value }))}>
                {SUB_FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Background */}
      <div className="pt-2 border-t border-outline-variant/20 space-y-3">
        <label className="text-label-sm text-on-surface-variant">Background Type</label>
        <div className="grid grid-cols-3 gap-2">
          {(['blur', 'solid', 'image'] as const).map(t => (
            <button key={t} onClick={() => setBg(prev => ({ ...prev, type: t }))}
              className={`p-2 border rounded-lg text-label-sm font-semibold transition-colors ${
                bg.type === t
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-bright/10'
              }`}>
              {t === 'blur' ? 'Blur' : t === 'solid' ? 'Solid' : 'Image'}
            </button>
          ))}
        </div>
        {bg.type === 'solid' && (
          <div className="flex items-center gap-2 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant">
            <input type="color" className="w-7 h-7 rounded-full border-none bg-transparent cursor-pointer"
              value={bg.solidColor} onChange={e => setBg(prev => ({ ...prev, solidColor: e.target.value }))} />
            <span className="text-code-sm font-mono opacity-60">{bg.solidColor}</span>
          </div>
        )}
        {bg.type === 'image' && bg.options.length > 0 && (
          <select
            className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg p-2 text-label-md appearance-none"
            value={bg.imageName} onChange={e => setBg(prev => ({ ...prev, imageName: e.target.value }))}>
            <option value="">Select background</option>
            {bg.options.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      {/* Color Correction */}
      <div className="pt-2 border-t border-outline-variant/20 space-y-3">
        <label className="text-label-sm text-on-surface-variant">Color Correction</label>
        {[
          { label: 'Brightness', key: 'brightness' as const, min: -1, max: 1, step: 0.05 },
          { label: 'Contrast', key: 'contrast' as const, min: 0, max: 3, step: 0.05 },
          { label: 'Saturation', key: 'saturation' as const, min: 0, max: 3, step: 0.05 },
          { label: 'Volume', key: 'volume' as const, min: 0, max: 3, step: 0.05 },
        ].map(s => (
          <div key={s.key}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-code-sm text-on-surface-variant">{s.label}</span>
              <span className="text-code-sm font-mono text-primary">{color[s.key].toFixed(2)}</span>
            </div>
            <input type="range" min={s.min} max={s.max} step={s.step}
              className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
              value={color[s.key]}
              onChange={e => setColor(prev => ({ ...prev, [s.key]: Number(e.target.value) }))} />
          </div>
        ))}
      </div>
    </section>
  )
}
