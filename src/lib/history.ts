// 历史记录管理工具

export interface HistoryItem {
  id: string;
  title: string;
  videoUrl: string;
  platform: string;
  transcript: string;
  notes: string;
  categoryId?: string; // 分类ID，默认为'all'
  createdAt: string;
  updatedAt: string;
}

const HISTORY_KEY = 'vidnotes_history';
const MAX_HISTORY_ITEMS = 50; // 最多保存50条记录

// 获取所有历史记录
export function getHistory(): HistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return [];
    
    const history = JSON.parse(stored) as HistoryItem[];
    // 按创建时间倒序排列
    return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('获取历史记录失败:', error);
    return [];
  }
}

// 保存新的历史记录
export function saveToHistory(item: Omit<HistoryItem, 'id' | 'createdAt' | 'updatedAt'>): HistoryItem {
  try {
    const history = getHistory();
    const now = new Date().toISOString();
    
    const newItem: HistoryItem = {
      ...item,
      id: generateId(),
      categoryId: item.categoryId || 'all', // 默认分类为'all'
      createdAt: now,
      updatedAt: now
    };
    
    // 检查是否已存在相同的视频URL
    const existingIndex = history.findIndex(h => h.videoUrl === item.videoUrl);
    if (existingIndex >= 0) {
      // 更新现有记录
      history[existingIndex] = {
        ...history[existingIndex],
        ...item,
        categoryId: item.categoryId || history[existingIndex].categoryId || 'all',
        updatedAt: now
      };
    } else {
      // 添加新记录
      history.unshift(newItem);
      
      // 限制历史记录数量
      if (history.length > MAX_HISTORY_ITEMS) {
        history.splice(MAX_HISTORY_ITEMS);
      }
    }
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return existingIndex >= 0 ? history[existingIndex] : newItem;
  } catch (error) {
    console.error('保存历史记录失败:', error);
    throw error;
  }
}

// 根据ID获取历史记录
export function getHistoryById(id: string): HistoryItem | null {
  try {
    const history = getHistory();
    return history.find(item => item.id === id) || null;
  } catch (error) {
    console.error('获取历史记录失败:', error);
    return null;
  }
}

// 删除历史记录
export function deleteFromHistory(id: string): boolean {
  try {
    const history = getHistory();
    const filteredHistory = history.filter(item => item.id !== id);
    
    if (filteredHistory.length === history.length) {
      return false; // 没有找到要删除的项
    }
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filteredHistory));
    return true;
  } catch (error) {
    console.error('删除历史记录失败:', error);
    return false;
  }
}

// 清空所有历史记录
export function clearHistory(): boolean {
  try {
    localStorage.removeItem(HISTORY_KEY);
    return true;
  } catch (error) {
    console.error('清空历史记录失败:', error);
    return false;
  }
}

// 生成唯一ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 格式化时间显示
export function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) {
    return '刚刚';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

// 根据分类ID获取历史记录
export function getHistoryByCategory(categoryId: string): HistoryItem[] {
  try {
    const allHistory = getHistory();
    
    if (categoryId === 'all') {
      return allHistory;
    }
    
    return allHistory.filter(item => item.categoryId === categoryId);
  } catch (error) {
    console.error('按分类获取历史记录失败:', error);
    return [];
  }
}

// 更新历史记录的分类
export function updateHistoryCategory(historyId: string, categoryId: string): boolean {
  try {
    const history = getHistory();
    const itemIndex = history.findIndex(item => item.id === historyId);
    
    if (itemIndex === -1) {
      return false;
    }
    
    history[itemIndex] = {
      ...history[itemIndex],
      categoryId: categoryId,
      updatedAt: new Date().toISOString()
    };
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    console.error('更新历史记录分类失败:', error);
    return false;
  }
}

// 获取平台显示名称
export function getPlatformDisplayName(platform: string): string {
  const platformMap: Record<string, string> = {
    'douyin': '抖音',
    'bilibili': '哔哩哔哩',
    'youtube': 'YouTube',
    'local': '本地文件',
    'unknown': '未知平台'
  };
  
  return platformMap[platform] || platform;
}