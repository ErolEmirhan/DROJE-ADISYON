import { useState, useEffect } from 'react';

export const useVirtualKeyboard = () => {
  const [activeInput, setActiveInput] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const handleFocus = (e) => {
      const target = e.target;
      
      // Sadece input, textarea ve contenteditable elementler için klavye aç
      if (
        (target.tagName === 'INPUT' && target.type !== 'checkbox' && target.type !== 'radio' && target.type !== 'file' && target.type !== 'button' && target.type !== 'submit') ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        setActiveInput(target);
        setKeyboardVisible(true);
      }
    };

    const handleBlur = (e) => {
      // Blur event'i hemen çalışmasın, biraz bekle (buton tıklamaları için)
      // Klavye butonlarına tıklandığında input focus'unu kaybetmemesi için daha uzun bekle
      setTimeout(() => {
        const activeElement = document.activeElement;
        // Eğer hala aynı input aktifse veya başka bir input aktifse klavyeyi açık tut
        if (activeInput && (activeInput === e.target || activeInput.contains(e.relatedTarget))) {
          return;
        }
        if (
          !activeElement ||
          (activeElement.tagName !== 'INPUT' && 
           activeElement.tagName !== 'TEXTAREA' && 
           activeElement.contentEditable !== 'true') ||
          activeElement === document.body
        ) {
          // Eğer klavye butonlarına tıklandıysa (button, div vb.) klavyeyi kapatma
          if (activeElement && (activeElement.tagName === 'BUTTON' || activeElement.closest('.pointer-events-auto'))) {
            // Klavye butonuna tıklandı, input'u yeniden focus et
            if (activeInput) {
              setTimeout(() => {
                activeInput.focus();
              }, 50);
            }
            return;
          }
          setKeyboardVisible(false);
          setActiveInput(null);
        }
      }, 300);
    };

    // Document seviyesinde event delegation kullan
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);

    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
    };
  }, []);

  const closeKeyboard = () => {
    setKeyboardVisible(false);
    setActiveInput(null);
    if (activeInput) {
      activeInput.blur();
    }
  };

  const handleInput = (value) => {
    if (activeInput) {
      // React controlled component için
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(activeInput, value);
      }
      
      const inputEvent = new Event('input', { bubbles: true });
      activeInput.dispatchEvent(inputEvent);
    }
  };

  return {
    activeInput,
    keyboardVisible,
    closeKeyboard,
    handleInput
  };
};

