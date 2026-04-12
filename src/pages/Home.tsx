import React, { useState, useEffect, useRef } from 'react';
import { Play, Upload, Zap, Brain, FileText, ArrowRight, Loader2, Menu, X, User, LogOut, Clock, Globe } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { validateVideoUrl, extractVideoUrl } from '../lib/utils';
import ParticleBackground from '../components/ParticleBackground';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { Link } from 'react-router-dom';

interface HomeProps {
  onStartAnalysis: (videoUrl: string) => void;
  onNavigateToAnalysis?: () => void;
}
interface UsageInfo {
  currentUsage: number;
  dailyLimit: number;
  remainingUsage: number;
  isAdmin: boolean;
}

const Home: React.FC<HomeProps> = ({ onStartAnalysis, onNavigateToAnalysis }) => {
  const { user, logout, isAdmin } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const [videoUrl, setVideoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 获取API基础URL
  const getApiBaseUrl = () => {
    return import.meta.env.VITE_API_BASE_URL || '/api';
  };

  // 获取用户使用次数信息
  const fetchUsageInfo = async () => {
    if (!user) return;
    
    setLoadingUsage(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBaseUrl()}/usage/daily`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsageInfo(data);
      } else {
        console.error('获取使用次数失败');
      }
    } catch (error) {
      console.error('获取使用次数失败:', error);
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    // 页面加载时自动聚焦到输入框
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    // 获取使用次数信息
    if (user) {
      fetchUsageInfo();
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) {
      toast.error(language === 'zh' ? '请输入视频链接或分享文本' : 'Please enter video link or share text');
      return;
    }

    // 检查使用次数限制（仅对非管理员用户）
    if (user && usageInfo && !usageInfo.isAdmin && usageInfo.remainingUsage <= 0) {
      toast.error(language === 'zh' ? '今日使用次数已达上限（3次），请明天再试或联系管理员' : 'Daily usage limit reached (3 times), please try again tomorrow or contact admin');
      return;
    }

    // 直接跳转到分析页面，让后端处理URL提取和验证
    onStartAnalysis(videoUrl);
  };

  const features = [
    {
      icon: Brain,
      title: t('features.aiSummary'),
      description: t('features.aiSummaryDesc')
    },
    {
      icon: FileText,
      title: t('features.noteManagement'),
      description: t('features.noteManagementDesc')
    },
    {
      icon: Zap,
      title: t('features.mindMap'),
      description: t('features.mindMapDesc')
    }
  ];

  const steps = [
    {
      step: '01',
      title: t('steps.step1Title'),
      description: t('steps.step1Desc')
    },
    {
      step: '02',
      title: t('steps.step2Title'),
      description: t('steps.step2Desc')
    },
    {
      step: '03',
      title: t('steps.step3Title'),
      description: t('steps.step3Desc')
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50">
      {/* Header */}
      <header className="sticky top-4 z-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto bg-white/40 backdrop-blur-lg border border-gray-200/30 rounded-2xl shadow-lg">
          <div className="flex items-center h-16 px-4 sm:px-6">
            {/* Left: Logo */}
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 rounded-xl mr-3">
                <span className="text-lg font-bold text-white">VN</span>
              </div>
              <span className="text-xl font-bold text-gray-900">VidNotes</span>
            </div>
            
            {/* Center: Navigation */}
            <nav className="hidden md:flex items-center space-x-6 flex-1 justify-center">
              <a href="#features" className="text-gray-600 hover:text-primary-600 transition-colors">
                {t('nav.features')}
              </a>
              <a href="#how-it-works" className="text-gray-600 hover:text-primary-600 transition-colors">
                {t('nav.howItWorks')}
              </a>
              <button
                onClick={() => onNavigateToAnalysis ? onNavigateToAnalysis() : toast.info(language === 'zh' ? '笔记管理功能即将上线' : 'Note management feature coming soon')}
                className="text-gray-600 hover:text-primary-600 transition-colors"
              >{t('nav.noteManagement')}</button>
            </nav>
            
            {/* Right: User Info */}
            <div className="hidden md:flex items-center space-x-4">
              {user ? (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-600">{user.username}</span>
                  </div>
                  <button
                    onClick={logout}
                    className="flex items-center space-x-1 text-gray-600 hover:text-red-600 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">{t('nav.logout')}</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-1">
                  <Link
                    to="/login"
                    className="text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    {t('nav.login')}
                  </Link>
                  <span className="text-gray-400">/</span>
                  <Link
                    to="/register"
                    className="text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    {t('nav.register')}
                  </Link>
                </div>
              )}
              
              {/* Language Switch Button */}
              <button
                onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
                className="flex items-center space-x-1 text-gray-600 hover:text-primary-600 transition-colors p-2 rounded-lg hover:bg-gray-100"
                title={language === 'zh' ? 'Switch to English' : '切换到中文'}
              >
                <Globe className="w-4 h-4" />
                <span className="text-sm font-medium">{language === 'zh' ? 'EN' : '中'}</span>
              </button>
            </div>
            
            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-gray-600 hover:text-gray-900 focus:outline-none focus:text-gray-900"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
          
          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden">
              <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white/40 backdrop-blur-lg border-t border-gray-200/30">
                <a
                  href="#features"
                  className="block px-3 py-2 text-gray-600 hover:text-primary-600 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('nav.features')}
                </a>
                <a
                  href="#how-it-works"
                  className="block px-3 py-2 text-gray-600 hover:text-primary-600 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('nav.howItWorks')}
                </a>
                <button
                  onClick={() => {
                    onNavigateToAnalysis ? onNavigateToAnalysis() : toast.info(language === 'zh' ? '笔记管理功能即将上线' : 'Note management feature coming soon');
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2 text-gray-600 hover:text-primary-600 transition-colors"
                >
                  {t('nav.noteManagement')}
                </button>
                
                {user ? (
                  <div className="border-t border-gray-200/30 pt-2 mt-2">
                    <div className="flex items-center px-3 py-2 text-gray-600">
                      <User className="w-4 h-4 mr-2" />
                      <span className="text-sm">{user.username}</span>
                    </div>
                    <button
                      onClick={() => {
                        logout();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center w-full px-3 py-2 text-gray-600 hover:text-red-600 transition-colors"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      <span className="text-sm">{t('nav.logout')}</span>
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-gray-200/30 pt-2 mt-2">
                    <div className="flex items-center px-3 py-2">
                      <Link
                        to="/login"
                        className="text-gray-600 hover:text-primary-600 transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {t('nav.login')}
                      </Link>
                      <span className="text-gray-400 mx-2">/</span>
                      <Link
                        to="/register"
                        className="text-gray-600 hover:text-primary-600 transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {t('nav.register')}
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 pb-16 relative overflow-hidden min-h-screen">
        <ParticleBackground />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              {t('home.title')}
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-12 max-w-3xl mx-auto px-4">
              {t('home.subtitle')}
            </p>

            {/* Video Input Form */}
            <div className="max-w-3xl mx-auto px-4">
              <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 sm:p-10">
                <div className="mb-6">
                  <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-700 mb-3 text-left">
                    {language === 'zh' ? '视频链接' : 'Video Link'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Play className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      ref={inputRef}
                      id="videoUrl"
                      type="text"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder={t('home.urlPlaceholder')}
                      className="block w-full pl-12 pr-4 py-5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-lg"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!videoUrl.trim() || (user && usageInfo && !usageInfo.isAdmin && usageInfo.remainingUsage <= 0)}
                  className={cn(
                    "w-full flex items-center justify-center px-6 py-5 border border-transparent rounded-xl text-lg font-medium text-white transition-all",
                    "bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500",
                    (!videoUrl.trim() || (user && usageInfo && !usageInfo.isAdmin && usageInfo.remainingUsage <= 0)) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Upload className="w-5 h-5 mr-3" />
                  {user && usageInfo && !usageInfo.isAdmin && usageInfo.remainingUsage <= 0 ? 
                    (language === 'zh' ? '今日次数已用完' : 'Daily limit reached') : 
                    t('home.analyzeButton')
                  }
                  <ArrowRight className="w-5 h-5 ml-3" />
                </button>
              </form>

              {/* Usage Info Display */}
              {user && usageInfo && (
                <div className="mt-6">
                  <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/50 p-4 shadow-sm">
                    <div className="flex items-center justify-center space-x-6">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-primary-600" />
                        <span className="text-sm font-medium text-gray-700">
                          {usageInfo.isAdmin ? (
                            <span className="text-green-600">{t('usage.adminAccount')}</span>
                          ) : (
                            <>
                              {t('usage.remainingToday')}: 
                              <span className={cn(
                                "font-bold ml-1",
                                usageInfo.remainingUsage > 1 ? "text-green-600" : 
                                usageInfo.remainingUsage === 1 ? "text-yellow-600" : "text-red-600"
                              )}>
                                {usageInfo.remainingUsage}/{usageInfo.dailyLimit}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                      {!usageInfo.isAdmin && usageInfo.remainingUsage === 0 && (
                        <div className="text-xs text-red-600 bg-red-50 px-3 py-1 rounded-full">
                          今日已达使用上限
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Supported Platforms */}
              <div className="mt-8">
                <p className="text-sm text-gray-500 mb-4">{t('usage.supportedPlatforms')}</p>
                <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-8 opacity-60">
                  <div className="text-xs sm:text-sm font-medium text-gray-600">抖音</div>
                  <div className="text-xs sm:text-sm font-medium text-gray-600">哔哩哔哩</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('features.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('features.subtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={index} className="text-center p-6 sm:p-8 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-primary-100 rounded-2xl mb-4 sm:mb-6">
                    <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">{feature.title}</h3>
                  <p className="text-sm sm:text-base text-gray-600">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-gradient-to-br from-primary-50 to-primary-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t('steps.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('steps.subtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg">
                  <div className="text-3xl sm:text-4xl font-bold text-primary-600 mb-3 sm:mb-4">{step.step}</div>
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">{step.title}</h3>
                  <p className="text-sm sm:text-base text-gray-600">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <ArrowRight className="w-6 h-6 sm:w-8 sm:h-8 text-primary-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 px-4">
            {t('cta.title')}
          </h2>
          <p className="text-lg sm:text-xl text-primary-100 mb-8 max-w-2xl mx-auto px-4">
            {t('cta.subtitle')}
          </p>

        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="sm:col-span-2">
              <div className="flex items-center mb-4">
                <div className="flex items-center justify-center w-10 h-10 bg-primary-600 rounded-xl mr-3">
                  <span className="text-lg font-bold text-white">VN</span>
                </div>
                <span className="text-xl font-bold">VidNotes</span>
              </div>
              <p className="text-gray-400 mb-4">
                {t('footer.description')}
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">{t('footer.product')}</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">{t('footer.features')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('footer.howItWorks')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('footer.pricing')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">{t('footer.support')}</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">{t('footer.helpCenter')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('footer.contact')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('footer.privacy')}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <div className="flex items-center justify-center space-x-4">
              <p>{t('footer.copyright')}</p>
              {user && isAdmin && (
                <button 
                  onClick={() => {
                    // 将token传递给管理后台
                    const token = localStorage.getItem('token');
                    // 根据环境动态生成管理后台URL - 使用应用基础URL而不是API URL
                    const baseUrl = import.meta.env.VITE_APP_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3002' : 'https://vidnotes.mrgrl.com');
                    const adminUrl = `${baseUrl}/admin?token=${encodeURIComponent(token || '')}`;
                    window.open(adminUrl, '_blank');
                  }}
                  className="text-gray-500 hover:text-gray-300 transition-colors text-sm bg-transparent border-none cursor-pointer"
                >
                  {t('footer.adminPanel')}
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;