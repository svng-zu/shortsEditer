import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EditorProvider, useEditor } from '../../contexts/EditorContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import TitleControls from './left/TitleControls'
import StyleControls from './left/StyleControls'
import VoiceTextPanel from './left/VoiceTextPanel'
import SfxHookPanel from './left/SfxHookPanel'
import RenderButton from './left/RenderButton'
import VideoCanvas from './center/VideoCanvas'
import Timeline from './center/Timeline'
import MediaList from './right/MediaList'
import SrtPanel from './left/SrtPanel'
import SrtModal from './left/SrtModal'
import Icon from '../ui/Icon'

/* ── Mobile Overlay Panel ─────────────────────────────────── */

function MobileOverlayPanel({
  open,
  onClose,
  title,
  icon,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  icon: string
  children: React.ReactNode
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="relative w-full max-h-[70vh] bg-surface-container rounded-t-2xl border-t border-outline-variant/30 overflow-y-auto animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-surface-container/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 z-10">
          <div className="flex items-center gap-3">
            <Icon name={icon} size={22} className="text-primary" />
            <span className="text-title-md font-bold text-on-surface">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center"
          >
            <Icon name="close" size={20} className="text-on-surface-variant" />
          </button>
        </div>
        {/* Content */}
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}

/* ── Mobile Editor Layout ─────────────────────────────────── */

function MobileEditorLayout() {
  const { selectedRaw, setSelectedRaw } = useEditor()
  const [activePanel, setActivePanel] = useState<'style' | 'voice' | 'text' | null>(null)

  const togglePanel = (panel: 'style' | 'voice' | 'text') => {
    setActivePanel((prev) => (prev === panel ? null : panel))
  }

  // No raw selected: show media list full screen
  if (!selectedRaw) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px-64px)] overflow-hidden -m-6">
        <StatsBar />
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/20">
          <Icon name="movie" size={22} className="text-primary" />
          <span className="text-title-md font-bold text-on-surface">Shorts Gallery</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <MediaList />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px-64px)] overflow-hidden -m-6">
      {/* Back button header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-outline-variant/20 shrink-0">
        <button onClick={() => setSelectedRaw(null)} className="p-1.5 rounded-lg hover:bg-surface-bright/10">
          <Icon name="arrow_back" size={22} className="text-primary" />
        </button>
        <span className="text-label-md text-on-surface font-semibold truncate flex-1">
          {selectedRaw.title || selectedRaw.filename}
        </span>
      </div>

      {/* Video Canvas — full-screen centered */}
      <div className="flex-1 flex items-center justify-center relative px-2 py-2 overflow-hidden bg-surface-container-lowest min-h-0">
        <div className="relative w-full max-w-[280px] h-full flex items-center justify-center">
          {/* PREVIEW badge */}
          <div className="absolute top-2 left-2 z-20">
            <span className="bg-black/60 backdrop-blur-md text-primary text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-primary/20">
              PREVIEW
            </span>
          </div>
          <VideoCanvas />
        </div>

        {/* Floating action buttons — right side */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
          <button
            onClick={() => togglePanel('style')}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-colors ${
              activePanel === 'style'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high/90 text-on-surface-variant backdrop-blur-sm'
            }`}
          >
            <Icon name="palette" size={22} />
          </button>
          <button
            onClick={() => togglePanel('voice')}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-colors ${
              activePanel === 'voice'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high/90 text-on-surface-variant backdrop-blur-sm'
            }`}
          >
            <Icon name="record_voice_over" size={22} />
          </button>
          <button
            onClick={() => togglePanel('text')}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-colors ${
              activePanel === 'text'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high/90 text-on-surface-variant backdrop-blur-sm'
            }`}
          >
            <Icon name="title" size={22} />
          </button>
        </div>
      </div>

      {/* Bottom drawer: Render */}
      <div className="shrink-0 bg-surface-container/90 backdrop-blur-xl border-t border-outline-variant/30 px-4 py-3">
        {selectedRaw ? (
          <RenderButton />
        ) : (
          <MediaList />
        )}
      </div>

      {/* Overlay panels */}
      <MobileOverlayPanel
        open={activePanel === 'style'}
        onClose={() => setActivePanel(null)}
        title="Style"
        icon="palette"
      >
        <StyleControls />
      </MobileOverlayPanel>

      <MobileOverlayPanel
        open={activePanel === 'voice'}
        onClose={() => setActivePanel(null)}
        title="Voice & Text"
        icon="record_voice_over"
      >
        <VoiceTextPanel />
        <div className="mt-4">
          <SfxHookPanel />
        </div>
      </MobileOverlayPanel>

      <MobileOverlayPanel
        open={activePanel === 'text'}
        onClose={() => setActivePanel(null)}
        title="Title & Text"
        icon="title"
      >
        <TitleControls />
      </MobileOverlayPanel>

      <SrtModal />
    </div>
  )
}

/* ── Desktop Editor Layout ────────────────────────────────── */

function StatsBar() {
  const { raws, shorts, downloadsCount, channelsCount } = useEditor()
  const navigate = useNavigate()
  const items = [
    { icon: 'subscriptions', label: '채널 관리', count: channelsCount, tab: 'manage' },
    { icon: 'download', label: '수집 영상', count: downloadsCount, tab: 'downloads' },
    { icon: 'movie_edit', label: '편집본', count: raws.length, tab: 'raws' },
    { icon: 'auto_awesome', label: '쇼츠', count: shorts.length, tab: 'shorts' },
  ]
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-outline-variant/20 shrink-0 bg-surface-container-lowest overflow-x-auto">
      {items.map((item) => (
        <button key={item.tab} onClick={() => navigate(`/channels?tab=${item.tab}`)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-on-surface-variant border border-transparent hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all cursor-pointer">
          <Icon name={item.icon} size={20} />
          <span className="text-label-md font-semibold whitespace-nowrap">{item.label}</span>
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-surface-variant text-on-surface-variant">{item.count}</span>
        </button>
      ))}
    </div>
  )
}

function DesktopEditorLayout() {
  const { selectedRaw, showSrt } = useEditor()

  return (
    <div className="flex flex-col h-[calc(100vh-64px-48px)] overflow-hidden -m-6 lg:-m-8">
      <StatsBar />
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* Left: Controls */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-1">
          <TitleControls />
          <StyleControls />
          <VoiceTextPanel />
          <SfxHookPanel />
          <RenderButton />
        </div>

        {/* Center: Canvas + Timeline */}
        <div className={`col-span-12 flex flex-col items-center justify-center gap-4 overflow-hidden ${showSrt ? 'lg:col-span-5' : 'lg:col-span-6'}`}>
          <VideoCanvas />
          <Timeline />
        </div>

        {/* Right: SrtPanel (자막 편집 모드) or Media List */}
        <div className={`col-span-12 flex flex-col gap-4 overflow-hidden ${showSrt ? 'lg:col-span-4' : 'lg:col-span-3 overflow-y-auto'}`}>
          {showSrt ? (
            <SrtPanel />
          ) : (
            <MediaList />
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Editor Layout Switcher ───────────────────────────────── */

function EditorLayout() {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  return isDesktop ? <DesktopEditorLayout /> : <MobileEditorLayout />
}

export default function EditorPage() {
  const { filename } = useParams<{ filename: string }>()

  return (
    <EditorProvider initialFilename={filename}>
      <EditorLayout />
    </EditorProvider>
  )
}
