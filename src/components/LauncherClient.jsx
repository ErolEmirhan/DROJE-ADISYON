import React, { useState, useEffect } from 'react';
import './LauncherClient.css';
import { getTenantInfo } from '../utils/tenantService';

const LauncherClient = ({ onLogin }) => {
  const [tenantId, setTenantId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [particles, setParticles] = useState([]);
  const [loadingBusinessName, setLoadingBusinessName] = useState('');

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

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!tenantId.trim()) {
      setError('Lütfen Tenant-ID giriniz');
      return;
    }

    setIsLoading(true);

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
      await new Promise(resolve => setTimeout(resolve, 4500));
      
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
        {/* Left Side - Premium Branding */}
        <div className="launcher-left">
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
                disabled={isLoading || !tenantId.trim()}
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

      {/* Premium Gaming-Style Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay">
          {/* Animated Background Grid */}
          <div className="loading-grid"></div>
          
          {/* Floating Particles */}
          <div className="loading-particles">
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={i} className="loading-particle" style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 2}s`
              }}></div>
            ))}
          </div>

          {/* Geometric Shapes */}
          <div className="loading-shapes">
            <div className="loading-shape shape-triangle"></div>
            <div className="loading-shape shape-circle"></div>
            <div className="loading-shape shape-square"></div>
            <div className="loading-shape shape-hexagon"></div>
          </div>

          {/* Main Content */}
          <div className="loading-content">
            {/* Modern Professional Logo Animation */}
            <div className="loading-logo-modern">
              <div className="logo-modern-container">
                {/* Outer Ring */}
                <div className="logo-ring logo-ring-outer">
                  <svg className="ring-svg" viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="90" fill="none" stroke="url(#ringGradient)" strokeWidth="3" strokeDasharray="565" strokeDashoffset="565">
                      <animate attributeName="stroke-dashoffset" values="565;0;565" dur="3s" repeatCount="indefinite" />
                    </circle>
                    <defs>
                      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="50%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#a78bfa" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                
                {/* Middle Ring */}
                <div className="logo-ring logo-ring-middle">
                  <svg className="ring-svg" viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="70" fill="none" stroke="url(#ringGradient2)" strokeWidth="2.5" strokeDasharray="440" strokeDashoffset="440">
                      <animate attributeName="stroke-dashoffset" values="440;0;440" dur="2.5s" repeatCount="indefinite" />
                    </circle>
                    <defs>
                      <linearGradient id="ringGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#a78bfa" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                
                {/* Inner Core */}
                <div className="logo-core">
                  <div className="logo-core-inner">
                    <div className="logo-letter">D</div>
                  </div>
                  <div className="logo-core-glow"></div>
                  <div className="logo-core-pulse"></div>
                </div>
                
                {/* Orbiting Particles */}
                <div className="logo-orbit orbit-1">
                  <div className="orbit-particle"></div>
                </div>
                <div className="logo-orbit orbit-2">
                  <div className="orbit-particle"></div>
                </div>
                <div className="logo-orbit orbit-3">
                  <div className="orbit-particle"></div>
                </div>
              </div>
            </div>

            {/* Welcome Text with Glitch Effect */}
            <div className="loading-welcome-container">
              <h2 className="loading-welcome">
                <span className="welcome-text" data-text="Hoşgeldiniz">Hoşgeldiniz</span>
                <span className="welcome-glitch"></span>
              </h2>
            </div>

            {/* Business Name with Typewriter Effect */}
            <div className="loading-business-container">
              <p className="loading-business-name">
                <span className="business-name-text">{loadingBusinessName || 'Yükleniyor...'}</span>
                <span className="business-name-cursor">|</span>
              </p>
            </div>

            {/* Advanced Progress Bar */}
            <div className="loading-progress-container">
              <div className="loading-progress-wrapper">
                <div className="loading-progress-bar">
                  <div className="progress-fill"></div>
                  <div className="progress-shine"></div>
                  <div className="progress-glow"></div>
                </div>
                <div className="progress-percentage">0%</div>
              </div>
              <div className="progress-particles">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="progress-particle"></div>
                ))}
              </div>
            </div>

            {/* Loading Status Text */}
            <div className="loading-status">
              <span className="status-dot"></span>
              <span className="status-text">Sistem başlatılıyor...</span>
            </div>

            {/* Sound Wave Visualization */}
            <div className="loading-soundwave">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="soundwave-bar" style={{
                  animationDelay: `${i * 0.1}s`
                }}></div>
              ))}
            </div>
          </div>

          {/* Corner Decorations */}
          <div className="loading-corner corner-top-left"></div>
          <div className="loading-corner corner-top-right"></div>
          <div className="loading-corner corner-bottom-left"></div>
          <div className="loading-corner corner-bottom-right"></div>
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

