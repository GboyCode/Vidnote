import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'zh' | 'en';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// 翻译文件
const translations = {
  zh: {
    // 导航栏
    'nav.features': '功能特色',
    'nav.howItWorks': '使用方法',
    'nav.noteManagement': '笔记管理',
    'nav.login': '登录',
    'nav.register': '注册',
    'nav.logout': '退出',
    
    // 首页
    'home.title': 'AI 视频笔记助手',
    'home.subtitle': '让 AI 帮你从视频中提取关键信息，生成结构化笔记',
    'home.urlPlaceholder': '请输入 YouTube 或 Bilibili 视频链接',
    'home.analyzeButton': '开始分析',
    'home.analyzing': '分析中...',
    'home.features.title': '功能特色',
    'home.features.ai.title': 'AI 智能分析',
    'home.features.ai.desc': '先进的 AI 技术自动提取视频关键信息',
    'home.features.notes.title': '结构化笔记',
    'home.features.notes.desc': '自动生成清晰的章节和要点总结',
    'home.features.mindmap.title': '思维导图',
    'home.features.mindmap.desc': '可视化知识结构，便于理解和记忆',
    'home.howItWorks.title': '使用方法',
    'home.howItWorks.step1': '粘贴视频链接',
    'home.howItWorks.step2': 'AI 自动分析',
    'home.howItWorks.step3': '获得结构化笔记',
    
    // 登录页面
    'login.title': '登录',
    'login.welcomeBack': '欢迎回来',
    'login.subtitle': '登录您的账户继续使用',
    'login.username': '用户名',
    'login.email': '邮箱地址',
    'login.password': '密码',
    'login.emailPlaceholder': '请输入邮箱地址',
    'login.passwordPlaceholder': '请输入密码',
    'login.submit': '登录',
    'login.submitting': '登录中...',
    'login.noAccount': '还没有账户？',
      'login.register': '立即注册',
      'login.fillAllFields': '请填写所有必填字段',
      
      // Register page
      'register.title': '创建账户',
      'register.subtitle': '注册新账户开始使用',
      'register.username': '用户名',
      'register.usernamePlaceholder': '请输入用户名',
      'register.email': '邮箱地址',
      'register.emailPlaceholder': '请输入邮箱地址',
      'register.password': '密码',
      'register.passwordPlaceholder': '请输入密码（至少6位）',
      'register.confirmPassword': '确认密码',
      'register.confirmPasswordPlaceholder': '请再次输入密码',
      'register.submit': '注册',
      'register.submitting': '注册中...',
      'register.hasAccount': '已有账户？',
      'register.login': '立即登录',
      'register.fillAllFields': '请填写所有必填字段',
      'register.usernameMinLength': '用户名至少需要3个字符',
      'register.passwordMinLength': '密码至少需要6个字符',
      'register.passwordMismatch': '两次输入的密码不一致',
      'register.invalidEmail': '请输入有效的邮箱地址',
      
      // Analysis page
      'analysis.tasks.videoInfo': '视频信息获取',
      'analysis.tasks.audioExtract': '音频提取',
      'analysis.tasks.transcription': '语音转录',
      'analysis.tasks.aiAnalysis': 'AI 智能分析',
      'analysis.backToHome': '返回首页',
      'analysis.viewModes.current': '当前分析',
      'analysis.viewModes.notes': '历史笔记',
      'analysis.viewModes.mindmap': '思维导图',
      'analysis.history.title': '历史记录',
      'analysis.history.empty': '暂无历史记录',
      'analysis.history.allCategories': '全部分类',
      'analysis.history.addCategory': '添加分类',
      'analysis.history.categoryName': '分类名称',
      'analysis.history.save': '保存',
      'analysis.history.cancel': '取消',
      'analysis.result.title': '分析结果',
      'analysis.result.summary': '智能总结',
      'analysis.result.transcript': '完整转录',
      'analysis.result.mindmap': '思维导图',
      'analysis.result.viewFull': '查看完整内容',
      'analysis.result.copy': '复制',
      'analysis.result.share': '分享',
      'analysis.result.download': '下载',
      'analysis.result.delete': '删除',
      'analysis.result.saveToHistory': '保存到历史',
      'analysis.status.processing': '处理中...',
      'analysis.status.completed': '分析完成',
      'analysis.status.error': '分析失败',
      'analysis.status.pending': '等待中',
      'analysis.welcome.title': '欢迎使用笔记管理',
      'analysis.welcome.description': '在这里您可以查看和管理您的视频分析历史记录',
      'analysis.welcome.instruction': '选择左侧的历史记录查看详细内容',
      'analysis.mindMap.title': '思维导图',
      'analysis.mindMap.expand': '展开思维导图',
      'analysis.mindMap.waiting': '等待分析完成后生成思维导图',
      'analysis.mindMap.canvas': '思维导图画布',
      'analysis.history.originalUrl': '原视频地址',
      'analysis.history.longVideo': '长视频',
      'analysis.history.shortVideo': '短视频',
      'analysis.history.viewDetails': '查看详情',
      'analysis.history.deleteRecord': '删除记录',
      'analysis.errors.startFailed': '启动分析失败',
      'analysis.errors.alreadyStarted': '分析已经启动，跳过重复调用',
      'analysis.errors.taskStartFailed': '任务启动失败',
      'analysis.errors.progressFailed': '获取进度失败',
      'analysis.actions.restart': '重新开始',
      'analysis.actions.fullPreview': '全文预览',
      'analysis.actions.copySummary': '复制AI总结',
      'analysis.actions.copiedSummary': 'AI总结已复制到剪贴板',
      'analysis.actions.copyFailed': '复制失败',
      'analysis.actions.shareSummary': '分享AI总结',
      'analysis.actions.shareGenerateFailed': '生成分享链接失败',
      'analysis.actions.shareLinkCopied': '分享链接已复制到剪贴板',
      'analysis.status.analyzing': '正在分析中...',
      'analysis.status.pleaseWait': '请耐心等待，这可能需要几分钟时间',
      'analysis.transcript.title': '完整转录',
      'analysis.transcript.waiting': '等待分析完成...',
      'analysis.actions.copyTranscript': '复制完整转录',
      'analysis.actions.copiedTranscript': '完整转录已复制到剪贴板',
      'analysis.actions.shareTranscript': '分享完整转录',
      'analysis.details.title': '分析详情',
      'analysis.progress.title': '分析进度',
      'analysis.video.title': '视频信息',
      'analysis.video.url': '链接',
      'analysis.mindMap.exportImage': '导出图片',
      'analysis.actions.close': '关闭 (ESC)',
      'analysis.actions.copy': '复制',
      'analysis.summary.fullPreview': 'AI总结 - 全文预览',
      'analysis.transcript.fullPreview': '完整转录 - 全文预览',

    
    // 分析页面
    'analysis.title': '视频分析结果',
    'analysis.summary': '内容摘要',
    'analysis.chapters': '章节划分',
    'analysis.keyPoints': '关键要点',
    'analysis.mindMap': '思维导图',
    'analysis.share': '分享',
    'analysis.back': '返回首页',
    
    // 使用信息
    'usage.adminAccount': '管理员账户 - 无限制',
    'usage.remainingToday': '今日剩余次数',
    'usage.dailyLimitReached': '今日已达使用上限',
    'usage.supportedPlatforms': '支持的平台',
    
    // 功能特色
    'features.title': '核心功能特色',
    'features.subtitle': '基于豆包大模型的AI视频分析工具，让视频内容理解更高效',
    'features.aiSummary': 'AI智能总结',
    'features.aiSummaryDesc': '基于豆包大模型，自动生成结构化视频内容总结，提取核心要点',
    'features.noteManagement': '笔记管理',
    'features.noteManagementDesc': '历史分析记录云端保存，支持分类管理和快速检索查看',
    'features.mindMap': '思维导图',
    'features.mindMapDesc': '自动生成可视化思维导图，帮助理解视频内容结构和逻辑关系',
    
    // 使用方法
    'steps.title': '使用方法',
    'steps.subtitle': '三步即可获得专业的视频内容分析报告',
    'steps.step1Title': '粘贴视频链接',
    'steps.step1Desc': '支持抖音、哔哩哔哩等主流平台，自动识别分享链接',
    'steps.step2Title': 'AI智能处理',
    'steps.step2Desc': '自动下载视频、提取音频、语音转录、AI分析生成总结',
    'steps.step3Title': '查看分析结果',
    'steps.step3Desc': 'AI总结、完整转录、可视化思维导图，支持复制分享和历史管理',
    
    // CTA部分
    'cta.title': '开始您的智能笔记之旅',
    'cta.subtitle': '立即体验AI驱动的视频笔记工具，让学习更高效',
    
    // 页脚
    'footer.description': '智能视频笔记工具，让学习更高效',
    'footer.product': '产品',
    'footer.support': '支持',
    'footer.features': '功能特色',
    'footer.howItWorks': '使用方法',
    'footer.pricing': '定价',
    'footer.helpCenter': '帮助中心',
    'footer.contact': '联系我们',
    'footer.privacy': '隐私政策',
    'footer.adminPanel': '管理后台',
    'footer.copyright': '© 2024 VidNotes. All rights reserved.',
    
    // 通用
    'common.loading': '加载中...',
    'common.error': '出错了',
    'common.retry': '重试',
    'common.cancel': '取消',
    'common.confirm': '确认',
  },
  en: {
    // Navigation
    'nav.features': 'Features',
    'nav.howItWorks': 'How It Works',
    'nav.noteManagement': 'Note Management',
    'nav.login': 'Login',
    'nav.register': 'Register',
    'nav.logout': 'Logout',
    
    // Home page
    'home.title': 'AI Video Note Assistant',
    'home.subtitle': 'Let AI help you extract key information from videos and generate structured notes',
    'home.urlPlaceholder': 'Enter YouTube or Bilibili video link',
    'home.analyzeButton': 'Start Analysis',
    'home.analyzing': 'Analyzing...',
    'home.features.title': 'Features',
    'home.features.ai.title': 'AI Smart Analysis',
    'home.features.ai.desc': 'Advanced AI technology automatically extracts key video information',
    'home.features.notes.title': 'Structured Notes',
    'home.features.notes.desc': 'Automatically generate clear chapters and key point summaries',
    'home.features.mindmap.title': 'Mind Map',
    'home.features.mindmap.desc': 'Visualize knowledge structure for better understanding and memory',
    'home.howItWorks.title': 'How It Works',
    'home.howItWorks.step1': 'Paste Video Link',
    'home.howItWorks.step2': 'AI Auto Analysis',
    'home.howItWorks.step3': 'Get Structured Notes',
    
    // Login page
    'login.title': 'Login',
    'login.welcomeBack': 'Welcome Back',
    'login.subtitle': 'Login to your account to continue',
    'login.username': 'Username',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.emailPlaceholder': 'Enter your email address',
    'login.passwordPlaceholder': 'Enter your password',
    'login.submit': 'Login',
    'login.submitting': 'Logging in...',
    'login.noAccount': "Don't have an account?",
    'login.registerLink': 'Register now',
    'login.fillAllFields': 'Please fill in all required fields',
    
    // Register page
    'register.title': 'Create Account',
    'register.subtitle': 'Register a new account to get started',
    'register.username': 'Username',
    'register.usernamePlaceholder': 'Enter your username',
    'register.email': 'Email Address',
    'register.emailPlaceholder': 'Enter your email address',
    'register.password': 'Password',
    'register.passwordPlaceholder': 'Enter password (at least 6 characters)',
    'register.confirmPassword': 'Confirm Password',
    'register.confirmPasswordPlaceholder': 'Enter password again',
    'register.submit': 'Register',
    'register.submitting': 'Registering...',
    'register.hasAccount': 'Already have an account?',
    'register.loginLink': 'Login now',
    'register.fillAllFields': 'Please fill in all required fields',
    'register.usernameMinLength': 'Username must be at least 3 characters',
    'register.passwordMinLength': 'Password must be at least 6 characters',
    'register.passwordMismatch': 'Passwords do not match',
      'register.invalidEmail': 'Please enter a valid email address',
      
      // Analysis page
      'analysis.tasks.videoInfo': 'Video Information Retrieval',
      'analysis.tasks.audioExtract': 'Audio Extraction',
      'analysis.tasks.transcription': 'Speech Transcription',
      'analysis.tasks.aiAnalysis': 'AI Analysis',
      'analysis.backToHome': 'Back to Home',
      'analysis.viewModes.current': 'Current Analysis',
      'analysis.viewModes.notes': 'History Notes',
      'analysis.viewModes.mindmap': 'Mind Map',
      'analysis.history.title': 'History',
      'analysis.history.empty': 'No history records',
      'analysis.history.allCategories': 'All Categories',
      'analysis.history.addCategory': 'Add Category',
      'analysis.history.categoryName': 'Category Name',
      'analysis.history.save': 'Save',
      'analysis.history.cancel': 'Cancel',
      'analysis.result.title': 'Analysis Result',
      'analysis.result.summary': 'AI Summary',
      'analysis.result.transcript': 'Full Transcript',
      'analysis.result.mindmap': 'Mind Map',
      'analysis.result.viewFull': 'View Full Content',
      'analysis.result.copy': 'Copy',
      'analysis.result.share': 'Share',
      'analysis.result.download': 'Download',
      'analysis.result.delete': 'Delete',
      'analysis.result.saveToHistory': 'Save to History',
      'analysis.status.processing': 'Processing...',
      'analysis.status.completed': 'Analysis Completed',
      'analysis.status.error': 'Analysis Failed',
      'analysis.status.pending': 'Pending',
      'analysis.welcome.title': 'Welcome to Note Management',
      'analysis.welcome.description': 'Here you can view and manage your video analysis history',
      'analysis.welcome.instruction': 'Select a history record on the left to view details',
      'analysis.mindMap.title': 'Mind Map',
      'analysis.mindMap.expand': 'Expand Mind Map',
      'analysis.mindMap.waiting': 'Waiting for analysis to complete to generate mind map',
      'analysis.mindMap.canvas': 'Mind Map Canvas',
      'analysis.history.originalUrl': 'Original Video URL',
      'analysis.history.longVideo': 'Long Video',
      'analysis.history.shortVideo': 'Short Video',
      'analysis.history.viewDetails': 'View Details',
      'analysis.history.deleteRecord': 'Delete Record',
      'analysis.errors.startFailed': 'Failed to start analysis',
      'analysis.errors.alreadyStarted': 'Analysis already started, skipping duplicate call',
      'analysis.errors.taskStartFailed': 'Failed to start task',
      'analysis.errors.progressFailed': 'Failed to get progress',
      'analysis.actions.restart': 'Restart',
      'analysis.actions.fullPreview': 'Full Preview',
      'analysis.actions.copySummary': 'Copy AI Summary',
      'analysis.actions.copiedSummary': 'AI summary copied to clipboard',
      'analysis.actions.copyFailed': 'Copy failed',
      'analysis.actions.shareSummary': 'Share AI Summary',
      'analysis.actions.shareGenerateFailed': 'Failed to generate share link',
      'analysis.actions.shareLinkCopied': 'Share link copied to clipboard',
      'analysis.status.analyzing': 'Analyzing...',
      'analysis.status.pleaseWait': 'Please wait, this may take a few minutes',
      'analysis.transcript.title': 'Full Transcript',
      'analysis.transcript.waiting': 'Waiting for analysis to complete...',
      'analysis.actions.copyTranscript': 'Copy Full Transcript',
      'analysis.actions.copiedTranscript': 'Full transcript copied to clipboard',
      'analysis.actions.shareTranscript': 'Share Full Transcript',
      'analysis.details.title': 'Analysis Details',
      'analysis.progress.title': 'Analysis Progress',
      'analysis.video.title': 'Video Information',
      'analysis.video.url': 'URL',
      'analysis.mindMap.exportImage': 'Export Image',
      'analysis.actions.close': 'Close (ESC)',
      'analysis.actions.copy': 'Copy',
      'analysis.summary.fullPreview': 'AI Summary - Full Preview',
      'analysis.transcript.fullPreview': 'Full Transcript - Full Preview',
      
      // Analysis page
    'analysis.title': 'Video Analysis Results',
    'analysis.summary': 'Content Summary',
    'analysis.chapters': 'Chapter Division',
    'analysis.keyPoints': 'Key Points',
    'analysis.mindMap': 'Mind Map',
    'analysis.share': 'Share',
    'analysis.back': 'Back to Home',
    
    // Usage info
    'usage.adminAccount': 'Admin Account - Unlimited',
    'usage.remainingToday': 'Remaining today',
    'usage.dailyLimitReached': 'Daily limit reached',
    'usage.supportedPlatforms': 'Supported Platforms',
    
    // Features
    'features.title': 'Core Features',
    'features.subtitle': 'AI-powered video analysis tool based on Doubao LLM for efficient content understanding',
    'features.aiSummary': 'AI Smart Summary',
    'features.aiSummaryDesc': 'Based on Doubao LLM, automatically generate structured video content summaries and extract key points',
    'features.noteManagement': 'Note Management',
    'features.noteManagementDesc': 'Historical analysis records saved in the cloud, supporting categorized management and quick search',
    'features.mindMap': 'Mind Map',
    'features.mindMapDesc': 'Automatically generate visual mind maps to help understand video content structure and logical relationships',
    
    // Steps
    'steps.title': 'How It Works',
    'steps.subtitle': 'Get professional video content analysis reports in three steps',
    'steps.step1Title': 'Paste Video Link',
    'steps.step1Desc': 'Support mainstream platforms like TikTok and Bilibili, automatically recognize share links',
    'steps.step2Title': 'AI Smart Processing',
    'steps.step2Desc': 'Automatically download video, extract audio, speech-to-text, AI analysis and summary generation',
    'steps.step3Title': 'View Analysis Results',
    'steps.step3Desc': 'AI summary, complete transcription, visual mind map, support copying, sharing and history management',
    
    // CTA Section
    'cta.title': 'Start Your Smart Note Journey',
    'cta.subtitle': 'Experience AI-driven video note tools immediately for more efficient learning',
    
    // Footer
    'footer.description': 'Smart video note tool for more efficient learning',
    'footer.product': 'Product',
    'footer.support': 'Support',
    'footer.features': 'Features',
    'footer.howItWorks': 'How It Works',
    'footer.pricing': 'Pricing',
    'footer.helpCenter': 'Help Center',
    'footer.contact': 'Contact Us',
    'footer.privacy': 'Privacy Policy',
    'footer.adminPanel': 'Admin Panel',
    'footer.copyright': '© 2024 VidNotes. All rights reserved.',
    
    // Common
    'common.loading': 'Loading...',
    'common.error': 'Error occurred',
    'common.retry': 'Retry',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
  },
};

interface I18nProviderProps {
  children: ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};