import { useState, useRef } from 'react'
import axios, { AxiosProgressEvent } from 'axios'
import { api, PipelineStatus, FileCounts } from '../services/api'

interface Props {
  status: PipelineStatus
  fileCounts: FileCounts
  onStartPolling: () => void
  onRefresh: () => void
  mobile?: boolean
  // unused on sidebar but passed via sharedProps spread
  [key: string]: unknown
}

const CHANNELS = ['@SBSBiz2021', '@hkwowtv', '@MBCNEWS11', '@JTBC_news', '@SPOTV', '@KBO1982']

export default function LeftSidebar({ status, fileCounts, onStartPolling, onRefresh, mobile }: Props) {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading]   = useState(false)
  const [uploadMsg, setUploadMsg]   = useState<string | null>(null)
  const [dragOver, setDragOver]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isRunning = !['idle', 'done', 'error'].includes(status.step)

  const uploadFile = async (file: File) => {
    setUploading(true); setUploadProgress(0); setUploadMsg(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await axios.post('/api/upload-video', form, {
        onUploadProgress: (e: AxiosProgressEvent) => {
          if (e.total) setUploadProgress(Math.round(e.loaded / e.total * 100))
        }
      })
      setUploadMsg(`✓ ${data.filename}`)
      onRefresh()
    } catch { setUploadMsg('업로드 실패') }
    finally { setUploading(false) }
  }

  const run = (fn: () => Promise<void>) => async () => { await fn(); onStartPolling() }

  const steps = [
    {
      num: 1, key: 'collecting', title: 'YouTube Download',
      count: fileCounts.downloads.length, countLabel: '영상',
      action: run(() => api.collect(true)),
      content: (
        <div className="space-y-3">
          {/* Channel list */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-2 font-medium">수집 채널</p>
            <div className="space-y-1">
              {CHANNELS.map(ch => (
                <div key={ch} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                  {ch}
                </div>
              ))}
            </div>
          </div>
          {/* Upload */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-3 text-center cursor-pointer transition-colors text-xs ${
              dragOver ? 'border-violet-500 bg-violet-500/10' : 'border-slate-600 hover:border-slate-500'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".mp4,.mkv,.mov,.avi" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
            {uploading
              ? <span className="text-violet-400">{uploadProgress}% 업로드 중...</span>
              : <span className="text-slate-400">MP4 드래그 또는 클릭</span>
            }
          </div>
          {uploadMsg && <p className={`text-xs text-center ${uploadMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{uploadMsg}</p>}
          {/* 수집된 영상 리스트 */}
          {fileCounts.downloads.length > 0 && (
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-2 font-medium">수집된 영상 ({fileCounts.downloads.length}개)</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {fileCounts.downloads.map((name, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span className="text-green-400 shrink-0">✓</span>
                    <span className="truncate">{name.replace(/\.[^/.]+$/, '')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      num: 2, key: 'transcribing', title: 'Subtitle Generation',
      count: fileCounts.transcripts.length, countLabel: '자막',
      action: run(() => api.transcribe()),
      content: (
        <p className="text-xs text-slate-400 leading-relaxed">
          Whisper AI를 사용해 영상에서 자막을 자동 생성합니다.
        </p>
      ),
    },
    {
      num: 3, key: 'analyzing', title: 'LLM Analysis',
      count: fileCounts.analyses.length, countLabel: '분석',
      action: run(() => api.analyze()),
      content: (
        <p className="text-xs text-slate-400 leading-relaxed">
          Gemini AI가 하이라이트 구간을 분석하고 점수를 매깁니다.
        </p>
      ),
    },
    {
      num: 4, key: 'editing', title: 'Video Editing',
      count: fileCounts.videos.length, countLabel: '편집',
      action: run(() => api.edit(1)),
      content: (
        <p className="text-xs text-slate-400 leading-relaxed">
          분석 결과를 바탕으로 쇼츠 영상을 자동 편집합니다.
        </p>
      ),
    },
  ]

  return (
    <aside className={`${mobile ? 'w-full' : 'w-80 shrink-0 border-r border-slate-800 overflow-hidden'} bg-slate-900 flex flex-col`}>

      {/* Logo — 데스크탑에서만 표시 */}
      {!mobile && (
        <div className="px-5 py-4 border-b border-slate-800 shrink-0">
          <h1 className="text-lg font-bold text-white tracking-tight">
            AI <span className="text-violet-400">Shorts</span> Studio
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">자동 쇼츠 생성 파이프라인</p>
        </div>
      )}

      {/* Global progress */}
      {isRunning && (
        <div className="px-5 py-3 border-b border-slate-800 shrink-0 fade-in">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-violet-400 font-medium">{status.message}</span>
            <span className="text-slate-400 tabular-nums">{status.progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full progress-shimmer transition-all duration-500"
              style={{ width: `${status.progress}%` }} />
          </div>
        </div>
      )}

      {/* Steps */}
      <div className={`${mobile ? '' : 'flex-1 overflow-y-auto'} p-4 space-y-3`}>
        {steps.map(step => {
          const isActive = status.step === step.key
          const isDone   = step.count > 0

          return (
            <div key={step.key}
              className={`rounded-xl p-4 border transition-all duration-200 ${
                isActive
                  ? 'bg-violet-950/50 border-violet-700/50'
                  : isDone
                  ? 'bg-slate-800/60 border-slate-700/50'
                  : 'bg-slate-800 border-slate-700/30'
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                  isDone   ? 'bg-green-500/20 text-green-400' :
                  isActive ? 'bg-violet-600 text-white' :
                             'bg-slate-700 text-slate-400'
                }`}>
                  {isDone ? '✓' : isActive ? <div className="spinner" /> : step.num}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className={`font-semibold text-sm ${isActive ? 'text-white' : isDone ? 'text-slate-200' : 'text-slate-300'}`}>
                    {step.title}
                  </h2>
                  {isDone && (
                    <span className="text-[11px] text-violet-400">{step.count}개 {step.countLabel}</span>
                  )}
                  {isActive && (
                    <span className="text-[11px] text-violet-400 fade-in">{status.message}</span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="mb-3">{step.content}</div>

              {/* Action button */}
              <button
                onClick={step.action}
                disabled={isRunning}
                className={`w-full rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                  isRunning
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-violet-600 hover:bg-violet-500 text-white active:scale-[0.98]'
                }`}
              >
                {isActive
                  ? <><div className="spinner" />처리 중...</>
                  : step.title.split(' ')[0]
                }
              </button>
            </div>
          )
        })}

        {/* Status messages */}
        {status.step === 'error' && (
          <div className="rounded-xl p-3 bg-red-950/50 border border-red-800/50 text-xs text-red-400 fade-in">
            ⚠ {status.message}
          </div>
        )}
        {status.step === 'done' && (
          <div className="rounded-xl p-3 bg-green-950/50 border border-green-800/50 text-xs text-green-400 fade-in">
            ✓ {status.message}
          </div>
        )}
      </div>
    </aside>
  )
}
