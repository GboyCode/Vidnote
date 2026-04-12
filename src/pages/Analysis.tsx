import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, Brain, FileText, Clock, CheckCircle, AlertCircle, Loader2, Trash2, Copy, Share2, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import MindMap from '../components/MindMap';
import { useI18n } from '../contexts/I18nContext';
import { 
  getHistory, 
  getHistoryByCategory,
  saveToHistory, 
  deleteFromHistory, 
  updateHistoryCategory,
  formatTimeAgo, 
  getPlatformDisplayName,
  type HistoryItem 
} from '../lib/history';
import {
  getCategories,
  addCategory,
  deleteCategory,
  validateCategoryName,
  type Category
} from '../lib/categories';

interface AnalysisProps {
  videoUrl: string;
  onBack: () => void;
}

interface TaskProgress {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  message?: string;
}

interface AnalysisResult {
  id: string;
  videoUrl: string;
  title: string;
  transcript: string;
  notes: string;
  createdAt: string;
  platform: string;
}

const Analysis: React.FC<AnalysisProps> = ({ videoUrl, onBack }) => {
  const { language, t } = useI18n();
  const [tasks, setTasks] = useState<TaskProgress[]>(() => [
    { id: '0', name: t('analysis.tasks.videoInfo'), status: 'pending', progress: 0 },
    { id: '1', name: t('analysis.tasks.audioExtract'), status: 'pending', progress: 0 },
    { id: '2', name: t('analysis.tasks.transcription'), status: 'pending', progress: 0 },
    { id: '3', name: t('analysis.tasks.aiAnalysis'), status: 'pending', progress: 0 }
  ]);
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [viewMode, setViewMode] = useState<'current' | 'notes' | 'mindmap'>(() => {
    if (videoUrl) {
      return 'current';
    }
    const savedViewMode = localStorage.getItem('analysisViewMode');
    if (savedViewMode) {
      return savedViewMode as 'current' | 'notes' | 'mindmap';
    }
    return 'notes';
  });
  const [showFullMindMap, setShowFullMindMap] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  const pollTimeoutRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const unmountedRef = useRef(false);

  // 获取API基础URL
  const getApiBaseUrl = () => {
    return import.meta.env.VITE_API_BASE_URL || '/api';
  };

  // 监听ESC键关闭全屏模态框
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowFullMindMap(false);
        setShowFullSummary(false);
        setShowFullTranscript(false);
      }
    };

    if (showFullMindMap || showFullSummary || showFullTranscript) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showFullMindMap, showFullSummary, showFullTranscript]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch {}
        abortControllerRef.current = null;
      }
    };
  }, []);

  const analysisStartedRef = useRef(false);

  useEffect(() => {
    // 1. Reset state for the new video URL to avoid showing stale data.
    console.log(`[Effect] New videoUrl: '${videoUrl}'. Resetting state.`);
    setTasks(prev => prev.map(p => ({ ...p, status: 'pending', progress: 0 })));
    setAnalysisResult(null);
    setIsCompleted(false);
    setHasError(false);
    setTaskId(null);
    analysisStartedRef.current = false;

    if (!videoUrl) {
      console.log("[Effect] videoUrl is empty, stopping.");
      return;
    }

    // 2. Check if the analysis is already in our local history.
    console.log("[Effect] Checking history for existing analysis.");
    const historyData = getHistory();
    const existingRecord = historyData.find(item => item.videoUrl === videoUrl);

    // 3. If found, restore the completed state.
    if (existingRecord && existingRecord.notes && existingRecord.transcript) {
      console.log("[Effect] Complete analysis found in history. Restoring state.", existingRecord);
      setAnalysisResult({
        id: existingRecord.id,
        videoUrl: existingRecord.videoUrl,
        title: existingRecord.title,
        transcript: existingRecord.transcript,
        notes: existingRecord.notes,
        createdAt: existingRecord.createdAt,
        platform: existingRecord.platform,
      });
      setIsCompleted(true);
      setTasks(prev => prev.map(task => ({ ...task, status: 'completed', progress: 100 })));
    } else {
      // 4. If not found, start a new analysis.
      console.log("[Effect] No analysis in history. Starting new analysis.");
      analysisStartedRef.current = true;
      startAnalysis();
    }
  }, [videoUrl]);

  useEffect(() => {
    // 加载历史记录和分类
    loadHistory();
    loadCategories();
  }, []);

  // 当选中分类改变时，重新加载历史记录
  useEffect(() => {
    loadHistoryByCategory();
  }, [selectedCategoryId]);

  // 监听viewMode变化，保存到localStorage
  useEffect(() => {
    localStorage.setItem('analysisViewMode', viewMode);
  }, [viewMode]);

  const loadHistory = () => {
    const historyData = getHistory();
    setHistory(historyData);
  };

  const loadCategories = () => {
    const categoriesData = getCategories();
    setCategories(categoriesData);
  };

  const loadHistoryByCategory = () => {
    const historyData = getHistoryByCategory(selectedCategoryId);
    setHistory(historyData);
  };

  const handleAddCategory = () => {
    const validation = validateCategoryName(newCategoryName);
    if (!validation.valid) {
      toast.error(validation.error || '分类名称无效');
      return;
    }

    try {
      addCategory(newCategoryName);
      loadCategories();
      setNewCategoryName('');
      setShowAddCategory(false);
      toast.success('分类添加成功');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加分类失败');
    }
  };

  const handleDeleteCategory = (categoryId: string) => {
    try {
      deleteCategory(categoryId);
      loadCategories();
      
      // 如果删除的是当前选中的分类，切换到"全部"
      if (selectedCategoryId === categoryId) {
        setSelectedCategoryId('all');
      }
      
      toast.success('分类删除成功');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除分类失败');
    }
  };

  const updateTaskStatus = (index: number, status: TaskProgress['status'], progress: number, message?: string) => {
    setTasks(prev => prev.map((task, i) => 
      i === index ? { ...task, status, progress, message } : task
    ));
  };

  const startAnalysis = async () => {
    // Redundant check to prevent re-analyzing completed tasks.
    const history = getHistory();
    const existing = history.find(item => item.videoUrl === videoUrl);
    if (existing && existing.notes && existing.transcript) {
      console.warn("startAnalysis called, but analysis is already complete in history. Aborting and restoring state.");
      setAnalysisResult({
        id: existing.id,
        videoUrl: existing.videoUrl,
        title: existing.title,
        transcript: existing.transcript,
        notes: existing.notes,
        createdAt: existing.createdAt,
        platform: existing.platform,
      });
      setIsCompleted(true);
      setTasks(prev => prev.map(task => ({ ...task, status: 'completed', progress: 100 })));
      return;
    }

    // 防止重复调用
    if (isCompleted) {
      console.log('startAnalysis: Analysis is already completed. Aborting.');
      return;
    }
    if (analysisStartedRef.current && taskId) {
      console.log(t('analysis.errors.alreadyStarted'));
      return;
    }

    try {
      console.log('开始启动分析任务，videoUrl:', videoUrl);
      
      // 启动分析任务
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBaseUrl()}/analyze-video`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ videoUrl })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: t('analysis.errors.startFailed') }));
        throw new Error(errorData.error || t('analysis.errors.startFailed'));
      }

      const responseData = await response.json();
      console.log('API响应数据:', responseData);
      
      // 检查是否有错误信息
      if (responseData.error) {
        throw new Error(responseData.error);
      }
      
      // Case 1: Backend returned a cached, completed result
      if (responseData.notes && responseData.transcript) {
          console.log('Received completed analysis from backend cache.');
          setAnalysisResult(responseData);
          setIsCompleted(true);
          setTasks(prev => prev.map(task => ({ ...task, status: 'completed', progress: 100 })));
          return; // Analysis is done, no polling needed
      }

      // Case 2: Backend started a new analysis task
      const { taskId: newTaskId, status } = responseData;
      setTaskId(newTaskId);
      
      if (status !== 'started') {
        console.error('状态检查失败:', { status, expected: 'started' });
        throw new Error(t('analysis.errors.taskStartFailed'));
      }

      // 开始轮询进度
      pollProgress(newTaskId);
    } catch (error: any) {
      console.error('Analysis error:', error);
      setHasError(true);
      updateTaskStatus(0, 'error', 0, error.message || t('analysis.errors.startFailed'));
      toast.error(`${t('analysis.errors.startFailed')}: ${error.message}`);
    }
  };

  const pollProgress = async (taskId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/progress/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(t('analysis.errors.progressFailed'));
      }

      const progressData = await response.json();
      
      // 更新任务状态
      if (progressData.steps) {
        progressData.steps.forEach((step: any, index: number) => {
          if (index < tasks.length) {
            const status = step.status === 'completed' ? 'completed' : 
                          step.status === 'processing' ? 'processing' : 'pending';
            updateTaskStatus(index, status, step.progress || 0, step.message);
            
            if (status === 'processing') {
              setCurrentTaskIndex(index);
            }
          }
        });
      }

      // 检查整体状态
      if (progressData.status === 'completed') {
        setAnalysisResult(progressData.result);
        setIsCompleted(true);
        
        // 保存到历史记录
        if (progressData.result) {
          try {
            saveToHistory({
              title: progressData.result.title,
              videoUrl: progressData.result.videoUrl,
              platform: progressData.result.platform,
              transcript: progressData.result.transcript,
              notes: progressData.result.notes
            });
            loadHistory(); // 重新加载历史记录
             loadHistoryByCategory(); // 重新加载当前分类的历史记录
          } catch (error) {
            console.error('保存历史记录失败:', error);
          }
        }
        
        toast.success('视频分析完成！');
        return;
      } else if (progressData.status === 'error') {
        setHasError(true);
        toast.error(progressData.message || '分析过程中出现错误');
        return;
      }

      // 继续轮询（恢复初始版本：不再保存定时器引用）
      setTimeout(() => pollProgress(taskId), 1000);
    } catch (error: any) {
      // （恢复初始版本：不再区分 AbortError/ERR_ABORTED）
      console.error('Progress polling error:', error);
      setHasError(true);
      toast.error('获取进度失败');
    }
  };

  const getStatusIcon = (status: TaskProgress['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: TaskProgress['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'processing':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  // 清理文本中的格式符号
  const cleanText = (text: string) => {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体标记 **text**
      .replace(/\*(.*?)\*/g, '$1')     // 移除斜体标记 *text*
      .replace(/`(.*?)`/g, '$1')      // 移除代码标记 `text`
      .replace(/#{1,6}\s/g, '')       // 移除标题标记 # ## ###
      .replace(/^[-*+]\s/gm, '')      // 移除列表标记 - * +
      .replace(/^\d+\.\s/gm, '')      // 移除数字列表标记 1. 2.
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接格式 [text](url)
      .replace(/^>\s/gm, '')          // 移除引用标记 >
      .replace(/\n{3,}/g, '\n\n')     // 合并多个换行为两个
      .trim();
  };

  return (
    <div className="h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 flex-shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center h-16">
            <button 
              onClick={onBack}
              className="flex items-center hover:opacity-80 transition-opacity cursor-pointer"
            >
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 rounded-xl mr-3">
                <span className="text-lg font-bold text-white">VN</span>
              </div>
              <span className="text-xl font-bold text-gray-900">VidNotes</span>
            </button>
            
            {/* 笔记管理菜单栏 - 绝对居中 */}
            <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center space-x-6">
              <button 
                onClick={() => setViewMode('current')}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  viewMode === 'current' 
                    ? "text-primary-600 bg-primary-50 border border-primary-200" 
                    : "text-gray-600 hover:text-primary-600 hover:bg-gray-50"
                )}
              >{t('analysis.viewModes.current')}</button>
              <button 
                onClick={() => setViewMode('notes')}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  viewMode === 'notes' 
                    ? "text-primary-600 bg-primary-50 border border-primary-200" 
                    : "text-gray-600 hover:text-primary-600 hover:bg-gray-50"
                )}
              >{t('analysis.viewModes.notes')}</button>
            </div>
            
            <button
              onClick={onBack}
              className="ml-auto flex items-center bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              {t('analysis.backToHome')}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧边栏 - 仅在非笔记看板模式下显示 */}
        {viewMode !== 'notes' && (
          <div className="w-[20%] bg-white border-r border-gray-200 flex flex-col">

          
          {/* 历史记录 */}
          <div className="flex-1 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('analysis.history.title')}</h3>
            <div className="space-y-2">
              {history.length > 0 ? (
                history.map((item) => (
                  <div 
                    key={item.id} 
                    className={cn(
                      "p-3 rounded-lg cursor-pointer hover:bg-gray-100 group relative",
                      selectedHistoryItem?.id === item.id ? "bg-primary-50 border border-primary-200" : ""
                    )}
                    onClick={() => {
                      setSelectedHistoryItem(item);
                      setAnalysisResult({
                        id: item.id,
                        videoUrl: item.videoUrl,
                        title: item.title,
                        transcript: item.transcript,
                        notes: item.notes,
                        createdAt: item.createdAt,
                        platform: item.platform
                      });
                      setIsCompleted(true);
                      setTasks(prev => prev.map(task => ({ ...task, status: 'completed', progress: 100 })));
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate font-medium">{item.title}</p>
                        <p className="text-xs text-gray-500">{formatTimeAgo(item.createdAt)}</p>
                        <p className="text-xs text-primary-600">{getPlatformDisplayName(item.platform)}</p>
                      </div>
                      <button
                        onClick={async (e) => {
                           e.stopPropagation();
                           
                           // 删除相关的分享链接
                           try {
                             await fetch(`/api/share/record/${item.id}`, {
                               method: 'DELETE'
                             });
                           } catch (error) {
                             console.warn('删除分享链接失败:', error);
                           }
                           
                           // 删除历史记录
                           deleteFromHistory(item.id);
                           loadHistory();
                           loadHistoryByCategory();
                           if (selectedHistoryItem?.id === item.id) {
                             setSelectedHistoryItem(null);
                             setAnalysisResult(null);
                             setIsCompleted(false);
                           }
                         }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">暂无历史记录</p>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* 主内容区域 */}
        <div className={cn(
          "p-6 overflow-auto scrollbar-hide relative bg-gray-50",
          viewMode === 'notes' ? "w-full" : "w-[60%]"
        )}>
            <div className="max-w-full mx-auto space-y-4">
            
            {/* 根据viewMode显示不同内容 */}
            {viewMode === 'notes' ? (
              /* 笔记看板模式 - 全屏历史记录卡片画册 */
              <div className="h-full">

                
                {history.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {history.map((item) => (
                      <div 
                        key={item.id}
                        className={cn(
                          "group relative bg-gradient-to-br from-white to-gray-50 rounded-2xl border-2 transition-all duration-300 cursor-pointer hover:shadow-xl hover:scale-105 overflow-hidden",
                          selectedHistoryItem?.id === item.id 
                            ? "border-primary-300 shadow-xl scale-105 ring-4 ring-primary-100" 
                            : "border-gray-200 hover:border-primary-200"
                        )}
                        onClick={() => {
                          setSelectedHistoryItem(item);
                          setAnalysisResult({
                            id: item.id,
                            videoUrl: item.videoUrl,
                            title: item.title,
                            transcript: item.transcript,
                            notes: item.notes,
                            createdAt: item.createdAt,
                            platform: item.platform
                          });
                          setIsCompleted(true);
                          setTasks(prev => prev.map(task => ({ ...task, status: 'completed', progress: 100 })));
                          setViewMode('current');
                        }}
                      >
                        {/* 卡片头部 - 平台标识和时间 */}
                        <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-primary-50 to-primary-100">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-primary-700 bg-white/80 px-3 py-1 rounded-full">
                              {getPlatformDisplayName(item.platform)}
                            </span>
                            <span className="text-xs text-primary-600 font-medium">
                              {formatTimeAgo(item.createdAt)}
                            </span>
                          </div>
                        </div>
                        
                        {/* 卡片内容 */}
                        <div className="p-4 flex-1">
                          <h3 className="font-bold text-gray-900 text-lg mb-3 line-clamp-2 leading-tight">
                            {item.title}
                          </h3>
                          <p className="text-sm text-gray-600 line-clamp-4 leading-relaxed mb-3">
                             {cleanText(item.notes).substring(0, 150)}...
                           </p>
                           
                           {/* 原视频地址 */}
                           <div className="mb-4 p-2 bg-gray-50 rounded-lg border border-gray-100">
                             <p className="text-xs text-gray-500 mb-1">{t('analysis.history.originalUrl')}</p>
                             <a 
                               href={item.videoUrl} 
                               target="_blank" 
                               rel="noopener noreferrer"
                               className="text-xs text-blue-600 hover:text-blue-800 underline break-all leading-relaxed"
                               onClick={(e) => e.stopPropagation()}
                             >
                               {item.videoUrl}
                             </a>
                           </div>
                           
                           {/* 标签和操作 */}
                           <div className="flex items-center justify-between">
                             <div className="flex items-center space-x-2">
                               <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                 {item.transcript.length > 1000 ? t('analysis.history.longVideo') : t('analysis.history.shortVideo')}
                               </span>
                               <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">
                                 {t('analysis.status.completed')}
                               </span>
                             </div>
                             <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-2">
                               <button 
                                 onClick={async (e) => {
                                   e.stopPropagation();
                                   
                                   // 删除相关的分享链接
                                   try {
                                     await fetch(`/api/share/record/${item.id}`, {
                                       method: 'DELETE'
                                     });
                                   } catch (error) {
                                     console.warn('删除分享链接失败:', error);
                                   }
                                   
                                   // 删除历史记录
                                   deleteFromHistory(item.id);
                                   loadHistory();
                                   loadHistoryByCategory();
                                   if (selectedHistoryItem?.id === item.id) {
                                     setSelectedHistoryItem(null);
                                     setAnalysisResult(null);
                                     setIsCompleted(false);
                                   }
                                 }}
                                 className="text-red-500 hover:text-red-700 p-1 rounded transition-colors"
                                 title={t('analysis.history.deleteRecord')}
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                               <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                                 {t('analysis.history.viewDetails')} →
                               </button>
                             </div>
                           </div>
                        </div>
                        
                        {/* 悬停效果覆盖层 */}
                        <div className="absolute inset-0 bg-gradient-to-t from-primary-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        
                        {/* 选中指示器 */}
                        {selectedHistoryItem?.id === item.id && (
                          <div className="absolute top-3 right-3 w-4 h-4 bg-primary-500 rounded-full border-2 border-white shadow-lg animate-pulse" />
                        )}
                        
                        {/* 卡片装饰 */}

                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-32 h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText className="w-16 h-16 text-gray-400" />
                      </div>
                      <h3 className="text-2xl font-semibold text-gray-900 mb-3">暂无笔记记录</h3>
                      <p className="text-gray-600 mb-4">完成视频分析后，您的笔记会以精美的卡片形式展示在这里</p>
                      <button 
                        onClick={() => setViewMode('current')}
                        className="bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors font-medium"
                      >
                        开始分析视频
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 当前页面模式 - 原有的分析内容 */
              <>
                {/* 当有videoUrl或analysisResult时显示分析相关内容，否则显示空白页面 */}
                {(videoUrl && videoUrl.trim()) || analysisResult ? (
                  <>
                    {/* 上方两个大卡片 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* AI总结卡片 */}
                      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 relative">
                        <div className="p-4 border-b border-gray-200">
                          <h2 className="text-xl font-bold text-gray-900 flex items-center">
                            <FileText className="w-6 h-6 mr-3 text-primary-600" />
                            AI总结
                          </h2>
                        </div>
                        <div className="p-6 pb-16">
                          {isCompleted && analysisResult ? (
                            <>
                              <div className="bg-gray-50 rounded-lg p-4 min-h-[200px] max-h-[280px] overflow-y-auto scrollbar-hide">
                                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                                  {cleanText(analysisResult.notes)}
                                </pre>
                              </div>

                            </>
                          ) : hasError ? (
                            <div className="text-center py-12">
                              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                              <h3 className="text-lg font-semibold text-gray-900 mb-2">分析失败</h3>
                              <p className="text-gray-600 text-sm mb-4">请检查视频链接是否正确，或稍后重试</p>
                              <button
                                onClick={onBack}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
                              >
                                {t('analysis.actions.restart')}
                              </button>
                            </div>
                          ) : (
                            <div className="text-center py-12">
                              <Loader2 className="w-12 h-12 text-primary-600 mx-auto mb-3 animate-spin" />
                              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('analysis.status.analyzing')}</h3>
                              <p className="text-gray-600 text-sm">{t('analysis.status.pleaseWait')}</p>
                            </div>
                          )}
                        </div>
                        {isCompleted && analysisResult && (
                          <div className="absolute bottom-4 right-4 flex space-x-2">
                            <button
                              onClick={() => setShowFullSummary(true)}
                              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                              title={t('analysis.actions.fullPreview')}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(analysisResult.notes).then(() => {
                                  toast.success(t('analysis.actions.copiedSummary'));
                                }).catch(() => {
                                  toast.error(t('analysis.actions.copyFailed'));
                                });
                              }}
                              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                              title={t('analysis.actions.copySummary')}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const response = await fetch(`${getApiBaseUrl()}/share`, {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      title: `AI总结 - ${analysisResult.title}`,
                                      content: analysisResult.notes,
                                      type: 'summary',
                                      recordId: analysisResult.id
                                    })
                                  });
                                  
                                  if (!response.ok) {
                                    throw new Error(t('analysis.actions.shareGenerateFailed'));
                                  }
                                  
                                  const { shareUrl } = await response.json();
                                  
                                  // 直接复制分享链接到剪贴板
                                  navigator.clipboard.writeText(shareUrl).then(() => {
                                    toast.success(t('analysis.actions.shareLinkCopied'));
                                  }).catch(() => {
                                    toast.error(t('analysis.actions.copyFailed'));
                                  });
                                } catch (error) {
                                  console.error('分享失败:', error);
                                  toast.error(t('analysis.actions.shareGenerateFailed'));
                                }
                              }}
                              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                              title={t('analysis.actions.shareSummary')}
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 完整转录卡片 */}
                      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 relative">
                        <div className="p-4 border-b border-gray-200">
                          <h2 className="text-xl font-bold text-gray-900 flex items-center">
                            <FileText className="w-6 h-6 mr-3 text-primary-600" />
                            {t('analysis.transcript.title')}
                          </h2>
                        </div>
                        <div className="p-6 pb-16">
                          {isCompleted && analysisResult ? (
                            <>
                              <div className="bg-gray-50 rounded-lg p-4 min-h-[200px] max-h-[280px] overflow-y-auto scrollbar-hide">
                                <p className="text-sm text-gray-700 leading-relaxed">
                                  {cleanText(analysisResult.transcript)}
                                </p>
                              </div>

                            </>
                          ) : (
                            <div className="bg-gray-50 rounded-lg p-4 min-h-[200px] flex items-center justify-center">
                              <p className="text-gray-500 text-sm">{t('analysis.transcript.waiting')}</p>
                            </div>
                          )}
                        </div>
                        {isCompleted && analysisResult && (
                          <div className="absolute bottom-4 right-4 flex space-x-2">
                            <button
                              onClick={() => setShowFullTranscript(true)}
                              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                              title={t('analysis.actions.fullPreview')}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(analysisResult.transcript).then(() => {
                                  toast.success(t('analysis.actions.copiedTranscript'));
                                }).catch(() => {
                                  toast.error(t('analysis.actions.copyFailed'));
                                });
                              }}
                              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                              title={t('analysis.actions.copyTranscript')}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const response = await fetch(`${getApiBaseUrl()}/share`, {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      title: `${t('analysis.transcript.title')} - ${analysisResult.title}`,
                                      content: analysisResult.transcript,
                                      type: 'transcript',
                                      recordId: analysisResult.id
                                    })
                                  });
                                  
                                  if (!response.ok) {
                                    throw new Error(t('analysis.actions.shareGenerateFailed'));
                                  }
                                  
                                  const { shareUrl } = await response.json();
                                  
                                  // 直接复制分享链接到剪贴板
                                  navigator.clipboard.writeText(shareUrl).then(() => {
                                    toast.success(t('analysis.actions.shareLinkCopied'));
                                  }).catch(() => {
                                    toast.error(t('analysis.actions.copyFailed'));
                                  });
                                } catch (error) {
                                  console.error('分享失败:', error);
                                  toast.error(t('analysis.actions.shareGenerateFailed'));
                                }
                              }}
                              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                              title={t('analysis.actions.shareTranscript')}
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    

                    {/* 下方合并的大卡片 */}
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-200">
                      <div className="p-4 border-b border-gray-200">
                        <h2 className="text-xl font-bold text-gray-900 flex items-center">
                          <FileText className="w-6 h-6 mr-3 text-primary-600" />
                          {t('analysis.details.title')}
                        </h2>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          
                          {/* 分析进度部分 */}
                          <div className="flex flex-col h-full">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                              <Brain className="w-5 h-5 mr-3 text-primary-600" />
                              {t('analysis.progress.title')}
                            </h3>
                            <div className="space-y-4 flex-1">
                              {tasks.map((task, index) => (
                                <div key={task.id} className="flex items-center space-x-3">
                                  <div className="flex-shrink-0">
                                    {getStatusIcon(task.status)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className={cn(
                                        "text-sm font-medium truncate",
                                        task.status === 'completed' ? 'text-green-700' :
                                        task.status === 'processing' ? 'text-blue-700' :
                                        task.status === 'error' ? 'text-red-700' :
                                        'text-gray-600'
                                      )}>
                                        {task.name}
                                      </span>
                                      {task.status === 'processing' && (
                                        <span className="text-xs text-gray-500 ml-2">{task.progress}%</span>
                                      )}
                                    </div>
                                    
                                    {(task.status === 'processing' || task.status === 'completed') && (
                                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                                        <div 
                                          className={cn("h-1.5 rounded-full transition-all duration-300", getStatusColor(task.status))}
                                          style={{ width: `${task.progress}%` }}
                                        />
                                      </div>
                                    )}
                                    
                                    {task.message && (
                                      <p className="text-xs text-red-600 mt-1 truncate">{task.message}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 视频信息部分 */}
                          <div className="flex flex-col h-full">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                              <Play className="w-5 h-5 mr-3 text-primary-600" />
                              {t('analysis.video.title')}
                            </h3>
                            <div className="space-y-1 flex-1">
                              <div className="bg-gray-50 rounded-lg p-1">
                                <p className="text-xs text-gray-500 mb-0.5">{t('analysis.video.url')}</p>
                                <a 
                                  href={analysisResult?.videoUrl || videoUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-sm text-blue-600 hover:text-blue-800 underline break-all"
                                >
                                  {analysisResult?.videoUrl || videoUrl}
                                </a>
                              </div>
                              {analysisResult && (
                                <>
                                  <div className="bg-gray-50 rounded-lg p-1">
                                    <p className="text-xs text-gray-500 mb-0.5">{t('analysis.result.title')}</p>
                                    <p className="text-sm text-gray-900 font-medium">{analysisResult.title}</p>
                                  </div>
                                  <div className="bg-gray-50 rounded-lg p-1">
                                    <p className="text-xs text-gray-500 mb-0.5">{t('analysis.result.platform')}</p>
                                    <p className="text-sm text-gray-900 font-medium">{analysisResult.platform}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  // 空白页面 - 当没有videoUrl时显示
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-32 h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText className="w-16 h-16 text-gray-400" />
                      </div>
                      <h3 className="text-2xl font-semibold text-gray-900 mb-3">{t('analysis.welcome.title')}</h3>
                      <p className="text-gray-600 mb-4">{t('analysis.welcome.description')}</p>
                      <p className="text-gray-500 text-xs">{t('analysis.welcome.instruction')}</p>
                    </div>
                  </div>
                )}
              </>
            )}
            </div>
        </div>
        
        {/* 右侧面板区域 - 20% 宽度 - 仅在非笔记看板模式下显示 */}
        {viewMode !== 'notes' && (
          <div className="w-[20%] p-6 border-l border-gray-200 bg-white">
              <div className="h-full">
                {/* 思维导图模式 */}
                <>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center justify-between">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 mr-3 text-primary-600">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                        <path d="M2 12h20"/>
                      </svg>
                      {t('analysis.mindMap.title')}
                    </div>
                    {isCompleted && analysisResult && (
                      <button 
                        onClick={() => setShowFullMindMap(true)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200 group"
                        title={t('analysis.mindMap.expand')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 group-hover:text-primary-600">
                          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                        </svg>
                      </button>
                    )}
                  </h3>
                  
                  {isCompleted && analysisResult ? (
                    <div className="h-[calc(100%-3rem)] rounded-lg overflow-hidden">
                      <MindMap data={analysisResult.notes} />
                    </div>
                  ) : (
                    <div className="h-[calc(100%-3rem)] bg-gray-50 rounded-lg p-4 flex items-center justify-center">
                      <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 text-gray-400 mx-auto mb-3">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                          <path d="M2 12h20"/>
                        </svg>
                        <p className="text-gray-500 text-sm">{t('analysis.mindMap.waiting')}</p>
                      </div>
                    </div>
                  )}
                </>
              </div>
          </div>
        )}
      </div>
      
      {/* 全屏思维导图模态框 */}
      {showFullMindMap && isCompleted && analysisResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white w-[95vw] h-[95vh] rounded-lg shadow-2xl overflow-hidden">
            {/* 头部工具栏 */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 mr-3 text-primary-600">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                  <path d="M2 12h20"/>
                </svg>
                {t('analysis.mindMap.canvas')}
              </h2>
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => {
                    // 直接调用导出功能
                    const svgElement = document.querySelector('.mind-map-container svg') as SVGElement;
                    if (svgElement) {
                      // 获取SVG的实际边界框
                      const bbox = (svgElement as SVGSVGElement).getBBox();
                      const padding = 50; // 添加边距
                      const exportWidth = Math.max(1200, bbox.width + padding * 2);
                      const exportHeight = Math.max(800, bbox.height + padding * 2);
                      
                      // 创建临时SVG元素
                      const tempSvg = svgElement.cloneNode(true) as SVGElement;
                      tempSvg.setAttribute('width', exportWidth.toString());
                      tempSvg.setAttribute('height', exportHeight.toString());
                      tempSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);
                      tempSvg.style.backgroundColor = 'white';
                      
                      // 创建Canvas并绘制
                      const canvas = document.createElement('canvas');
                      canvas.width = exportWidth;
                      canvas.height = exportHeight;
                      const ctx = canvas.getContext('2d')!;
                      
                      // 填充白色背景
                      ctx.fillStyle = 'white';
                      ctx.fillRect(0, 0, canvas.width, canvas.height);
                      
                      // 将SVG转换为图片
                      const svgData = new XMLSerializer().serializeToString(tempSvg);
                      const img = new Image();
                      img.onload = () => {
                        ctx.drawImage(img, 0, 0, exportWidth, exportHeight);
                        
                        // 下载图片
                        const link = document.createElement('a');
                        link.download = `mindmap-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                      };
                      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                    }
                  }}
                  className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 text-sm font-medium"
                  title={t('analysis.mindMap.exportImage')}
                >
                  <Download className="w-4 h-4" />
                  <span>{t('analysis.mindMap.exportImage')}</span>
                </button>
                <button 
                  onClick={() => setShowFullMindMap(false)}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200"
                  title={t('analysis.actions.close')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* 思维导图画布 */}
            <div className="h-[calc(100%-80px)] relative overflow-hidden">
              <MindMap data={analysisResult.notes} />
            </div>
          </div>
        </div>
      )}

      {/* AI总结全文预览模态框 */}
      {showFullSummary && isCompleted && analysisResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white w-[90vw] h-[90vh] rounded-lg shadow-2xl overflow-hidden">
            {/* 头部工具栏 */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <FileText className="w-6 h-6 mr-3 text-primary-600" />
                {t('analysis.summary.fullPreview')}
              </h2>
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(analysisResult.notes).then(() => {
                      toast.success(t('analysis.actions.copiedSummary'));
                    }).catch(() => {
                      toast.error(t('analysis.actions.copyFailed'));
                    });
                  }}
                  className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 text-sm font-medium"
                  title={t('analysis.actions.copySummary')}
                >
                  <Copy className="w-4 h-4" />
                  <span>{t('analysis.actions.copy')}</span>
                </button>
                <button 
                  onClick={() => setShowFullSummary(false)}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200"
                  title={t('analysis.actions.close')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* 内容区域 */}
            <div className="h-[calc(100%-80px)] p-6 overflow-y-auto">
              <div className="bg-gray-50 rounded-lg p-6">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                  {cleanText(analysisResult.notes)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 完整转录全文预览模态框 */}
      {showFullTranscript && isCompleted && analysisResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white w-[90vw] h-[90vh] rounded-lg shadow-2xl overflow-hidden">
            {/* 头部工具栏 */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <FileText className="w-6 h-6 mr-3 text-primary-600" />
                {t('analysis.transcript.fullPreview')}
              </h2>
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(analysisResult.transcript).then(() => {
                      toast.success(t('analysis.actions.copiedTranscript'));
                    }).catch(() => {
                      toast.error(t('analysis.actions.copyFailed'));
                    });
                  }}
                  className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 text-sm font-medium"
                  title={t('analysis.actions.copyTranscript')}
                >
                  <Copy className="w-4 h-4" />
                  <span>复制</span>
                </button>
                <button 
                  onClick={() => setShowFullTranscript(false)}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200"
                  title="关闭 (ESC)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* 内容区域 */}
            <div className="h-[calc(100%-80px)] p-6 overflow-y-auto">
              <div className="bg-gray-50 rounded-lg p-6">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {cleanText(analysisResult.transcript)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analysis;