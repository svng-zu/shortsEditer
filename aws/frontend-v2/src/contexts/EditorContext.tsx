import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react'
import { api, RawInfo, ShortInfo, StyleParams, getSessionId } from '../services/api'

/* ── Types ── */

export interface TextOverlay {
  id: string; text: string; x_pct: number; y_pct: number
  font_size: number; font_color: string; font_name: string
  start_time: number; end_time: number
  border_width: number; border_color: string
  bg_enabled: boolean; bg_color: string; bg_opacity: number
}

export interface SubEntry {
  index: number; start: number; end: number; text: string
}

export interface SfxEntry {
  time: number; sfx_id: string; volume: number
}

export interface SfxItem {
  id: string; file: string; description: string
}

/* ── Title state ── */
export interface TitleState {
  title1: string; title2: string
  t1Color: string; t2Color: string
  titleY: number; titleFontSizeDelta: number; titleFont: string
  title1BorderWidth: number; title2BorderWidth: number
  title1BorderColor: string; title2BorderColor: string
  title1BgEnabled: boolean; title1BgColor: string; title1BgOpacity: number
  title2BgEnabled: boolean; title2BgColor: string; title2BgOpacity: number
}

/* ── Subtitle state ── */
export interface SubtitleState {
  enabled: boolean; size: number; color: string; x: number; y: number; font: string
  bgEnabled: boolean; bgColor: string; bgOpacity: number
}

/* ── Channel overlay ── */
export interface ChannelState {
  name: string; color: string; x: number; y: number; fontsize: number
  imageUrl: string; topLeftText: string; topLeftColor: string
  topLeftFontsize: number; topLeftX: number; topLeftY: number
}

/* ── Background state ── */
export interface BgState {
  type: 'blur' | 'solid' | 'image'
  solidColor: string; imageName: string; options: string[]
  templateId: number
}

/* ── Narration state ── */
export interface NarrationState {
  enabled: boolean; volume: number; videoVolume: number
  voice: string; speed: number; mode: 'title' | 'script'
  script: string; scriptMode: 'summary' | 'style_convert'
}

/* ── SFX & Hook ── */
export interface HookSfxState {
  useHook: boolean; hookSfxId: string | null
  hookSfxOffset: number; hookSfxVolume: number
  customSfx: SfxEntry[]; sfxList: SfxItem[]
}

/* ── Render state ── */
export interface RenderState {
  isRendering: boolean; message: string
  isGeneratingScript: boolean; genScriptMsg: string
  isGeneratingNarrSubs: boolean; genNarrSubsMsg: string
}

// ── Font options (matching editor_base.py FONT_MAP) ──
export const SUB_FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'NanumSquareRoundEB', label: '나눔스퀘어라운드 ExtraBold' },
  { value: 'NanumSquareRoundB', label: '나눔스퀘어라운드 Bold' },
  { value: 'NanumSquareRoundR', label: '나눔스퀘어라운드 Regular' },
  { value: 'NanumSquareEB', label: '나눔스퀘어 ExtraBold' },
  { value: 'NanumSquareB', label: '나눔스퀘어 Bold' },
  { value: 'NanumGothicExtraBold', label: '나눔고딕 ExtraBold' },
  { value: 'NanumGothicBold', label: '나눔고딕 Bold' },
  { value: 'NanumGothic', label: '나눔고딕' },
  { value: 'NanumBarunGothicBold', label: '나눔바른고딕 Bold' },
  { value: 'NanumMyeongjoExtraBold', label: '나눔명조 ExtraBold' },
  { value: 'NanumMyeongjoBold', label: '나눔명조 Bold' },
  { value: 'NanumBrush', label: '나눔 붓체' },
  { value: 'NanumPen', label: '나눔 펜체' },
  { value: 'BlackHanSans', label: '검은고딕 (Black Han Sans)' },
  { value: 'NotoSerifKRBold', label: 'Noto Serif KR Bold' },
  { value: 'NotoSansKRBold', label: 'Noto Sans KR Bold' },
]

export const NARRATION_VOICE_GROUPS = [
  { group: 'ElevenLabs (멀티링구얼)', options: [
    { value: 'el-rachel', label: 'Rachel (여성)' },
    { value: 'el-sarah', label: 'Sarah (여성)' },
    { value: 'el-charlotte', label: 'Charlotte (여성)' },
    { value: 'el-adam', label: 'Adam (남성)' },
    { value: 'el-antoni', label: 'Antoni (남성)' },
  ]},
  { group: 'Chirp3 HD - 여성', options: [
    { value: 'ko-KR-Chirp3-HD-Aoede', label: 'Aoede' },
    { value: 'ko-KR-Chirp3-HD-Kore', label: 'Kore' },
    { value: 'ko-KR-Chirp3-HD-Leda', label: 'Leda' },
    { value: 'ko-KR-Chirp3-HD-Zephyr', label: 'Zephyr' },
  ]},
  { group: 'Chirp3 HD - 남성', options: [
    { value: 'ko-KR-Chirp3-HD-Achird', label: 'Achird' },
    { value: 'ko-KR-Chirp3-HD-Fenrir', label: 'Fenrir' },
    { value: 'ko-KR-Chirp3-HD-Puck', label: 'Puck' },
    { value: 'ko-KR-Chirp3-HD-Schedar', label: 'Schedar' },
  ]},
  { group: 'Neural2', options: [
    { value: 'ko-KR-Neural2-A', label: '여성 A' },
    { value: 'ko-KR-Neural2-B', label: '여성 B' },
    { value: 'ko-KR-Neural2-C', label: '남성' },
  ]},
  { group: 'WaveNet', options: [
    { value: 'ko-KR-Wavenet-A', label: '여성 A' },
    { value: 'ko-KR-Wavenet-B', label: '여성 B' },
    { value: 'ko-KR-Wavenet-C', label: '남성 A' },
    { value: 'ko-KR-Wavenet-D', label: '남성 B' },
  ]},
]

// Canvas constants (9:16 at 270x480 preview)
export const CV_W = 360, CV_H = 640
export const SCALE = CV_W / 1080
export const VID_Y_PX = Math.round(555 * SCALE)
export const VID_H_PX = Math.round(810 * SCALE)

export const TMPL_COLORS: Record<string, Record<number, { bg: string }>> = {
  sports:   { 1: { bg: '#0d0d0d' }, 2: { bg: '#f5f5f5' }, 3: { bg: '#1a1a0d' } },
  economy:  { 1: { bg: '#0a0f0a' }, 2: { bg: '#f5f5f5' }, 3: { bg: '#0d1b2a' } },
  politics: { 1: { bg: '#0d0505' }, 2: { bg: '#f5f5f5' }, 3: { bg: '#111111' } },
}

/* ── Context Value ── */
interface EditorContextValue {
  // Selection
  activeTab: 'raws' | 'shorts'
  setActiveTab: (t: 'raws' | 'shorts') => void
  raws: RawInfo[]; shorts: ShortInfo[]
  selectedRaw: RawInfo | null; selectedShort: ShortInfo | null
  setSelectedRaw: (r: RawInfo | null) => void
  setSelectedShort: (s: ShortInfo | null) => void
  refreshLists: () => void

  // Title
  title: TitleState; setTitle: React.Dispatch<React.SetStateAction<TitleState>>
  // Subtitle
  subtitle: SubtitleState; setSubtitle: React.Dispatch<React.SetStateAction<SubtitleState>>
  // Channel
  channel: ChannelState; setChannel: React.Dispatch<React.SetStateAction<ChannelState>>
  // Background
  bg: BgState; setBg: React.Dispatch<React.SetStateAction<BgState>>
  // Narration
  narr: NarrationState; setNarr: React.Dispatch<React.SetStateAction<NarrationState>>
  // Hook/SFX
  hookSfx: HookSfxState; setHookSfx: React.Dispatch<React.SetStateAction<HookSfxState>>
  // Render
  render: RenderState; setRender: React.Dispatch<React.SetStateAction<RenderState>>
  // Text overlays
  textOverlays: TextOverlay[]; setTextOverlays: React.Dispatch<React.SetStateAction<TextOverlay[]>>
  // Subtitle entries
  subEntries: SubEntry[]; setSubEntries: React.Dispatch<React.SetStateAction<SubEntry[]>>
  // SRT modal
  showSrt: boolean; setShowSrt: (v: boolean) => void

  // Canvas refs
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  hidVidRef: React.RefObject<HTMLVideoElement | null>
  hookVidRef: React.RefObject<HTMLVideoElement | null>
  narrAudioRef: React.RefObject<HTMLAudioElement | null>
  isPlaying: boolean; togglePlay: () => void
  videoDuration: number; setVideoDuration: (d: number) => void

  // Actions
  handleRender: () => Promise<void>
  handleGenerateScript: () => Promise<void>
  handleGenerateNarrSubs: () => Promise<void>
  handleNarrationPreview: () => Promise<void>
  getStyleParams: () => StyleParams
}

const EditorContext = createContext<EditorContextValue | null>(null)

/* ── Provider ── */
export function EditorProvider({ children }: { children: ReactNode }) {
  // Selection
  const [activeTab, setActiveTab] = useState<'raws' | 'shorts'>('raws')
  const [raws, setRaws] = useState<RawInfo[]>([])
  const [shorts, setShorts] = useState<ShortInfo[]>([])
  const [selectedRaw, setSelectedRaw] = useState<RawInfo | null>(null)
  const [selectedShort, setSelectedShort] = useState<ShortInfo | null>(null)

  // Grouped states
  const [title, setTitle] = useState<TitleState>({
    title1: '', title2: '', t1Color: '#FFD700', t2Color: '#FFFFFF',
    titleY: 0, titleFontSizeDelta: 0, titleFont: 'NanumSquareRoundEB',
    title1BorderWidth: 3, title2BorderWidth: 3,
    title1BorderColor: '#000000', title2BorderColor: '#000000',
    title1BgEnabled: false, title1BgColor: '#000000', title1BgOpacity: 0.6,
    title2BgEnabled: false, title2BgColor: '#000000', title2BgOpacity: 0.6,
  })

  const [subtitle, setSubtitle] = useState<SubtitleState>({
    enabled: true, size: 52, color: '#FFFFFF', x: 0, y: 20, font: 'NanumSquareRoundEB',
    bgEnabled: false, bgColor: '#000000', bgOpacity: 0.6,
  })

  const [channel, setChannel] = useState<ChannelState>({
    name: '', color: '#FFFFFF', x: 0, y: 0, fontsize: 36,
    imageUrl: '', topLeftText: '', topLeftColor: '#FFFFFF',
    topLeftFontsize: 32, topLeftX: 16, topLeftY: 16,
  })

  const [bg, setBg] = useState<BgState>({
    type: 'blur', solidColor: '#1A1A1A', imageName: '', options: [], templateId: 1,
  })

  const [narr, setNarr] = useState<NarrationState>({
    enabled: false, volume: 1.2, videoVolume: 0.3,
    voice: 'ko-KR-Neural2-A', speed: 1.0, mode: 'title',
    script: '', scriptMode: 'summary',
  })

  const [hookSfx, setHookSfx] = useState<HookSfxState>({
    useHook: false, hookSfxId: null, hookSfxOffset: 0, hookSfxVolume: 0.8,
    customSfx: [], sfxList: [],
  })

  const [render, setRender] = useState<RenderState>({
    isRendering: false, message: '',
    isGeneratingScript: false, genScriptMsg: '',
    isGeneratingNarrSubs: false, genNarrSubsMsg: '',
  })

  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([])
  const [subEntries, setSubEntries] = useState<SubEntry[]>([])
  const [showSrt, setShowSrt] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [videoDuration, setVideoDuration] = useState(0)

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hidVidRef = useRef<HTMLVideoElement>(null)
  const hookVidRef = useRef<HTMLVideoElement>(null)
  const narrAudioRef = useRef<HTMLAudioElement>(null)

  // Fetch lists
  const refreshLists = useCallback(async () => {
    try {
      const [rawRes, shortRes] = await Promise.all([api.getRaws(), api.getShorts()])
      setRaws(rawRes.raws)
      setShorts(shortRes.shorts)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refreshLists() }, [refreshLists])

  // Load SFX list
  useEffect(() => {
    api.getSfxList().then(res => setHookSfx(prev => ({ ...prev, sfxList: res.sfx })))
      .catch(() => {})
  }, [])

  // Load backgrounds
  useEffect(() => {
    api.getBackgrounds().then(res => setBg(prev => ({ ...prev, options: res.backgrounds })))
      .catch(() => {})
  }, [])

  // Init from selected raw
  useEffect(() => {
    if (!selectedRaw) return
    const r = selectedRaw
    const parts = (r.title || r.filename.replace(/_raw\.\w+$/, '')).split(' / ')
    setTitle(prev => ({
      ...prev,
      title1: parts[0] || '',
      title2: parts[1] || '',
    }))
    // Load subtitle entries
    const stem = r.filename.replace(/_raw\.\w+$/, '')
    api.getSubtitleEntries(stem).then(res => setSubEntries(res.entries.map((e, i) => ({ ...e, index: i })))).catch(() => setSubEntries([]))
  }, [selectedRaw])

  const togglePlay = useCallback(() => {
    const vid = hidVidRef.current
    if (!vid) return
    if (vid.paused) { vid.play(); setIsPlaying(true) }
    else { vid.pause(); setIsPlaying(false) }
  }, [])

  const getStyleParams = useCallback((): StyleParams => {
    return {
      title1_color: title.t1Color, title2_color: title.t2Color,
      title_y_extra: title.titleY, title_fontsize_delta: title.titleFontSizeDelta,
      title_font_name: title.titleFont,
      title1_border_width: title.title1BorderWidth, title2_border_width: title.title2BorderWidth,
      title1_border_color: title.title1BorderColor, title2_border_color: title.title2BorderColor,
      title1_bg_enabled: title.title1BgEnabled, title1_bg_color: title.title1BgColor, title1_bg_opacity: title.title1BgOpacity,
      title2_bg_enabled: title.title2BgEnabled, title2_bg_color: title.title2BgColor, title2_bg_opacity: title.title2BgOpacity,
      sub_fontsize: subtitle.size, sub_color: subtitle.color,
      sub_margin_v: subtitle.y, sub_margin_h: subtitle.x,
      sub_bg_enabled: subtitle.bgEnabled, sub_bg_color: subtitle.bgColor, sub_bg_opacity: subtitle.bgOpacity,
      channel_name: channel.name, channel_color: channel.color,
      channel_x: channel.x, channel_y: channel.y, channel_fontsize: channel.fontsize,
      channel_image_url: channel.imageUrl,
      channel_topleft_text: channel.topLeftText, channel_topleft_color: channel.topLeftColor,
      channel_topleft_fontsize: channel.topLeftFontsize,
      channel_topleft_x: channel.topLeftX, channel_topleft_y: channel.topLeftY,
      font_name: subtitle.font,
      narration_volume: narr.volume, narration_video_volume: narr.videoVolume,
    }
  }, [title, subtitle, channel, narr])

  const handleRender = useCallback(async () => {
    if (!selectedRaw) return
    setRender(prev => ({ ...prev, isRendering: true, message: '렌더링 시작...' }))
    try {
      const style = getStyleParams()
      await api.render(
        selectedRaw.filename,
        `${title.title1}\n${title.title2}`.trim(),
        subtitle.enabled,
        bg.templateId,
        style,
        bg.type === 'image' ? bg.imageName : undefined,
        bg.type === 'solid' ? bg.solidColor : undefined,
        narr.enabled, narr.voice, narr.mode, narr.speed,
        hookSfx.useHook, hookSfx.hookSfxId, hookSfx.hookSfxOffset, hookSfx.hookSfxVolume,
        hookSfx.customSfx.length > 0 ? hookSfx.customSfx : undefined,
        textOverlays.length > 0 ? textOverlays.map(o => ({
          time: o.start_time, end: o.end_time, text: o.text, color: o.font_color,
          x_pct: o.x_pct, y_pct: o.y_pct, size: o.font_size,
        })) : undefined,
      )
      setRender(prev => ({ ...prev, message: '렌더링 완료!' }))
      refreshLists()
    } catch (e: any) {
      setRender(prev => ({ ...prev, message: `렌더링 실패: ${e?.response?.data?.detail || e.message}` }))
    } finally {
      setRender(prev => ({ ...prev, isRendering: false }))
    }
  }, [selectedRaw, getStyleParams, refreshLists, title, subtitle, bg, narr, hookSfx, textOverlays])

  const handleGenerateScript = useCallback(async () => {
    if (!selectedRaw) return
    setRender(prev => ({ ...prev, isGeneratingScript: true, genScriptMsg: '' }))
    try {
      const stem = selectedRaw.filename.replace(/_raw\.\w+$/, '')
      const res = await api.generateScript(stem, narr.scriptMode)
      setNarr(prev => ({ ...prev, script: res.narration_script }))
      setRender(prev => ({ ...prev, genScriptMsg: '스크립트 생성 완료' }))
    } catch (e: any) {
      setRender(prev => ({ ...prev, genScriptMsg: `실패: ${e?.response?.data?.detail || e.message}` }))
    } finally {
      setRender(prev => ({ ...prev, isGeneratingScript: false }))
    }
  }, [selectedRaw, narr.scriptMode])

  const handleGenerateNarrSubs = useCallback(async () => {
    if (!selectedRaw) return
    setRender(prev => ({ ...prev, isGeneratingNarrSubs: true, genNarrSubsMsg: '' }))
    try {
      const stem = selectedRaw.filename.replace(/_raw\.\w+$/, '')
      await api.generateNarrationSubtitles(stem, narr.voice, narr.mode, narr.speed)
      setRender(prev => ({ ...prev, genNarrSubsMsg: '나레이션 자막 생성 완료' }))
    } catch (e: any) {
      setRender(prev => ({ ...prev, genNarrSubsMsg: `실패: ${e?.response?.data?.detail || e.message}` }))
    } finally {
      setRender(prev => ({ ...prev, isGeneratingNarrSubs: false }))
    }
  }, [selectedRaw, narr])

  const handleNarrationPreview = useCallback(async () => {
    if (!selectedRaw) return
    try {
      const stem = selectedRaw.filename.replace(/_raw\.\w+$/, '')
      const res = await api.narrationPreview(stem, narr.voice, narr.mode, narr.speed)
      if (narrAudioRef.current && res.audio) {
        const url = URL.createObjectURL(res.audio)
        narrAudioRef.current.src = url
        narrAudioRef.current.play()
      }
    } catch { /* ignore */ }
  }, [selectedRaw, narr])

  return (
    <EditorContext.Provider value={{
      activeTab, setActiveTab, raws, shorts,
      selectedRaw, selectedShort, setSelectedRaw, setSelectedShort, refreshLists,
      title, setTitle, subtitle, setSubtitle, channel, setChannel,
      bg, setBg, narr, setNarr, hookSfx, setHookSfx,
      render, setRender, textOverlays, setTextOverlays,
      subEntries, setSubEntries, showSrt, setShowSrt,
      canvasRef, hidVidRef, hookVidRef, narrAudioRef,
      isPlaying, togglePlay, videoDuration, setVideoDuration,
      handleRender, handleGenerateScript, handleGenerateNarrSubs, handleNarrationPreview,
      getStyleParams,
    }}>
      {children}
    </EditorContext.Provider>
  )
}

export function useEditor() {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used within EditorProvider')
  return ctx
}
