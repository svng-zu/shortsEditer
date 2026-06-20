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

        {/* Title backgrounds */}
        {[
          { label: '1줄 배경', key: 'title1' as const },
          { label: '2줄 배경', key: 'title2' as const },
        ].map(({ label, key }) => {
          const enabled = title[`${key}BgEnabled`]
          return (
            <div key={key} className="border border-outline-variant/30 rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-primary cursor-pointer"
                  checked={enabled}
                  onChange={e => setTitle(prev => ({ ...prev, [`${key}BgEnabled`]: e.target.checked }))} />
                <span className="text-label-sm text-on-surface-variant">{label}</span>
              </label>
              {enabled && (
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-[11px] text-on-surface-variant block mb-1">색상</span>
                    <input type="color" className="w-8 h-7 rounded border border-outline-variant cursor-pointer"
                      value={title[`${key}BgColor`]}
                      onChange={e => setTitle(prev => ({ ...prev, [`${key}BgColor`]: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="text-[11px] text-on-surface-variant">투명도</span>
                      <span className="text-[11px] text-primary font-mono">{Math.round(title[`${key}BgOpacity`] * 100)}%</span>
                    </div>
                    <input type="range" min={0.1} max={1} step={0.05}
                      className="w-full h-1 bg-surface-container-highest rounded appearance-none cursor-pointer accent-primary"
                      value={title[`${key}BgOpacity`]}
                      onChange={e => setTitle(prev => ({ ...prev, [`${key}BgOpacity`]: Number(e.target.value) }))} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
