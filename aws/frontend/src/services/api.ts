import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

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
    bgImage?: string
  ): Promise<void> {
    await client.post('/api/render', {
      filename,
      title,
      subtitles,
      template_id: templateId,
      style,
      bg_image: bgImage,
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
