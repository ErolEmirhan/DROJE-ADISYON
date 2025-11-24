import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Türkçe karakter mapping
const turkishCharMap = {
  'ı': 'I',
  'ğ': 'Ğ',
  'ü': 'Ü',
  'ş': 'Ş',
  'i': 'İ',
  'ö': 'Ö',
  'ç': 'Ç'
};

const VirtualKeyboard = ({ targetInput, onClose, onInput }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isShift, setIsShift] = useState(false);
  const [isNumeric, setIsNumeric] = useState(false);
  const keyboardRef = useRef(null);

  useEffect(() => {
    if (targetInput) {
      setIsVisible(true);
      // Input tipine göre klavye modunu ayarla
      const inputType = targetInput.type || 'text';
      const inputMode = targetInput.getAttribute('inputmode') || '';
      
      if (inputType === 'password' || inputMode === 'numeric' || inputType === 'number') {
        setIsNumeric(true);
      } else {
        setIsNumeric(false);
      }
    } else {
      setIsVisible(false);
    }
  }, [targetInput]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Klavye butonlarına tıklandığında input'un focus'unu koru
      if (keyboardRef.current && keyboardRef.current.contains(event.target)) {
        // Klavye butonuna tıklandı, input'u focus et
        if (targetInput) {
          setTimeout(() => {
            targetInput.focus();
          }, 0);
        }
        return;
      }
      
      if (keyboardRef.current && !keyboardRef.current.contains(event.target)) {
        // Input alanına tıklanmadıysa klavyeyi kapat
        if (targetInput && !targetInput.contains(event.target)) {
          onClose();
        }
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isVisible, targetInput, onClose]);

  if (!isVisible || !targetInput) return null;

  const handleKeyPress = (key) => {
    if (!targetInput) return;

    const input = targetInput;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const value = input.value || '';
    
    let newValue = '';
    let newCursorPos = start;

    if (key === 'BACKSPACE') {
      if (start === end && start > 0) {
        newValue = value.slice(0, start - 1) + value.slice(start);
        newCursorPos = start - 1;
      } else if (start !== end) {
        newValue = value.slice(0, start) + value.slice(end);
        newCursorPos = start;
      }
    } else if (key === 'SPACE') {
      newValue = value.slice(0, start) + ' ' + value.slice(end);
      newCursorPos = start + 1;
    } else if (key === 'ENTER') {
      newValue = value.slice(0, start) + '\n' + value.slice(end);
      newCursorPos = start + 1;
    } else if (key === 'SHIFT') {
      setIsShift(!isShift);
      return;
    } else if (key === 'NUMERIC') {
      setIsNumeric(!isNumeric);
      // Input'un focus'unu koru
      if (input) {
        setTimeout(() => {
          input.focus();
        }, 0);
      }
      return;
    } else if (key === 'CLOSE') {
      onClose();
      return;
    } else {
      let char = isShift ? key.toUpperCase() : key.toLowerCase();
      // Türkçe karakter desteği
      if (isShift && turkishCharMap[char]) {
        char = turkishCharMap[char];
      } else if (isShift && char === 'i') {
        char = 'İ'; // Türkçe büyük İ
      }
      newValue = value.slice(0, start) + char + value.slice(end);
      newCursorPos = start + 1;
    }

    // Input veya textarea değerini güncelle - React controlled component desteği
    const isTextarea = input.tagName === 'TEXTAREA';
    const valueSetter = isTextarea
      ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    
    if (valueSetter) {
      valueSetter.call(input, newValue);
    } else {
      input.value = newValue;
    }
    
    // React onChange ve onInput event'lerini tetikle
    // Önce input event'i (React onChange için)
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    Object.defineProperty(inputEvent, 'target', { 
      value: input, 
      enumerable: true,
      writable: false,
      configurable: true
    });
    input.dispatchEvent(inputEvent);
    
    // Sonra change event'i
    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    Object.defineProperty(changeEvent, 'target', { 
      value: input, 
      enumerable: true,
      writable: false,
      configurable: true
    });
    input.dispatchEvent(changeEvent);

    // Cursor pozisyonunu ayarla
    setTimeout(() => {
      input.setSelectionRange(newCursorPos, newCursorPos);
      input.focus();
    }, 0);

    // Shift tuşunu otomatik kapat (tek karakter sonra)
    if (isShift && key !== 'SHIFT') {
      setIsShift(false);
    }

    if (onInput) {
      onInput(newValue);
    }
  };

  const numericLayout = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'BACKSPACE']
  ];

  const qwertyLayout = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACKSPACE'],
    ['NUMERIC', 'SPACE', 'ENTER', 'CLOSE']
  ];

  const turkishLayout = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'BACKSPACE'],
    ['NUMERIC', 'SPACE', 'ENTER', 'CLOSE']
  ];

  const currentLayout = isNumeric ? numericLayout : turkishLayout;

  const getKeyDisplay = (key) => {
    if (key === 'BACKSPACE') return '⌫';
    if (key === 'SPACE') return 'Boşluk';
    if (key === 'ENTER') return 'Enter';
    if (key === 'SHIFT') return isShift ? '⇧' : '⇧';
    if (key === 'NUMERIC') return isNumeric ? 'ABC' : '123';
    if (key === 'CLOSE') return '✕';
    return isShift ? key.toUpperCase() : key;
  };

  const getKeyClass = (key) => {
    const baseClass = 'flex items-center justify-center rounded-xl font-semibold transition-all duration-200 active:scale-95 select-none touch-manipulation';
    
    if (key === 'BACKSPACE' || key === 'SHIFT' || key === 'NUMERIC' || key === 'CLOSE') {
      return `${baseClass} bg-gray-100 hover:bg-gray-200 text-gray-700 text-lg min-h-[60px]`;
    }
    
    if (key === 'SPACE') {
      return `${baseClass} bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-medium min-h-[60px] flex-1`;
    }
    
    if (key === 'ENTER') {
      return `${baseClass} bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 text-sm font-medium min-h-[60px] flex-1 shadow-md`;
    }
    
    return `${baseClass} bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-800 text-lg font-medium min-h-[60px] shadow-sm`;
  };

  return createPortal(
    <div className="fixed inset-0 flex items-end justify-center z-[9999] animate-fade-in pointer-events-none">
      <div 
        ref={keyboardRef}
        className="w-full max-w-6xl bg-white rounded-t-3xl shadow-2xl transform animate-slide-up border-t-4 border-gray-100 pointer-events-auto"
        style={{ 
          boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
        }}
      >
        {/* Keyboard Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Sanal Klavye</h3>
              <p className="text-xs text-gray-500">Dokunmatik giriş</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Keyboard Body */}
        <div className="p-6 bg-white">
          <div className="space-y-3">
            {currentLayout.map((row, rowIndex) => (
              <div 
                key={rowIndex} 
                className="flex gap-2 justify-center"
              >
                {row.map((key, keyIndex) => {
                  const displayKey = getKeyDisplay(key);
                  const isSpecialKey = ['BACKSPACE', 'SHIFT', 'NUMERIC', 'SPACE', 'ENTER', 'CLOSE'].includes(key);
                  
                  return (
                    <button
                      key={`${rowIndex}-${keyIndex}`}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleKeyPress(key);
                        // Input'un focus'unu koru
                        if (targetInput) {
                          setTimeout(() => {
                            targetInput.focus();
                          }, 0);
                        }
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.style.transform = 'scale(0.95)';
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className={getKeyClass(key)}
                      style={{
                        minWidth: isSpecialKey ? '80px' : '60px',
                        flex: key === 'SPACE' ? 1 : 'none',
                        WebkitTapHighlightColor: 'transparent',
                        touchAction: 'manipulation',
                      }}
                    >
                      {key === 'BACKSPACE' ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                        </svg>
                      ) : key === 'SHIFT' ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      ) : (
                        <span className={isShift && !isSpecialKey ? 'font-bold' : ''}>
                          {displayKey}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default VirtualKeyboard;

