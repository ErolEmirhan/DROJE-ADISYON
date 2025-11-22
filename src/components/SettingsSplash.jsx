import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const SettingsSplash = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // 2 saniye sonra kapat
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        onComplete?.();
      }, 300); // Fade out animasyonu için
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  return createPortal(
    <div className={`fixed inset-0 bg-white flex items-center justify-center z-[1999] transition-opacity duration-300 ${
      isVisible ? 'opacity-100' : 'opacity-0'
    }`}>
      <div className="text-center overflow-visible">
        {/* Aydınlanma animasyonu ile ikon */}
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-2xl icon-glow">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>
        
        {/* "Ayarlar" yazısı */}
        <div className="pb-8 overflow-visible">
          <h1 className="text-6xl md:text-7xl font-black tracking-[0.2em] bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent text-fade-in leading-[1.2] overflow-visible" style={{ paddingBottom: '1.5rem' }}>
            Ayarlar
          </h1>
        </div>
      </div>
      
      <style>{`
        .icon-glow {
          animation: glow 2s ease-in-out infinite;
        }
        .text-fade-in {
          animation: fadeInUp 0.8s ease-out;
        }
        @keyframes glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(147, 51, 234, 0.5), 0 0 40px rgba(147, 51, 234, 0.3);
          }
          50% {
            box-shadow: 0 0 40px rgba(236, 72, 153, 0.7), 0 0 60px rgba(236, 72, 153, 0.5);
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default SettingsSplash;

