import { useState } from 'react'
import { api, ShortInfo, RawInfo, StyleParams } from '../services/api'

interface ShortsPanelProps {
  activeTab: 'raws' | 'shorts'
  onTabChange: (tab: 'raws' | 'shorts') => void
  shorts: ShortInfo[]
  raws: RawInfo[]
  selectedShort: ShortInfo | null
  selectedRaw: RawInfo | null
  onSelectShort: (short: ShortInfo) => void
  onSelectRaw: (raw: RawInfo) => void
  onRefresh: () => void
  onStartPolling: () => void
}

export default function ShortsPanel({
  activeTab,
  onTabChange,
  shorts,
  raws,
  selectedShort,
  selectedRaw,
  onSelectShort,
  onSelectRaw,
  onRefresh,
  onStartPolling,
}: ShortsPanelProps) {
  return (
    <div className="flex flex-col overflow-hidden bg-bg">
      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-2 border-b border-border">
        <button
          onClick={() => onTabChange('raws')}
          className={`px-4 py-1.5 rounded-t-md text-xs font-bold ${
            activeTab === 'raws'
              ? 'bg-accent text-black'
              : 'bg-surface2 text-muted'
          }`}
        >
          영상 편집
        </button>
        <button
          onClick={() => onTabChange('shorts')}
          className={`px-4 py-1.5 rounded-t-md text-xs font-bold ${
            activeTab === 'shorts'
              ? 'bg-accent text-black'
              : 'bg-surface2 text-muted'
          }`}
        >
          완성 쇼츠
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'raws' ? (
          <RawsTab
            raws={raws}
            selectedRaw={selectedRaw}
            onSelectRaw={onSelectRaw}
            onRefresh={onRefresh}
            onStartPolling={onStartPolling}
          />
        ) : (
          <ShortsTab
            shorts={shorts}
            selectedShort={selectedShort}
            onSelectShort={onSelectShort}
            onRefresh={onRefresh}
          />
        )}
      </div>
    </div>
  )
}

interface RawsTabProps {
  raws: RawInfo[]
  selectedRaw: RawInfo | null
  onSelectRaw: (raw: RawInfo) => void
  onRefresh: () => void
  onStartPolling: () => void
}

function RawsTab({ raws, selectedRaw, onSelectRaw, onRefresh, onStartPolling }: RawsTabProps) {
  const [renderTitle, setRenderTitle] = useState('')
  const [templateId, setTemplateId] = useState(1)

  const handleRender = async () => {
    if (!selectedRaw) return
    const style: StyleParams = {
      title1_color: '#FFD700',
      title2_color: '#FFFFFF',
      title_y_extra: 0,
      title_fontsize_scale: 1.0,
      sub_fontsize: 52,
      sub_color: '#FFFFFF',
      sub_margin_v: 20,
    }
    await api.render(selectedRaw.filename, renderTitle, false, templateId, style)
    onStartPolling()
  }

  return (
    <>
      {/* Raw List */}
      <div className="w-60 shrink-0 border-r border-border overflow-y-auto bg-surface">
        <div className="px-3.5 py-2.5 font-bold text-[11px] tracking-wider uppercase text-muted border-b border-border sticky top-0 bg-surface z-10 flex items-center justify-between">
          <span>편집된 영상 (raw)</span>
          <span className="bg-accent text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">
            {raws.length}
          </span>
          <button onClick={onRefresh} className="text-muted hover:text-white">↻</button>
        </div>
        {raws.length === 0 ? (
          <div className="text-center py-10 text-muted">
            <div className="text-3xl mb-2">🎞</div>
            <p className="text-[11px]">영상 편집을 먼저 실행하세요.</p>
          </div>
        ) : (
          raws.map((raw) => (
            <div
              key={raw.filename}
              onClick={() => {
                onSelectRaw(raw)
                setRenderTitle(raw.title)
              }}
              className={`p-3 border-b border-border cursor-pointer transition-colors ${
                selectedRaw?.filename === raw.filename
                  ? 'bg-surface2 border-l-[3px] border-l-accent'
                  : 'hover:bg-surface2'
              }`}
            >
              <div className="text-xs font-semibold">{raw.title}</div>
              <div className="text-[10px] text-muted mt-0.5">
                {raw.filename} · {raw.category}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Player & Render Controls */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-bg">
        {selectedRaw ? (
          <>
            <div className="w-full max-w-[360px] aspect-[9/16] bg-surface rounded-2xl overflow-hidden shadow-2xl">
              <video
                src={selectedRaw.url}
                controls
                className="w-full h-full object-contain"
              />
            </div>

            {/* Render Controls */}
            <div className="mt-4 w-full max-w-[360px] bg-surface rounded-lg p-4">
              <div className="text-[10px] text-muted mb-2">
                선택: {selectedRaw.filename}
              </div>
              <input
                type="text"
                value={renderTitle}
                onChange={(e) => setRenderTitle(e.target.value)}
                placeholder="제목 입력"
                className="w-full p-2 bg-surface2 border border-border rounded text-sm text-white mb-2"
              />
              <div className="flex gap-2">
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(Number(e.target.value))}
                  className="flex-1 p-2 bg-surface2 border border-border rounded text-xs text-white"
                >
                  <option value={1}>① 다크 계열</option>
                  <option value={2}>② 미니멀 흰배경</option>
                  <option value={3}>③ 네이비/포인트</option>
                </select>
                <button
                  onClick={handleRender}
                  className="px-4 py-2 bg-accent text-black font-bold rounded text-xs"
                >
                  ▶ 렌더링
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-muted">
            <div className="text-5xl mb-3">▶</div>
            <p className="text-xs">왼쪽에서 영상을 선택하세요</p>
          </div>
        )}
      </div>
    </>
  )
}

interface ShortsTabProps {
  shorts: ShortInfo[]
  selectedShort: ShortInfo | null
  onSelectShort: (short: ShortInfo) => void
  onRefresh: () => void
}

function ShortsTab({ shorts, selectedShort, onSelectShort, onRefresh }: ShortsTabProps) {
  const handleDelete = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`'${filename}'을 삭제할까요?`)) return
    await api.deleteShort(filename)
    onRefresh()
  }

  return (
    <>
      {/* Shorts List */}
      <div className="w-60 shrink-0 border-r border-border overflow-y-auto bg-surface">
        <div className="px-3.5 py-2.5 font-bold text-[11px] tracking-wider uppercase text-muted border-b border-border sticky top-0 bg-surface z-10 flex items-center justify-between">
          <span>완성 쇼츠</span>
          <span className="bg-accent text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">
            {shorts.length}
          </span>
          <button onClick={onRefresh} className="text-muted hover:text-white">↻</button>
        </div>
        {shorts.length === 0 ? (
          <div className="text-center py-10 text-muted">
            <div className="text-3xl mb-2">🎬</div>
            <p className="text-[11px]">
              아직 생성된 쇼츠가 없어요.
              <br />
              영상 편집 후 렌더링하세요.
            </p>
          </div>
        ) : (
          shorts.map((short) => (
            <div
              key={short.filename}
              onClick={() => onSelectShort(short)}
              className={`flex items-center gap-2.5 p-2.5 border-b border-border cursor-pointer transition-colors ${
                selectedShort?.filename === short.filename
                  ? 'bg-surface2 border-l-[3px] border-l-accent'
                  : 'hover:bg-surface2'
              }`}
            >
              <div className="w-13 h-13 bg-border rounded-md shrink-0 overflow-hidden flex items-center justify-center">
                <video
                  src={`${short.url}#t=1`}
                  className="w-full h-full object-cover"
                  muted
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold line-clamp-2 mb-1">{short.title || short.filename}</div>
                <div className="text-[10px] text-muted uppercase tracking-wide">
                  {short.category && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      short.category === 'sports' ? 'bg-[#1e3a5f] text-[#60a5fa]' :
                      short.category === 'economy' ? 'bg-[#1c3a2a] text-[#34d399]' :
                      'bg-[#3b1f2b] text-[#f472b6]'
                    }`}>
                      {short.category}
                    </span>
                  )}
                </div>
                <div className="flex gap-1 mt-1">
                  <a
                    href={short.url}
                    download={short.filename}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-700 text-white"
                    onClick={(e) => e.stopPropagation()}
                  >
                    다운로드
                  </a>
                  <button
                    onClick={(e) => handleDelete(short.filename, e)}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-900 text-white"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Player */}
      <div className="flex-1 flex items-center justify-center p-6 bg-bg">
        {selectedShort ? (
          <div className="w-full max-w-[360px] aspect-[9/16] bg-surface rounded-2xl overflow-hidden shadow-2xl">
            <video
              src={selectedShort.url}
              controls
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="text-center text-muted">
            <div className="text-5xl mb-3">▶</div>
            <p className="text-xs">
              왼쪽 목록에서
              <br />
              쇼츠를 선택하세요
            </p>
          </div>
        )}
      </div>
    </>
  )
}
