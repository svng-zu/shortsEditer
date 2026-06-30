import { useEditor } from '../../../contexts/EditorContext'

function phaseLabel(progress: number): string {
  if (progress < 20) return '영상을 준비하고 있습니다...'
  if (progress < 80) return 'AI가 영상을 렌더링하고 있습니다...'
  if (progress < 100) return '거의 완료되었습니다...'
  return '렌더링이 완료되었습니다!'
}

export default function RenderButton() {
  const { render: renderState, handleRender, setRender, selectedRaw, setShowSrt } = useEditor()

  if (!selectedRaw) return null

  const { isRendering, progress, error, message } = renderState
  const isDone = isRendering && progress >= 100 && !error
  const isError = isRendering && !!error

  const dismissModal = () =>
    setRender(prev => ({ ...prev, isRendering: false, error: null, progress: 0, message: '' }))

  return (
    <>
      <div className="space-y-3">
        {/* 자막 편집 버튼 */}
        <button
          onClick={() => setShowSrt(true)}
          className="w-full h-16 rounded-xl font-semibold text-white bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:brightness-110 active:brightness-95 shadow-md shadow-teal-500/20 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">closed_caption</span>
          <span className="text-[18px]">자막 편집 (SRT)</span>
        </button>

        {/* 렌더 버튼 */}
        <button
          onClick={handleRender}
          disabled={isRendering}
          className="w-full bg-primary text-on-primary font-bold py-5 px-6 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isRendering ? (
            <>
              <div className="w-5 h-5 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin flex-shrink-0" />
              <span className="text-[18px]">렌더링 중...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined">memory</span>
              <span className="text-[18px]">최종영상으로 저장하기</span>
            </>
          )}
        </button>
      </div>

      {/* ── 렌더링 진행 모달 (Bottom Sheet) ── */}
      {isRendering && (
        <div
          className="fixed inset-0 z-[500] flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
        >
          <div
            className="bg-surface-container rounded-t-3xl w-full max-w-lg mx-auto px-6 pt-7 pb-12 shadow-2xl"
            style={{ animation: 'sheetSlideUp 0.35s cubic-bezier(0.34,1.2,0.64,1) both' }}
          >
            {/* 드래그 핸들 */}
            <div className="w-10 h-1 bg-outline-variant/40 rounded-full mx-auto mb-6" />

            {/* ── 에러 상태 ── */}
            {isError && (
              <div className="flex flex-col items-center text-center gap-4 py-2">
                <span
                  className="material-symbols-outlined text-error"
                  style={{ fontSize: 60, fontVariationSettings: "'FILL' 1", animation: 'popIn 0.4s ease-out both' }}
                >
                  error
                </span>
                <p className="text-[22px] font-bold text-on-surface">렌더링에 실패했습니다.</p>
                <p className="text-[15px] text-on-surface-variant leading-relaxed max-w-xs break-words">
                  {error}
                </p>
                <div className="flex gap-3 mt-3 w-full">
                  <button
                    onClick={dismissModal}
                    className="flex-1 py-3.5 rounded-2xl border border-outline-variant text-on-surface font-semibold text-[16px] hover:bg-surface-container-high transition-colors active:scale-[0.97]"
                  >
                    닫기
                  </button>
                  <button
                    onClick={handleRender}
                    className="flex-1 py-3.5 rounded-2xl bg-primary text-on-primary font-semibold text-[16px] hover:bg-primary/90 transition-colors active:scale-[0.97]"
                  >
                    다시 시도
                  </button>
                </div>
              </div>
            )}

            {/* ── 완료 상태 ── */}
            {isDone && (
              <div
                className="flex flex-col items-center text-center gap-4 py-2"
                style={{ animation: 'popIn 0.45s cubic-bezier(0.34,1.4,0.64,1) both' }}
              >
                <span
                  className="material-symbols-outlined text-tertiary"
                  style={{ fontSize: 68, fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                <p className="text-[24px] font-bold text-on-surface">렌더링이 완료되었습니다!</p>
                <p className="text-[15px] text-on-surface-variant">
                  영상이 성공적으로 저장되었습니다.<br />
                  <span className="text-[13px] text-on-surface-variant/50">편집본 목록 → 쇼츠에서 확인하세요.</span>
                </p>
              </div>
            )}

            {/* ── 진행 상태 ── */}
            {!isError && !isDone && (
              <>
                {/* 헤더 */}
                <div className="flex items-center gap-3 mb-7">
                  <span className="text-[30px] leading-none">🎬</span>
                  <p className="text-[20px] font-bold text-on-surface leading-tight">
                    영상을 렌더링하는 중입니다.
                  </p>
                </div>

                {/* 진행률 + 퍼센트 */}
                <div className="flex items-end justify-between mb-2.5">
                  <span className="text-[13px] text-on-surface-variant/70 leading-snug max-w-[60%] truncate">
                    {message || phaseLabel(progress)}
                  </span>
                  <span
                    className="text-[36px] font-black text-primary tabular-nums leading-none"
                    style={{ fontFeatureSettings: "'tnum'" }}
                  >
                    {Math.round(progress)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-5 bg-surface-container-highest rounded-full overflow-hidden mb-6 shadow-inner">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                    style={{ width: `${Math.max(progress, 3)}%` }}
                  >
                    {/* 반짝이는 shimmer 효과 */}
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                      style={{ animation: 'shimmer 1.8s infinite' }}
                    />
                  </div>
                </div>

                {/* 안내 문구 */}
                <p className="text-[17px] font-semibold text-on-surface text-center mb-2">
                  {phaseLabel(progress)}
                </p>
                <p className="text-[13px] text-on-surface-variant/60 text-center">
                  잠시만 기다려주세요.
                </p>
                <p className="text-[13px] text-on-surface-variant/45 text-center mt-0.5">
                  앱을 종료하지 않는 것을 권장합니다.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes sheetSlideUp {
          from { transform: translateY(100%); opacity: 0.4; }
          to   { transform: translateY(0);    opacity: 1;   }
        }
        @keyframes popIn {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes shimmer {
          from { transform: translateX(-100%); }
          to   { transform: translateX(400%);  }
        }
      `}</style>
    </>
  )
}
