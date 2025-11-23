import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const ExitSplash = ({ onComplete }) => {
  const [visible, setVisible] = useState(true);
  const [textVisible, setTextVisible] = useState(false);
  
  const text = 'Görüşmek Üzere...';

  useEffect(() => {
    // Kısa bir gecikme sonrası yazıyı göster (aydınlanma animasyonu)
    const textTimeout = setTimeout(() => {
      setTextVisible(true);
    }, 300);

    // 2 saniye sonra uygulamayı kapat
    const quitTimeout = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => {
      clearTimeout(textTimeout);
      clearTimeout(quitTimeout);
    };
  }, [onComplete]);

  if (!visible) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
    >
      <div className="text-center">
        <h1 
          className="text-white"
          style={{ 
            fontFamily: '"Montserrat", sans-serif',
            fontWeight: 900,
            fontSize: '5rem',
            lineHeight: '1.2',
            letterSpacing: '0.05em',
            transition: 'opacity 1s ease-in, transform 1s ease-in',
            opacity: textVisible ? 1 : 0,
            transform: textVisible ? 'scale(1)' : 'scale(0.9)'
          }}
        >
          {text.split('').map((char, index) => (
            <span
              key={index}
              className="exit-text-char"
              style={{
                display: 'inline-block',
                transition: 'opacity 0.4s ease-in',
                transitionDelay: textVisible ? `${index * 0.06}s` : '0s',
                opacity: textVisible ? 1 : 0,
              }}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          ))}
        </h1>
      </div>
      
    </div>,
    document.body
  );
};

export default ExitSplash;

