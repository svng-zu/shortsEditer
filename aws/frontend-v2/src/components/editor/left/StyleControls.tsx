import { useEditor, SUB_FONT_OPTIONS } from '../../../contexts/EditorContext'
import { useT } from '../../../i18n'

export default function StyleControls() {
  const { title, setTitle, subtitle, setSubtitle, bg, setBg, selectedRaw } = useEditor()
  const t = useT()

  if (!selectedRaw) return null

  return (
    <section className="glass-panel p-5 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-primary border-b border-outline-variant/20 pb-2 mb-2">
        <span className="material-symbols-outlined">palette</span>
        <h2 className="text-title-md font-semibold">{t.styleSettings}</h2>
      </div>

      {/* Font Selection */}
      <div>
        <label className="text-label-sm text-on-surface-variant mb-1 block">{t.titleFont}</label>
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
        <label className="text-label-sm text-on-surface-variant">{t.titleBorder}</label>
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
          <label className="text-label-md text-on-surface">{t.subtitles}</label>
          <input type="checkbox" checked={subtitle.enabled}
            className="w-10 h-5 rounded-full bg-surface-container-highest text-primary border-none focus:ring-0 cursor-pointer"
            onChange={e => setSubtitle(prev => ({ ...prev, enabled: e.target.checked }))} />
        </div>
        {subtitle.enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-sm text-on-surface-variant mb-1 block">{t.color}</label>
                <div className="flex items-center gap-2 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant">
                  <input type="color" className="w-6 h-6 rounded-full border-none bg-transparent cursor-pointer"
                    value={subtitle.color} onChange={e => setSubtitle(prev => ({ ...prev, color: e.target.value }))} />
                  <span className="text-code-sm font-mono opacity-60">{subtitle.color}</span>
                </div>
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant mb-1 block">{t.size}</label>
                <input type="number" min={20} max={80}
                  className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg p-2 text-label-md"
                  value={subtitle.size} onChange={e => setSubtitle(prev => ({ ...prev, size: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="text-label-sm text-on-surface-variant mb-1 block">{t.subtitleFont}</label>
              <select
                className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary p-2 text-label-md appearance-none"
                value={subtitle.font} onChange={e => setSubtitle(prev => ({ ...prev, font: e.target.value }))}>
                {SUB_FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-sm text-on-surface-variant mb-1 block">{t.subXPos}</label>
                <input type="range" min={-300} max={300} step={5}
                  className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                  value={subtitle.x} onChange={e => setSubtitle(prev => ({ ...prev, x: Number(e.target.value) }))} />
                <span className="text-code-sm font-mono text-primary">{subtitle.x}px</span>
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant mb-1 block">{t.subYPos}</label>
                <input type="range" min={-500} max={1200} step={10}
                  className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                  value={subtitle.y} onChange={e => setSubtitle(prev => ({ ...prev, y: Number(e.target.value) }))} />
                <span className="text-code-sm font-mono text-primary">{subtitle.y}px</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-label-sm text-on-surface-variant cursor-pointer">
                <input type="checkbox" checked={subtitle.bgEnabled}
                  className="w-4 h-4 rounded bg-surface-container-highest text-primary border-outline-variant cursor-pointer accent-primary"
                  onChange={e => setSubtitle(prev => ({ ...prev, bgEnabled: e.target.checked }))} />
                {t.subBg}
              </label>
              {subtitle.bgEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-label-sm text-on-surface-variant mb-1 block">{t.subBgColor}</label>
                    <div className="flex items-center gap-2 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant">
                      <input type="color" className="w-6 h-6 rounded-full border-none bg-transparent cursor-pointer"
                        value={subtitle.bgColor} onChange={e => setSubtitle(prev => ({ ...prev, bgColor: e.target.value }))} />
                      <span className="text-code-sm font-mono opacity-60">{subtitle.bgColor}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-label-sm text-on-surface-variant mb-1 block">{t.subBgOpacity}</label>
                    <input type="range" min={0} max={1} step={0.05}
                      className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                      value={subtitle.bgOpacity} onChange={e => setSubtitle(prev => ({ ...prev, bgOpacity: Number(e.target.value) }))} />
                    <span className="text-code-sm font-mono text-primary">{Math.round(subtitle.bgOpacity * 100)}%</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Background */}
      <div className="pt-2 border-t border-outline-variant/20 space-y-3">
        <label className="text-label-sm text-on-surface-variant">{t.bgType}</label>
        <div className="grid grid-cols-3 gap-2">
          {(['blur', 'solid', 'image'] as const).map(bgOpt => (
            <button key={bgOpt} onClick={() => setBg(prev => ({ ...prev, type: bgOpt }))}
              className={`p-2 border rounded-lg text-label-sm font-semibold transition-colors ${
                bg.type === bgOpt
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-bright/10'
              }`}>
              {bgOpt === 'blur' ? t.bgBlur : bgOpt === 'solid' ? t.bgSolid : t.bgImage}
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
            <option value="">{t.selectBg}</option>
            {bg.options.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

    </section>
  )
}
