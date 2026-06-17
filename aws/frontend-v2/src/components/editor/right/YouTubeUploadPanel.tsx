import { useState } from 'react'
import { api } from '../../../services/api'
import { useEditor } from '../../../contexts/EditorContext'

export default function YouTubeUploadPanel() {
  const { selectedRaw, shorts, title: titleState } = useEditor()
  const [ytTitle, setYtTitle] = useState('')
  const [ytDesc, setYtDesc] = useState('')
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('unlisted')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')

  const latestShort = shorts.find(s => {
    const stem = selectedRaw?.filename.replace(/_raw\.\w+$/, '')
    return stem && s.filename.includes(stem)
  })

  const handleUpload = async () => {
    if (!latestShort) { setUploadMsg('렌더링된 쇼츠가 없습니다.'); return }
    setUploading(true); setUploadMsg('')
    try {
      await api.uploadToYouTube(
        latestShort.filename,
        ytTitle || titleState.title1 || latestShort.filename,
        ytDesc,
        privacy,
      )
      setUploadMsg('업로드 시작됨!')
    } catch (e: any) {
      setUploadMsg(`실패: ${e?.response?.data?.detail || e.message}`)
    } finally { setUploading(false) }
  }

  return (
    <section className="glass-panel p-5 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-secondary-container border-b border-outline-variant/20 pb-2 mb-2">
        <span className="material-symbols-outlined">upload</span>
        <h2 className="text-title-md font-semibold">YouTube Upload</h2>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-label-sm text-on-surface-variant mb-1 block">Shorts Title</label>
          <input type="text"
            className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary p-2 text-label-md"
            value={ytTitle} onChange={e => setYtTitle(e.target.value)}
            placeholder={titleState.title1 || 'Title'} />
        </div>

        <div>
          <label className="text-label-sm text-on-surface-variant mb-1 block">Description</label>
          <textarea
            className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg focus:border-primary p-2 text-body-md text-sm resize-none"
            rows={3} value={ytDesc} onChange={e => setYtDesc(e.target.value)}
            placeholder="#shorts #ai" />
        </div>

        <div>
          <label className="text-label-sm text-on-surface-variant mb-1 block">Privacy</label>
          <div className="flex gap-2">
            {(['private', 'unlisted', 'public'] as const).map(p => (
              <button key={p} onClick={() => setPrivacy(p)}
                className={`flex-1 p-2 border rounded-lg text-label-sm font-semibold capitalize ${
                  privacy === p
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:bg-surface-bright/10'
                }`}>
                {p === 'private' ? 'Private' : p === 'unlisted' ? 'Unlisted' : 'Public'}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleUpload} disabled={uploading || !latestShort}
          className="w-full bg-secondary-container text-on-secondary-container font-bold py-3 px-4 rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50">
          <span className="material-symbols-outlined">publish</span>
          {uploading ? 'UPLOADING...' : 'UPLOAD TO YOUTUBE'}
        </button>

        {uploadMsg && (
          <div className={`text-label-sm p-2 rounded-lg ${uploadMsg.includes('실패') ? 'text-error bg-error-container/20' : 'text-tertiary bg-tertiary/10'}`}>
            {uploadMsg}
          </div>
        )}
      </div>
    </section>
  )
}
