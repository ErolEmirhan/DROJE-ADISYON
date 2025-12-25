import React, { useState, useEffect } from 'react';
import './LauncherClient.css';
import { getTenantInfo } from '../utils/tenantService';

const LauncherClient = ({ onLogin }) => {
  const [tenantId, setTenantId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [particles, setParticles] = useState([]);
  const [loadingBusinessName, setLoadingBusinessName] = useState('');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Animated particles for background
  useEffect(() => {
    const particleCount = 50;
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 10,
      delay: Math.random() * 5,
    }));
    setParticles(newParticles);
  }, []);

  // Son girilen Tenant-ID'yi otomatik yükle
  useEffect(() => {
    const savedTenantId = localStorage.getItem('makara_last_tenant_id');
    if (savedTenantId) {
      setTenantId(savedTenantId);
    }
  }, []);

  // Güncelleme kontrolü ve event listener'ları
  useEffect(() => {
    if (window.electronAPI) {
      // Güncelleme kontrolü yap
      setIsCheckingUpdate(true);
      window.electronAPI.checkForUpdates().then(() => {
        setIsCheckingUpdate(false);
      }).catch(() => {
        setIsCheckingUpdate(false);
      });

      // Güncelleme event listener'ları
      window.electronAPI.onUpdateAvailable((info) => {
        setUpdateInfo({ ...info, downloaded: false });
        setIsCheckingUpdate(false);
      });

      window.electronAPI.onUpdateDownloaded((info) => {
        setUpdateInfo({ ...info, downloaded: true });
        setIsDownloading(false);
      });

      window.electronAPI.onUpdateProgress((progress) => {
        setUpdateDownloadProgress(progress);
        setIsDownloading(true);
      });

      window.electronAPI.onUpdateError((error) => {
        console.error('Güncelleme hatası:', error);
        setIsCheckingUpdate(false);
        setIsDownloading(false);
      });

      // Güncelleme yoksa kontrolü bitir
      window.electronAPI.onUpdateNotAvailable((info) => {
        setIsCheckingUpdate(false);
        setUpdateInfo(null);
      });
    }
  }, []);

  const handleDownloadUpdate = async () => {
    if (window.electronAPI && !isDownloading) {
      setIsDownloading(true);
      try {
        await window.electronAPI.downloadUpdate();
      } catch (error) {
        console.error('Güncelleme indirme hatası:', error);
        setIsDownloading(false);
      }
    }
  };

  const handleInstallUpdate = () => {
    if (window.electronAPI && updateInfo?.downloaded) {
      window.electronAPI.installUpdate();
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    // Güncelleme kontrolü yapılıyorsa bekle
    if (isCheckingUpdate) {
      setError('Güncelleme kontrol ediliyor, lütfen bekleyin...');
      return;
    }

    // Güncelleme varsa ve indirilmemişse giriş yapılamaz
    if (updateInfo && !updateInfo.downloaded) {
      setError('Lütfen önce güncellemeyi indirin');
      return;
    }

    // Güncelleme indirildiyse giriş yapılamaz (yeniden başlatılmalı)
    if (updateInfo && updateInfo.downloaded) {
      setError('Güncelleme indirildi. Lütfen "Yeniden Başlat ve Güncelle" butonuna tıklayın');
      return;
    }

    if (!tenantId.trim()) {
      setError('Lütfen Tenant-ID giriniz');
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0); // Progress'i sıfırla

    try {
      const trimmedTenantId = tenantId.trim();
      
      // Tenant-ID'yi doğrula ve bilgilerini al
      const tenantInfo = await getTenantInfo(trimmedTenantId);
      
      if (!tenantInfo.isActive) {
        setError('Bu Tenant-ID aktif değil');
        setIsLoading(false);
        return;
      }

      // Başarılı girişte Tenant-ID'yi localStorage'a kaydet
      localStorage.setItem('makara_last_tenant_id', trimmedTenantId);

      // Business name'i kaydet (loading ekranında gösterilecek)
      setLoadingBusinessName(tenantInfo.businessName || 'İşletme');

      // Electron'a tenant bilgilerini gönder
      if (window.electronAPI && window.electronAPI.setTenantInfo) {
        await window.electronAPI.setTenantInfo(tenantInfo);
      }
      
      // Loading ekranını daha uzun göster (oyun tarzı splash screen için)
      // Progress bar animasyonu
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            return 100;
          }
          return prev + 2;
        });
      }, 90); // 4.5 saniyede 100% olacak şekilde
      
      await new Promise(resolve => setTimeout(resolve, 4500));
      clearInterval(progressInterval);
      setLoadingProgress(100);
      
      // Enter fullscreen mode if electronAPI is available
      if (window.electronAPI && window.electronAPI.enterFullscreen) {
        window.electronAPI.enterFullscreen();
      }
      
      // Trigger login callback with tenant info
      onLogin(tenantInfo);
      setIsLoading(false);
    } catch (error) {
      console.error('Tenant doğrulama hatası:', error);
      setError(error.message || 'Tenant-ID doğrulanamadı. Lütfen kontrol edin.');
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading) {
      handleLogin(e);
    }
  };

  return (
    <div className="launcher-client">
      {/* Premium Animated Background */}
      <div className="launcher-background">
        <div className="gradient-overlay"></div>
        <div className="mesh-gradient"></div>
        <div className="floating-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
          <div className="shape shape-4"></div>
        </div>
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="launcher-container">
        {/* Left Side - Premium Branding veya Güncelleme */}
        <div className="launcher-left">
          {updateInfo ? (
            <div className="update-section">
              <div className="update-container">
                <div className="update-icon-wrapper">
                  <div className="update-icon-glow"></div>
                  <svg className="update-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="url(#updateIconGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 17L12 22L22 17" stroke="url(#updateIconGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 12L12 17L22 12" stroke="url(#updateIconGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <defs>
                      <linearGradient id="updateIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <h2 className="update-title">Yeni Güncelleme Mevcut</h2>
                <p className="update-subtitle">
                  Versiyon <span className="update-version">{updateInfo.version}</span> indirilmeye hazır
                </p>

                {updateDownloadProgress && !updateInfo.downloaded && (
                  <div className="update-progress-container">
                    <div className="update-progress-bar">
                      <div 
                        className="update-progress-fill"
                        style={{ width: `${updateDownloadProgress.percent}%` }}
                      ></div>
                    </div>
                    <div className="update-progress-info">
                      <span>{Math.round(updateDownloadProgress.percent)}%</span>
                      <span>{Math.round(updateDownloadProgress.transferred / 1024 / 1024)} MB / {Math.round(updateDownloadProgress.total / 1024 / 1024)} MB</span>
                    </div>
                  </div>
                )}

                {updateInfo.downloaded ? (
                  <div className="update-actions">
                    <div className="update-success-message">
                      <svg className="update-success-icon" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <p>Güncelleme başarıyla indirildi!</p>
                    </div>
                    <button 
                      onClick={handleInstallUpdate}
                      className="update-install-button"
                    >
                      <span>Yeniden Başlat ve Güncelle</span>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M10 3L3 10H7V17H13V10H17L10 3Z" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="update-actions">
                    <button 
                      onClick={handleDownloadUpdate}
                      disabled={isDownloading}
                      className="update-download-button"
                    >
                      {isDownloading ? (
                        <>
                          <span className="update-spinner"></span>
                          <span>İndiriliyor...</span>
                        </>
                      ) : (
                        <>
                          <span>İndir</span>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 3V13M10 13L6 9M10 13L14 9M3 16H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </>
                      )}
                    </button>
                    <p className="update-note">
                      Güncellemeyi indirmeden giriş yapamazsınız
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
          <div className="brand-section">
            <div className="logo-container">
              <div className="logo-glow"></div>
              <div className="logo-orb"></div>
              <div className="logo-main">
                <svg
                  width="160"
                  height="160"
                  viewBox="0 0 120 120"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="logo-svg"
                >
                  <defs>
                    <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="30%" stopColor="#8b5cf6" />
                      <stop offset="60%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#c4b5fd" />
                    </linearGradient>
                    <linearGradient id="logoGradientInner" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#a78bfa" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  <circle
                    cx="60"
                    cy="60"
                    r="56"
                    stroke="url(#logoGradient)"
                    strokeWidth="2.5"
                    fill="none"
                    className="logo-circle-outer"
                    opacity="0.3"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    stroke="url(#logoGradient)"
                    strokeWidth="2"
                    fill="none"
                    className="logo-circle"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="44"
                    fill="url(#logoGradientInner)"
                    opacity="0.1"
                    className="logo-circle-inner"
                  />
                  <text
                    x="60"
                    y="80"
                    textAnchor="middle"
                    fill="url(#logoGradient)"
                    fontSize="64"
                    fontWeight="800"
                    fontFamily="Inter, -apple-system, sans-serif"
                    className="logo-text"
                    filter="url(#glow)"
                  >
                    D
                  </text>
                </svg>
              </div>
            </div>
            <h1 className="brand-title">
              <span className="title-main">
                <span className="title-letter">D</span>
                <span className="title-letter">R</span>
                <span className="title-letter">O</span>
                <span className="title-letter">J</span>
                <span className="title-letter">E</span>
              </span>
              <span className="title-sub">ADİSYON SİSTEMLERİ</span>
            </h1>
            <p className="brand-tagline">
              <span className="tagline-icon">✨</span>
              Profesyonel Adisyon ve Nokta Satış Çözümleri
              <span className="tagline-icon">✨</span>
            </p>
            <div className="brand-features-mini">
              <div className="feature-mini">
                <div className="feature-icon-mini">⚡</div>
                <span>Hızlı</span>
              </div>
              <div className="feature-mini">
                <div className="feature-icon-mini">🔒</div>
                <span>Güvenli</span>
              </div>
              <div className="feature-mini">
                <div className="feature-icon-mini">📊</div>
                <span>Akıllı</span>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Right Side - Premium Login Form */}
        <div className="launcher-right">
          <div className="login-panel">
            <div className="login-header">
              <div className="login-icon-wrapper">
                <svg className="login-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="url(#loginIconGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="url(#loginIconGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="url(#loginIconGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <defs>
                    <linearGradient id="loginIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <h2 className="login-title">Giriş Yap</h2>
              <p className="login-subtitle">
                Tenant-ID'nizi girerek sisteme erişebilirsiniz
              </p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div className="input-group">
                <label htmlFor="tenantId" className="input-label">
                  <span className="label-icon">🔑</span>
                  Tenant-ID
                </label>
                <div className="input-wrapper">
                  <div className="input-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M10 2C7.24 2 5 4.24 5 7C5 9.76 7.24 12 10 12C12.76 12 15 9.76 15 7C15 4.24 12.76 2 10 2ZM10 10.5C8.07 10.5 6.5 8.93 6.5 7C6.5 5.07 8.07 3.5 10 3.5C11.93 3.5 13.5 5.07 13.5 7C13.5 8.93 11.93 10.5 10 10.5Z" fill="currentColor" opacity="0.4"/>
                      <path d="M3.5 16.5C3.5 13.74 6.24 11.5 10 11.5C13.76 11.5 16.5 13.74 16.5 16.5V18H3.5V16.5Z" fill="currentColor" opacity="0.4"/>
                    </svg>
                  </div>
                  <input
                    id="tenantId"
                    type="text"
                    value={tenantId}
                    onChange={(e) => {
                      setTenantId(e.target.value);
                      setError('');
                    }}
                    onKeyPress={handleKeyPress}
                    placeholder="Tenant-ID giriniz"
                    className={`input-field ${error ? 'input-error' : ''}`}
                    disabled={isLoading}
                    autoFocus
                  />
                  <div className="input-glow"></div>
                  <div className="input-border"></div>
                </div>
                {error && (
                  <div className="error-message">
                    <span className="error-icon">⚠️</span>
                    {error}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className={`login-button ${isLoading ? 'loading' : ''}`}
                disabled={isLoading || !tenantId.trim() || isCheckingUpdate || (updateInfo && !updateInfo.downloaded) || (updateInfo && updateInfo.downloaded)}
              >
                <div className="button-content">
                  {isLoading ? (
                    <>
                      <span className="button-spinner"></span>
                      <span>Bağlanıyor...</span>
                    </>
                  ) : (
                    <>
                      <span>Giriş Yap</span>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="button-arrow"
                      >
                        <path
                          d="M7.5 15L12.5 10L7.5 5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </>
                  )}
                </div>
                <div className="button-shine"></div>
              </button>
            </form>

            <div className="login-footer">
              <div className="footer-link">
                <span>Yardıma mı ihtiyacınız var?</span>
                <a href="#" className="help-link">
                  <span>Destek</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5.25 3.5L9.75 7L5.25 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Premium Corporate Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay-corporate">
          {/* Subtle Background Gradient */}
          <div className="corporate-bg-gradient"></div>
          
          {/* Minimal Grid Pattern */}
          <div className="corporate-grid"></div>

          {/* Main Content */}
          <div className="loading-content-corporate">
            {/* Elegant Logo Animation */}
            <div className="corporate-logo-container">
              <div className="logo-ring-elegant">
                <svg className="ring-svg-elegant" viewBox="0 0 200 200">
                  <circle 
                    cx="100" 
                    cy="100" 
                    r="85" 
                    fill="none" 
                    stroke="url(#elegantGradient)" 
                    strokeWidth="2" 
                    strokeDasharray="534" 
                    strokeDashoffset="534"
                    className="ring-circle"
                  />
                    <defs>
                    <linearGradient id="elegantGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              <div className="logo-center-elegant">
                <div className="logo-letter-elegant">D</div>
                <div className="logo-glow-subtle"></div>
              </div>
            </div>

            {/* Welcome Section */}
            <div className="corporate-welcome">
              <div className="welcome-status-badge">
                <div className="status-dot-elegant"></div>
                <span className="status-text-elegant">Initializing System</span>
            </div>
              <h1 className="welcome-title-corporate">
                <span className="welcome-line-1">Welcome to</span>
                <span className="welcome-line-2">{loadingBusinessName || 'DROJE POS'}</span>
              </h1>
              <p className="welcome-subtitle-corporate">
                Enterprise Point of Sale System
              </p>
            </div>

            {/* Progress Section */}
            <div className="corporate-progress-section">
              <div className="progress-header-corporate">
                <span className="progress-label-corporate">Loading</span>
                <span className="progress-percentage-corporate">{loadingProgress}%</span>
              </div>
              <div className="progress-bar-corporate">
                <div className="progress-track-corporate">
                  <div 
                    className="progress-fill-corporate" 
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                </div>
              <div className="progress-steps">
                {['Connect', 'Authenticate', 'Load Data', 'Ready'].map((step, i) => (
                  <div 
                    key={i} 
                    className={`progress-step ${loadingProgress > (i + 1) * 25 ? 'completed' : ''}`}
                  >
                    <div className="step-indicator"></div>
                    <span className="step-label">{step}</span>
              </div>
                ))}
              </div>
            </div>

            {/* System Status */}
            <div className="corporate-status-grid">
              <div className="status-item-corporate">
                <div className="status-icon-corporate">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="status-text-corporate">
                  <span className="status-name-corporate">Database</span>
                  <span className="status-value-corporate">Connected</span>
                </div>
              </div>
              <div className="status-item-corporate">
                <div className="status-icon-corporate">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="status-text-corporate">
                  <span className="status-name-corporate">Services</span>
                  <span className="status-value-corporate">Initializing</span>
                </div>
              </div>
              <div className="status-item-corporate">
                <div className="status-icon-corporate">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M12 8V12L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="status-text-corporate">
                  <span className="status-name-corporate">Security</span>
                  <span className="status-value-corporate">Active</span>
                </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Premium Version Info */}
      <div className="version-info">
        <div className="version-badge">
          <span className="version-text">v2.4.0</span>
          <div className="version-glow"></div>
        </div>
      </div>
    </div>
  );
};

export default LauncherClient;

