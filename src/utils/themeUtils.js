/**
 * Tema renkleri utility fonksiyonları
 * Tenant bazlı dinamik tema desteği
 */

/**
 * Hex renk kodunu RGB'ye çevirir
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * RGB'yi hex'e çevirir
 */
function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * Renk tonunu açıklaştırır veya koyulaştırır
 * @param {string} hex - Hex renk kodu (#f97316 gibi)
 * @param {number} percent - Yüzde (-100 ile 100 arası, negatif koyulaştırır, pozitif açıklaştırır)
 */
function adjustColorBrightness(hex, percent) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.max(0, Math.min(255, rgb.r + (rgb.r * percent / 100)));
  const g = Math.max(0, Math.min(255, rgb.g + (rgb.g * percent / 100)));
  const b = Math.max(0, Math.min(255, rgb.b + (rgb.b * percent / 100)));
  
  return rgbToHex(Math.round(r), Math.round(g), Math.round(b));
}

/**
 * Tenant'ın tema rengine göre gradient renklerini hesaplar
 * @param {string} themeColor - Ana tema rengi (hex formatında, örn: #f97316)
 * @returns {object} Tema renkleri objesi
 */
export function getThemeColors(themeColor = '#f97316') {
  // Eğer themeColor yoksa varsayılan turuncu kullan
  if (!themeColor || !themeColor.startsWith('#')) {
    themeColor = '#f97316';
  }

  // Ana renk tonları
  const primary = themeColor; // Ana renk (orange-500 eşdeğeri)
  const primaryLight = adjustColorBrightness(themeColor, 15); // Açık ton (orange-400 eşdeğeri)
  const primaryDark = adjustColorBrightness(themeColor, -20); // Koyu ton (orange-600 eşdeğeri)
  
  // Çok açık tonlar (50, 100, 200 seviyeleri)
  const primary50 = adjustColorBrightness(themeColor, 85);
  const primary100 = adjustColorBrightness(themeColor, 70);
  const primary200 = adjustColorBrightness(themeColor, 50);
  const primary300 = adjustColorBrightness(themeColor, 30);
  const primary400 = primaryLight;
  const primary500 = primary;
  const primary600 = primaryDark;
  const primary700 = adjustColorBrightness(themeColor, -30);
  const primary800 = adjustColorBrightness(themeColor, -40);

  // RGB değerleri (rgba için)
  const rgb = hexToRgb(themeColor);
  const rgba = {
    primary: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
    primaryLight: hexToRgb(primaryLight) ? `rgba(${hexToRgb(primaryLight).r}, ${hexToRgb(primaryLight).g}, ${hexToRgb(primaryLight).b}, 1)` : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`,
    primaryDark: hexToRgb(primaryDark) ? `rgba(${hexToRgb(primaryDark).r}, ${hexToRgb(primaryDark).g}, ${hexToRgb(primaryDark).b}, 1)` : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`,
  };

  return {
    // Hex renkler
    primary,
    primaryLight,
    primaryDark,
    primary50,
    primary100,
    primary200,
    primary300,
    primary400,
    primary500,
    primary600,
    primary700,
    primary800,
    
    // RGB renkler
    rgba,
    
    // Gradient string'leri
    gradient: {
      // Ana gradient (from-orange-500 via-orange-400 to-orange-600)
      main: `linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%)`,
      // Horizontal gradient
      horizontal: `linear-gradient(to right, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%)`,
      // Vertical gradient
      vertical: `linear-gradient(to bottom, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%)`,
      // Brighter gradient (for overlays)
      bright: `linear-gradient(135deg, ${primaryLight} 0%, ${primary} 50%, ${primaryDark} 100%)`,
    },
    
    // Tailwind class'ları için renk değerleri
    tailwind: {
      '50': primary50,
      '100': primary100,
      '200': primary200,
      '300': primary300,
      '400': primary400,
      '500': primary500,
      '600': primary600,
      '700': primary700,
      '800': primary800,
    }
  };
}

/**
 * Tailwind class'larını dinamik tema rengine göre oluşturur
 * @param {string} themeColor - Ana tema rengi
 * @returns {object} Tailwind class mapping'leri
 */
export function getThemeClasses(themeColor = '#f97316') {
  const colors = getThemeColors(themeColor);
  
  return {
    // Gradient text
    gradientText: `bg-gradient-to-r from-[${colors.primary}] via-[${colors.primaryLight}] to-[${colors.primaryDark}] bg-clip-text text-transparent`,
    
    // Gradient background
    gradientBg: `bg-gradient-to-r from-[${colors.primary}] via-[${colors.primaryLight}] to-[${colors.primaryDark}]`,
    
    // Border
    border: `border-[${colors.primary}]`,
    borderLight: `border-[${colors.primary300}]`,
    borderDark: `border-[${colors.primary600}]`,
    
    // Text
    text: `text-[${colors.primary600}]`,
    textLight: `text-[${colors.primary400}]`,
    textDark: `text-[${colors.primary700}]`,
    
    // Background
    bg: `bg-[${colors.primary}]`,
    bgLight: `bg-[${colors.primary50}]`,
    bgMedium: `bg-[${colors.primary100}]`,
  };
}

/**
 * Inline style için gradient oluşturur
 * @param {string} themeColor - Ana tema rengi
 * @returns {string} CSS gradient string
 */
export function getGradientStyle(themeColor = '#f97316') {
  const colors = getThemeColors(themeColor);
  return colors.gradient.main;
}

/**
 * Inline style için rgba oluşturur
 * @param {string} themeColor - Ana tema rengi
 * @param {number} opacity - Opacity değeri (0-1)
 * @returns {string} CSS rgba string
 */
export function getRgbaStyle(themeColor = '#f97316', opacity = 1) {
  const rgb = hexToRgb(themeColor);
  if (!rgb) return `rgba(249, 115, 22, ${opacity})`; // Fallback turuncu
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}




