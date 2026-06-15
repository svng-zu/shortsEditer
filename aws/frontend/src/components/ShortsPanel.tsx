import { useState, useEffect, useRef, useCallback, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { api, ShortInfo, RawInfo, StyleParams } from '../services/api'
import YouTubeUploadModal from './YouTubeUploadModal'

interface Props {
  activeTab: 'raws' | 'shorts'
  onTabChange: (t: 'raws' | 'shorts') => void
  raws: RawInfo[]
  shorts: ShortInfo[]
  selectedRaw: RawInfo | null
  selectedShort: ShortInfo | null
  onSelectRaw: (r: RawInfo | null) => void
  onSelectShort: (s: ShortInfo | null) => void
  onRefresh: () => void
  onStartPolling: () => void
  isMobile?: boolean
}

// Canvas 상수 — 고화질 (270×480 = 9:16)
const CV_W = 270, CV_H = 480
const SCALE = CV_W / 1080
const VID_Y_PX = Math.round(555 * SCALE)   // ≈139
const VID_H_PX = Math.round(810 * SCALE)   // ≈203

const TMPL_COLORS: Record<string, Record<number, { bg: string }>> = {
  sports:   { 1: { bg: '#0d0d0d' }, 2: { bg: '#f5f5f5' }, 3: { bg: '#1a1a0d' } },
  economy:  { 1: { bg: '#0a0f0a' }, 2: { bg: '#f5f5f5' }, 3: { bg: '#0d1b2a' } },
  politics: { 1: { bg: '#0d0505' }, 2: { bg: '#f5f5f5' }, 3: { bg: '#111111' } },
}

function _hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r},${g},${b},${alpha})`
}

// 자막 글꼴 — FFmpeg 렌더링에 쓰이는 FONT_MAP(editor_base.py)과 키를 맞춰야 한다
const SUB_FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'NanumSquareRoundEB',   label: '나눔스퀘어라운드 EB' },
  { value: 'NanumSquareRoundB',    label: '나눔스퀘어라운드 B' },
  { value: 'NanumSquareB',         label: '나눔스퀘어 B' },
  { value: 'NanumGothicBold',      label: '나눔고딕 Bold' },
  { value: 'NanumGothic',          label: '나눔고딕' },
  { value: 'NanumBarunGothicBold', label: '나눔바른고딕 Bold' },
  { value: 'NanumMyeongjoBold',    label: '나눔명조 Bold' },
]

// Google Cloud TTS 한국어(ko-KR) 음성 — SSML <mark> 타임포인트를 지원하는 타입만 포함
// (Chirp3 HD는 <mark>를 지원하지 않아 나레이션 자막 생성이 동작하지 않음)
const NARRATION_VOICE_GROUPS: { group: string; options: { value: string; label: string }[] }[] = [
  {
    group: 'ElevenLabs (멀티링구얼)',
    options: [
      { value: 'el-rachel', label: 'Rachel (여성)' },
      { value: 'el-sarah', label: 'Sarah (여성)' },
      { value: 'el-charlotte', label: 'Charlotte (여성)' },
      { value: 'el-adam', label: 'Adam (남성)' },
      { value: 'el-antoni', label: 'Antoni (남성)' },
    ],
  },
  {
    group: 'Chirp3 HD (최신·자연스러움) - 여성',
    options: [
      { value: 'ko-KR-Chirp3-HD-Achernar', label: 'Achernar' },
      { value: 'ko-KR-Chirp3-HD-Aoede', label: 'Aoede' },
      { value: 'ko-KR-Chirp3-HD-Autonoe', label: 'Autonoe' },
      { value: 'ko-KR-Chirp3-HD-Callirrhoe', label: 'Callirrhoe' },
      { value: 'ko-KR-Chirp3-HD-Despina', label: 'Despina' },
      { value: 'ko-KR-Chirp3-HD-Erinome', label: 'Erinome' },
      { value: 'ko-KR-Chirp3-HD-Gacrux', label: 'Gacrux' },
      { value: 'ko-KR-Chirp3-HD-Kore', label: 'Kore' },
      { value: 'ko-KR-Chirp3-HD-Laomedeia', label: 'Laomedeia' },
      { value: 'ko-KR-Chirp3-HD-Leda', label: 'Leda' },
      { value: 'ko-KR-Chirp3-HD-Pulcherrima', label: 'Pulcherrima' },
      { value: 'ko-KR-Chirp3-HD-Sulafat', label: 'Sulafat' },
      { value: 'ko-KR-Chirp3-HD-Vindemiatrix', label: 'Vindemiatrix' },
      { value: 'ko-KR-Chirp3-HD-Zephyr', label: 'Zephyr' },
    ],
  },
  {
    group: 'Chirp3 HD (최신·자연스러움) - 남성',
    options: [
      { value: 'ko-KR-Chirp3-HD-Achird', label: 'Achird' },
      { value: 'ko-KR-Chirp3-HD-Algenib', label: 'Algenib' },
      { value: 'ko-KR-Chirp3-HD-Algieba', label: 'Algieba' },
      { value: 'ko-KR-Chirp3-HD-Alnilam', label: 'Alnilam' },
      { value: 'ko-KR-Chirp3-HD-Charon', label: 'Charon' },
      { value: 'ko-KR-Chirp3-HD-Enceladus', label: 'Enceladus' },
      { value: 'ko-KR-Chirp3-HD-Fenrir', label: 'Fenrir' },
      { value: 'ko-KR-Chirp3-HD-Iapetus', label: 'Iapetus' },
      { value: 'ko-KR-Chirp3-HD-Orus', label: 'Orus' },
      { value: 'ko-KR-Chirp3-HD-Puck', label: 'Puck' },
      { value: 'ko-KR-Chirp3-HD-Rasalgethi', label: 'Rasalgethi' },
      { value: 'ko-KR-Chirp3-HD-Sadachbia', label: 'Sadachbia' },
      { value: 'ko-KR-Chirp3-HD-Sadaltager', label: 'Sadaltager' },
      { value: 'ko-KR-Chirp3-HD-Schedar', label: 'Schedar' },
      { value: 'ko-KR-Chirp3-HD-Umbriel', label: 'Umbriel' },
      { value: 'ko-KR-Chirp3-HD-Zubenelgenubi', label: 'Zubenelgenubi' },
    ],
  },
  {
    group: 'Neural2 (고품질)',
    options: [
      { value: 'ko-KR-Neural2-A', label: '여성 A' },
      { value: 'ko-KR-Neural2-B', label: '여성 B' },
      { value: 'ko-KR-Neural2-C', label: '남성' },
    ],
  },
  {
    group: 'WaveNet',
    options: [
      { value: 'ko-KR-Wavenet-A', label: '여성 A' },
      { value: 'ko-KR-Wavenet-B', label: '여성 B' },
      { value: 'ko-KR-Wavenet-C', label: '남성 A' },
      { value: 'ko-KR-Wavenet-D', label: '남성 B' },
    ],
  },
  {
    group: 'Standard',
    options: [
      { value: 'ko-KR-Standard-A', label: '여성 A' },
      { value: 'ko-KR-Standard-B', label: '여성 B' },
      { value: 'ko-KR-Standard-C', label: '남성 A' },
      { value: 'ko-KR-Standard-D', label: '남성 B' },
    ],
  },
]

const bgCache: Record<string, HTMLImageElement | null> = {}
function loadBg(name: string) {
  if (name in bgCache) return
  const img = new Image(); img.src = `/static/backgrounds/${name}.png`
  img.onload = () => { bgCache[name] = img }; img.onerror = () => { bgCache[name] = null }
  bgCache[name] = img
}

// SRT 편집 모달
type SrtEntry = { index: string; times: string; text: string }
function SrtModal({ stem, onClose }: { stem: string; onClose: () => void }) {
  const [entries, setEntries] = useState<SrtEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    api.getSrt(stem).then(r => setEntries(r.entries)).catch(() => setEntries([])).finally(() => setLoading(false))
  }, [stem])

  const save = async () => {
    setSaving(true); setMsg('')
    try { await api.saveSrt(stem, entries); setMsg('✓ 저장 완료') }
    catch { setMsg('저장 실패') }
    finally { setSaving(false) }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div className="card" style={{ width: 560, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>자막 편집</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { const last = entries.length ? parseInt(entries[entries.length-1].index)+1 : 1; setEntries([...entries, { index: String(last), times: '00:00:00,000 --> 00:00:00,000', text: '' }]) }}
              className="btn-outlined" style={{ padding: '5px 12px', fontSize: 14 }}>+ 추가</button>
            <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '5px 14px', fontSize: 14 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
            <button onClick={onClose} className="btn-outlined" style={{ padding: '5px 10px', fontSize: 14 }}>✕</button>
          </div>
        </div>
        <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
          시간: 00:00:00,000 → 00:00:00,000 형식 / 저장 후 다음 렌더링에 반영
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>로딩 중...</p>
            : entries.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>자막 생성 단계를 먼저 실행하세요.</p>
            : entries.map((e, i) => (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 20 }}>{e.index}</span>
                    <input value={e.times} onChange={ev => { const u = [...entries]; u[i] = { ...e, times: ev.target.value }; setEntries(u) }}
                      className="input-field" style={{ flex: 1, fontSize: 13, fontFamily: 'monospace', padding: '3px 6px' }} />
                    <button onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                  </div>
                  <textarea value={e.text} rows={2} onChange={ev => { const u = [...entries]; u[i] = { ...e, text: ev.target.value }; setEntries(u) }}
                    className="input-field" style={{ fontSize: 15, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
              ))
          }
        </div>
        {msg && <div style={{ padding: '8px 20px', fontSize: 14, color: msg.startsWith('✓') ? 'var(--success)' : 'var(--error)', borderTop: '1px solid var(--border)' }}>{msg}</div>}
      </div>
    </div>
  )
}

function fmtDuration(sec?: number | null): string {
  if (sec == null) return ''
  const total = Math.round(sec)
  const m = Math.floor(total / 60), s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function CategoryBadge({ cat }: { cat: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    sports:   { bg: '#e8f0fe', color: '#1a73e8', label: '스포츠' },
    economy:  { bg: '#e6f4ea', color: '#34a853', label: '경제' },
    politics: { bg: '#fce8e6', color: '#ea4335', label: '정치' },
  }
  const s = map[cat]
  if (!s) return null
  return <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: s.bg, color: s.color }}>{s.label}</span>
}

const VARIANT_LABELS: Record<number, string> = {
  1: '버전1 · 기본',
  2: '버전2 · 하이라이트 인트로',
  3: '버전3 · 압축 하이라이트',
}

function VariantBadge({ variant }: { variant?: number }) {
  if (!variant || variant <= 1) return null
  return <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#f3e8fd', color: '#9334e6' }}>{VARIANT_LABELS[variant] || `버전${variant}`}</span>
}

export default function ShortsPanel({
  activeTab, onTabChange, raws, shorts,
  selectedRaw, selectedShort, onSelectRaw, onSelectShort,
  onRefresh, onStartPolling, isMobile = false,
}: Props) {
  const [uploadTarget, setUploadTarget] = useState<ShortInfo | null>(null)
  const [rawSelected, setRawSelected] = useState<Set<string>>(new Set())
  const [shortSelected, setShortSelected] = useState<Set<string>>(new Set())

  const deleteShort = async (fn: string, e: React.MouseEvent) => {
    e.stopPropagation(); if (!confirm('삭제?')) return
    await api.deleteShort(fn)
    if (selectedShort?.filename === fn) onSelectShort(null)
    setShortSelected(prev => { const s = new Set(prev); s.delete(fn); return s })
    onRefresh()
  }

  const shortToggle = (fn: string) => setShortSelected(prev => { const s = new Set(prev); s.has(fn) ? s.delete(fn) : s.add(fn); return s })
  const shortToggleAll = () => setShortSelected(prev => prev.size === shorts.length ? new Set() : new Set(shorts.map(s => s.filename)))
  const handleShortDeleteSelected = async () => {
    if (shortSelected.size === 0) return
    if (!confirm(`선택된 ${shortSelected.size}개 쇼츠를 삭제하시겠습니까?`)) return
    await Promise.all([...shortSelected].map(fn => api.deleteShort(fn)))
    if (selectedShort && shortSelected.has(selectedShort.filename)) onSelectShort(null)
    setShortSelected(new Set())
    onRefresh()
  }
  const handleShortDownloadSelected = () => {
    const selected = shorts.filter(s => shortSelected.has(s.filename))
    selected.forEach((s, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = `${s.url}/download`
        a.download = s.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }, i * 400)
    })
  }

  const deleteRaw = async (fn: string, e: React.MouseEvent) => {
    e.stopPropagation(); if (!confirm('삭제?')) return
    await api.deleteRaw(fn)
    if (selectedRaw?.filename === fn) onSelectRaw(null)
    setRawSelected(prev => { const s = new Set(prev); s.delete(fn); return s })
    onRefresh()
  }

  const rawToggle = (fn: string) => setRawSelected(prev => { const s = new Set(prev); s.has(fn) ? s.delete(fn) : s.add(fn); return s })
  const rawToggleAll = () => setRawSelected(prev => prev.size === raws.length ? new Set() : new Set(raws.map(r => r.filename)))
  const handleRawDeleteSelected = async () => {
    if (rawSelected.size === 0) return
    if (!confirm(`선택된 ${rawSelected.size}개 영상을 삭제하시겠습니까?`)) return
    await Promise.all([...rawSelected].map(fn => api.deleteRaw(fn)))
    if (selectedRaw && rawSelected.has(selectedRaw.filename)) onSelectRaw(null)
    setRawSelected(new Set())
    onRefresh()
  }

  // 모바일: 선택된 항목이 있으면 해당 상세/편집 화면으로 전환
  const mobileShowEdit = isMobile && activeTab === 'raws' && selectedRaw !== null
  const mobileShowPlayer = isMobile && activeTab === 'shorts' && selectedShort !== null

  // ── 모바일 레이아웃 ──
  if (isMobile) {
    return (
      <>
        {uploadTarget && <YouTubeUploadModal filename={uploadTarget.filename} defaultTitle={uploadTarget.title} onClose={() => setUploadTarget(null)} />}

        {/* 편집/플레이어 — fixed 전체화면 오버레이 (앱 레이아웃 영향을 받지 않도록 body에 직접 렌더링) */}
        {mobileShowEdit && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0, zIndex: 10, background: 'white', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
              <button onClick={() => onSelectRaw(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--primary)', lineHeight: 1, padding: '0 4px 0 0' }}>
                ←
              </button>
              <span style={{ fontWeight: 700, fontSize: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRaw?.title || '편집'}</span>
              <CategoryBadge cat={selectedRaw?.category || ''} />
            </div>
            <RawEditArea raw={selectedRaw} onStartPolling={onStartPolling} isMobile />
          </div>,
          document.body
        )}

        {mobileShowPlayer && selectedShort && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: '#111', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
              <button onClick={() => onSelectShort(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'white', lineHeight: 1, padding: '0 4px 0 0' }}>
                ←
              </button>
              <span style={{ fontWeight: 700, fontSize: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'white' }}>
                {selectedShort.title || selectedShort.filename}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <a href={`${selectedShort.url}/download`} download={selectedShort.filename}
                  style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', textDecoration: 'none' }}>⬇</a>
                <button onClick={() => setUploadTarget(selectedShort)}
                  style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, background: '#ea4335', color: 'white', border: 'none', cursor: 'pointer' }}>YT</button>
                <button onClick={async e => { await deleteShort(selectedShort.filename, e); onSelectShort(null) }}
                  style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}>삭제</button>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div style={{ aspectRatio: '9/16', maxHeight: '100%', width: 'auto', background: '#000', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.5)' }}>
                <video key={selectedShort.url} src={selectedShort.url} controls autoPlay style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* 리스트 — 자연 스크롤 */}
        <div style={{ background: 'var(--bg)' }}>
          {/* 탭 */}
          <div style={{ display: 'flex', background: 'white', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
            {(['raws', 'shorts'] as const).map(tab => (
              <button key={tab} onClick={() => onTabChange(tab)} style={{
                flex: 1, padding: '13px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                color: activeTab === tab ? 'var(--primary)' : 'var(--text2)',
                borderBottom: `3px solid ${activeTab === tab ? 'var(--primary)' : 'transparent'}`,
                transition: 'color .15s',
              }}>
                {tab === 'raws' ? '✂️ 편집' : '🎬 쇼츠'}
              </button>
            ))}
          </div>

          {/* RAW 목록 */}
          {activeTab === 'raws' && (
            <div style={{ background: 'white' }}>
              {raws.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <input type="checkbox" checked={rawSelected.size === raws.length && raws.length > 0} onChange={rawToggleAll} style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: 16, height: 16 }} />
                  <span style={{ fontSize: 13, color: 'var(--text2)', flex: 1 }}>{rawSelected.size > 0 ? `${rawSelected.size}개 선택됨` : '전체 선택'}</span>
                  {rawSelected.size > 0 && (
                    <button onClick={handleRawDeleteSelected} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6, background: 'var(--error, #d93025)', color: 'white', border: 'none', cursor: 'pointer' }}>선택 삭제</button>
                  )}
                </div>
              )}
              {raws.length === 0
                ? <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.3 }}>🎞</div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text2)' }}>편집된 영상 없음</p>
                    <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>파이프라인에서 영상 편집을 실행하세요</p>
                  </div>
                : raws.map(r => (
                    <div key={r.filename} onClick={() => onSelectRaw(r)} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '16px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      background: 'white',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                      <input type="checkbox" checked={rawSelected.has(r.filename)} onClick={e => e.stopPropagation()} onChange={() => rawToggle(r.filename)} style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: 16, height: 16, flexShrink: 0 }} />
                      <div style={{ width: 48, height: 48, borderRadius: 12, overflow: 'hidden', background: '#202124', flexShrink: 0 }}>
                        <video src={`${r.url}#t=1`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title || r.filename}
                        </div>
                        {r.channel_name && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.channel_thumbnail_url && <img src={r.channel_thumbnail_url} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.channel_name}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CategoryBadge cat={r.category} />
                          <VariantBadge variant={r.variant} />
                          {r.duration != null && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{fmtDuration(r.duration)}</span>}
                        </div>
                      </div>
                      <button onClick={e => deleteRaw(r.filename, e)}
                        style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
                      <span style={{ color: '#bdc1c6', fontSize: 22, flexShrink: 0 }}>›</span>
                    </div>
                  ))
              }
            </div>
          )}

          {/* SHORTS 목록 */}
          {activeTab === 'shorts' && (
            <div style={{ background: 'white' }}>
              {shorts.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <input type="checkbox" checked={shortSelected.size === shorts.length && shorts.length > 0} onChange={shortToggleAll} style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: 16, height: 16 }} />
                  <span style={{ fontSize: 13, color: 'var(--text2)', flex: 1 }}>{shortSelected.size > 0 ? `${shortSelected.size}개 선택됨` : '전체 선택'}</span>
                  {shortSelected.size > 0 && (
                    <>
                      <button onClick={handleShortDownloadSelected} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer' }}>선택 다운로드</button>
                      <button onClick={handleShortDeleteSelected} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6, background: 'var(--error, #d93025)', color: 'white', border: 'none', cursor: 'pointer' }}>선택 삭제</button>
                    </>
                  )}
                </div>
              )}
              {shorts.length === 0
                ? <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.3 }}>🎬</div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text2)' }}>완성된 쇼츠 없음</p>
                    <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>편집실에서 렌더링을 실행하세요</p>
                  </div>
                : shorts.map(s => (
                    <div key={s.filename} onClick={() => onSelectShort(s)} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      background: 'white',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                      <input type="checkbox" checked={shortSelected.has(s.filename)} onClick={e => e.stopPropagation()} onChange={() => shortToggle(s.filename)} style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: 16, height: 16, flexShrink: 0 }} />
                      <div style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', background: '#202124', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                        <video src={`${s.url}#t=1`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title || s.filename}
                        </div>
                        {s.channel_name && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>
                            {s.channel_thumbnail_url && <img src={s.channel_thumbnail_url} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }} />}
                            {s.channel_name}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <VariantBadge variant={s.variant} />
                          <span style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600 }}>탭하여 재생 ▶</span>
                        </div>
                      </div>
                      <span style={{ color: '#bdc1c6', fontSize: 22, flexShrink: 0 }}>›</span>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </>
    )
  }

  // ── 데스크톱 레이아웃 ──
  return (
    <main className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {uploadTarget && <YouTubeUploadModal filename={uploadTarget.filename} defaultTitle={uploadTarget.title} onClose={() => setUploadTarget(null)} />}

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', flexShrink: 0 }}>
        {(['raws', 'shorts'] as const).map(tab => (
          <button key={tab} onClick={() => onTabChange(tab)} style={{
            padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
            color: activeTab === tab ? 'var(--primary)' : 'var(--text2)',
            borderBottom: `2px solid ${activeTab === tab ? 'var(--primary)' : 'transparent'}`,
            marginBottom: -1, transition: 'color .15s',
          }}>
            {tab === 'raws' ? '✂️ 영상 편집' : '🎬 완성 쇼츠'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ─── RAW 탭 ─── */}
        {activeTab === 'raws' && (
          <>
            <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface2)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {raws.length > 0 && (
                  <input type="checkbox" checked={rawSelected.size === raws.length && raws.length > 0} onChange={rawToggleAll} style={{ cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }} />
                )}
                <span style={{ flex: 1 }}>편집된 영상</span>
                {rawSelected.size > 0
                  ? <button onClick={handleRawDeleteSelected} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--error, #d93025)', color: 'white', border: 'none', cursor: 'pointer' }}>삭제({rawSelected.size})</button>
                  : <span style={{ background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{raws.length}</span>
                }
              </div>
              {raws.length === 0
                ? <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.4 }}>🎞</div>
                    <p style={{ fontSize: 13 }}>영상 편집 후 표시됩니다</p>
                  </div>
                : raws.map(r => (
                    <div key={r.filename} onClick={() => onSelectRaw(r)} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${selectedRaw?.filename === r.filename ? 'var(--primary)' : 'transparent'}`,
                      background: selectedRaw?.filename === r.filename ? 'var(--primary-bg)' : 'transparent',
                      transition: 'background .15s',
                    }}>
                      <input type="checkbox" checked={rawSelected.has(r.filename)} onClick={e => e.stopPropagation()} onChange={() => rawToggle(r.filename)} style={{ cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }} />
                      <div style={{ width: 64, height: 64, borderRadius: 6, overflow: 'hidden', background: '#202124', flexShrink: 0 }}>
                        <video src={`${r.url}#t=1`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title || r.filename}
                        </div>
                        {r.channel_name && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.channel_thumbnail_url && <img src={r.channel_thumbnail_url} alt="" style={{ width: 13, height: 13, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.channel_name}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CategoryBadge cat={r.category} />
                          <VariantBadge variant={r.variant} />
                          {r.duration != null && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDuration(r.duration)}</span>}
                          <button onClick={e => deleteRaw(r.filename, e)}
                            style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', marginLeft: 'auto' }}>삭제</button>
                        </div>
                      </div>
                    </div>
                  ))
              }
            </div>
            <RawEditArea raw={selectedRaw} onStartPolling={onStartPolling} />
          </>
        )}

        {/* ─── SHORTS 탭 ─── */}
        {activeTab === 'shorts' && (
          <>
            <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface2)' }}>
              <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {shorts.length > 0 && (
                  <input type="checkbox" checked={shortSelected.size === shorts.length && shorts.length > 0} onChange={shortToggleAll} style={{ cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }} />
                )}
                <span style={{ flex: 1 }}>완성 쇼츠</span>
                {shortSelected.size > 0
                  ? <>
                      <button onClick={handleShortDownloadSelected} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer' }}>다운({shortSelected.size})</button>
                      <button onClick={handleShortDeleteSelected} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--error, #d93025)', color: 'white', border: 'none', cursor: 'pointer' }}>삭제({shortSelected.size})</button>
                    </>
                  : <span style={{ background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{shorts.length}</span>
                }
              </div>
              {shorts.length === 0
                ? <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.4 }}>🎬</div>
                    <p style={{ fontSize: 13 }}>렌더링 후 표시됩니다</p>
                  </div>
                : shorts.map(s => (
                    <div key={s.filename} onClick={() => onSelectShort(s)} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${selectedShort?.filename === s.filename ? 'var(--primary)' : 'transparent'}`,
                      background: selectedShort?.filename === s.filename ? 'var(--primary-bg)' : 'transparent',
                    }}>
                      <input type="checkbox" checked={shortSelected.has(s.filename)} onClick={e => e.stopPropagation()} onChange={() => shortToggle(s.filename)} style={{ cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }} />
                      <div style={{ width: 83, height: 83, borderRadius: 6, overflow: 'hidden', background: '#202124', flexShrink: 0 }}>
                        <video src={`${s.url}#t=1`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title || s.filename}
                        </div>
                        {s.channel_name && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.channel_thumbnail_url && <img src={s.channel_thumbnail_url} alt="" style={{ width: 13, height: 13, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.channel_name}</span>
                          </div>
                        )}
                        {s.variant != null && s.variant > 1 && (
                          <div style={{ marginBottom: 4 }}><VariantBadge variant={s.variant} /></div>
                        )}
                        <div style={{ display: 'flex', gap: 4 }}>
                          <a href={`${s.url}/download`} download={s.filename} onClick={e => e.stopPropagation()}
                            className="btn-outlined" style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>다운</a>
                          <button onClick={e => { e.stopPropagation(); setUploadTarget(s) }}
                            style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: '#fce8e6', color: 'var(--error)', border: '1px solid #f28b82', cursor: 'pointer' }}>YT</button>
                          <button onClick={e => deleteShort(s.filename, e)}
                            style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', marginLeft: 'auto' }}>삭제</button>
                        </div>
                      </div>
                    </div>
                  ))
              }
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--surface)', overflow: 'hidden' }}>
              {selectedShort
                ? <div style={{ aspectRatio: '9/16', maxHeight: '100%', width: 'auto', background: '#202124', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
                    <video key={selectedShort.url} src={selectedShort.url} controls style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
                  </div>
                : <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.3 }}>▶</div>
                    <p style={{ fontSize: 15 }}>쇼츠를 선택하세요</p>
                  </div>
              }
            </div>
          </>
        )}
      </div>
    </main>
  )
}

// Raw 편집 영역
function RawEditArea({ raw, onStartPolling, isMobile = false }: {
  raw: RawInfo | null
  onStartPolling: () => void
  isMobile?: boolean
}) {
  const [title1, setTitle1]         = useState('')
  const [title2, setTitle2]         = useState('')
  const [t1Color, setT1Color]       = useState('#FFD700')
  const [t2Color, setT2Color]       = useState('#FFFFFF')
  const [titleY, setTitleY]         = useState(0)
  const [titleFontSizeDelta, setTitleFontSizeDelta] = useState(0)
  const [titleFont, setTitleFont]   = useState('NanumSquareRoundEB')
  const [title1BorderWidth, setTitle1BorderWidth] = useState(3)
  const [title2BorderWidth, setTitle2BorderWidth] = useState(3)
  const [title1BorderColor, setTitle1BorderColor] = useState('#000000')
  const [title2BorderColor, setTitle2BorderColor] = useState('#000000')
  const [title1BgEnabled, setTitle1BgEnabled] = useState(false)
  const [title1BgColor,   setTitle1BgColor]   = useState('#000000')
  const [title1BgOpacity, setTitle1BgOpacity] = useState(0.6)
  const [title2BgEnabled, setTitle2BgEnabled] = useState(false)
  const [title2BgColor,   setTitle2BgColor]   = useState('#000000')
  const [title2BgOpacity, setTitle2BgOpacity] = useState(0.6)
  const [subtitles, setSubtitles]   = useState(false)
  const [subSize,   setSubSize]     = useState(52)
  const [subColor,  setSubColor]    = useState('#FFFFFF')
  const [subY,      setSubY]        = useState(20)
  const [subFont,   setSubFont]     = useState('NanumSquareRoundEB')
  const [subBgEnabled, setSubBgEnabled] = useState(false)
  const [subBgColor,   setSubBgColor]   = useState('#000000')
  const [subBgOpacity, setSubBgOpacity] = useState(0.6)
  const [channelName, setChannelName] = useState('')
  const [channelColor, setChannelColor] = useState('#FFFFFF')
  const [channelX,    setChannelX]    = useState(0)
  const [channelY,    setChannelY]    = useState(0)
  const [channelFontsize, setChannelFontsize] = useState(36)
  const [channelImageUrl, setChannelImageUrl] = useState('')
  const [channelTopLeftText, setChannelTopLeftText] = useState('')
  const [channelTopLeftColor, setChannelTopLeftColor] = useState('#FFFFFF')
  const [channelTopLeftFontsize, setChannelTopLeftFontsize] = useState(32)
  const [channelTopLeftX, setChannelTopLeftX] = useState(16)
  const [channelTopLeftY, setChannelTopLeftY] = useState(16)
  const [regChannels, setRegChannels] = useState<{url: string; category: string; thumbnail_url?: string}[]>([])
  const avatarImgRef = useRef<HTMLImageElement | null>(null)
  const [bgOptions,     setBgOptions]     = useState<string[]>([])
  const [bgType,        setBgType]        = useState<'blur' | 'solid' | 'image'>('blur')
  const [bgSolidColor,  setBgSolidColor]  = useState('#1A1A1A')
  const [bgImageName,   setBgImageName]   = useState('')
  const [bgUploadMsg,   setBgUploadMsg]   = useState('')
  const bgFileInputRef = useRef<HTMLInputElement>(null)
  const [templateId, setTemplateId] = useState(1)
  // 캡컷 스타일 색감/음량 보정 — brightness: -1~1, contrast/saturation/volume: 0~3 (1=원본)
  const [brightness, setBrightness] = useState(0)
  const [contrast,   setContrast]   = useState(1)
  const [saturation, setSaturation] = useState(1)
  const [volume,     setVolume]     = useState(1)
  const [narration, setNarration]   = useState(false)
  const [narrVolume, setNarrVolume] = useState(1.2)
  const [narrVideoVolume, setNarrVideoVolume] = useState(0.3)
  const [narrVoice, setNarrVoice]   = useState('ko-KR-Neural2-A')
  const [narrSpeed, setNarrSpeed]   = useState(1.0)
  const [narrMode, setNarrMode]     = useState<'title' | 'script'>('title')
  const [narrationScript, setNarrationScript] = useState('')
  const [scriptMode, setScriptMode] = useState<'summary' | 'style_convert'>('summary')
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)
  const [genScriptMsg, setGenScriptMsg] = useState('')
  const [isGeneratingNarrSubs, setIsGeneratingNarrSubs] = useState(false)
  const [genNarrSubsMsg, setGenNarrSubsMsg] = useState('')
  const [isRendering, setIsRendering] = useState(false)
  const [renderMsg, setRenderMsg]   = useState('')
  const [showSrt, setShowSrt]       = useState(false)
  const [isPreviewingNarration, setIsPreviewingNarration] = useState(false)
  const [isNarrPreviewPlaying, setIsNarrPreviewPlaying] = useState(false)
  const [narrPreviewMsg, setNarrPreviewMsg] = useState('')
  const [narrPreviewSubs, setNarrPreviewSubs] = useState<{ start: number; end: number; text: string }[]>([])

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const hidVidRef  = useRef<HTMLVideoElement>(null)
  const narrAudioRef = useRef<HTMLAudioElement>(null)
  const narrAudioUrlRef = useRef<string>('')
  const rafRef     = useRef<number>(0)
  const [isPlaying, setIsPlaying] = useState(true)

  // 캔버스 미리보기가 실제 렌더링과 동일한 폰트로 보이도록 웹폰트를 미리 로드
  useEffect(() => {
    for (const f of ['NanumSquareRoundEB', 'NanumSquareRoundB', 'NanumSquareB']) {
      document.fonts.load(`900 100px '${f}'`).catch(() => {})
      document.fonts.load(`bold 100px '${f}'`).catch(() => {})
    }
  }, [])

  const togglePlay = useCallback(() => {
    const vid = hidVidRef.current
    if (!vid) return
    if (vid.paused || vid.ended) {
      if (vid.ended) vid.currentTime = 0
      vid.play().catch(() => {})
    } else {
      vid.pause()
    }
  }, [])

  useEffect(() => { api.getBackgrounds().then(r => { setBgOptions(r.backgrounds); r.backgrounds.forEach(loadBg) }).catch(() => {}) }, [])
  useEffect(() => { api.getChannels().then(r => setRegChannels(r.channels)).catch(() => {}) }, [])

  useEffect(() => {
    if (!raw) return
    const parts = raw.title.split(' / ')
    setTitle1(parts[0] || ''); setTitle2(parts[1] || ''); setRenderMsg('')
    setChannelName(raw.channel_name || '')
    setChannelX(0); setChannelY(0); setChannelFontsize(36); setChannelColor('#FFFFFF')
    setChannelImageUrl(raw.channel_thumbnail_url || '')
    setNarrMode('title'); setNarrationScript(''); setGenScriptMsg(''); setScriptMode('summary'); setGenNarrSubsMsg('')
    setNarrPreviewMsg(''); setNarrPreviewSubs([]); setIsNarrPreviewPlaying(false)
    if (narrAudioRef.current) { narrAudioRef.current.pause(); narrAudioRef.current.removeAttribute('src') }
    if (narrAudioUrlRef.current) { URL.revokeObjectURL(narrAudioUrlRef.current); narrAudioUrlRef.current = '' }
    if (bgOptions.includes(raw.category)) {
      setBgType('image'); setBgImageName(raw.category); loadBg(raw.category)
    } else {
      setBgType('blur')
    }
  }, [raw?.filename])

  useEffect(() => {
    if (!channelImageUrl) { avatarImgRef.current = null; return }
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => { avatarImgRef.current = img }
    img.onerror = () => { avatarImgRef.current = null }
    img.src = channelImageUrl
  }, [channelImageUrl])

  // 영상 자체의 재생/음소거 상태 — 선택된 영상이 바뀔 때만 새로 로드한다
  // (제목/스타일을 입력할 때마다 src를 다시 지정하면 오디오가 매번 처음부터 끊겨 재생된다)
  useEffect(() => {
    if (!raw || !hidVidRef.current) return
    const vid = hidVidRef.current
    setIsPlaying(true)
    vid.src = raw.url
    // 재생 상태(▶/⏸ 표시)는 항상 video 엘리먼트의 실제 상태를 그대로 따라가게 한다
    // (수동으로만 isPlaying을 갱신하면 끝까지 재생되어 멈췄을 때 버튼이 갱신되지 않아
    //  "재생 후 정지가 안 되는" 것처럼 보이는 불일치가 생긴다)
    const onPlay  = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => setIsPlaying(false)
    vid.addEventListener('play', onPlay)
    vid.addEventListener('pause', onPause)
    vid.addEventListener('ended', onEnded)
    // 소리까지 들려야 실제 편집 결과를 가늠할 수 있다 — 음소거 해제 재생을 먼저 시도하고,
    // 브라우저 자동재생 정책으로 막히면 음소거로 시작한 뒤 첫 사용자 클릭에서 음소거를 해제한다
    const unmute = () => { vid.muted = false }
    vid.muted = false
    vid.play().catch(() => {
      vid.muted = true
      vid.play().catch(() => {})
      document.addEventListener('click', unmute, { once: true })
    })
    return () => {
      document.removeEventListener('click', unmute)
      vid.removeEventListener('play', onPlay)
      vid.removeEventListener('pause', onPause)
      vid.removeEventListener('ended', onEnded)
      vid.pause(); vid.removeAttribute('src'); vid.load()
    }
  }, [raw?.filename])

  useEffect(() => {
    if (!raw || !canvasRef.current || !hidVidRef.current) return
    const canvas = canvasRef.current; const ctx = canvas.getContext('2d')!; const vid = hidVidRef.current

    const draw = () => {
      ctx.clearRect(0, 0, CV_W, CV_H)
      const cat = raw.category || 'economy'
      const colors = (TMPL_COLORS[cat] || TMPL_COLORS.economy)[templateId] || { bg: '#0a0f0a' }
      if (bgType === 'solid') {
        ctx.fillStyle = bgSolidColor; ctx.fillRect(0, 0, CV_W, CV_H)
      } else if (bgType === 'image') {
        const bgImg = bgCache[bgImageName]
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) ctx.drawImage(bgImg, 0, 0, CV_W, CV_H)
        else { ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, CV_W, CV_H) }
      } else {
        ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, CV_W, CV_H)
      }

      if (vid.readyState >= 2) {
        // 캡컷 스타일 색감 보정 미리보기 — 실제 렌더링은 서버에서 ffmpeg eq 필터로 적용된다
        ctx.filter = `brightness(${1 + brightness}) contrast(${contrast}) saturate(${saturation})`
        ctx.drawImage(vid, 0, VID_Y_PX, CV_W, VID_H_PX)
        ctx.filter = 'none'
      }
      const lines = [{ t: title1, c: t1Color }, { t: title2, c: t2Color }].filter(l => l.t.trim())
      if (lines.length) {
        const maxLen = Math.max(...lines.map(l => l.t.length))
        let sz = maxLen<=7?115:maxLen<=10?101:maxLen<=13?86:maxLen<=16?72:62
        sz = Math.max(8, Math.round((sz + titleFontSizeDelta) * SCALE))
        const lineH = sz + Math.round(20*SCALE)
        const yCenter = Math.round((555/2+140+titleY)*SCALE)
        const startY = yCenter - (lines.length*lineH)/2
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.font = `900 ${sz}px '${titleFont}','Malgun Gothic','Apple SD Gothic Neo',sans-serif`
        const lineBg = [
          { enabled: title1BgEnabled, color: title1BgColor, opacity: title1BgOpacity },
          { enabled: title2BgEnabled, color: title2BgColor, opacity: title2BgOpacity },
        ]
        lines.forEach((line, i) => {
          const bg = lineBg[i]
          if (bg?.enabled) {
            const tw = ctx.measureText(line.t).width + 8
            ctx.fillStyle = _hexToRgba(bg.color, bg.opacity)
            ctx.fillRect(CV_W/2-tw/2, startY+i*lineH-2, tw, sz+4)
          }
        })
        const lineBorderWidths = [title1BorderWidth, title2BorderWidth]
        const lineBorderColors = [title1BorderColor, title2BorderColor]
        lines.forEach((line, i) => {
          ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 3
          const bw = lineBorderWidths[i] ?? 3
          if (bw > 0) {
            ctx.lineWidth = bw * 2 * SCALE
            ctx.lineJoin = 'round'
            ctx.strokeStyle = _hexToRgba(lineBorderColors[i] ?? '#000000', 0.85)
            ctx.strokeText(line.t, CV_W/2, startY+i*lineH)
          }
          ctx.fillStyle = line.c; ctx.fillText(line.t, CV_W/2, startY+i*lineH)
        })
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
      }
      if (subtitles) {
        const sz = Math.round(subSize*SCALE)
        const lineH = Math.round(sz*1.35)
        const sY = VID_Y_PX+VID_H_PX-Math.round(subY*SCALE)-sz-4
        // 나레이션 미리듣기 재생 중이면 현재 재생 위치에 맞는 실제 자막을 보여준다
        let lines = ['자막 샘플']
        const narrAudio = narrAudioRef.current
        if (narrAudio && !narrAudio.paused && narrPreviewSubs.length) {
          const t = narrAudio.currentTime
          const active = narrPreviewSubs.find(s => t >= s.start && t <= s.end)
          if (active) {
            const activeLines = active.text.split('\n').map(l => l.trim()).filter(Boolean)
            if (activeLines.length) lines = activeLines
          } else {
            lines = []
          }
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.font = `bold ${sz}px '${subFont}','Malgun Gothic',sans-serif`
        lines.forEach((line, i) => {
          const y = sY - (lines.length - 1 - i) * lineH
          if (subBgEnabled) {
            const tw = ctx.measureText(line).width+8
            ctx.fillStyle = _hexToRgba(subBgColor, subBgOpacity)
            ctx.fillRect(CV_W/2-tw/2,y-2,tw,sz+4)
          }
          ctx.fillStyle = subColor; ctx.fillText(line, CV_W/2, y)
        })
      }
      const channel = channelName.trim()
      if (channel) {
        const sz = Math.round(channelFontsize * SCALE)
        const bottomH = CV_H - (VID_Y_PX + VID_H_PX)
        const cY = VID_Y_PX + VID_H_PX + Math.round((bottomH - sz) / 2) + Math.round(channelY * SCALE)
        const cX = CV_W / 2 + Math.round(channelX * SCALE)
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.font = `bold ${sz}px '${subFont}','Malgun Gothic',sans-serif`
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2
        ctx.fillStyle = _hexToRgba(channelColor, 0.75)
        ctx.fillText(channel, cX, cY)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
        // 원형 아바타 이미지
        const avatar = avatarImgRef.current
        if (avatar) {
          const avSize = sz * 2
          const tw = ctx.measureText(channel).width
          const avX = cX - tw / 2 - avSize - Math.round(6 * SCALE)
          const avY = cY + (sz - avSize) / 2
          ctx.save()
          ctx.beginPath(); ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2); ctx.clip()
          ctx.drawImage(avatar, avX, avY, avSize, avSize)
          ctx.restore()
        }
      }
      const topLeftText = channelTopLeftText.trim()
      if (topLeftText) {
        const sz = Math.round(channelTopLeftFontsize * SCALE)
        const x = Math.round(channelTopLeftX * SCALE)
        const y = VID_Y_PX + Math.round(channelTopLeftY * SCALE)
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.font = `bold ${sz}px '${subFont}','Malgun Gothic',sans-serif`
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2
        ctx.fillStyle = channelTopLeftColor
        ctx.fillText(topLeftText, x, y)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [raw?.filename, title1, title2, t1Color, t2Color, titleY, titleFontSizeDelta, titleFont, title1BorderWidth, title2BorderWidth, title1BorderColor, title2BorderColor, title1BgEnabled, title1BgColor, title1BgOpacity, title2BgEnabled, title2BgColor, title2BgOpacity, subtitles, subSize, subColor, subFont, subY, subBgEnabled, subBgColor, subBgOpacity, channelName, channelColor, channelX, channelY, channelFontsize, channelImageUrl, channelTopLeftText, channelTopLeftColor, channelTopLeftFontsize, channelTopLeftX, channelTopLeftY, bgType, bgSolidColor, bgImageName, templateId, brightness, contrast, saturation, narrPreviewSubs])

  // 음량 조절 — 미리듣기 영상에 즉시 반영 (HTML 비디오는 0~1 범위만 지원하므로 100%까지만 미리듣기 가능, 그 이상은 렌더링 결과로 확인)
  useEffect(() => {
    const vid = hidVidRef.current
    if (vid) vid.volume = Math.max(0, Math.min(1, volume))
  }, [volume])

  const getStyle = (): StyleParams => ({
    title1_color: t1Color, title2_color: t2Color, title_y_extra: titleY,
    title_fontsize_delta: titleFontSizeDelta,
    title_font_name: titleFont,
    title1_border_width: title1BorderWidth, title2_border_width: title2BorderWidth,
    title1_border_color: title1BorderColor, title2_border_color: title2BorderColor,
    title1_bg_enabled: title1BgEnabled, title1_bg_color: title1BgColor, title1_bg_opacity: title1BgOpacity,
    title2_bg_enabled: title2BgEnabled, title2_bg_color: title2BgColor, title2_bg_opacity: title2BgOpacity,
    sub_fontsize: subSize, sub_color: subColor, sub_margin_v: subY,
    sub_bg_enabled: subBgEnabled, sub_bg_color: subBgColor, sub_bg_opacity: subBgOpacity,
    channel_name: channelName.trim(), channel_color: channelColor,
    channel_x: channelX, channel_y: channelY, channel_fontsize: channelFontsize,
    channel_image_url: channelImageUrl,
    channel_topleft_text: channelTopLeftText.trim(), channel_topleft_color: channelTopLeftColor,
    channel_topleft_fontsize: channelTopLeftFontsize, channel_topleft_x: channelTopLeftX, channel_topleft_y: channelTopLeftY,
    font_name: subFont,
    brightness, contrast, saturation, volume,
    narration_volume: narrVolume, narration_video_volume: narrVideoVolume,
  })
  const getTitle = () => { const t1=title1.trim(),t2=title2.trim(); return t1&&t2?`${t1}\n${t2}`:(t1||t2||'') }

  const getBgParams = () => ({
    bgImage: bgType === 'image' ? bgImageName : '',
    bgSolidColor: bgType === 'solid' ? bgSolidColor : undefined,
  })

  const handleRender = async () => {
    if (!raw || isRendering) return
    setIsRendering(true); setRenderMsg('')
    try {
      const { bgImage, bgSolidColor: bgSC } = getBgParams()
      await api.render(raw.filename, getTitle(), subtitles, templateId, getStyle(), bgImage, bgSC, narration, narrVoice, narrMode, narrSpeed)
      setRenderMsg(narration ? '✓ 나레이션 버전 렌더링 시작' : '✓ 렌더링 시작 — 완성 쇼츠 탭에서 확인')
      onStartPolling()
    } catch (e: any) { setRenderMsg(e?.response?.data?.detail || '오류가 발생했습니다') }
    finally { setIsRendering(false) }
  }

  const handleGenerateScript = async () => {
    if (!raw || isGeneratingScript) return
    setIsGeneratingScript(true); setGenScriptMsg('')
    try {
      const res = await api.generateScript(raw.filename, scriptMode)
      setNarrationScript(res.narration_script)
      setGenScriptMsg(`✓ 대본 생성 완료 (효과음 ${res.sfx_placements.length}개)`)
    } catch (e: any) {
      setGenScriptMsg(e?.response?.data?.detail || '대본 생성 실패')
    } finally {
      setIsGeneratingScript(false)
    }
  }

  const handleScriptBlur = async () => {
    if (!raw) return
    try { await api.updateNarrationScript(raw.filename, narrationScript) } catch {}
  }

  const handleGenerateNarrationSubtitles = async () => {
    if (!raw || isGeneratingNarrSubs) return
    setIsGeneratingNarrSubs(true); setGenNarrSubsMsg('')
    try {
      const res = await api.generateNarrationSubtitles(raw.filename, narrVoice, narrMode, narrSpeed)
      setGenNarrSubsMsg(`✓ 나레이션 자막 ${res.subtitles.length}개 생성 완료`)
    } catch (e: any) {
      setGenNarrSubsMsg(e?.response?.data?.detail || '나레이션 자막 생성 실패')
    } finally {
      setIsGeneratingNarrSubs(false)
    }
  }

  // 나레이션 미리듣기 — TTS 오디오를 재생하면서, 자막 스타일대로 캔버스에 캡션을 동기 표시한다
  const handleNarrationPreview = async () => {
    const audio = narrAudioRef.current
    if (!raw || !audio) return

    if (audio.src && !audio.ended) {
      if (audio.paused) audio.play().catch(() => {})
      else audio.pause()
      return
    }

    setIsPreviewingNarration(true); setNarrPreviewMsg('')
    try {
      const { audio: blob, subtitles } = await api.narrationPreview(raw.filename, narrVoice, narrMode, narrSpeed)
      if (narrAudioUrlRef.current) URL.revokeObjectURL(narrAudioUrlRef.current)
      const url = URL.createObjectURL(blob)
      narrAudioUrlRef.current = url
      setNarrPreviewSubs(subtitles)
      audio.src = url
      audio.currentTime = 0
      await audio.play()
    } catch (e: any) {
      setNarrPreviewMsg(e?.response?.data?.detail || '나레이션 미리듣기 생성 실패')
    } finally {
      setIsPreviewingNarration(false)
    }
  }

  // 모바일: 세로 스택 (캔버스 → 컨트롤)
  // 데스크톱: 가로 분할 (280px 미리보기 | flex 컨트롤)
  if (isMobile) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
        <video ref={hidVidRef} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }} playsInline />
        <audio ref={narrAudioRef} style={{ display: 'none' }}
          onPlay={() => setIsNarrPreviewPlaying(true)}
          onPause={() => setIsNarrPreviewPlaying(false)}
          onEnded={() => setIsNarrPreviewPlaying(false)} />
        {!raw
          ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 8 }}>
              <div style={{ fontSize: 40, opacity: 0.15 }}>🎬</div>
              <p style={{ fontSize: 15, color: 'var(--text2)' }}>목록에서 영상을 선택하세요</p>
            </div>
          : <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {/* 캔버스 미리보기 — 전체 너비 */}
              <div style={{ background: 'var(--surface2)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative', width: '60%', maxWidth: 200, borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                  <canvas ref={canvasRef} width={CV_W} height={CV_H}
                    style={{ display: 'block', width: '100%', aspectRatio: '9/16' }} />
                  <button onClick={togglePlay} aria-label={isPlaying ? '일시정지' : '재생'} style={{
                    position: 'absolute', bottom: 8, right: 8, width: 30, height: 30, borderRadius: '50%',
                    border: 'none', background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 15,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                </div>
              </div>

              {/* 컨트롤 */}
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                  {raw.filename}
                </p>

                {/* 제목 */}
                <div>
                  <div className="section-label">제목</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="color" value={t1Color} onChange={e => setT1Color(e.target.value)} style={{ width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                      <input value={title1} onChange={e => setTitle1(e.target.value)} placeholder="1줄 — 노란색" className="input-field" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="color" value={t2Color} onChange={e => setT2Color(e.target.value)} style={{ width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                      <input value={title2} onChange={e => setTitle2(e.target.value)} placeholder="2줄 — 흰색" className="input-field" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Slider label="Y 위치" value={titleY} display={`${titleY}px`} min={-150} max={150} step={5} onChange={setTitleY} />
                      <Slider label="글자 크기" value={titleFontSizeDelta} display={`${titleFontSizeDelta > 0 ? '+' : ''}${titleFontSizeDelta}px`} min={-40} max={40} step={2} onChange={setTitleFontSizeDelta} />
                    </div>
                    <TitleStyleControls
                      titleFont={titleFont} setTitleFont={setTitleFont}
                      title1BorderWidth={title1BorderWidth} setTitle1BorderWidth={setTitle1BorderWidth}
                      title2BorderWidth={title2BorderWidth} setTitle2BorderWidth={setTitle2BorderWidth}
                      title1BorderColor={title1BorderColor} setTitle1BorderColor={setTitle1BorderColor}
                      title2BorderColor={title2BorderColor} setTitle2BorderColor={setTitle2BorderColor}
                      title1BgEnabled={title1BgEnabled} setTitle1BgEnabled={setTitle1BgEnabled}
                      title1BgColor={title1BgColor} setTitle1BgColor={setTitle1BgColor}
                      title1BgOpacity={title1BgOpacity} setTitle1BgOpacity={setTitle1BgOpacity}
                      title2BgEnabled={title2BgEnabled} setTitle2BgEnabled={setTitle2BgEnabled}
                      title2BgColor={title2BgColor} setTitle2BgColor={setTitle2BgColor}
                      title2BgOpacity={title2BgOpacity} setTitle2BgOpacity={setTitle2BgOpacity}
                    />
                  </div>
                </div>

                {/* 자막 */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="section-label" style={{ margin: 0 }}>자막</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => setShowSrt(true)} className="btn-outlined" style={{ padding: '4px 10px', fontSize: 13 }}>✏️ 편집</button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--text2)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={subtitles} onChange={e => setSubtitles(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                        자동 삽입
                      </label>
                    </div>
                  </div>
                  {subtitles && <SubtitleStyleControls
                    subSize={subSize} setSubSize={setSubSize}
                    subColor={subColor} setSubColor={setSubColor}
                    subY={subY} setSubY={setSubY}
                    subFont={subFont} setSubFont={setSubFont}
                    subBgEnabled={subBgEnabled} setSubBgEnabled={setSubBgEnabled}
                    subBgColor={subBgColor} setSubBgColor={setSubBgColor}
                    subBgOpacity={subBgOpacity} setSubBgOpacity={setSubBgOpacity}
                  />}
                </div>

                {/* 출처 채널명 */}
                <div>
                  <div className="section-label">출처 채널명 (영상 하단)</div>
                  <input value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="예: 채널명 / 출처: ○○뉴스" className="input-field" style={{ marginBottom: 8 }} />
                  {regChannels.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {regChannels.map(ch => {
                        const name = ch.url.match(/youtube\.com\/(@[^/?#]+)/i)?.[1] || ch.url
                        return (
                          <button key={ch.url} onClick={() => { setChannelName(name); setChannelImageUrl(ch.thumbnail_url || '') }}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer' }}>
                            {ch.thumbnail_url && <img src={ch.thumbnail_url} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />}
                            {name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <Slider label="X 위치" value={channelX} display={`${channelX}px`} min={-400} max={400} step={10} onChange={setChannelX} />
                    <Slider label="Y 위치" value={channelY} display={`${channelY}px`} min={-200} max={200} step={5} onChange={setChannelY} />
                    <Slider label="크기" value={channelFontsize} display={`${channelFontsize}px`} min={18} max={80} step={2} onChange={setChannelFontsize} />
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>색상</div>
                      <input type="color" value={channelColor} onChange={e => setChannelColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                    </div>
                  </div>
                </div>

                {/* 채널명 (영상 좌측상단) */}
                <div>
                  <div className="section-label">채널명 (영상 좌측상단)</div>
                  <input value={channelTopLeftText} onChange={e => setChannelTopLeftText(e.target.value)} placeholder="예: @채널명" className="input-field" style={{ marginBottom: 8 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <Slider label="X 위치" value={channelTopLeftX} display={`${channelTopLeftX}px`} min={0} max={500} step={10} onChange={setChannelTopLeftX} />
                    <Slider label="Y 위치" value={channelTopLeftY} display={`${channelTopLeftY}px`} min={0} max={300} step={5} onChange={setChannelTopLeftY} />
                    <Slider label="크기" value={channelTopLeftFontsize} display={`${channelTopLeftFontsize}px`} min={16} max={72} step={2} onChange={setChannelTopLeftFontsize} />
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>색상</div>
                      <input type="color" value={channelTopLeftColor} onChange={e => setChannelTopLeftColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                    </div>
                  </div>
                </div>

                {/* 배경 */}
                <BgSection
                  bgType={bgType} setBgType={setBgType}
                  bgSolidColor={bgSolidColor} setBgSolidColor={setBgSolidColor}
                  bgImageName={bgImageName} setBgImageName={setBgImageName}
                  bgOptions={bgOptions} setBgOptions={setBgOptions}
                  bgUploadMsg={bgUploadMsg} setBgUploadMsg={setBgUploadMsg}
                  bgFileInputRef={bgFileInputRef}
                />

                {/* 색감 & 음량 */}
                <ColorVolumeControls
                  brightness={brightness} setBrightness={setBrightness}
                  contrast={contrast} setContrast={setContrast}
                  saturation={saturation} setSaturation={setSaturation}
                  volume={volume} setVolume={setVolume}
                />

                {/* 나레이션 */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: narration ? 'var(--primary-bg)' : 'var(--surface2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16 }}>🎙</span>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>나레이션</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={narration} onChange={e => setNarration(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                      포함
                    </label>
                  </div>
                  {narration && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>AI 분석 요약을 TTS로 변환해 도입부에 삽입합니다.</p>
                      <select value={narrVoice} onChange={e => setNarrVoice(e.target.value)} className="input-field" style={{ cursor: 'pointer', fontSize: 14 }}>
                        {NARRATION_VOICE_GROUPS.map(g => (
                          <optgroup key={g.group} label={g.group}>
                            {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                          <input type="radio" name="narrMode" checked={narrMode === 'title'} onChange={() => setNarrMode('title')} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                          제목만
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                          <input type="radio" name="narrMode" checked={narrMode === 'script'} onChange={() => setNarrMode('script')} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                          전체 대본
                        </label>
                      </div>
                      {narrMode === 'script' && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                              <input type="radio" name="scriptMode" checked={scriptMode === 'summary'} onChange={() => setScriptMode('summary')} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                              전체 요약
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                              <input type="radio" name="scriptMode" checked={scriptMode === 'style_convert'} onChange={() => setScriptMode('style_convert')} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                              화법 변환 (전체 유지)
                            </label>
                          </div>
                          <button onClick={handleGenerateScript} disabled={isGeneratingScript} className="btn-outlined"
                            style={{ fontSize: 13, padding: '5px 10px', cursor: 'pointer' }}>
                            {isGeneratingScript ? '생성 중...' : '✨ AI 나레이션 대본 생성'}
                          </button>
                          {genScriptMsg && <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>{genScriptMsg}</p>}
                          <textarea value={narrationScript} onChange={e => setNarrationScript(e.target.value)} onBlur={handleScriptBlur}
                            placeholder="대본을 생성하거나 직접 입력하세요"
                            className="input-field" style={{ width: '100%', marginTop: 6, minHeight: 80, resize: 'vertical', fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                      )}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                        <button onClick={handleGenerateNarrationSubtitles} disabled={isGeneratingNarrSubs} className="btn-outlined"
                          style={{ fontSize: 13, padding: '5px 10px', cursor: 'pointer' }}>
                          {isGeneratingNarrSubs ? '생성 중...' : '📝 나레이션 자막 생성'}
                        </button>
                        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>나레이션 음성에 맞춰 자막을 생성합니다. '자막' 옵션을 켜면 렌더링 영상에 함께 표시됩니다.</p>
                        {genNarrSubsMsg && <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>{genNarrSubsMsg}</p>}
                      </div>
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <Slider label="나레이션 속도" value={narrSpeed} display={`${narrSpeed.toFixed(2)}x`}
                          min={0.5} max={2} step={0.05} onChange={setNarrSpeed} />
                        <Slider label="나레이션 음량" value={narrVolume} display={`${Math.round(narrVolume * 100)}%`}
                          min={0} max={3} step={0.05} onChange={setNarrVolume} />
                        <Slider label="원본 영상 음량" value={narrVideoVolume} display={`${Math.round(narrVideoVolume * 100)}%`}
                          min={0} max={2} step={0.05} onChange={setNarrVideoVolume} />
                      </div>
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                        <button onClick={handleNarrationPreview} disabled={isPreviewingNarration} className="btn-outlined"
                          style={{ fontSize: 13, padding: '5px 10px', cursor: 'pointer' }}>
                          {isPreviewingNarration ? '생성 중...' : isNarrPreviewPlaying ? '⏸ 일시정지' : '🎙 나레이션 미리듣기'}
                        </button>
                        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>현재 설정의 나레이션 음성을 들으며, 위 미리보기 화면에서 자막이 표시되는 모습을 확인합니다.</p>
                        {narrPreviewMsg && <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>{narrPreviewMsg}</p>}
                      </div>
                    </div>
                  )}
                </div>

                {/* 템플릿 + 렌더 */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={templateId} onChange={e => setTemplateId(+e.target.value)}
                    className="input-field" style={{ flex: 1, cursor: 'pointer' }}>
                    <option value={1}>다크</option>
                    <option value={2}>미니멀 흰배경</option>
                    <option value={3}>네이비</option>
                  </select>
                  <button onClick={handleRender} disabled={isRendering} className="btn-primary"
                    style={{ padding: '8px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    {isRendering
                      ? <><div className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />처리 중</>
                      : `▶ 렌더링${narration ? '(나레이션)' : ''}`
                    }
                  </button>
                </div>
                {renderMsg && (
                  <div style={{ fontSize: 14, color: renderMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)', padding: '6px 10px', background: renderMsg.startsWith('✓') ? '#e6f4ea' : '#fce8e6', borderRadius: 6, border: `1px solid ${renderMsg.startsWith('✓') ? '#81c995' : '#f28b82'}` }}>
                    {renderMsg}
                  </div>
                )}
              </div>
            </div>
        }
        {showSrt && raw && <SrtModal stem={raw.filename.replace('_raw.mp4', '')} onClose={() => setShowSrt(false)} />}
      </div>
    )
  }

  // 데스크톱 레이아웃 (기존)
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--surface)' }}>
      <video ref={hidVidRef} style={{ display: 'none' }} playsInline />
      <audio ref={narrAudioRef} style={{ display: 'none' }}
        onPlay={() => setIsNarrPreviewPlaying(true)}
        onPause={() => setIsNarrPreviewPlaying(false)}
        onEnded={() => setIsNarrPreviewPlaying(false)} />

      {/* 왼쪽: 캔버스 미리보기 */}
      <div style={{ width: 'clamp(220px, 28vw, 380px)', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface2)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>실시간 미리보기</span>
          {raw && <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{raw.category}</span>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {raw ? (
            <>
              <div style={{ position: 'relative', display: 'inline-block', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                <canvas ref={canvasRef} width={CV_W} height={CV_H}
                  style={{ display: 'block', height: 'min(60vh, 520px)', width: 'auto', aspectRatio: '9/16', imageRendering: 'auto' }} />
                <button onClick={togglePlay} aria-label={isPlaying ? '일시정지' : '재생'} style={{
                  position: 'absolute', bottom: 10, right: 10, width: 34, height: 34, borderRadius: '50%',
                  border: 'none', background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                  {isPlaying ? '⏸' : '▶'}
                </button>
              </div>

              <details style={{ width: '100%' }} open={false}>
                <summary style={{ fontSize: 13, color: 'var(--text2)', cursor: 'pointer', padding: '4px 2px', userSelect: 'none' }}>▸ 원본 영상</summary>
                <div style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                  <video key={raw.url} src={raw.url} controls style={{ width: '100%', maxHeight: 180, display: 'block' }} />
                </div>
              </details>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 10, padding: 20, minHeight: 300 }}>
              <div style={{ fontSize: 40, opacity: 0.15 }}>🎬</div>
              <p style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.6, color: 'var(--text2)' }}>왼쪽 목록에서<br/>영상을 선택하세요</p>
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽: 편집 컨트롤 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {!raw
          ? <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 8 }}>
              <div style={{ fontSize: 32, opacity: 0.3 }}>✏️</div>
              <p style={{ fontSize: 15, color: 'var(--text2)' }}>영상을 선택하면 편집 옵션이 나타납니다</p>
            </div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              <p style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                {raw.filename}
              </p>

              {/* 제목 */}
              <div>
                <div className="section-label">제목</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={t1Color} onChange={e => setT1Color(e.target.value)} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                    <input value={title1} onChange={e => setTitle1(e.target.value)} placeholder="1줄 — 노란색" className="input-field" style={{ flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={t2Color} onChange={e => setT2Color(e.target.value)} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                    <input value={title2} onChange={e => setTitle2(e.target.value)} placeholder="2줄 — 흰색" className="input-field" style={{ flex: 1 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Slider label="Y 위치" value={titleY} display={`${titleY}px`} min={-150} max={150} step={5} onChange={setTitleY} />
                    <Slider label="글자 크기" value={titleFontSizeDelta} display={`${titleFontSizeDelta > 0 ? '+' : ''}${titleFontSizeDelta}px`} min={-40} max={40} step={2} onChange={setTitleFontSizeDelta} />
                  </div>
                  <TitleStyleControls
                    titleFont={titleFont} setTitleFont={setTitleFont}
                    title1BorderWidth={title1BorderWidth} setTitle1BorderWidth={setTitle1BorderWidth}
                    title2BorderWidth={title2BorderWidth} setTitle2BorderWidth={setTitle2BorderWidth}
                    title1BorderColor={title1BorderColor} setTitle1BorderColor={setTitle1BorderColor}
                    title2BorderColor={title2BorderColor} setTitle2BorderColor={setTitle2BorderColor}
                    title1BgEnabled={title1BgEnabled} setTitle1BgEnabled={setTitle1BgEnabled}
                    title1BgColor={title1BgColor} setTitle1BgColor={setTitle1BgColor}
                    title1BgOpacity={title1BgOpacity} setTitle1BgOpacity={setTitle1BgOpacity}
                    title2BgEnabled={title2BgEnabled} setTitle2BgEnabled={setTitle2BgEnabled}
                    title2BgColor={title2BgColor} setTitle2BgColor={setTitle2BgColor}
                    title2BgOpacity={title2BgOpacity} setTitle2BgOpacity={setTitle2BgOpacity}
                  />
                </div>
              </div>

              {/* 자막 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="section-label" style={{ margin: 0 }}>자막</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setShowSrt(true)} className="btn-outlined" style={{ padding: '4px 10px', fontSize: 13 }}>✏️ 자막 편집</button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={subtitles} onChange={e => setSubtitles(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                      자동 삽입
                    </label>
                  </div>
                </div>
                {subtitles && <SubtitleStyleControls
                  subSize={subSize} setSubSize={setSubSize}
                  subColor={subColor} setSubColor={setSubColor}
                  subY={subY} setSubY={setSubY}
                  subFont={subFont} setSubFont={setSubFont}
                  subBgEnabled={subBgEnabled} setSubBgEnabled={setSubBgEnabled}
                  subBgColor={subBgColor} setSubBgColor={setSubBgColor}
                  subBgOpacity={subBgOpacity} setSubBgOpacity={setSubBgOpacity}
                />}
              </div>

              {/* 출처 채널명 */}
              <div>
                <div className="section-label">출처 채널명 (영상 하단)</div>
                <input value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="예: 채널명 / 출처: ○○뉴스" className="input-field" style={{ marginBottom: 8 }} />
                {regChannels.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {regChannels.map(ch => {
                      const name = ch.url.match(/youtube\.com\/(@[^/?#]+)/i)?.[1] || ch.url
                      return (
                        <button key={ch.url} onClick={() => { setChannelName(name); setChannelImageUrl(ch.thumbnail_url || '') }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer' }}>
                          {ch.thumbnail_url && <img src={ch.thumbnail_url} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />}
                          {name}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <Slider label="X 위치" value={channelX} display={`${channelX}px`} min={-400} max={400} step={10} onChange={setChannelX} />
                  <Slider label="Y 위치" value={channelY} display={`${channelY}px`} min={-200} max={200} step={5} onChange={setChannelY} />
                  <Slider label="크기" value={channelFontsize} display={`${channelFontsize}px`} min={18} max={80} step={2} onChange={setChannelFontsize} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>색상</div>
                    <input type="color" value={channelColor} onChange={e => setChannelColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                  </div>
                </div>
              </div>

              {/* 채널명 (영상 좌측상단) */}
              <div>
                <div className="section-label">채널명 (영상 좌측상단)</div>
                <input value={channelTopLeftText} onChange={e => setChannelTopLeftText(e.target.value)} placeholder="예: @채널명" className="input-field" style={{ marginBottom: 8 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <Slider label="X 위치" value={channelTopLeftX} display={`${channelTopLeftX}px`} min={0} max={500} step={10} onChange={setChannelTopLeftX} />
                  <Slider label="Y 위치" value={channelTopLeftY} display={`${channelTopLeftY}px`} min={0} max={300} step={5} onChange={setChannelTopLeftY} />
                  <Slider label="크기" value={channelTopLeftFontsize} display={`${channelTopLeftFontsize}px`} min={16} max={72} step={2} onChange={setChannelTopLeftFontsize} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>색상</div>
                    <input type="color" value={channelTopLeftColor} onChange={e => setChannelTopLeftColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                  </div>
                </div>
              </div>

              {/* 배경 */}
              <BgSection
                bgType={bgType} setBgType={setBgType}
                bgSolidColor={bgSolidColor} setBgSolidColor={setBgSolidColor}
                bgImageName={bgImageName} setBgImageName={setBgImageName}
                bgOptions={bgOptions} setBgOptions={setBgOptions}
                bgUploadMsg={bgUploadMsg} setBgUploadMsg={setBgUploadMsg}
                bgFileInputRef={bgFileInputRef}
              />

              {/* 색감 & 음량 */}
              <ColorVolumeControls
                brightness={brightness} setBrightness={setBrightness}
                contrast={contrast} setContrast={setContrast}
                saturation={saturation} setSaturation={setSaturation}
                volume={volume} setVolume={setVolume}
              />

              {/* 나레이션 */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: narration ? 'var(--primary-bg)' : 'var(--surface2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: narration ? 10 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>🎙</span>
                    <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>나레이션</span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={narration} onChange={e => setNarration(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                    포함
                  </label>
                </div>
                {narration && (
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>AI 분석의 요약문을 TTS로 변환해 영상 도입부에 삽입합니다.</p>
                    <select value={narrVoice} onChange={e => setNarrVoice(e.target.value)} className="input-field" style={{ cursor: 'pointer', fontSize: 14 }}>
                      {NARRATION_VOICE_GROUPS.map(g => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                        <input type="radio" name="narrModeDesktop" checked={narrMode === 'title'} onChange={() => setNarrMode('title')} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                        제목만
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                        <input type="radio" name="narrModeDesktop" checked={narrMode === 'script'} onChange={() => setNarrMode('script')} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                        전체 대본
                      </label>
                    </div>
                    {narrMode === 'script' && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                            <input type="radio" name="scriptModeDesktop" checked={scriptMode === 'summary'} onChange={() => setScriptMode('summary')} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                            전체 요약
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                            <input type="radio" name="scriptModeDesktop" checked={scriptMode === 'style_convert'} onChange={() => setScriptMode('style_convert')} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                            화법 변환 (전체 유지)
                          </label>
                        </div>
                        <button onClick={handleGenerateScript} disabled={isGeneratingScript} className="btn-outlined"
                          style={{ fontSize: 13, padding: '5px 10px', cursor: 'pointer' }}>
                          {isGeneratingScript ? '생성 중...' : '✨ AI 나레이션 대본 생성'}
                        </button>
                        {genScriptMsg && <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>{genScriptMsg}</p>}
                        <textarea value={narrationScript} onChange={e => setNarrationScript(e.target.value)} onBlur={handleScriptBlur}
                          placeholder="대본을 생성하거나 직접 입력하세요"
                          className="input-field" style={{ width: '100%', marginTop: 6, minHeight: 80, resize: 'vertical', fontSize: 13, boxSizing: 'border-box' }} />
                      </div>
                    )}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <button onClick={handleGenerateNarrationSubtitles} disabled={isGeneratingNarrSubs} className="btn-outlined"
                        style={{ fontSize: 13, padding: '5px 10px', cursor: 'pointer' }}>
                        {isGeneratingNarrSubs ? '생성 중...' : '📝 나레이션 자막 생성'}
                      </button>
                      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>나레이션 음성에 맞춰 자막을 생성합니다. '자막' 옵션을 켜면 렌더링 영상에 함께 표시됩니다.</p>
                      {genNarrSubsMsg && <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>{genNarrSubsMsg}</p>}
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <Slider label="나레이션 속도" value={narrSpeed} display={`${narrSpeed.toFixed(2)}x`}
                        min={0.5} max={2} step={0.05} onChange={setNarrSpeed} />
                      <Slider label="나레이션 음량" value={narrVolume} display={`${Math.round(narrVolume * 100)}%`}
                        min={0} max={3} step={0.05} onChange={setNarrVolume} />
                      <Slider label="원본 영상 음량" value={narrVideoVolume} display={`${Math.round(narrVideoVolume * 100)}%`}
                        min={0} max={2} step={0.05} onChange={setNarrVideoVolume} />
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <button onClick={handleNarrationPreview} disabled={isPreviewingNarration} className="btn-outlined"
                        style={{ fontSize: 13, padding: '5px 10px', cursor: 'pointer' }}>
                        {isPreviewingNarration ? '생성 중...' : isNarrPreviewPlaying ? '⏸ 일시정지' : '🎙 나레이션 미리듣기'}
                      </button>
                      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>현재 설정의 나레이션 음성을 들으며, 왼쪽 미리보기 화면에서 자막이 표시되는 모습을 확인합니다.</p>
                      {narrPreviewMsg && <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>{narrPreviewMsg}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* 템플릿 + 렌더 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={templateId} onChange={e => setTemplateId(+e.target.value)}
                  className="input-field" style={{ flex: 1, cursor: 'pointer' }}>
                  <option value={1}>다크 계열</option>
                  <option value={2}>미니멀 흰배경</option>
                  <option value={3}>네이비/포인트</option>
                </select>
                <button onClick={handleRender} disabled={isRendering} className="btn-primary"
                  style={{ padding: '8px 20px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isRendering
                    ? <><div className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />렌더링 중...</>
                    : `▶ 렌더링${narration ? ' (나레이션)' : ''}`
                  }
                </button>
              </div>
              {renderMsg && (
                <div style={{ fontSize: 14, color: renderMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)', padding: '6px 10px', background: renderMsg.startsWith('✓') ? '#e6f4ea' : '#fce8e6', borderRadius: 6, border: `1px solid ${renderMsg.startsWith('✓') ? '#81c995' : '#f28b82'}` }}>
                  {renderMsg}
                </div>
              )}
            </div>
        }
      </div>

      {showSrt && raw && <SrtModal stem={raw.filename.replace('_raw.mp4', '')} onClose={() => setShowSrt(false)} />}
    </div>
  )
}

// 캡컷 스타일 색감/음량 보정 컨트롤 — 밝기·대비·채도·음량을 슬라이더로 조절하고
// 미리보기(canvas filter) + 최종 렌더링(ffmpeg eq/volume 필터) 양쪽에 동일하게 반영된다
function ColorVolumeControls({
  brightness, setBrightness, contrast, setContrast, saturation, setSaturation, volume, setVolume,
}: {
  brightness: number; setBrightness: (v: number) => void
  contrast: number; setContrast: (v: number) => void
  saturation: number; setSaturation: (v: number) => void
  volume: number; setVolume: (v: number) => void
}) {
  const isDefault = brightness === 0 && contrast === 1 && saturation === 1 && volume === 1
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="section-label" style={{ margin: 0 }}>색감 & 음량 보정</div>
        {!isDefault && (
          <button onClick={() => { setBrightness(0); setContrast(1); setSaturation(1); setVolume(1) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
            ↺ 초기화
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        <Slider label="밝기" value={brightness} display={brightness >= 0 ? `+${brightness.toFixed(2)}` : brightness.toFixed(2)}
          min={-1} max={1} step={0.05} onChange={setBrightness} />
        <Slider label="대비" value={contrast} display={`${Math.round(contrast * 100)}%`}
          min={0} max={2} step={0.05} onChange={setContrast} />
        <Slider label="채도" value={saturation} display={`${Math.round(saturation * 100)}%`}
          min={0} max={2} step={0.05} onChange={setSaturation} />
        <Slider label="음량" value={volume} display={`${Math.round(volume * 100)}%`}
          min={0} max={2} step={0.05} onChange={setVolume} />
      </div>
    </div>
  )
}

function TitleLineBgControls({
  label, bgEnabled, setBgEnabled, bgColor, setBgColor, bgOpacity, setBgOpacity,
}: {
  label: string
  bgEnabled: boolean; setBgEnabled: (v: boolean) => void
  bgColor: string; setBgColor: (v: string) => void
  bgOpacity: number; setBgOpacity: (v: number) => void
}) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text2)', cursor: 'pointer', marginBottom: bgEnabled ? 8 : 0 }}>
        <input type="checkbox" checked={bgEnabled} onChange={e => setBgEnabled(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
        {label} 배경 표시
      </label>
      {bgEnabled && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>배경색</div>
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
          </div>
          <Slider label="투명도" value={bgOpacity} display={`${Math.round(bgOpacity * 100)}%`} min={0.1} max={1} step={0.05} onChange={setBgOpacity} />
        </div>
      )}
    </div>
  )
}

function TitleStyleControls({
  titleFont, setTitleFont,
  title1BorderWidth, setTitle1BorderWidth, title2BorderWidth, setTitle2BorderWidth,
  title1BorderColor, setTitle1BorderColor, title2BorderColor, setTitle2BorderColor,
  title1BgEnabled, setTitle1BgEnabled, title1BgColor, setTitle1BgColor, title1BgOpacity, setTitle1BgOpacity,
  title2BgEnabled, setTitle2BgEnabled, title2BgColor, setTitle2BgColor, title2BgOpacity, setTitle2BgOpacity,
}: {
  titleFont: string; setTitleFont: (v: string) => void
  title1BorderWidth: number; setTitle1BorderWidth: (v: number) => void
  title2BorderWidth: number; setTitle2BorderWidth: (v: number) => void
  title1BorderColor: string; setTitle1BorderColor: (v: string) => void
  title2BorderColor: string; setTitle2BorderColor: (v: string) => void
  title1BgEnabled: boolean; setTitle1BgEnabled: (v: boolean) => void
  title1BgColor: string; setTitle1BgColor: (v: string) => void
  title1BgOpacity: number; setTitle1BgOpacity: (v: number) => void
  title2BgEnabled: boolean; setTitle2BgEnabled: (v: boolean) => void
  title2BgColor: string; setTitle2BgColor: (v: string) => void
  title2BgOpacity: number; setTitle2BgOpacity: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>글꼴</div>
        <select value={titleFont} onChange={e => setTitleFont(e.target.value)} className="input-field" style={{ fontSize: 14, padding: '7px 8px', width: '100%' }}>
          {SUB_FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
        <Slider label="외곽선 두께 (1줄)" value={title1BorderWidth} display={`${title1BorderWidth}px`} min={0} max={10} step={1} onChange={setTitle1BorderWidth} />
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>외곽선 색상 (1줄)</div>
          <input type="color" value={title1BorderColor} onChange={e => setTitle1BorderColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
        <Slider label="외곽선 두께 (2줄)" value={title2BorderWidth} display={`${title2BorderWidth}px`} min={0} max={10} step={1} onChange={setTitle2BorderWidth} />
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>외곽선 색상 (2줄)</div>
          <input type="color" value={title2BorderColor} onChange={e => setTitle2BorderColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
        </div>
      </div>
      <TitleLineBgControls
        label="1줄"
        bgEnabled={title1BgEnabled} setBgEnabled={setTitle1BgEnabled}
        bgColor={title1BgColor} setBgColor={setTitle1BgColor}
        bgOpacity={title1BgOpacity} setBgOpacity={setTitle1BgOpacity}
      />
      <TitleLineBgControls
        label="2줄"
        bgEnabled={title2BgEnabled} setBgEnabled={setTitle2BgEnabled}
        bgColor={title2BgColor} setBgColor={setTitle2BgColor}
        bgOpacity={title2BgOpacity} setBgOpacity={setTitle2BgOpacity}
      />
    </div>
  )
}

function SubtitleStyleControls({
  subSize, setSubSize, subColor, setSubColor, subY, setSubY, subFont, setSubFont,
  subBgEnabled, setSubBgEnabled, subBgColor, setSubBgColor, subBgOpacity, setSubBgOpacity,
}: {
  subSize: number; setSubSize: (v: number) => void
  subColor: string; setSubColor: (v: string) => void
  subY: number; setSubY: (v: number) => void
  subFont: string; setSubFont: (v: string) => void
  subBgEnabled: boolean; setSubBgEnabled: (v: boolean) => void
  subBgColor: string; setSubBgColor: (v: string) => void
  subBgOpacity: number; setSubBgOpacity: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end' }}>
        <Slider label="크기" value={subSize} display={`${subSize}px`} min={16} max={80} step={2} onChange={setSubSize} />
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>색상</div>
          <input type="color" value={subColor} onChange={e => setSubColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
        </div>
        <Slider label="Y 위치" value={subY} display={`${subY}px`} min={-500} max={1200} step={10} onChange={setSubY} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '-4px 0 0' }}>
        음수: 영상 아래쪽 바깥 여백 / 큰 값: 영상 위쪽 바깥 여백으로 이동
      </p>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>글꼴</div>
        <select value={subFont} onChange={e => setSubFont(e.target.value)} className="input-field" style={{ fontSize: 14, padding: '7px 8px', width: '100%' }}>
          {SUB_FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text2)', cursor: 'pointer', marginBottom: subBgEnabled ? 8 : 0 }}>
          <input type="checkbox" checked={subBgEnabled} onChange={e => setSubBgEnabled(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
          배경 표시
        </label>
        {subBgEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>배경색</div>
              <input type="color" value={subBgColor} onChange={e => setSubBgColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
            </div>
            <Slider label="투명도" value={subBgOpacity} display={`${Math.round(subBgOpacity * 100)}%`} min={0.1} max={1} step={0.05} onChange={setSubBgOpacity} />
          </div>
        )}
      </div>
    </div>
  )
}

function Slider({ label, value, display, min, max, step, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 700 }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--primary)' }} />
    </div>
  )
}

function BgSection({
  bgType, setBgType,
  bgSolidColor, setBgSolidColor,
  bgImageName, setBgImageName,
  bgOptions, setBgOptions,
  bgUploadMsg, setBgUploadMsg,
  bgFileInputRef,
}: {
  bgType: 'blur' | 'solid' | 'image'
  setBgType: (v: 'blur' | 'solid' | 'image') => void
  bgSolidColor: string; setBgSolidColor: (v: string) => void
  bgImageName: string; setBgImageName: (v: string) => void
  bgOptions: string[]; setBgOptions: (v: string[]) => void
  bgUploadMsg: string; setBgUploadMsg: (v: string) => void
  bgFileInputRef: RefObject<HTMLInputElement>
}) {
  const BG_TYPES = [
    { key: 'blur' as const,  label: '블러' },
    { key: 'solid' as const, label: '단색' },
    { key: 'image' as const, label: '이미지' },
  ]

  const handleUpload = async (file: File) => {
    setBgUploadMsg('업로드 중...')
    try {
      const r = await api.uploadBackground(file)
      const res = await api.getBackgrounds()
      setBgOptions(res.backgrounds)
      setBgImageName(r.filename)
      loadBg(r.filename)
      setBgType('image')
      setBgUploadMsg(`✓ ${r.filename}`)
    } catch {
      setBgUploadMsg('업로드 실패')
    }
  }

  return (
    <div>
      <div className="section-label">배경</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {BG_TYPES.map(({ key, label }) => (
          <button key={key} onClick={() => setBgType(key)} style={{
            flex: 1, padding: '6px 0', border: `1px solid ${bgType === key ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 8, background: bgType === key ? 'var(--primary-bg)' : 'transparent',
            color: bgType === key ? 'var(--primary)' : 'var(--text2)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          }}>
            {label}
          </button>
        ))}
      </div>

      {bgType === 'solid' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={bgSolidColor} onChange={e => setBgSolidColor(e.target.value)}
            style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'monospace' }}>{bgSolidColor}</span>
        </div>
      )}

      {bgType === 'image' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={bgImageName} onChange={e => { setBgImageName(e.target.value); loadBg(e.target.value) }}
              className="input-field" style={{ flex: 1, cursor: 'pointer' }}>
              {bgOptions.length === 0 && <option value="">이미지 없음 (업로드하세요)</option>}
              {bgOptions.map(n => <option key={n} value={n}>🖼 {n}</option>)}
            </select>
            <button onClick={() => bgFileInputRef.current?.click()} className="btn-outlined"
              style={{ padding: '6px 12px', fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer' }}>
              📤 업로드
            </button>
            <input ref={bgFileInputRef} type="file" accept=".png,.jpg,.jpeg,.webp" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
          </div>
          {bgUploadMsg && (
            <div style={{ fontSize: 13, color: bgUploadMsg.startsWith('✓') ? 'var(--success)' : bgUploadMsg === '업로드 중...' ? 'var(--primary)' : 'var(--error)', fontWeight: 600 }}>
              {bgUploadMsg}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
