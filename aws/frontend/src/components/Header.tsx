import { useState } from 'react'
import { PipelineStatus } from '../services/api'
import { getSessionId, setSessionId } from '../services/api'

interface Props {
  status: PipelineStatus
  isRunning: boolean
  isPaused: boolean
  onPause: () => void
  onResume: () => void
}

export default function Header({ status, isRunning, isPaused, onPause, onResume }: Props) {
  const [showSession, setShowSession] = useState(false)
  const [sessionInput, setSessionInput] = useState(getSessionId())

  const stepColor = isRunning && !isPaused ? '#1a73e8'
    : isPaused ? '#f9ab00'
    : status.step === 'done'  ? '#34a853'
    : status.step === 'error' ? '#ea4335'
    : '#9aa0a6'

  return (
    <header style={{
      height: 80, flexShrink: 0, background: 'white',
      borderBottom: '1px solid #dadce0',
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* 로고 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img
          src="/static/gorila_ai.png"
          alt="Gorila AI"
          style={{ height: 64, width: 'auto', borderRadius: 10, display: 'block', imageRendering: 'auto' }}
        />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#202124', lineHeight: 1.2 }}>
            Gorila <span style={{ color: '#1a73e8' }}>AI</span>
          </div>
          <div style={{ fontSize: 10, color: '#9aa0a6', lineHeight: 1 }}>Shorts Studio</div>
        </div>
      </div>

      <div style={{ width: 1, height: 24, background: '#dadce0' }} />

      {/* 상태 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: stepColor, flexShrink: 0,
          animation: isRunning && !isPaused ? 'pulse 1.2s infinite' : 'none',
        }} />
        <span style={{ fontSize: 12, color: '#5f6368', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isPaused ? '일시정지됨' : status.message || '대기 중'}
        </span>
        {isRunning && <span style={{ fontSize: 12, fontWeight: 600, color: '#1a73e8', flexShrink: 0 }}>{status.progress}%</span>}
      </div>

      {/* 중지/재개 */}
      {isRunning && (
        !isPaused
          ? <button onClick={onPause} className="btn-outlined" style={{ padding: '5px 12px', fontSize: 12 }}>⏸ 중지</button>
          : <button onClick={onResume} className="btn-primary" style={{ padding: '5px 12px', fontSize: 12 }}>▶ 재개</button>
      )}

      {/* 세션 관리 */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowSession(v => !v); setSessionInput(getSessionId()) }}
          style={{ background: 'none', border: '1px solid #dadce0', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#5f6368', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          title="세션 ID 관리"
        >
          🔑 <span style={{ fontFamily: 'monospace', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{getSessionId().slice(0, 8)}…</span>
        </button>

        {showSession && (
          <div style={{
            position: 'absolute', top: 40, right: 0, zIndex: 100,
            background: 'white', border: '1px solid #dadce0', borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: 16, width: 320,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>세션 ID</div>
            <div style={{ fontSize: 11, color: '#5f6368', marginBottom: 10, lineHeight: 1.5 }}>
              세션 ID를 바꾸면 해당 세션의 데이터를 불러옵니다.<br/>
              이전 데이터 복구: <code style={{ background: '#f1f3f4', padding: '1px 4px', borderRadius: 3 }}>default</code> 입력
            </div>
            <input
              value={sessionInput}
              onChange={e => setSessionInput(e.target.value)}
              className="input-field"
              style={{ marginBottom: 8, fontFamily: 'monospace', fontSize: 12 }}
              placeholder="세션 ID 입력 (예: default)"
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setSessionId(sessionInput); setShowSession(false) }}
                className="btn-primary" style={{ flex: 1, padding: '7px 0', fontSize: 12 }}>
                적용 (새로고침)
              </button>
              <button onClick={() => setShowSession(false)} className="btn-outlined" style={{ padding: '7px 12px', fontSize: 12 }}>취소</button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
