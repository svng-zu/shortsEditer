import { useEditor, NARRATION_VOICE_GROUPS } from '../../../contexts/EditorContext'

export default function VoiceTextPanel() {
  const { subtitle, setSubtitle, narr, setNarr, render, handleGenerateScript, handleGenerateNarrSubs, handleNarrationPreview, selectedRaw } = useEditor()

  if (!selectedRaw) return null

  return (
    <section className="glass-panel p-5 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-primary border-b border-outline-variant/20 pb-2 mb-2">
        <span className="material-symbols-outlined">keyboard_voice</span>
        <h2 className="text-title-md font-semibold">Voice &amp; Text</h2>
      </div>

      <div className="space-y-4">
        {/* Show Subtitles */}
        <div className="flex items-center justify-between">
          <label className="text-label-md text-on-surface">Show Subtitles</label>
          <input type="checkbox" checked={subtitle.enabled}
            className="w-10 h-5 rounded-full bg-surface-container-highest text-primary border-none focus:ring-0 cursor-pointer"
            onChange={e => setSubtitle(prev => ({ ...prev, enabled: e.target.checked }))} />
        </div>

        {/* Narration Toggle */}
        <div className="flex items-center justify-between">
          <label className="text-label-md text-on-surface">Add Narration</label>
          <input type="checkbox" checked={narr.enabled}
            className="w-10 h-5 rounded-full bg-surface-container-highest text-primary border-none focus:ring-0 cursor-pointer"
            onChange={e => setNarr(prev => ({ ...prev, enabled: e.target.checked }))} />
        </div>

        {narr.enabled && (
          <>
            {/* Voice Selection */}
            <div>
              <label className="text-label-sm text-on-surface-variant mb-1 block">Voice Selection</label>
              <select
                className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary p-2 text-label-md appearance-none"
                value={narr.voice}
                onChange={e => setNarr(prev => ({ ...prev, voice: e.target.value }))}
              >
                {NARRATION_VOICE_GROUPS.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Narration Mode */}
            <div>
              <label className="text-label-sm text-on-surface-variant mb-1 block">Narration Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setNarr(prev => ({ ...prev, mode: 'title' }))}
                  className={`p-2 border rounded-lg text-label-sm font-semibold ${
                    narr.mode === 'title' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-bright/10'
                  }`}>Title</button>
                <button onClick={() => setNarr(prev => ({ ...prev, mode: 'script' }))}
                  className={`p-2 border rounded-lg text-label-sm font-semibold ${
                    narr.mode === 'script' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-bright/10'
                  }`}>Script</button>
              </div>
            </div>

            {narr.mode === 'script' && (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-label-sm text-on-surface-variant">Script Mode</label>
                    <button onClick={handleGenerateScript}
                      disabled={render.isGeneratingScript}
                      className="text-label-sm text-primary hover:text-primary-fixed-dim disabled:opacity-50">
                      {render.isGeneratingScript ? 'Generating...' : 'Auto Generate'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button onClick={() => setNarr(prev => ({ ...prev, scriptMode: 'summary' }))}
                      className={`p-1.5 border rounded-lg text-label-sm ${
                        narr.scriptMode === 'summary' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant'
                      }`}>Summary</button>
                    <button onClick={() => setNarr(prev => ({ ...prev, scriptMode: 'style_convert' }))}
                      className={`p-1.5 border rounded-lg text-label-sm ${
                        narr.scriptMode === 'style_convert' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant'
                      }`}>Style Convert</button>
                  </div>
                  {render.genScriptMsg && (
                    <div className={`text-label-sm mb-2 ${render.genScriptMsg.includes('실패') ? 'text-error' : 'text-tertiary'}`}>
                      {render.genScriptMsg}
                    </div>
                  )}
                  <textarea
                    className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary p-3 text-body-md resize-none"
                    rows={4} placeholder="나레이션 스크립트..."
                    value={narr.script}
                    onChange={e => setNarr(prev => ({ ...prev, script: e.target.value }))} />
                </div>
                <button onClick={handleGenerateNarrSubs}
                  disabled={render.isGeneratingNarrSubs}
                  className="w-full border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 py-2 rounded-xl text-label-sm font-bold transition-all disabled:opacity-50">
                  {render.isGeneratingNarrSubs ? '생성 중...' : '나레이션 자막 생성'}
                </button>
                {render.genNarrSubsMsg && (
                  <div className={`text-label-sm ${render.genNarrSubsMsg.includes('실패') ? 'text-error' : 'text-tertiary'}`}>
                    {render.genNarrSubsMsg}
                  </div>
                )}
              </>
            )}

            {/* Volume Controls */}
            <div className="space-y-2">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-code-sm text-on-surface-variant">Narration Vol</span>
                  <span className="text-code-sm font-mono text-primary">{narr.volume.toFixed(1)}</span>
                </div>
                <input type="range" min={0} max={3} step={0.1}
                  className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                  value={narr.volume}
                  onChange={e => setNarr(prev => ({ ...prev, volume: Number(e.target.value) }))} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-code-sm text-on-surface-variant">Video Vol (w/ narr)</span>
                  <span className="text-code-sm font-mono text-primary">{narr.videoVolume.toFixed(1)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.05}
                  className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                  value={narr.videoVolume}
                  onChange={e => setNarr(prev => ({ ...prev, videoVolume: Number(e.target.value) }))} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-code-sm text-on-surface-variant">Speed</span>
                  <span className="text-code-sm font-mono text-primary">{narr.speed.toFixed(1)}x</span>
                </div>
                <input type="range" min={0.5} max={2} step={0.1}
                  className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                  value={narr.speed}
                  onChange={e => setNarr(prev => ({ ...prev, speed: Number(e.target.value) }))} />
              </div>
            </div>

            {/* Preview Button */}
            <button onClick={handleNarrationPreview}
              className="w-full border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary/50 py-2 rounded-xl text-label-sm font-bold transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">play_circle</span>
              Preview Voice
            </button>
          </>
        )}
      </div>
    </section>
  )
}
