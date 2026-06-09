import { useAuth } from '../contexts/AuthContext'
import { useInView } from '../hooks/useInView'

interface Props {
  onStart: () => void
}

interface Feature {
  step: string
  icon: string
  title: string
  desc: string
  color: string
}

const FEATURES: Feature[] = [
  {
    step: '01',
    icon: '⬇️',
    title: '채널만 등록하면, 영상 수집은 자동으로',
    desc: '관심 있는 유튜브 채널을 등록해두면 AI가 최신 영상을 알아서 찾아 다운로드해요. 직접 URL을 붙여넣어 받을 수도 있어요.',
    color: '#1a73e8',
  },
  {
    step: '02',
    icon: '💬',
    title: 'AI가 자막을 만들고, 핵심 장면을 분석해요',
    desc: 'Whisper가 영상의 음성을 정확한 자막으로 바꾸고, Gemini가 자막을 읽고 쇼츠로 만들기 좋은 하이라이트 구간을 찾아내요.',
    color: '#34a853',
  },
  {
    step: '03',
    icon: '✂️',
    title: '카테고리에 맞는 스타일로 자동 편집',
    desc: '스포츠·경제·정치 등 카테고리별 템플릿으로 얼굴을 인식해 세로 화면에 맞게 자르고, 자막과 타이틀 오버레이까지 입혀요.',
    color: '#f9ab00',
  },
  {
    step: '04',
    icon: '🚀',
    title: '완성된 쇼츠, 바로 업로드까지',
    desc: '미리보기로 확인하고 제목과 스타일을 다듬은 다음, 한 번의 클릭으로 유튜브에 업로드해요.',
    color: '#ea4335',
  },
]

function ScrollHint() {
  return (
    <div style={{
      position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      color: 'var(--muted)', fontSize: 14, animation: 'pulse 1.8s infinite',
    }}>
      <span>스크롤해서 더 알아보기</span>
      <span style={{ fontSize: 16 }}>↓</span>
    </div>
  )
}

function FeatureSection({ feature, index }: { feature: Feature; index: number }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.35)
  const reverse = index % 2 === 1

  return (
    <section style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '80px 24px',
    }}>
      <div
        ref={ref}
        className={`reveal ${inView ? 'in-view' : ''}`}
        style={{
          display: 'flex', flexDirection: reverse ? 'row-reverse' : 'row',
          alignItems: 'center', gap: 56, maxWidth: 920, width: '100%',
          flexWrap: 'wrap', justifyContent: 'center',
        }}
      >
        <div style={{
          width: 168, height: 168, borderRadius: 32, flexShrink: 0,
          background: `${feature.color}1a`, border: `1px solid ${feature.color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 64,
        }}>
          {feature.icon}
        </div>
        <div style={{ maxWidth: 460, textAlign: reverse ? 'right' : 'left' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: feature.color, letterSpacing: 1, marginBottom: 10 }}>
            STEP {feature.step}
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1.35, marginBottom: 14 }}>
            {feature.title}
          </h2>
          <p style={{ fontSize: 17, color: 'var(--text2)', lineHeight: 1.7 }}>
            {feature.desc}
          </p>
        </div>
      </div>
    </section>
  )
}

export default function LandingPage({ onStart }: Props) {
  const { user, openAuthModal } = useAuth()
  const cta = useInView<HTMLDivElement>(0.4)

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg)' }}>
      {/* 히어로 */}
      <section style={{
        position: 'relative',
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '24px',
      }}>
        <img src="/static/gorila_ai.png" alt="고릴라AI" style={{ height: 88, width: 'auto', borderRadius: 18, marginBottom: 28, boxShadow: '0 8px 28px rgba(0,0,0,0.12)' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)', letterSpacing: 2, marginBottom: 14 }}>
          고릴라AI · SHORTS STUDIO
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, color: 'var(--text)', lineHeight: 1.35, maxWidth: 640, marginBottom: 18 }}>
          유튜브 영상을<br />
          <span style={{ color: 'var(--primary)' }}>AI가 알아서</span> 쇼츠로 만들어드려요
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 520, marginBottom: 36 }}>
          채널 등록부터 자막, 분석, 편집, 업로드까지 — 쇼츠 제작의 전 과정을 자동화하는 파이프라인.
          지금 바로 무료로 체험해보세요.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={onStart} className="btn-primary" style={{ padding: '14px 32px', fontSize: 17, borderRadius: 10 }}>
            무료로 시작하기 →
          </button>
          {!user && (
            <button onClick={() => openAuthModal('signup')} className="btn-outlined" style={{ padding: '14px 28px', fontSize: 17, borderRadius: 10 }}>
              회원가입하고 더 받기
            </button>
          )}
        </div>
        <ScrollHint />
      </section>

      {/* 파이프라인 흐름 설명 — 위에서 아래로 스크롤하며 순서대로 등장 */}
      {FEATURES.map((f, i) => (
        <FeatureSection key={f.step} feature={f} index={i} />
      ))}

      {/* 마무리 CTA */}
      <section style={{
        minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px',
      }}>
        <div
          ref={cta.ref}
          className={`reveal ${cta.inView ? 'in-view' : ''}`}
          style={{ textAlign: 'center', maxWidth: 520 }}
        >
          <h2 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', marginBottom: 16, lineHeight: 1.4 }}>
            지금 바로 첫 쇼츠를<br />만들어보세요
          </h2>
          <p style={{ fontSize: 17, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 30 }}>
            로그인 없이도 바로 체험할 수 있어요. 계정을 만들면 더 많은 영상을 처리할 수 있는 한도가 주어져요.
          </p>
          <button onClick={onStart} className="btn-primary" style={{ padding: '14px 36px', fontSize: 17, borderRadius: 10 }}>
            고릴라AI 시작하기 →
          </button>
        </div>
      </section>
    </div>
  )
}
