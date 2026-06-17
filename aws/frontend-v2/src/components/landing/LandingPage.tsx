import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useInView } from '../../hooks/useInView'

/* ── Helpers ───────────────────────────────────────────────── */

const SEEN_KEY = 'gorila_seen_app'

function markSeen() {
  localStorage.setItem(SEEN_KEY, '1')
}

/** Reusable reveal wrapper driven by IntersectionObserver */
function Reveal({ children, className = '', delay = 0 }: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15)
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

/* ── Section Components ────────────────────────────────────── */

function NavBar({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  return (
    <nav className="fixed top-0 w-full z-50 bg-surface/85 backdrop-blur-xl border-b border-outline-variant/30">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 select-none">
          <img src="/static/gorila_ai.png" alt="Gorilla AI" className="w-9 h-9 rounded-lg" />
          <span className="font-bold text-headline-lg text-primary tracking-tighter">
            Gorilla AI
          </span>
        </div>

        {/* Center links — hidden on mobile */}
        <div className="hidden md:flex items-center gap-8">
          {['Platform', 'Pipeline', 'Features', 'Pricing'].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              className="text-on-surface-variant hover:text-primary transition-colors text-body-md"
            >
              {label}
            </a>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          {/* Desktop: Log In + Get Started buttons */}
          <button
            onClick={onLogin}
            className="hidden md:block text-on-surface hover:text-primary transition-colors text-body-md font-medium px-3 py-1.5"
          >
            Log In
          </button>
          <button
            onClick={onGetStarted}
            className="hidden md:block bg-primary text-on-primary rounded-xl font-bold text-body-md px-5 py-2 hover:brightness-110 transition-all"
          >
            Get Started
          </button>

          {/* Mobile: notification + profile icons */}
          <button className="md:hidden relative p-2 rounded-full hover:bg-surface-container-high/50 transition-colors">
            <Icon name="notifications" className="text-xl text-on-surface-variant" />
          </button>
          <button
            onClick={onLogin}
            className="md:hidden w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/50"
          >
            <Icon name="person" className="text-sm text-primary" />
          </button>
        </div>
      </div>
    </nav>
  )
}

function HeroSection({ onGetStarted, onExplore }: { onGetStarted: () => void; onExplore: () => void }) {
  return (
    <section id="platform" className="relative pt-28 md:pt-40 pb-16 md:pb-20 overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(173,198,255,0.15) 0%, rgba(78,222,163,0.05) 40%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto text-center px-6">
        {/* Pill badge */}
        <Reveal>
          <div className="inline-flex items-center gap-2 glass-panel rounded-full px-4 md:px-5 py-1.5 md:py-2 mb-6 md:mb-8">
            <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
            <span className="text-label-sm md:text-label-md text-on-surface-variant font-mono">
              V3.2 ENGINE LOADED
            </span>
          </div>
        </Reveal>

        {/* Headline */}
        <Reveal delay={100}>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight mb-6">
            <span className="text-on-surface">AI가 만드는 완벽한</span>
            <br />
            <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">
              쇼츠, 고릴라AI
            </span>
          </h1>
        </Reveal>

        {/* Subtitle */}
        <Reveal delay={200}>
          <p className="text-body-md md:text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-8 md:mb-10">
            유튜브 채널 분석부터 자동 편집, 렌더링까지. 당신의 콘텐츠를 가장 스마트하게 쇼츠로 변환하세요.
          </p>
        </Reveal>

        {/* CTA buttons — stacked on mobile, row on sm+ */}
        <Reveal delay={300}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-12 md:mb-16">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto bg-primary text-on-primary rounded-xl font-bold text-body-lg px-8 py-3.5
                         hover:shadow-[0_0_30px_rgba(173,198,255,0.4)] transition-all duration-300"
            >
              지금 시작하기
            </button>
            <button
              onClick={onExplore}
              className="hidden sm:block bg-surface-variant/50 text-on-surface border border-outline-variant rounded-xl
                         font-bold text-body-lg px-8 py-3.5 hover:bg-surface-variant/80 transition-all"
            >
              기능 살펴보기
            </button>
          </div>
        </Reveal>

        {/* Dashboard preview — autoplay mp4 as animated preview */}
        <Reveal delay={400}>
          <div className="relative max-w-3xl mx-auto group">
            <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full group-hover:bg-primary/30 transition-colors" />
            <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl relative border border-outline-variant/50">
              <video
                className="w-full object-cover"
                src="/static/v2_traced-ea09eeb2-1494-4c7f-babc-ce98974f26cc.mp4"
                autoPlay
                loop
                muted
                playsInline
              />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Pipeline Steps ───────────────────────────────────────── */

const PIPELINE_STEPS = [
  {
    num: '01',
    icon: 'download',
    title: '자동 수집',
    desc: '유튜브 채널에서 자동으로 고화질 영상을 안전하게 가져옵니다.',
    color: 'text-primary',
  },
  {
    num: '02',
    icon: 'psychology',
    title: 'AI 분석',
    desc: 'Gemini AI가 영상의 맥락을 읽어 가장 임팩트 있는 구간을 정확히 찾아냅니다.',
    color: 'text-primary',
  },
  {
    num: '03',
    icon: 'auto_fix_high',
    title: '스마트 편집',
    desc: '자막, 나레이션, 배경음악 및 트랜지션을 AI가 자동으로 디자인하여 입힙니다.',
    color: 'text-primary',
  },
  {
    num: '04',
    icon: 'upload_file',
    title: '즉시 업로드',
    desc: '완성된 영상을 유튜브 쇼츠로 즉시 발행하여 도달률을 높이세요.',
    color: 'text-tertiary',
  },
] as const

function PipelineSection() {
  return (
    <section id="pipeline" className="py-24 max-w-7xl mx-auto px-6">
      <Reveal>
        <div className="text-center mb-16">
          <h2 className="text-headline-lg font-bold text-on-surface mb-3">어떻게 작동하나요?</h2>
          <div className="w-16 h-1 bg-primary rounded-full mx-auto" />
        </div>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
        {/* Connecting line (desktop only) */}
        <div className="hidden lg:block absolute top-1/2 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-primary/40 via-primary/20 to-tertiary/40 -translate-y-1/2 z-0" />

        {PIPELINE_STEPS.map((step, i) => (
          <Reveal key={step.num} delay={i * 120}>
            <div className="glass-panel rounded-2xl p-6 relative z-10 h-full flex flex-col items-center text-center">
              <div className={`w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center mb-4 ${step.color}`}>
                <Icon name={step.icon} className="text-3xl" />
              </div>
              <span className="text-label-sm text-outline font-mono mb-1">Step {step.num}</span>
              <h3 className="text-title-md text-on-surface mb-2">{step.title}</h3>
              <p className="text-body-md text-on-surface-variant leading-relaxed">{step.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ── Features Bento Grid ─────────────────────────────────── */

function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-surface-container-lowest">
      <div className="max-w-7xl mx-auto px-6">
        <Reveal>
          <div className="text-center mb-16">
            <h2 className="text-headline-lg font-bold text-on-surface mb-3">핵심 기능</h2>
            <div className="w-16 h-1 bg-tertiary rounded-full mx-auto" />
          </div>
        </Reveal>

        {/* Mobile: horizontal scroll cards / Desktop: grid */}
        <div className="flex overflow-x-auto gap-4 pb-4 -mx-2 px-2 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible md:pb-0 md:mx-0 md:px-0 md:snap-none">
          {/* Feature 1 — wide on desktop */}
          <Reveal className="flex-shrink-0 w-[280px] snap-start md:w-auto md:col-span-2">
            <div className="glass-panel rounded-2xl p-6 md:p-8 h-full">
              <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-5">
                <div className="w-14 h-14 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon name="neurology" className="text-3xl text-primary animate-pulse-glow" />
                </div>
                <div>
                  <h3 className="text-title-md text-on-surface mb-2">Gemini 2.5 Flash 기반 분석</h3>
                  <p className="text-body-md text-on-surface-variant leading-relaxed">
                    최신 Gemini 모델이 영상 전체의 맥락, 감정, 화제성을 종합 분석합니다.
                    카테고리별 최적화된 Few-shot 프롬프트로 일관된 고품질 분석을 제공합니다.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Feature 2 */}
          <Reveal delay={100} className="flex-shrink-0 w-[280px] snap-start md:w-auto">
            <div className="glass-panel rounded-2xl p-6 md:p-8 h-full">
              <div className="w-14 h-14 rounded-xl bg-tertiary/10 flex items-center justify-center mb-4">
                <Icon name="closed_caption" className="text-3xl text-tertiary" />
              </div>
              <h3 className="text-title-md text-on-surface mb-2">Whisper 자동 자막 생성</h3>
              <p className="text-body-md text-on-surface-variant leading-relaxed">
                OpenAI Whisper가 음성을 정밀하게 인식하여 정확한 타임스탬프와 함께 자막을 생성합니다.
              </p>
            </div>
          </Reveal>

          {/* Feature 3 */}
          <Reveal delay={150} className="flex-shrink-0 w-[280px] snap-start md:w-auto">
            <div className="glass-panel rounded-2xl p-6 md:p-8 h-full">
              <div className="w-14 h-14 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                <Icon name="record_voice_over" className="text-3xl text-secondary" />
              </div>
              <h3 className="text-title-md text-on-surface mb-2">고품질 TTS 나레이션</h3>
              <p className="text-body-md text-on-surface-variant leading-relaxed">
                자연스러운 AI 음성으로 나레이션을 자동 생성하여 시청 몰입감을 극대화합니다.
              </p>
            </div>
          </Reveal>

          {/* Feature 4 — wide on desktop */}
          <Reveal delay={200} className="flex-shrink-0 w-[280px] snap-start md:w-auto md:col-span-2">
            <div className="glass-panel rounded-2xl p-6 md:p-8 h-full">
              <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-5">
                <div className="w-14 h-14 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon name="face" className="text-3xl text-primary" />
                </div>
                <div>
                  <h3 className="text-title-md text-on-surface mb-2">얼굴 인식 기반 오토 크롭</h3>
                  <p className="text-body-md text-on-surface-variant leading-relaxed">
                    AI 얼굴 감지 알고리즘으로 핵심 인물이 항상 화면 중앙에 오도록 자동 크롭합니다.
                    가로 영상을 세로 쇼츠로 자연스럽게 변환하여 시청자의 몰입도를 극대화합니다.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ── Stats ─────────────────────────────────────────────────── */

const STATS = [
  { value: '10M+', label: '총 생성된 쇼츠' },
  { value: '98%', label: '정확한 AI 요약' },
  { value: '25k', label: '활동 크리에이터' },
  { value: '1/10', label: '제작 시간 단축' },
] as const

function StatsSection() {
  return (
    <section className="py-20 border-y border-outline-variant/20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 80}>
              <div className="text-center">
                <div className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-body-md text-on-surface-variant">{stat.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── CTA Section ──────────────────────────────────────────── */

function CtaSection({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="py-32 relative overflow-hidden">
      {/* Big glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(173,198,255,0.12) 0%, rgba(78,222,163,0.06) 30%, transparent 60%)',
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto text-center px-6">
        <Reveal>
          <h2 className="text-headline-lg sm:text-headline-xl font-bold text-on-surface mb-6 leading-tight">
            이미 수많은 크리에이터가
            <br />
            고릴라AI와 함께하고 있습니다.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-5">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto bg-primary text-on-primary rounded-xl font-bold text-body-lg px-10 py-4
                         hover:shadow-[0_0_40px_rgba(173,198,255,0.45)] transition-all duration-300"
            >
              무료로 시작하기
            </button>
            <button
              className="w-full sm:w-auto bg-surface-variant/50 text-on-surface border border-outline-variant rounded-xl
                         font-bold text-body-lg px-10 py-4 hover:bg-surface-variant/80 transition-all"
            >
              요금제 보기
            </button>
          </div>
        </Reveal>
        <Reveal delay={200}>
          <p className="text-label-md text-outline">
            카드 등록 없이 즉시 시작 &bull; 5분 이내 결과물 확인
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Footer ────────────────────────────────────────────────── */

const FOOTER_COLS = [
  {
    title: '제품',
    links: ['기능 소개', 'API 가이드', '요금제'],
  },
  {
    title: '리소스',
    links: ['도움말 센터', '성공 사례', '블로그'],
  },
  {
    title: '법률/지원',
    links: ['개인정보 처리방침', '이용 약관', '문의하기'],
  },
] as const

function Footer() {
  return (
    <footer className="border-t border-outline-variant/20 py-10 md:py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-8 md:gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2">
              <img src="/static/gorila_ai.png" alt="Gorilla AI" className="w-8 h-8 rounded-lg" />
              <span className="font-bold text-headline-lg text-primary tracking-tighter">Gorilla AI</span>
            </div>
            <p className="text-body-md text-on-surface-variant mt-3 max-w-xs">
              AI 기반 유튜브 쇼츠 자동 생성 플랫폼
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h4 className="text-label-md text-on-surface font-semibold mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-body-md text-on-surface-variant hover:text-primary transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-outline-variant/20 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-label-md text-outline">&copy; {new Date().getFullYear()} Gorilla AI. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="text-label-md text-on-surface-variant">한국어</span>
            <span className="text-outline-variant">|</span>
            {/* Social icons */}
            {['language', 'code', 'mail'].map((icon) => (
              <a key={icon} href="#" className="text-on-surface-variant hover:text-primary transition-colors">
                <Icon name={icon} className="text-xl" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ── Main Landing Page ─────────────────────────────────────── */

export default function LandingPage() {
  const { openAuthModal } = useAuth()
  const navigate = useNavigate()

  const handleGetStarted = useCallback(() => {
    markSeen()
    openAuthModal('signup')
  }, [openAuthModal])

  const handleLogin = useCallback(() => {
    openAuthModal('login')
  }, [openAuthModal])

  const handleExplore = useCallback(() => {
    markSeen()
    navigate('/dashboard')
  }, [navigate])

  return (
    <div className="min-h-screen bg-surface text-on-surface pb-16 md:pb-0">
      <NavBar onGetStarted={handleGetStarted} onLogin={handleLogin} />
      <HeroSection onGetStarted={handleGetStarted} onExplore={handleExplore} />
      <PipelineSection />
      <FeaturesSection />
      <StatsSection />
      <CtaSection onGetStarted={handleGetStarted} />
      <Footer />
    </div>
  )
}
