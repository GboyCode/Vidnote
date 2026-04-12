import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, Eye, ArrowLeft, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface ShareData {
  id: string;
  title: string;
  content: string;
  type: 'summary' | 'transcript';
  createdAt: string;
  views: number;
}

const Share: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }

    fetchShareData();
  }, [shareId]);

  const fetchShareData = async () => {
    try {
      const response = await fetch(`/api/share/${shareId}`);
      if (!response.ok) {
        throw new Error('分享内容不存在或已过期');
      }
      const data = await response.json();
      setShareData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取分享内容失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (shareData) {
      navigator.clipboard.writeText(shareData.content).then(() => {
        toast.success('内容已复制到剪贴板');
      }).catch(() => {
        toast.error('复制失败，请手动复制');
      });
    }
  };

  const handleGoToApp = () => {
    // 根据环境决定跳转地址
    const baseUrl = import.meta.env.VITE_APP_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5173' : 'https://vidnotes.mrgrl.com');
    window.location.href = baseUrl;
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载分享内容...</p>
        </div>
      </div>
    );
  }

  if (error || !shareData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">内容不存在</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={handleGoToApp}
            className="bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            前往 VidNotes
          </button>
        </div>
      </div>
    );
  }

  const getTypeDisplayName = (type: string) => {
    return type === 'summary' ? 'AI总结' : '完整转录';
  };

  const getTypeIcon = (type: string) => {
    return type === 'summary' ? '🧠' : '📝';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* 顶部导航 */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/50 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <div className="flex items-center justify-center w-8 h-8 bg-primary-600 rounded-lg mr-3">
                <span className="text-sm font-bold text-white">VN</span>
              </div>
              <span className="text-lg font-bold text-gray-900">VidNotes</span>
              <span className="ml-2 text-sm text-gray-500">分享</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center text-sm text-gray-500">
                <Eye className="w-4 h-4 mr-1" />
                {shareData.views} 次查看
              </div>
              <button
                onClick={handleGoToApp}
                className="flex items-center text-primary-600 hover:text-primary-700 transition-colors text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                使用 VidNotes
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* 卡片头部 */}
          <div className="bg-primary-600 px-6 py-4 text-white">
            <div className="flex items-center mb-2">
              <span className="text-xl mr-3">{getTypeIcon(shareData.type)}</span>
              <div>
                <h1 className="text-xl font-bold">{getTypeDisplayName(shareData.type)}</h1>
                <p className="text-primary-100 mt-1 text-sm">
                  分享于 {new Date(shareData.createdAt).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* 卡片内容 */}
          <div className="p-6">
            <div className="bg-gray-50 rounded-xl p-6 min-h-[300px] relative">
              <div className="prose prose-gray max-w-none">
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {cleanText(shareData.content)}
                </div>
              </div>
              

            </div>
          </div>

          {/* 卡片底部 */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                由 <span className="font-medium text-primary-600">VidNotes</span> 智能生成
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleCopy}
                  className="p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-gray-600 hover:text-primary-600 border border-gray-200"
                  title="复制内容"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={handleGoToApp}
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                >
                  体验 VidNotes
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 底部说明 */}
        <div className="text-center mt-8">
          <p className="text-gray-500 text-sm">
            VidNotes - 智能视频笔记工具，让学习更高效
          </p>
        </div>
      </main>
    </div>
  );
};

export default Share;