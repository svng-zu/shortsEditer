import { useRef, useState } from 'react'
import { RawInfo, ShortInfo } from '../services/api'

interface Props {
  activeTab: 'raws' | 'shorts'
  selectedRaw: RawInfo | null
  selectedShort: ShortInfo | null
  onRefresh: () => void
  mobile?: boolean
  // unused but passed via sharedProps spread
  [key: string]: unknown
}

export default function PreviewPanel({ activeTab, selectedRaw, selectedShort, mobile }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const item = activeTab === 'raws' ? selectedRaw : selectedShort
  const url  = item?.url ?? ''

  const toggle = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true) }
    else { videoRef.current.pause(); setPlaying(false) }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const pct = duration ? (currentTime / duration) * 100 : 0

  return (
    <aside className={`${mobile ? 'w-full' : 'w-96 shrink-0'} bg-slate-100 p-5 flex flex-col gap-4`}>

      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">Preview</h2>
        {item && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
            activeTab === 'raws'
              ? 'bg-violet-100 text-violet-600'
              : 'bg-green-100 text-green-600'
          }`}>
            {activeTab === 'raws' ? 'RAW' : 'SHORT'}
          </span>
        )}
      </div>

      {/* 9:16 video */}
      <div className="aspect-[9/16] bg-black rounded-3xl overflow-hidden relative shadow-xl">
        {url ? (
          <video
            ref={videoRef}
            key={url}
            src={url}
            className="w-full h-full object-cover"
            onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
            onEnded={() => setPlaying(false)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
            <div className="text-4xl mb-3 opacity-30">▶</div>
            <p className="text-xs text-center px-4 leading-relaxed opacity-50">
              {activeTab === 'raws' ? '편집 영상을' : '완성 쇼츠를'}<br/>선택하면 미리보기가<br/>나타납니다
            </p>
          </div>
        )}

        {/* Play overlay */}
        {url && !playing && (
          <button
            onClick={toggle}
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <span className="text-slate-800 text-xl ml-1">▶</span>
            </div>
          </button>
        )}
      </div>

      {/* Controls */}
      {url && (
        <div className="space-y-3">
          {/* Scrubber */}
          <div className="space-y-1.5">
            <div
              className="h-2 bg-slate-300 rounded-full overflow-hidden cursor-pointer"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                if (videoRef.current) videoRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
              }}
            >
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 tabular-nums">
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* Play/Pause button */}
          <button
            onClick={toggle}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {playing ? '⏸ 일시정지' : '▶ 재생'}
          </button>

          {/* Info */}
          {item && (
            <div className="bg-white rounded-xl p-3 border border-slate-200">
              <p className="text-xs font-semibold text-slate-700 line-clamp-2 mb-1.5">{item.title || item.filename}</p>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase ${
                  item.category === 'sports'   ? 'bg-blue-100 text-blue-600' :
                  item.category === 'economy'  ? 'bg-emerald-100 text-emerald-600' :
                  item.category === 'politics' ? 'bg-pink-100 text-pink-600' :
                  'bg-slate-100 text-slate-500'
                }`}>{item.category || '–'}</span>
                <span className="text-[11px] text-slate-400 tabular-nums ml-auto">{fmt(duration)}</span>
              </div>
            </div>
          )}

          {/* Download */}
          {item && (
            <a
              href={url}
              download={item.filename}
              className="block w-full py-2.5 rounded-xl border-2 border-slate-300 hover:border-violet-400 text-slate-600 hover:text-violet-600 text-sm font-semibold text-center transition-all"
            >
              ⬇ 다운로드
            </a>
          )}
        </div>
      )}
    </aside>
  )
}
