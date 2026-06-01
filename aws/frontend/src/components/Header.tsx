import { PipelineStatus } from '../services/api'

interface HeaderProps {
  status: PipelineStatus
}

export default function Header({ status }: HeaderProps) {
  const isRunning = ['collecting', 'transcribing', 'analyzing', 'editing'].includes(status.step)

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-5 gap-4 shrink-0 z-10">
      <div className="font-['Bebas_Neue'] text-[22px] tracking-wider text-accent flex items-center gap-2">
        SHORTS<span className="text-white">AI</span>
      </div>

      <div className="w-px h-5 bg-border mx-1" />

      <span className="text-muted text-xs">쇼츠 자동 생성 파이프라인</span>

      <div className="ml-auto flex items-center gap-2.5">
        <div
          className={`w-2 h-2 rounded-full transition-colors ${
            isRunning
              ? 'bg-accent animate-pulse-custom'
              : status.step === 'done'
              ? 'bg-success'
              : status.step === 'error'
              ? 'bg-accent2'
              : 'bg-muted'
          }`}
        />
        <span className="text-muted text-xs max-w-[300px] truncate">
          {status.message || '대기 중'}
        </span>
      </div>
    </header>
  )
}
