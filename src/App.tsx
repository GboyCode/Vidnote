import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { I18nProvider } from './contexts/I18nContext';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Home from './pages/Home';
import Analysis from './pages/Analysis';
import Share from './pages/Share';
import Login from './pages/Login';
import Register from './pages/Register';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [videoUrl, setVideoUrl] = useState(() => {
    // 从localStorage恢复视频URL
    return localStorage.getItem('videoUrl') || '';
  });

  // 监听视频URL变化，保存到localStorage
  useEffect(() => {
    if (videoUrl) {
      localStorage.setItem('videoUrl', videoUrl);
    }
  }, [videoUrl]);

  const handleStartAnalysis = (url: string) => {
    setVideoUrl(url);
    navigate('/analysis');
  };

  const handleBackToHome = () => {
    setVideoUrl('');
    // 清除localStorage中的视频URL和分析页面状态
    localStorage.removeItem('videoUrl');
    localStorage.removeItem('analysisViewMode');
    navigate('/');
  };

  const handleNavigateToAnalysis = () => {
    // 清除videoUrl，确保进入笔记管理模式
    setVideoUrl('');
    localStorage.removeItem('videoUrl');
    // 设置viewMode为current，确保显示历史记录页面
    localStorage.setItem('analysisViewMode', 'current');
    navigate('/analysis');
  };

  return (
    <div className="App">
      <Routes>
        <Route 
          path="/" 
          element={
            <Home 
              onStartAnalysis={handleStartAnalysis} 
              onNavigateToAnalysis={handleNavigateToAnalysis} 
            />
          } 
        />
        <Route 
          path="/analysis" 
          element={
            <ProtectedRoute>
              <Analysis 
                videoUrl={videoUrl} 
                onBack={handleBackToHome} 
              />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/share/:shareId" 
          element={<Share />} 
        />
        <Route 
          path="/login" 
          element={<Login />} 
        />
        <Route 
          path="/register" 
          element={<Register />} 
        />
      </Routes>

      {/* Toast Notifications */}
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#fff',
            color: '#374151',
            border: '1px solid #e5e7eb',
            borderRadius: '0.75rem',
            fontSize: '14px',
          },
        }}
      />
    </div>
  );
}

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;