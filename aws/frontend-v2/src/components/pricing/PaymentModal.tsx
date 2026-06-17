import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../services/api'
import Modal from '../ui/Modal'
import Icon from '../ui/Icon'
import Button from '../ui/Button'

declare global {
  interface Window {
    IMP?: {
      init: (impKey: string) => void
      request_pay: (params: Record<string, unknown>, callback: (response: PortOneResponse) => void) => void
    }
  }
}

interface PortOneResponse {
  success: boolean
  imp_uid?: string
  merchant_uid?: string
  error_msg?: string
}

interface PaymentModalProps {
  plan: string
  planName: string
  amount: number
  features: string[]
  onSuccess: () => void
  onClose: () => void
}

const IMP_KEY = import.meta.env.VITE_IMP_KEY || 'imp00000000'

export default function PaymentModal({
  plan,
  planName,
  amount,
  features,
  onSuccess,
  onClose,
}: PaymentModalProps) {
  const { user } = useAuth()
  const [step, setStep] = useState<'summary' | 'processing' | 'success' | 'error'>('summary')
  const [errorMsg, setErrorMsg] = useState('')

  // Ensure PortOne SDK is loaded
  useEffect(() => {
    if (window.IMP) return
    const existing = document.querySelector('script[src*="iamport"]')
    if (existing) return
    const script = document.createElement('script')
    script.src = 'https://cdn.iamport.kr/v1/iamport.js'
    script.async = true
    document.head.appendChild(script)
  }, [])

  const formatPrice = (n: number) =>
    n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' })

  const handlePay = async () => {
    if (!window.IMP) {
      setErrorMsg('결제 모듈을 불러오지 못했습니다. 페이지를 새로고침해주세요.')
      setStep('error')
      return
    }

    setStep('processing')

    try {
      // 1. Prepare payment on backend
      const { merchant_uid, amount: serverAmount } = await api.preparePayment(plan)

      // Use server amount if available, fallback to prop
      const payAmount = serverAmount || amount

      // 2. Init PortOne
      window.IMP.init(IMP_KEY)

      // 3. Request payment
      window.IMP.request_pay(
        {
          pg: 'html5_inicis',
          pay_method: 'card',
          merchant_uid,
          name: `Gorilla AI ${planName} 월간 구독`,
          amount: payAmount,
          buyer_email: user?.email || '',
          buyer_name: user?.name || user?.email || '',
        },
        async (response: PortOneResponse) => {
          if (!response.success) {
            setErrorMsg(response.error_msg || '결제가 취소되었습니다.')
            setStep('error')
            return
          }

          try {
            // 4. Verify on backend
            const result = await api.verifyPayment(
              response.imp_uid!,
              response.merchant_uid!,
            )

            if (result.success) {
              setStep('success')
              // Auto-close after 2 seconds
              setTimeout(() => {
                onSuccess()
              }, 2000)
            } else {
              setErrorMsg('결제 검증에 실패했습니다. 고객센터에 문의해주세요.')
              setStep('error')
            }
          } catch {
            setErrorMsg('결제 검증 중 오류가 발생했습니다. 고객센터에 문의해주세요.')
            setStep('error')
          }
        },
      )
    } catch {
      setErrorMsg('결제 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      setStep('error')
    }
  }

  return (
    <Modal open onClose={step === 'processing' ? () => {} : onClose}>
      {/* Summary Step */}
      {step === 'summary' && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="credit_card" size={24} className="text-primary" />
            </div>
            <div>
              <h2 className="text-title-md font-bold text-on-surface">구독 결제</h2>
              <p className="text-label-sm text-on-surface-variant">
                {planName} 플랜
              </p>
            </div>
          </div>

          {/* Plan info */}
          <div className="bg-surface-container-low rounded-xl p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-label-md text-on-surface font-bold">{planName} 월간 구독</span>
              <span className="text-headline-lg text-primary font-bold">{formatPrice(amount)}</span>
            </div>
            <ul className="space-y-2">
              {features.map((feat) => (
                <li key={feat} className="flex items-center gap-2 text-label-md text-on-surface-variant">
                  <Icon name="check" size={16} className="text-tertiary" />
                  {feat}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              취소
            </Button>
            <Button variant="primary" className="flex-1" onClick={handlePay}>
              <Icon name="lock" size={18} />
              결제하기
            </Button>
          </div>
        </div>
      )}

      {/* Processing Step */}
      {step === 'processing' && (
        <div className="text-center py-8">
          <Icon name="sync" size={48} className="text-primary animate-spin mb-4" />
          <h2 className="text-title-md font-bold text-on-surface mb-2">결제 처리 중...</h2>
          <p className="text-label-md text-on-surface-variant">
            결제 창을 확인해주세요
          </p>
        </div>
      )}

      {/* Success Step */}
      {step === 'success' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-tertiary/10 flex items-center justify-center mx-auto mb-4">
            <Icon name="check_circle" size={40} className="text-tertiary" />
          </div>
          <h2 className="text-title-md font-bold text-on-surface mb-2">결제 완료!</h2>
          <p className="text-label-md text-on-surface-variant">
            {planName} 플랜이 활성화되었습니다
          </p>
        </div>
      )}

      {/* Error Step */}
      {step === 'error' && (
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
            <Icon name="error" size={40} className="text-error" />
          </div>
          <h2 className="text-title-md font-bold text-on-surface mb-2">결제 실패</h2>
          <p className="text-label-md text-on-surface-variant mb-6">{errorMsg}</p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              닫기
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setStep('summary')}>
              다시 시도
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
