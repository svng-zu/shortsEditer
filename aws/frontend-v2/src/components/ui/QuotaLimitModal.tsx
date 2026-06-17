import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Modal from './Modal'
import Icon from './Icon'
import Button from './Button'

interface QuotaLimitModalProps {
  open: boolean
  onClose: () => void
}

export default function QuotaLimitModal({ open, onClose }: QuotaLimitModalProps) {
  const { user, openAuthModal } = useAuth()
  const navigate = useNavigate()

  const isAnonymous = !user

  const handleLogin = () => {
    onClose()
    openAuthModal('login')
  }

  const handleViewPricing = () => {
    onClose()
    navigate('/pricing')
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="text-center py-4">
        {/* Warning icon */}
        <div className="w-16 h-16 rounded-full bg-secondary-container/10 flex items-center justify-center mx-auto mb-5">
          <Icon name="warning" size={40} className="text-secondary-container" />
        </div>

        {/* Title */}
        <h2 className="text-title-md font-bold text-on-surface mb-3">
          이용 한도에 도달했습니다
        </h2>

        {/* Description */}
        <p className="text-body-md text-on-surface-variant mb-6 leading-relaxed">
          {isAnonymous
            ? '무료 체험 한도(2개)를 모두 사용했습니다. 로그인하면 5개까지 무료로 이용할 수 있습니다.'
            : '무료 플랜 한도(5개)에 도달했습니다. 더 많은 쇼츠를 만들려면 플랜을 업그레이드하세요.'}
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          {isAnonymous ? (
            <>
              <Button variant="ghost" className="flex-1" onClick={handleViewPricing}>
                요금제 보기
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleLogin}>
                <Icon name="login" size={18} />
                로그인
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="flex-1" onClick={onClose}>
                닫기
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleViewPricing}>
                <Icon name="bolt" size={18} />
                요금제 보기
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
