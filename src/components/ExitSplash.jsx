import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const ExitSplash = ({ onComplete }) => {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  
  const text = 'GÜLE GÜLE';
  const subtitle = 'Yeniden Görüşmek Üzere';

  useEffect(() => {
    // 2 saniye sonra fade out başlat ve uygulamayı kapat
    const endTimeout = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        setVisible(false);
        onComplete();
      }, 300);
    }, 2000);

    return () => {
      clearTimeout(endTimeout);
    };
  }, [onComplete]);

  if (!visible) return null;

  return createPortal(
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #f1f5f9 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.3s ease',
        overflow: 'hidden'
      }}
    >
      <style>{`
        @keyframes exitTextReveal {
          0% {
            opacity: 0;
            transform: translateY(40px) scale(0.95);
            letter-spacing: 0.3em;
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            letter-spacing: 0.15em;
          }
        }
        @keyframes exitSubtitleFadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes exitLineExpand {
          from {
            width: 0%;
            opacity: 0;
          }
          to {
            width: 100%;
            opacity: 1;
          }
        }
        .exit-main-text {
          animation: exitTextReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 1;
        }
        .exit-subtitle-text {
          animation: exitSubtitleFadeIn 0.8s ease-out forwards;
          animation-delay: 0.3s;
          opacity: 1;
        }
        .exit-decorative-line {
          animation: exitLineExpand 1s ease-out forwards;
          animation-delay: 0.5s;
          opacity: 1;
        }
      `}</style>

      {/* Minimal dekoratif arka plan elementleri */}
      <div 
        style={{
          position: 'absolute',
          top: '20%',
          left: '10%',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(148, 163, 184, 0.1) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(40px)',
          pointerEvents: 'none'
        }}
      />
      <div 
        style={{
          position: 'absolute',
          bottom: '20%',
          right: '10%',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(148, 163, 184, 0.08) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          pointerEvents: 'none'
        }}
      />

      <div className="text-center" style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        {/* Ana Başlık - GÖRÜŞMEK ÜZERE */}
        <h1 
          className="exit-main-text"
          style={{ 
            fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(5rem, 12vw, 10rem)',
            lineHeight: '0.9',
            letterSpacing: '0.15em',
            color: '#1e293b',
            margin: 0,
            padding: 0,
            textAlign: 'center',
            textTransform: 'uppercase',
            position: 'relative',
            display: 'block',
            opacity: 1
          }}
        >
          {text}
        </h1>

        {/* Dekoratif İnce Çizgi */}
        <div 
          className="exit-decorative-line"
          style={{
            width: '0%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(148, 163, 184, 0.4) 50%, transparent 100%)',
            margin: '32px auto 40px',
            maxWidth: '400px',
            opacity: 1
          }}
        />

        {/* Alt Başlık */}
        <p 
          className="exit-subtitle-text"
          style={{
            fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)',
            fontWeight: 400,
            color: '#64748b',
            margin: 0,
            padding: 0,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            textAlign: 'center',
            opacity: 0.8,
            display: 'block'
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>,
    document.body
  );
};

export default ExitSplash;

