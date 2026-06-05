import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

const SESSION_KEY = 'gorila_session_id'

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function setSessionId(id: string) {
  localStorage.setItem(SESSION_KEY, id.trim())
  window.location.reload()
}

const client = axios.create({ baseURL: API_BASE })

// 요청마다 최신 세션 ID를 헤더에 주입
client.interceptors.request.use(config => {
  config.headers['X-Session-ID'] = getSessionId()
  // FormData는 Content-Type을 axios가 자동 설정(multipart)하도록 두기
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
})

// Pipeline.tsx 등에서 파일 업로드 시 직접 사용
export { client as apiClient }

export interface PipelineStatus {
  step: 'idle' | 'collecting' | 'transcribing' | 'analyzing' | 'editing' | 'done' | 'error'
  message: string
  progress: number
}

export interface FileCounts {
  downloads: string[]
  videos: string[]
  transcripts: string[]
  analyses: string[]
  shorts: string[]
}

export interface Candidate {
  start: number
  end: number
  reason: string
  score: number
  edit_order: number
  connection_note?: string
}

export interface ShortInfo {
  filename: string
  url: string
  title: string
  category: string
  candidates: Candidate[]
}

export interface RawInfo {
  filename: string
  url: string
  title: string
  category: string
}

export interface StyleParams {
  title1_color: string
  title2_color: string
  title_y_extra: number
  title_fontsize_scale: number
  sub_fontsize: number
  sub_color: string
  sub_margin_v: number
  font_name?: string
}

export const api = {
  // Status
  async getStatus(): Promise<PipelineStatus> {
    const { data } = await client.get('/api/status')
    return data
  },

  // Files
  async getFiles(): Promise<FileCounts> {
    const { data } = await client.get('/api/files')
    return data
  },

  // Shorts
  async getShorts(): Promise<{ shorts: ShortInfo[] }> {
    const { data } = await client.get('/api/shorts')
    return data
  },

  async getRaws(): Promise<{ raws: RawInfo[] }> {
    const { data } = await client.get('/api/raws')
    return data
  },

  async deleteShort(filename: string): Promise<void> {
    await client.delete(`/api/shorts/${filename}`)
  },

  async updateTitle(filename: string, introText: string): Promise<void> {
    await client.post('/api/update-title', {
      filename,
      intro_text: introText,
    })
  },

  // Pipeline
  async collect(clearExisting: boolean = true): Promise<void> {
    await client.post('/api/collect', { clear_existing: clearExisting })
  },

  async transcribe(): Promise<void> {
    await client.post('/api/transcribe')
  },

  async analyze(): Promise<void> {
    await client.post('/api/analyze')
  },

  async edit(templateId: number = 1): Promise<void> {
    await client.post('/api/edit', { template_id: templateId })
  },

  // Render
  async render(
    filename: string,
    title: string,
    subtitles: boolean,
    templateId: number,
    style: StyleParams,
    bgImage?: string,
    narration?: boolean,
    narrationVoice?: string,
  ): Promise<void> {
    await client.post('/api/render', {
      filename,
      title,
      subtitles,
      template_id: templateId,
      style,
      bg_image: bgImage,
      narration: narration ?? false,
      narration_voice: narrationVoice ?? 'female',
    })
  },

  async preview(
    filename: string,
    title: string,
    style: StyleParams,
    seek: number = 2.0,
    bgImage?: string
  ): Promise<Blob> {
    const { data } = await client.post(
      '/api/preview',
      {
        filename,
        title,
        style,
        seek,
        bg_image: bgImage,
      },
      { responseType: 'blob' }
    )
    return data
  },

  async rerender(templateId: number = 1): Promise<void> {
    await client.post('/api/rerender', { template_id: templateId })
  },

  async downloadUrl(url: string, category: string): Promise<void> {
    await client.post('/api/download-url', { url, category })
  },

  async getDownloadUrlStatus(): Promise<{ status: string; message: string; filename: string | null; error: string | null }> {
    const { data } = await client.get('/api/download-url-status')
    return data
  },

  async pause(): Promise<void> {
    await client.post('/api/pause')
  },

  async resume(): Promise<void> {
    await client.post('/api/resume')
  },

  // YouTube
  async getYouTubeAuthStatus(): Promise<{ authenticated: boolean; configured: boolean }> {
    const { data } = await client.get('/api/youtube/auth-status')
    return data
  },

  async getYouTubeAuthUrl(): Promise<{ url: string }> {
    const { data } = await client.get('/api/youtube/auth-url')
    return data
  },

  async uploadToYouTube(
    filename: string,
    title: string,
    description: string,
    privacy: 'public' | 'unlisted' | 'private'
  ): Promise<{ ok: boolean; message: string }> {
    const { data } = await client.post('/api/youtube/upload', {
      filename,
      title,
      description,
      privacy,
    })
    return data
  },

  async getYouTubeUploadStatus(): Promise<{
    running: boolean
    result: { video_id: string; url: string } | null
    error: string | null
  }> {
    const { data } = await client.get('/api/youtube/upload-status')
    return data
  },

  // Backgrounds
  async getBackgrounds(): Promise<{ backgrounds: string[] }> {
    const { data } = await client.get('/api/backgrounds')
    return data
  },

  // SRT
  async getSrt(stem: string): Promise<{ entries: { index: string; times: string; text: string }[] }> {
    const { data } = await client.get(`/api/srt/${stem}`)
    return data
  },

  async saveSrt(stem: string, entries: { index: string; times: string; text: string }[]): Promise<void> {
    await client.post('/api/srt', { stem, entries })
  },
}
