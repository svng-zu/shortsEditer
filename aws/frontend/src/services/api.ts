import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

const SESSION_KEY = 'gorila_session_id'
export const AUTH_TOKEN_KEY = 'gorila_auth_token'
export const AUTH_ERROR_KEY = 'gorila_auth_error'
const TOKEN_KEY = AUTH_TOKEN_KEY

// 비로그인 사용자를 구분하는 익명 세션 ID. X-Session-Id 헤더로 전송되어
// 익명 체험 한도(quota)를 추적하는 데 쓰이고, 회원가입/구글 로그인 시
// 계정에 연결되어 기존에 모아둔 데이터를 그대로 이어받는 데도 쓰인다.
export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

// 로그아웃 시 호출 — 계정에 연결됐던 익명 세션 ID를 새 값으로 교체해
// 로그아웃 이후의 익명 사용이 그 계정의 데이터 디렉터리를 계속 가리키지 않도록 한다.
export function resetSessionId(): string {
  const id = crypto.randomUUID()
  localStorage.setItem(SESSION_KEY, id)
  return id
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY)
}

const client = axios.create({ baseURL: API_BASE })

// 요청마다 익명 세션 ID + (있다면) 로그인 토큰을 헤더에 주입.
// 비로그인 사용자는 X-Session-Id로 체험 한도를, 로그인 사용자는 토큰으로 계정 한도를 적용받는다.
client.interceptors.request.use(config => {
  config.headers['X-Session-Id'] = getSessionId()
  const token = getAuthToken()
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  // FormData는 Content-Type을 axios가 자동 설정(multipart)하도록 두기
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
})

// 토큰 만료/무효 시 로그아웃 처리를 위해 AuthContext에서 등록하는 콜백
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && getAuthToken()) {
      clearAuthToken()
      onUnauthorized?.()
    }
    return Promise.reject(err)
  }
)

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
  title?: string
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

export interface AuthUser {
  id: string
  email: string
  name?: string | null
  provider: string
  is_admin?: boolean
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: AuthUser
}

export interface Quota {
  used: number
  limit: number | null
  is_member: boolean
  is_admin: boolean
}

export interface RawInfo {
  filename: string
  url: string
  title: string
  category: string
  duration?: number | null
}

export interface VideoInfo {
  title: string
  duration: number
  thumbnail_url: string
  filesize_approx: number | null
  video_id: string
}

export interface DownloadInfo {
  filename: string
  stem: string
  category: string
  thumbnail_url: string | null
  duration: number | null
}

export interface AdminUserInfo {
  id: string
  email: string
  name?: string | null
  provider: string
  is_admin: boolean
  created_at: string
  session_id: string
  quota_used: number
  quota_limit: number | null
}

export interface AdminStats {
  total_sessions: number
  total_users: number
  downloads: number
  transcripts: number
  analyses: number
  raws: number
  shorts: number
  category_counts: Record<string, number>
}

export interface AdminPipelineInfo {
  session_id: string
  step: string
  message: string
  progress: number
  is_paused: boolean
  user_email: string | null
}

export interface StyleParams {
  title1_color: string
  title2_color: string
  title_y_extra: number
  title_fontsize_scale: number
  sub_fontsize: number
  sub_color: string
  sub_margin_v: number
  sub_bg_enabled?: boolean
  sub_bg_color?: string
  sub_bg_opacity?: number
  channel_name?: string
  channel_color?: string
  channel_x?: number
  channel_y?: number
  channel_fontsize?: number
  channel_image_url?: string
  font_name?: string
  brightness?: number
  contrast?: number
  saturation?: number
  volume?: number
}

export const api = {
  // Auth
  async signup(email: string, password: string, name?: string): Promise<AuthResponse> {
    const { data } = await client.post('/api/auth/signup', {
      email, password, name, session_id: getSessionId(),
    })
    return data
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const { data } = await client.post('/api/auth/login', { email, password })
    return data
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    const { data } = await client.post('/api/auth/forgot-password', { email })
    return data
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const { data } = await client.post('/api/auth/reset-password', { token, new_password: newPassword })
    return data
  },

  async me(): Promise<AuthUser> {
    const { data } = await client.get('/api/auth/me')
    return data
  },

  async getGoogleLoginUrl(): Promise<{ url: string }> {
    const { data } = await client.get('/api/auth/google/login', {
      params: { session_id: getSessionId() },
    })
    return data
  },

  // 사용량 한도
  async getQuota(): Promise<Quota> {
    const { data } = await client.get('/api/quota')
    return data
  },

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

  async deleteRaw(filename: string): Promise<void> {
    await client.delete(`/api/raws/${filename}`)
  },

  async deleteDownload(filename: string): Promise<void> {
    await client.delete(`/api/downloads/${encodeURIComponent(filename)}`)
  },

  async updateTitle(filename: string, introText: string): Promise<void> {
    await client.post('/api/update-title', {
      filename,
      intro_text: introText,
    })
  },

  async generateScript(filename: string, mode: string = 'summary'): Promise<{ narration_script: string; sfx_placements: any[] }> {
    const { data } = await client.post('/api/generate-script', { filename, mode })
    return data
  },

  async updateNarrationScript(filename: string, narrationScript: string): Promise<void> {
    await client.post('/api/update-narration-script', {
      filename,
      narration_script: narrationScript,
    })
  },

  async generateNarrationSubtitles(filename: string, narrationVoice: string, narrationMode: string): Promise<{ subtitles: { start: number; end: number; text: string }[] }> {
    const { data } = await client.post('/api/generate-narration-subtitles', {
      filename,
      narration_voice: narrationVoice,
      narration_mode: narrationMode,
    })
    return data
  },

  // Channels
  async getChannels(): Promise<{ channels: { url: string; category: string; thumbnail_url?: string }[] }> {
    const { data } = await client.get('/api/channels')
    return data
  },
  async addChannel(url: string, category: string): Promise<void> {
    await client.post('/api/channels', { url, category })
  },
  async removeChannel(url: string): Promise<void> {
    await client.delete('/api/channels', { data: { url } })
  },

  // Pipeline
  async collect(clearExisting: boolean = true, limitPerChannel: number = 3, channelUrls?: string[]): Promise<void> {
    await client.post('/api/collect', {
      clear_existing: clearExisting,
      limit_per_channel: limitPerChannel,
      channel_urls: channelUrls && channelUrls.length > 0 ? channelUrls : null,
    })
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

  async process(templateId: number = 1): Promise<void> {
    await client.post('/api/process', { template_id: templateId })
  },

  // Render
  async render(
    filename: string,
    title: string,
    subtitles: boolean,
    templateId: number,
    style: StyleParams,
    bgImage?: string,
    bgSolidColor?: string,
    narration?: boolean,
    narrationVoice?: string,
    narrationMode?: string,
  ): Promise<void> {
    await client.post('/api/render', {
      filename,
      title,
      subtitles,
      template_id: templateId,
      style,
      bg_image: bgImage,
      bg_solid_color: bgSolidColor ?? null,
      narration: narration ?? false,
      narration_voice: narrationVoice ?? 'female',
      narration_mode: narrationMode ?? 'title',
    })
  },

  async preview(
    filename: string,
    title: string,
    style: StyleParams,
    seek: number = 2.0,
    bgImage?: string,
    bgSolidColor?: string,
  ): Promise<Blob> {
    const { data } = await client.post(
      '/api/preview',
      {
        filename,
        title,
        style,
        seek,
        bg_image: bgImage,
        bg_solid_color: bgSolidColor ?? null,
      },
      { responseType: 'blob' }
    )
    return data
  },

  async rerender(templateId: number = 1): Promise<void> {
    await client.post('/api/rerender', { template_id: templateId })
  },

  async getVideoInfo(url: string): Promise<VideoInfo> {
    const { data } = await client.get('/api/video-info', { params: { url } })
    return data
  },

  async downloadUrl(url: string, category: string): Promise<void> {
    await client.post('/api/download-url', { url, category })
  },

  async getDownloadUrlStatus(): Promise<{ status: string; message: string; filename: string | null; error: string | null }> {
    const { data } = await client.get('/api/download-url-status')
    return data
  },

  async getDownloads(): Promise<{ downloads: DownloadInfo[] }> {
    const { data } = await client.get('/api/downloads')
    return data
  },

  async processSelected(
    items: { filename: string; category: string }[],
    templateId: number = 1
  ): Promise<void> {
    await client.post('/api/process-selected', { items, template_id: templateId })
  },

  async pause(): Promise<void> {
    await client.post('/api/pause')
  },

  async resume(): Promise<void> {
    await client.post('/api/resume')
  },

  async stop(): Promise<void> {
    await client.post('/api/stop')
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

  async uploadBackground(file: File): Promise<{ filename: string; ok: boolean }> {
    const form = new FormData()
    form.append('file', file)
    const { data } = await client.post('/api/backgrounds/upload', form)
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

  // Admin
  async getAdminUsers(): Promise<AdminUserInfo[]> {
    const { data } = await client.get('/api/admin/users')
    return data
  },

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<void> {
    await client.patch(`/api/admin/users/${userId}`, { is_admin: isAdmin })
  },

  async getAdminStats(): Promise<AdminStats> {
    const { data } = await client.get('/api/admin/stats')
    return data
  },

  async getAdminPipelines(): Promise<AdminPipelineInfo[]> {
    const { data } = await client.get('/api/admin/pipelines')
    return data
  },
}
