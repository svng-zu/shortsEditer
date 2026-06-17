import { useEditor } from '../../../contexts/EditorContext'

export default function TitleControls() {
  const { title, setTitle, selectedRaw } = useEditor()

  if (!selectedRaw) return null

  return (
    <section className="glass-panel p-5 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-primary border-b border-outline-variant/20 pb-2 mb-2">
        <span className="material-symbols-outlined">title</span>
        <h2 className="text-title-md font-semibold">Title/Intro</h2>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-label-sm text-on-surface-variant mb-1 block">Title 1</label>
          <textarea
            className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary focus:ring-1 focus:ring-primary p-3 text-body-md resize-none"
            rows={2}
            value={title.title1}
            onChange={e => setTitle(prev => ({ ...prev, title1: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-label-sm text-on-surface-variant mb-1 block">Intro Text (Title 2)</label>
          <textarea
            className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary focus:ring-1 focus:ring-primary p-3 text-body-md resize-none"
            rows={2}
            value={title.title2}
            onChange={e => setTitle(prev => ({ ...prev, title2: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block">Title 1 Color</label>
            <div className="flex items-center gap-2 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant">
              <input type="color" className="w-7 h-7 rounded-full border-none bg-transparent cursor-pointer"
                value={title.t1Color}
                onChange={e => setTitle(prev => ({ ...prev, t1Color: e.target.value }))} />
              <span className="text-code-sm font-mono opacity-60">{title.t1Color}</span>
            </div>
          </div>
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block">Title 2 Color</label>
            <div className="flex items-center gap-2 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant">
              <input type="color" className="w-7 h-7 rounded-full border-none bg-transparent cursor-pointer"
                value={title.t2Color}
                onChange={e => setTitle(prev => ({ ...prev, t2Color: e.target.value }))} />
              <span className="text-code-sm font-mono opacity-60">{title.t2Color}</span>
            </div>
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-label-sm text-on-surface-variant">Title Y Offset</label>
            <span className="text-code-sm font-mono text-primary">{title.titleY}px</span>
          </div>
          <input type="range" min={-500} max={500} step={1}
            className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
            value={title.titleY}
            onChange={e => setTitle(prev => ({ ...prev, titleY: Number(e.target.value) }))} />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-label-sm text-on-surface-variant">Font Size Delta</label>
            <span className="text-code-sm font-mono text-primary">{title.titleFontSizeDelta > 0 ? '+' : ''}{title.titleFontSizeDelta}px</span>
          </div>
          <input type="range" min={-50} max={50} step={1}
            className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
            value={title.titleFontSizeDelta}
            onChange={e => setTitle(prev => ({ ...prev, titleFontSizeDelta: Number(e.target.value) }))} />
        </div>
      </div>
    </section>
  )
}
