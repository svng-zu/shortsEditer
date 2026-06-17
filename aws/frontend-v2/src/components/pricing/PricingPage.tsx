import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api, Quota } from '../../services/api'
import GlassPanel from '../ui/GlassPanel'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
import PaymentModal from './PaymentModal'

/* ── Plan definitions ────────────────────────────────────── */

interface PlanDef {
  key: string
  name: string
  price: number
  priceLabel: string
  shorts: string
  maxMinutes: string
  storageDays: string
  tts: string
  features: { text: string; included: boolean }[]
  popular?: boolean
}

const PLANS: PlanDef[] = [
  {
    key: 'free',
    name: 'Free',
    price: 0,
    priceLabel: '무료',
    shorts: '5',
    maxMinutes: '30',
    storageDays: '7',
    tts: 'Google 기본',
    features: [
      { text: '월 5개 쇼츠 생성', included: true },
      { text: '최대 30분 영상', included: true },
      { text: '7일 보관', included: true },
      { text: 'Google TTS 기본', included: true },
      { text: '우선 처리', included: false },
      { text: '전담 지원', included: false },
    ],
  },
  {
    key: 'starter',
    name: 'Starter',
    price: 9900,
    priceLabel: '₩9,900',
    shorts: '30',
    maxMinutes: '60',
    storageDays: '30',
    tts: 'Google 전체',
    features: [
      { text: '월 30개 쇼츠 생성', included: true },
      { text: '최대 1시간 영상', included: true },
      { text: '30일 보관', included: true },
      { text: 'Google TTS 전체', included: true },
      { text: '우선 처리', included: false },
      { text: '전담 지원', included: false },
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 29900,
    priceLabel: '₩29,900',
    shorts: '100',
    maxMinutes: '120',
    storageDays: '90',
    tts: '+ ElevenLabs',
    popular: true,
    features: [
      { text: '월 100개 쇼츠 생성', included: true },
      { text: '최대 2시간 영상', included: true },
      { text: '90일 보관', included: true },
      { text: 'Google TTS + ElevenLabs', included: true },
      { text: '우선 처리', included: true },
      { text: '전담 지원', included: false },
    ],
  },
  {
    key: 'business',
    name: 'Business',
    price: 79900,
    priceLabel: '₩79,900',
    shorts: '무제한',
    maxMinutes: '무제한',
    storageDays: '무제한',
    tts: '+ ElevenLabs',
    features: [
      { text: '무제한 쇼츠 생성', included: true },
      { text: '무제한 영상 길이', included: true },
      { text: '무제한 보관', included: true },
      { text: 'Google TTS + ElevenLabs', included: true },
      { text: '우선 처리', included: true },
      { text: '전담 지원', included: true },
    ],
  },
]

/* ── PricingPage ─────────────────────────────────────────── */

export default function PricingPage() {
  const { user, openAuthModal } = useAuth()
  const [quota, setQuota] = useState<Quota | null>(null)
  const [paymentPlan, setPaymentPlan] = useState<PlanDef | null>(null)

  useEffect(() => {
    api.getQuota().then(setQuota).catch(() => {})
  }, [])

  const currentPlan = quota?.plan ?? 'free'

  const handleSelect = (plan: PlanDef) => {
    if (!user) {
      openAuthModal('login')
      return
    }
    if (plan.key === 'free') return
    if (plan.key === currentPlan) return
    setPaymentPlan(plan)
  }

  const handlePaymentSuccess = () => {
    setPaymentPlan(null)
    // Refresh quota after successful payment
    api.getQuota().then(setQuota).catch(() => {})
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-20">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-headline-lg font-bold text-on-surface mb-3">요금제</h1>
        <p className="text-body-md text-on-surface-variant">
          서비스에 맞는 플랜을 선택하세요
        </p>
      </div>

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key
          const isPopular = plan.popular

          return (
            <GlassPanel
              key={plan.key}
              className={`
                rounded-2xl p-6 flex flex-col relative transition-all duration-300
                ${isPopular ? 'border-primary ring-1 ring-primary/30 scale-[1.02]' : ''}
                ${isCurrent ? 'border-tertiary/50' : ''}
              `}
            >
              {/* Popular badge */}
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-on-primary text-[11px] font-bold uppercase tracking-widest px-4 py-1 rounded-full">
                    인기
                  </span>
                </div>
              )}

              {/* Current plan badge */}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-tertiary text-on-tertiary text-[11px] font-bold uppercase tracking-widest px-4 py-1 rounded-full">
                    현재 플랜
                  </span>
                </div>
              )}

              {/* Plan name */}
              <h3 className="text-title-md font-bold text-on-surface mt-2 mb-1">
                {plan.name}
              </h3>

              {/* Price */}
              <div className="mb-5">
                <span className="text-headline-xl text-primary">{plan.priceLabel}</span>
                {plan.price > 0 && (
                  <span className="text-label-md text-on-surface-variant ml-1">/월</span>
                )}
              </div>

              {/* Features list */}
              <ul className="flex-1 space-y-3 mb-6">
                {plan.features.map((feat) => (
                  <li key={feat.text} className="flex items-start gap-2.5">
                    <Icon
                      name={feat.included ? 'check_circle' : 'cancel'}
                      size={18}
                      className={feat.included ? 'text-tertiary mt-0.5' : 'text-on-surface-variant/30 mt-0.5'}
                    />
                    <span
                      className={`text-label-md ${
                        feat.included ? 'text-on-surface' : 'text-on-surface-variant/40'
                      }`}
                    >
                      {feat.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Action button */}
              {isCurrent ? (
                <Button variant="ghost" disabled className="w-full">
                  현재 플랜
                </Button>
              ) : !user ? (
                <Button
                  variant={isPopular ? 'primary' : 'ghost'}
                  className="w-full"
                  onClick={() => openAuthModal('login')}
                >
                  <Icon name="login" size={18} />
                  로그인 후 시작
                </Button>
              ) : plan.key === 'free' ? (
                <Button variant="ghost" disabled className="w-full">
                  시작하기
                </Button>
              ) : (
                <Button
                  variant={isPopular ? 'primary' : 'ghost'}
                  className="w-full"
                  onClick={() => handleSelect(plan)}
                >
                  구독하기
                </Button>
              )}
            </GlassPanel>
          )
        })}
      </div>

      {/* Payment Modal */}
      {paymentPlan && (
        <PaymentModal
          plan={paymentPlan.key}
          planName={paymentPlan.name}
          amount={paymentPlan.price}
          features={paymentPlan.features.filter((f) => f.included).map((f) => f.text)}
          onSuccess={handlePaymentSuccess}
          onClose={() => setPaymentPlan(null)}
        />
      )}
    </div>
  )
}
