import { useState, useEffect, useRef, useCallback } from 'react'
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

const TMPL_COLORS: Record<string, Record<number, { bg: string; div: string }>> = {
  sports:   { 1: { bg: '#0d0d0d', div: '#FFD700' }, 2: { bg: '#f5f5f5', div: '#DAA520' }, 3: { bg: '#1a1a0d', div: '#FFD700' } },
  economy:  { 1: { bg: '#0a0f0a', div: '#00E676' }, 2: { bg: '#f5f5f5', div: '#00897B' }, 3: { bg: '#0d1b2a', div: '#00E676' } },
  politics: { 1: { bg: '#0d0505', div: '#FF3D3D' }, 2: { bg: '#f5f5f5', div: '#CC0000' }, 3: { bg: '#111111', div: '#FF3D3D' } },
}

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
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>자막 편집</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { const last = entries.length ? parseInt(entries[entries.length-1].index)+1 : 1; setEntries([...entries, { index: String(last), times: '00:00:00,000 --> 00:00:00,000', text: '' }]) }}
              className="btn-outlined" style={{ padding: '5px 12px', fontSize: 12 }}>+ 추가</button>
            <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '5px 14px', fontSize: 12 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
            <button onClick={onClose} className="btn-outlined" style={{ padding: '5px 10px', fontSize: 12 }}>✕</button>
          </div>
        </div>
        <div style={{ padding: '8px 20px', fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
          시간: 00:00:00,000 → 00:00:00,000 형식 / 저장 후 다음 렌더링에 반영
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>로딩 중...</p>
            : entries.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>자막 생성 단계를 먼저 실행하세요.</p>
            : entries.map((e, i) => (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 20 }}>{e.index}</span>
                    <input value={e.times} onChange={ev => { const u = [...entries]; u[i] = { ...e, times: ev.target.value }; setEntries(u) }}
                      className="input-field" style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', padding: '3px 6px' }} />
                    <button onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>
                  <textarea value={e.text} rows={2} onChange={ev => { const u = [...entries]; u[i] = { ...e, text: ev.target.value }; setEntries(u) }}
                    className="input-field" style={{ fontSize: 13, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
              ))
          }
        </div>
        {msg && <div style={{ padding: '8px 20px', fontSize: 12, color: msg.startsWith('✓') ? 'var(--success)' : 'var(--error)', borderTop: '1px solid var(--border)' }}>{msg}</div>}
      </div>
    </div>
  )
}

function CategoryBadge({ cat }: { cat: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    sports:   { bg: '#e8f0fe', color: '#1a73e8', label: '스포츠' },
    economy:  { bg: '#e6f4ea', color: '#34a853', label: '경제' },
    politics: { bg: '#fce8e6', color: '#ea4335', label: '정치' },
  }
  const s = map[cat]
  if (!s) return null
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: s.bg, color: s.color }}>{s.label}</span>
}

export default function ShortsPanel({
  activeTab, onTabChange, raws, shorts,
  selectedRaw, selectedShort, onSelectRaw, onSelectShort,
  onRefresh, onStartPolling, isMobile = false,
}: Props) {
  const [uploadTarget, setUploadTarget] = useState<ShortInfo | null>(null)

  const deleteShort = async (fn: string, e: React.MouseEvent) => {
    e.stopPropagation(); if (!confirm('삭제?')) return
    await api.deleteShort(fn); onRefresh()
  }

  const deleteRaw = async (fn: string, e: React.MouseEvent) => {
    e.stopPropagation(); if (!confirm('삭제?')) return
    await api.deleteRaw(fn)
    if (selectedRaw?.filename === fn) onSelectRaw(null)
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

        {/* 편집/플레이어 — fixed 전체화면 오버레이 */}
        {mobileShowEdit && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'var(--bg)', overflowY: 'auto' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
              <button onClick={() => onSelectRaw(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--primary)', lineHeight: 1, padding: '0 4px 0 0' }}>
                ←
              </button>
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRaw?.title || '편집'}</span>
              <CategoryBadge cat={selectedRaw?.category || ''} />
            </div>
            <RawEditArea raw={selectedRaw} onStartPolling={onStartPolling} isMobile />
          </div>
        )}

        {mobileShowPlayer && selectedShort && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: '#111', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
              <button onClick={() => onSelectShort(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'white', lineHeight: 1, padding: '0 4px 0 0' }}>
                ←
              </button>
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'white' }}>
                {selectedShort.title || selectedShort.filename}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <a href={selectedShort.url} download={selectedShort.filename}
                  style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', textDecoration: 'none' }}>⬇</a>
                <button onClick={() => setUploadTarget(selectedShort)}
                  style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, background: '#ea4335', color: 'white', border: 'none', cursor: 'pointer' }}>YT</button>
                <button onClick={async e => { await deleteShort(selectedShort.filename, e); onSelectShort(null) }}
                  style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}>삭제</button>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div style={{ aspectRatio: '9/16', maxHeight: '100%', width: 'auto', background: '#000', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.5)' }}>
                <video key={selectedShort.url} src={selectedShort.url} controls autoPlay style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
              </div>
            </div>
          </div>
        )}

        {/* 리스트 — 자연 스크롤 */}
        <div style={{ background: 'var(--bg)' }}>
          {/* 탭 */}
          <div style={{ display: 'flex', background: 'white', borderBottom: '1px solid var(--border)', position: 'sticky', top: 52, zIndex: 50 }}>
            {(['raws', 'shorts'] as const).map(tab => (
              <button key={tab} onClick={() => onTabChange(tab)} style={{
                flex: 1, padding: '13px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                color: activeTab === tab ? 'var(--primary)' : 'var(--text2)',
                borderBottom: `3px solid ${activeTab === tab ? 'var(--primary)' : 'transparent'}`,
                transition: 'color .15s',
              }}>{tab === 'raws' ? '✂️ 영상 편집' : '🎬 완성 쇼츠'}</button>
            ))}
          </div>

          {/* RAW 목록 */}
          {activeTab === 'raws' && (
            <div style={{ background: 'white' }}>
              {raws.length === 0
                ? <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.3 }}>🎞</div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>편집된 영상 없음</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>파이프라인에서 영상 편집을 실행하세요</p>
                  </div>
                : raws.map(r => (
                    <div key={r.filename} onClick={() => onSelectRaw(r)} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '16px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      background: 'white',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: '#e8eaed', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                        ✂️
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title || r.filename}
                        </div>
                        <CategoryBadge cat={r.category} />
                      </div>
                      <button onClick={e => deleteRaw(r.filename, e)}
                        style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
                      <span style={{ color: '#bdc1c6', fontSize: 22, flexShrink: 0 }}>›</span>
                    </div>
                  ))
              }
            </div>
          )}

          {/* SHORTS 목록 */}
          {activeTab === 'shorts' && (
            <div style={{ background: 'white' }}>
              {shorts.length === 0
                ? <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.3 }}>🎬</div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>완성된 쇼츠 없음</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>편집실에서 렌더링을 실행하세요</p>
                  </div>
                : shorts.map(s => (
                    <div key={s.filename} onClick={() => onSelectShort(s)} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      background: 'white',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                      <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: '#202124', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                        <video src={`${s.url}#t=1`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title || s.filename}
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>탭하여 재생 ▶</span>
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
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            color: activeTab === tab ? 'var(--primary)' : 'var(--text2)',
            borderBottom: `2px solid ${activeTab === tab ? 'var(--primary)' : 'transparent'}`,
            marginBottom: -1, transition: 'color .15s',
          }}>{tab === 'raws' ? '영상 편집' : '완성 쇼츠'}</button>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ─── RAW 탭 ─── */}
        {activeTab === 'raws' && (
          <>
            <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface2)' }}>
              <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                편집된 영상
                <span style={{ background: 'var(--primary)', color: 'white', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{raws.length}</span>
              </div>
              {raws.length === 0
                ? <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.4 }}>🎞</div>
                    <p style={{ fontSize: 11 }}>영상 편집 후 표시됩니다</p>
                  </div>
                : raws.map(r => (
                    <div key={r.filename} onClick={() => onSelectRaw(r)} style={{
                      padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${selectedRaw?.filename === r.filename ? 'var(--primary)' : 'transparent'}`,
                      background: selectedRaw?.filename === r.filename ? 'var(--primary-bg)' : 'transparent',
                      transition: 'background .15s',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.title || r.filename}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CategoryBadge cat={r.category} />
                        <button onClick={e => deleteRaw(r.filename, e)}
                          style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', marginLeft: 'auto' }}>삭제</button>
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
            <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface2)' }}>
              <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                완성 쇼츠
                <span style={{ background: 'var(--primary)', color: 'white', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{shorts.length}</span>
              </div>
              {shorts.length === 0
                ? <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.4 }}>🎬</div>
                    <p style={{ fontSize: 11 }}>렌더링 후 표시됩니다</p>
                  </div>
                : shorts.map(s => (
                    <div key={s.filename} onClick={() => onSelectShort(s)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${selectedShort?.filename === s.filename ? 'var(--primary)' : 'transparent'}`,
                      background: selectedShort?.filename === s.filename ? 'var(--primary-bg)' : 'transparent',
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', background: '#202124', flexShrink: 0 }}>
                        <video src={`${s.url}#t=1`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title || s.filename}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <a href={s.url} download={s.filename} onClick={e => e.stopPropagation()}
                            className="btn-outlined" style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>다운</a>
                          <button onClick={e => { e.stopPropagation(); setUploadTarget(s) }}
                            style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fce8e6', color: 'var(--error)', border: '1px solid #f28b82', cursor: 'pointer' }}>YT</button>
                          <button onClick={e => deleteShort(s.filename, e)}
                            style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', marginLeft: 'auto' }}>삭제</button>
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
                    <p style={{ fontSize: 13 }}>쇼츠를 선택하세요</p>
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
  const [titleScale, setTitleScale] = useState(1.0)
  const [subtitles, setSubtitles]   = useState(false)
  const [subSize,   setSubSize]     = useState(52)
  const [subColor,  setSubColor]    = useState('#FFFFFF')
  const [subY,      setSubY]        = useState(20)
  const [channelName, setChannelName] = useState('')
  const [bgOptions, setBgOptions]   = useState<string[]>([])
  const [bgImage,   setBgImage]     = useState('')
  const [templateId, setTemplateId] = useState(1)
  // 캡컷 스타일 색감/음량 보정 — brightness: -1~1, contrast/saturation/volume: 0~3 (1=원본)
  const [brightness, setBrightness] = useState(0)
  const [contrast,   setContrast]   = useState(1)
  const [saturation, setSaturation] = useState(1)
  const [volume,     setVolume]     = useState(1)
  const [narration, setNarration]   = useState(false)
  const [narrVoice, setNarrVoice]   = useState('female')
  const [isRendering, setIsRendering] = useState(false)
  const [renderMsg, setRenderMsg]   = useState('')
  const [showSrt, setShowSrt]       = useState(false)

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const hidVidRef  = useRef<HTMLVideoElement>(null)
  const rafRef     = useRef<number>(0)
  const [isPlaying, setIsPlaying] = useState(true)

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

  useEffect(() => {
    if (!raw) return
    const parts = raw.title.split(' / ')
    setTitle1(parts[0] || ''); setTitle2(parts[1] || ''); setChannelName(''); setRenderMsg('')
    if (bgOptions.includes(raw.category)) { setBgImage(raw.category); loadBg(raw.category) }
    else setBgImage('')
  }, [raw?.filename])

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
      const colors = (TMPL_COLORS[cat] || TMPL_COLORS.economy)[templateId] || { bg: '#0a0f0a', div: '#00E676' }
      const bgImg = bgCache[bgImage]
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) ctx.drawImage(bgImg, 0, 0, CV_W, CV_H)
      else { ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, CV_W, CV_H) }

      if (vid.readyState >= 2) {
        // 캡컷 스타일 색감 보정 미리보기 — 실제 렌더링은 서버에서 ffmpeg eq 필터로 적용된다
        ctx.filter = `brightness(${1 + brightness}) contrast(${contrast}) saturate(${saturation})`
        ctx.drawImage(vid, 0, VID_Y_PX, CV_W, VID_H_PX)
        ctx.filter = 'none'
      }
      ctx.fillStyle = colors.div
      ctx.fillRect(0, VID_Y_PX, CV_W, Math.max(1, Math.round(4*SCALE)))
      ctx.fillRect(0, VID_Y_PX+VID_H_PX-Math.max(1, Math.round(4*SCALE)), CV_W, Math.max(1, Math.round(4*SCALE)))

      const lines = [{ t: title1, c: t1Color }, { t: title2, c: t2Color }].filter(l => l.t.trim())
      if (lines.length) {
        const maxLen = Math.max(...lines.map(l => l.t.length))
        let sz = maxLen<=7?115:maxLen<=10?101:maxLen<=13?86:maxLen<=16?72:62
        sz = Math.max(8, Math.round(sz * titleScale * SCALE))
        const lineH = sz + Math.round(20*SCALE)
        const yCenter = Math.round((555/2+140+titleY)*SCALE)
        const startY = yCenter - (lines.length*lineH)/2
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        lines.forEach((line, i) => {
          ctx.font = `900 ${sz}px 'Malgun Gothic','Apple SD Gothic Neo',sans-serif`
          ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 3
          ctx.fillStyle = line.c; ctx.fillText(line.t, CV_W/2, startY+i*lineH)
        })
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
      }
      if (subtitles) {
        const sz = Math.round(subSize*SCALE)
        const sY = VID_Y_PX+VID_H_PX-Math.round(subY*SCALE)-sz-4
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.font = `bold ${sz}px 'Malgun Gothic',sans-serif`
        const tw = ctx.measureText('자막 샘플').width+8
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(CV_W/2-tw/2,sY-2,tw,sz+4)
        ctx.fillStyle = subColor; ctx.fillText('자막 샘플', CV_W/2, sY)
      }
      const channel = channelName.trim()
      if (channel) {
        const sz = Math.round(36*SCALE)
        const bottomH = CV_H - (VID_Y_PX + VID_H_PX)
        const cY = VID_Y_PX + VID_H_PX + Math.round((bottomH - sz) / 2)
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.font = `bold ${sz}px 'Malgun Gothic',sans-serif`
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.fillText(channel, CV_W/2, cY)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [raw?.filename, title1, title2, t1Color, t2Color, titleY, titleScale, subtitles, subSize, subColor, subY, channelName, bgImage, templateId, brightness, contrast, saturation])

  // 음량 조절 — 미리듣기 영상에 즉시 반영 (HTML 비디오는 0~1 범위만 지원하므로 100%까지만 미리듣기 가능, 그 이상은 렌더링 결과로 확인)
  useEffect(() => {
    const vid = hidVidRef.current
    if (vid) vid.volume = Math.max(0, Math.min(1, volume))
  }, [volume])

  const getStyle = (): StyleParams => ({
    title1_color: t1Color, title2_color: t2Color, title_y_extra: titleY,
    title_fontsize_scale: titleScale, sub_fontsize: subSize, sub_color: subColor, sub_margin_v: subY,
    channel_name: channelName.trim(),
    font_name: 'NanumSquareRoundEB',
    brightness, contrast, saturation, volume,
  })
  const getTitle = () => { const t1=title1.trim(),t2=title2.trim(); return t1&&t2?`${t1}\n${t2}`:(t1||t2||'') }

  const handlePreview = useCallback(async () => {
    if (!raw) return
    try {
      const blob = await api.preview(raw.filename, getTitle(), getStyle(), 2.0, bgImage)
      const url = URL.createObjectURL(blob)
      const modal = document.createElement('div')
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;'
      modal.onclick = () => { modal.remove(); URL.revokeObjectURL(url) }
      const img = document.createElement('img')
      img.src = url; img.style.cssText = 'max-height:90vh;max-width:90vw;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.4);'
      modal.appendChild(img); document.body.appendChild(modal)
    } catch { alert('미리보기 오류') }
  }, [raw, title1, title2, t1Color, t2Color, titleY, titleScale, bgImage, templateId])

  const handleRender = async () => {
    if (!raw || isRendering) return
    setIsRendering(true); setRenderMsg('')
    try {
      await api.render(raw.filename, getTitle(), subtitles, templateId, getStyle(), bgImage, narration, narrVoice)
      setRenderMsg(narration ? '✓ 나레이션 버전 렌더링 시작' : '✓ 렌더링 시작 — 완성 쇼츠 탭에서 확인')
      onStartPolling()
    } catch { setRenderMsg('오류가 발생했습니다') }
    finally { setIsRendering(false) }
  }

  // 모바일: 세로 스택 (캔버스 → 컨트롤)
  // 데스크톱: 가로 분할 (280px 미리보기 | flex 컨트롤)
  if (isMobile) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
        <video ref={hidVidRef} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }} playsInline />
        {!raw
          ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 8 }}>
              <div style={{ fontSize: 40, opacity: 0.15 }}>🎬</div>
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>목록에서 영상을 선택하세요</p>
            </div>
          : <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* 캔버스 미리보기 — 전체 너비 */}
              <div style={{ background: 'var(--surface2)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative', width: '60%', maxWidth: 200, borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                  <canvas ref={canvasRef} width={CV_W} height={CV_H}
                    style={{ display: 'block', width: '100%', aspectRatio: '9/16' }} />
                  <button onClick={togglePlay} aria-label={isPlaying ? '일시정지' : '재생'} style={{
                    position: 'absolute', bottom: 8, right: 8, width: 30, height: 30, borderRadius: '50%',
                    border: 'none', background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                </div>
                <button onClick={handlePreview} className="btn-outlined" style={{ width: '60%', maxWidth: 200, padding: '7px 0', fontSize: 12 }}>
                  🔍 고화질 미리보기
                </button>
              </div>

              {/* 컨트롤 */}
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
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
                      <Slider label="크기" value={titleScale} display={`${titleScale.toFixed(1)}×`} min={0.5} max={1.8} step={0.1} onChange={setTitleScale} />
                    </div>
                  </div>
                </div>

                {/* 자막 */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="section-label" style={{ margin: 0 }}>자막</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => setShowSrt(true)} className="btn-outlined" style={{ padding: '4px 10px', fontSize: 11 }}>✏️ 편집</button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={subtitles} onChange={e => setSubtitles(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                        자동 삽입
                      </label>
                    </div>
                  </div>
                  {subtitles && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end' }}>
                      <Slider label="크기" value={subSize} display={`${subSize}px`} min={16} max={80} step={2} onChange={setSubSize} />
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>색상</div>
                        <input type="color" value={subColor} onChange={e => setSubColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                      </div>
                      <Slider label="하단 여백" value={subY} display={`${subY}px`} min={5} max={120} step={5} onChange={setSubY} />
                    </div>
                  )}
                </div>

                {/* 출처 채널명 */}
                <div>
                  <div className="section-label">출처 채널명 (영상 하단)</div>
                  <input value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="예: 채널명 / 출처: ○○뉴스" className="input-field" />
                </div>

                {/* 배경 */}
                <div>
                  <div className="section-label">배경 이미지</div>
                  <select value={bgImage} onChange={e => { setBgImage(e.target.value); if (e.target.value) loadBg(e.target.value) }}
                    className="input-field" style={{ cursor: 'pointer' }}>
                    <option value="">단색 배경</option>
                    {bgOptions.map(n => <option key={n} value={n}>🖼 {n}.png</option>)}
                  </select>
                </div>

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
                      <span style={{ fontWeight: 600, fontSize: 13 }}>나레이션</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={narration} onChange={e => setNarration(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                      포함
                    </label>
                  </div>
                  {narration && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>AI 분석 요약을 TTS로 변환해 도입부에 삽입합니다.</p>
                      <select value={narrVoice} onChange={e => setNarrVoice(e.target.value)} className="input-field" style={{ cursor: 'pointer', fontSize: 12 }}>
                        <option value="female">여성 (SunHi)</option>
                        <option value="male">남성 (InJoon)</option>
                      </select>
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
                  <div style={{ fontSize: 12, color: renderMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)', padding: '6px 10px', background: renderMsg.startsWith('✓') ? '#e6f4ea' : '#fce8e6', borderRadius: 6, border: `1px solid ${renderMsg.startsWith('✓') ? '#81c995' : '#f28b82'}` }}>
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

      {/* 왼쪽: 캔버스 미리보기 */}
      <div style={{ width: 420, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface2)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>실시간 미리보기</span>
          {raw && <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>{raw.category}</span>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {raw ? (
            <>
              <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                <canvas ref={canvasRef} width={CV_W} height={CV_H}
                  style={{ display: 'block', width: '100%', aspectRatio: '9/16', imageRendering: 'auto' }} />
                <button onClick={togglePlay} aria-label={isPlaying ? '일시정지' : '재생'} style={{
                  position: 'absolute', bottom: 10, right: 10, width: 34, height: 34, borderRadius: '50%',
                  border: 'none', background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                  {isPlaying ? '⏸' : '▶'}
                </button>
              </div>

              <details style={{ width: '100%' }} open={false}>
                <summary style={{ fontSize: 11, color: 'var(--text2)', cursor: 'pointer', padding: '4px 2px', userSelect: 'none' }}>▸ 원본 영상</summary>
                <div style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                  <video key={raw.url} src={raw.url} controls style={{ width: '100%', maxHeight: 180, display: 'block' }} />
                </div>
              </details>

              <button onClick={handlePreview} className="btn-outlined" style={{ width: '100%', padding: '7px 0' }}>
                🔍 정밀 미리보기 (고화질)
              </button>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 10, padding: 20, minHeight: 300 }}>
              <div style={{ fontSize: 40, opacity: 0.15 }}>🎬</div>
              <p style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.6, color: 'var(--text2)' }}>왼쪽 목록에서<br/>영상을 선택하세요</p>
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽: 편집 컨트롤 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {!raw
          ? <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 8 }}>
              <div style={{ fontSize: 32, opacity: 0.3 }}>✏️</div>
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>영상을 선택하면 편집 옵션이 나타납니다</p>
            </div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              <p style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
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
                    <Slider label="크기" value={titleScale} display={`${titleScale.toFixed(1)}×`} min={0.5} max={1.8} step={0.1} onChange={setTitleScale} />
                  </div>
                </div>
              </div>

              {/* 자막 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="section-label" style={{ margin: 0 }}>자막</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setShowSrt(true)} className="btn-outlined" style={{ padding: '4px 10px', fontSize: 11 }}>✏️ 자막 편집</button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={subtitles} onChange={e => setSubtitles(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                      자동 삽입
                    </label>
                  </div>
                </div>
                {subtitles && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end' }}>
                    <Slider label="크기" value={subSize} display={`${subSize}px`} min={16} max={80} step={2} onChange={setSubSize} />
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>색상</div>
                      <input type="color" value={subColor} onChange={e => setSubColor(e.target.value)} style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                    </div>
                    <Slider label="하단 여백" value={subY} display={`${subY}px`} min={5} max={120} step={5} onChange={setSubY} />
                  </div>
                )}
              </div>

              {/* 출처 채널명 */}
              <div>
                <div className="section-label">출처 채널명 (영상 하단)</div>
                <input value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="예: 채널명 / 출처: ○○뉴스" className="input-field" />
              </div>

              {/* 배경 */}
              <div>
                <div className="section-label">배경 이미지</div>
                <select value={bgImage} onChange={e => { setBgImage(e.target.value); if (e.target.value) loadBg(e.target.value) }}
                  className="input-field" style={{ cursor: 'pointer' }}>
                  <option value="">단색 배경 (템플릿 색상)</option>
                  {bgOptions.map(n => <option key={n} value={n}>🖼 {n}.png</option>)}
                </select>
              </div>

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
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>나레이션</span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={narration} onChange={e => setNarration(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                    포함
                  </label>
                </div>
                {narration && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>AI 분석의 요약문을 TTS로 변환해 영상 도입부에 삽입합니다.</p>
                    <select value={narrVoice} onChange={e => setNarrVoice(e.target.value)} className="input-field" style={{ cursor: 'pointer', fontSize: 12 }}>
                      <option value="female">여성 목소리 (SunHi)</option>
                      <option value="male">남성 목소리 (InJoon)</option>
                    </select>
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
                <div style={{ fontSize: 12, color: renderMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)', padding: '6px 10px', background: renderMsg.startsWith('✓') ? '#e6f4ea' : '#fce8e6', borderRadius: 6, border: `1px solid ${renderMsg.startsWith('✓') ? '#81c995' : '#f28b82'}` }}>
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
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
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

function Slider({ label, value, display, min, max, step, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--primary)' }} />
    </div>
  )
}
