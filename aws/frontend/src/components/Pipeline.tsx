import { useState } from 'react'
import { api, PipelineStatus, FileCounts } from '../services/api'

interface PipelineProps {
  status: PipelineStatus
  fileCounts: FileCounts
  onStartPolling: () => void
  onRefresh: () => void
}

export default function Pipeline({ status, fileCounts, onStartPolling, onRefresh }: PipelineProps) {
  const [clearExisting, setClearExisting] = useState(true)
  const isRunning = !['idle', 'done', 'error'].includes(status.step)

  const runCollect = async () => {
    try {
      await api.collect(clearExisting)
      onStartPolling()
    } catch (e) {
      console.error('Collect failed:', e)
    }
  }

  const runTranscribe = async () => {
    try {
      await api.transcribe()
      onStartPolling()
    } catch (e) {
      console.error('Transcribe failed:', e)
    }
  }

  const runAnalyze = async () => {
    try {
      await api.analyze()
      onStartPolling()
    } catch (e) {
      console.error('Analyze failed:', e)
    }
  }

  const runEdit = async () => {
    try {
      await api.edit(1)
      onStartPolling()
    } catch (e) {
      console.error('Edit failed:', e)
    }
  }

  return (
    <div className="bg-surface border-r border-border flex flex-col overflow-hidden">
      <div className="px-4 py-3 font-bold text-[11px] tracking-wider uppercase text-muted border-b border-border flex items-center justify-between">
        파이프라인
        <button
          onClick={onRefresh}
          className="text-muted hover:text-white text-sm"
          title="새로고침"
        >
          ↻
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* File Counts */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {[
            { label: '영상', count: fileCounts.videos.length },
            { label: '자막', count: fileCounts.transcripts.length },
            { label: '분석', count: fileCounts.analyses.length },
            { label: '쇼츠', count: fileCounts.shorts.length },
          ].map(({ label, count }) => (
            <div key={label} className="bg-bg rounded-md p-1.5 text-center">
              <div className="text-lg font-black text-accent">{count}</div>
              <div className="text-[10px] text-muted">{label}</div>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="h-0.5 bg-border rounded-sm mb-3 overflow-hidden">
          <div
            className="h-full bg-accent rounded-sm transition-all duration-300"
            style={{ width: `${status.progress}%` }}
          />
        </div>

        {/* Pipeline Steps */}
        <div className="flex flex-col gap-2">
          {/* Step 1: Collect */}
          <StepCard
            step={1}
            title="영상 수집"
            isActive={status.step === 'collecting'}
            isDone={fileCounts.downloads.length > 0}
          >
            <label className="flex items-center gap-1.5 mt-2 text-[11px] text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={clearExisting}
                onChange={(e) => setClearExisting(e.target.checked)}
                className="accent-accent"
              />
              기존 파일 전부 삭제 후 수집
            </label>
            <button
              onClick={runCollect}
              disabled={isRunning}
              className="step-btn mt-2"
            >
              ▶ 수집 시작
            </button>
          </StepCard>

          {/* Step 2: Transcribe */}
          <StepCard
            step={2}
            title="자막 생성"
            isActive={status.step === 'transcribing'}
            isDone={fileCounts.transcripts.length > 0}
          >
            <button
              onClick={runTranscribe}
              disabled={isRunning}
              className="step-btn mt-2"
            >
              ▶ 자막 생성
            </button>
          </StepCard>

          {/* Step 3: Analyze */}
          <StepCard
            step={3}
            title="LLM 분석"
            isActive={status.step === 'analyzing'}
            isDone={fileCounts.analyses.length > 0}
          >
            <button
              onClick={runAnalyze}
              disabled={isRunning}
              className="step-btn mt-2"
            >
              ▶ 분석 시작
            </button>
          </StepCard>

          {/* Step 4: Edit */}
          <StepCard
            step={4}
            title="영상 편집"
            isActive={status.step === 'editing'}
            isDone={fileCounts.videos.length > 0}
          >
            <button
              onClick={runEdit}
              disabled={isRunning}
              className="step-btn mt-2"
            >
              ▶ 영상 편집 시작
            </button>
          </StepCard>
        </div>
      </div>
    </div>
  )
}

interface StepCardProps {
  step: number
  title: string
  isActive: boolean
  isDone: boolean
  children: React.ReactNode
}

function StepCard({ step, title, isActive, isDone, children }: StepCardProps) {
  return (
    <div
      className={`bg-surface2 border rounded-lg p-3 transition-colors ${
        isActive ? 'border-accent' : 'border-border hover:border-[#444]'
      }`}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-all ${
            isDone
              ? 'bg-success text-black'
              : isActive
              ? 'bg-accent text-black'
              : 'bg-border text-muted'
          }`}
        >
          {step}
        </div>
        <div className="font-bold text-[13px]">{title}</div>
      </div>
      {children}
    </div>
  )
}
