import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化时间
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

// 验证视频URL
export function validateVideoUrl(url: string): { isValid: boolean; platform?: 'bilibili' | 'douyin' } {
  const bilibiliRegex = /^https?:\/\/(www\.)?(bilibili\.com\/video\/|b23\.tv\/)/
  // 支持更多抖音链接格式
  const douyinRegex = /^https?:\/\/(www\.)?(douyin\.com\/(video\/|share\/video\/|user\/.*\/video\/)|v\.douyin\.com\/|vm\.tiktok\.com\/)/
  
  if (bilibiliRegex.test(url)) {
    return { isValid: true, platform: 'bilibili' }
  }
  
  if (douyinRegex.test(url)) {
    return { isValid: true, platform: 'douyin' }
  }
  
  return { isValid: false }
}

// 格式化相对时间
export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const target = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - target.getTime()) / 1000)
  
  if (diffInSeconds < 60) {
    return '刚刚'
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes}分钟前`
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours}小时前`
  }
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 30) {
    return `${diffInDays}天前`
  }
  
  return target.toLocaleDateString('zh-CN')
}

// 截取文本
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// 生成随机ID
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

// 从分享文本中提取视频链接
export function extractVideoUrl(text: string): string {
  // 如果输入的就是一个有效的URL，直接返回
  const trimmedText = text.trim()
  const { isValid } = validateVideoUrl(trimmedText)
  if (isValid) {
    return trimmedText
  }
  
  // 使用更通用的方法：从http开始到空格或字符串结尾提取URL
  const urlPattern = /https?:\/\/[^\s]+/g
  const matches = text.match(urlPattern)
  
  if (matches && matches.length > 0) {
    // 遍历所有匹配的URL，找到第一个有效的视频链接
    for (const url of matches) {
      // 清理URL末尾可能的标点符号
      const cleanUrl = url.replace(/[.,;!?）】\]}>"'`]+$/, '')
      const { isValid } = validateVideoUrl(cleanUrl)
      if (isValid) {
        return cleanUrl
      }
    }
  }
  
  // 如果没有找到有效的URL，返回原始文本
  return text
}