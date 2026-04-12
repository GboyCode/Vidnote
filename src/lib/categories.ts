// 分类管理工具

export interface Category {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES_KEY = 'vidnotes_categories';
const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'all',
    name: '全部',
    color: '#3b82f6',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// 获取所有分类
export function getCategories(): Category[] {
  try {
    const stored = localStorage.getItem(CATEGORIES_KEY);
    if (!stored) {
      // 如果没有存储的分类，返回默认分类并保存
      saveCategories(DEFAULT_CATEGORIES);
      return DEFAULT_CATEGORIES;
    }
    
    const categories = JSON.parse(stored) as Category[];
    
    // 确保"全部"分类始终存在且在第一位
    const allCategory = categories.find(cat => cat.id === 'all');
    if (!allCategory) {
      const updatedCategories = [DEFAULT_CATEGORIES[0], ...categories];
      saveCategories(updatedCategories);
      return updatedCategories;
    }
    
    // 确保"全部"分类在第一位
    const otherCategories = categories.filter(cat => cat.id !== 'all');
    return [allCategory, ...otherCategories];
  } catch (error) {
    console.error('获取分类失败:', error);
    return DEFAULT_CATEGORIES;
  }
}

// 保存分类到localStorage
function saveCategories(categories: Category[]): void {
  try {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  } catch (error) {
    console.error('保存分类失败:', error);
    throw error;
  }
}

// 添加新分类
export function addCategory(name: string, color?: string): Category {
  try {
    const categories = getCategories();
    
    // 检查分类名是否已存在
    if (categories.some(cat => cat.name === name)) {
      throw new Error('分类名称已存在');
    }
    
    const now = new Date().toISOString();
    const newCategory: Category = {
      id: generateId(),
      name: name.trim(),
      color: color || getRandomColor(),
      createdAt: now,
      updatedAt: now
    };
    
    const updatedCategories = [...categories, newCategory];
    saveCategories(updatedCategories);
    
    return newCategory;
  } catch (error) {
    console.error('添加分类失败:', error);
    throw error;
  }
}

// 更新分类
export function updateCategory(id: string, updates: Partial<Pick<Category, 'name' | 'color'>>): Category | null {
  try {
    // 不允许修改"全部"分类
    if (id === 'all') {
      throw new Error('不能修改默认分类');
    }
    
    const categories = getCategories();
    const categoryIndex = categories.findIndex(cat => cat.id === id);
    
    if (categoryIndex === -1) {
      return null;
    }
    
    // 如果更新名称，检查是否与其他分类重复
    if (updates.name && categories.some(cat => cat.id !== id && cat.name === updates.name)) {
      throw new Error('分类名称已存在');
    }
    
    const updatedCategory: Category = {
      ...categories[categoryIndex],
      ...updates,
      name: updates.name?.trim() || categories[categoryIndex].name,
      updatedAt: new Date().toISOString()
    };
    
    categories[categoryIndex] = updatedCategory;
    saveCategories(categories);
    
    return updatedCategory;
  } catch (error) {
    console.error('更新分类失败:', error);
    throw error;
  }
}

// 删除分类
export function deleteCategory(id: string): boolean {
  try {
    // 不允许删除"全部"分类
    if (id === 'all') {
      throw new Error('不能删除默认分类');
    }
    
    const categories = getCategories();
    const filteredCategories = categories.filter(cat => cat.id !== id);
    
    if (filteredCategories.length === categories.length) {
      return false; // 没有找到要删除的分类
    }
    
    saveCategories(filteredCategories);
    return true;
  } catch (error) {
    console.error('删除分类失败:', error);
    throw error;
  }
}

// 根据ID获取分类
export function getCategoryById(id: string): Category | null {
  try {
    const categories = getCategories();
    return categories.find(cat => cat.id === id) || null;
  } catch (error) {
    console.error('获取分类失败:', error);
    return null;
  }
}

// 清空所有自定义分类（保留"全部"分类）
export function clearCustomCategories(): boolean {
  try {
    saveCategories(DEFAULT_CATEGORIES);
    return true;
  } catch (error) {
    console.error('清空分类失败:', error);
    return false;
  }
}

// 生成唯一ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 获取随机颜色
function getRandomColor(): string {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#ec4899', // pink
    '#6366f1'  // indigo
  ];
  
  return colors[Math.floor(Math.random() * colors.length)];
}

// 验证分类名称
export function validateCategoryName(name: string): { valid: boolean; error?: string } {
  const trimmedName = name.trim();
  
  if (!trimmedName) {
    return { valid: false, error: '分类名称不能为空' };
  }
  
  if (trimmedName.length > 20) {
    return { valid: false, error: '分类名称不能超过20个字符' };
  }
  
  if (trimmedName === '全部') {
    return { valid: false, error: '不能使用保留名称' };
  }
  
  return { valid: true };
}