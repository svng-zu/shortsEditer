import { useEditor } from '../../../contexts/EditorContext'

export default function RenderButton() {
  const { render: renderState, handleRender, selectedRaw, setShowSrt } = useEditor()

  if (!selectedRaw) return null

  return (
    <div className="space-y-3">
      {/* SRT Edit Button */}
      <button onClick={() => setShowSrt(true)}
        className="w-full border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary/50 py-3 rounded-xl text-label-sm font-bold transition-all flex items-center justify-center gap-2">
        <span className="material-symbols-outlined text-[18px]">closed_caption</span>
        자막 편집 (SRT)
      </button>

      {/* Render Button */}
      <button
        onClick={handleRender}
        disabled={renderState.isRendering}
        className="w-full bg-primary text-on-primary font-bold py-5 px-6 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined">memory</span>
        {renderState.isRendering ? 'RENDERING...' : 'FINAL RENDER'}
      </button>

      {/* Render Status */}
      {renderState.message && (
        <div className={`p-3 rounded-xl text-label-sm font-medium ${
          renderState.message.includes('완료') ? 'bg-tertiary/10 text-tertiary' :
          renderState.message.includes('실패') ? 'bg-error-container/20 text-error' :
          'bg-primary/10 text-primary'
        }`}>
          {renderState.message}
        </div>
      )}
    </div>
  )
}
