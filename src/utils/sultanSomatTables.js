// SULTAN SOMATI (TENANT-1766611377865) için özel salon bazlı masa yapısı
// YAKA'S GRILL (TENANT-1766340222641) için özel direkt masa yapısı
// GECE DÖNERCİSİ (TENANT-1769602125250) için 6 genel kategori: salon, bahçe, paket, trendyolgo, yemeksepeti, migros yemek

export const SULTAN_SOMATI_TENANT_ID = 'TENANT-1766611377865';
export const YAKAS_GRILL_TENANT_ID = 'TENANT-1766340222641';
export const GECE_DONERCISI_TENANT_ID = 'TENANT-1769602125250';
export const LACROMISA_TENANT_ID = 'TENANT-1769956051654';
export const YAKAS_GRILL_TABLE_COUNT = 30;
export const GECE_DONERCISI_TABLE_COUNT_PER_CATEGORY = 30;

// Salon yapısı tanımı
export const SULTAN_SOMATI_SALONS = [
  { id: 'disari', name: 'Dışarı', count: 4, icon: '☀️' },
  { id: 'kis-bahcesi', name: 'Kış Bahçesi', count: 14, icon: '🌿' },
  { id: 'osmanli-odasi', name: 'Osmanlı Odası', count: 8, icon: '🏛️' },
  { id: 'selcuklu-odasi', name: 'Selçuklu Odası', count: 10, icon: '🕌' },
  { id: 'mevlevi-odasi', name: 'Mevlevi Odası', count: 1, icon: '🕯️' },
  { id: 'ask-odasi', name: 'Aşk Odası', count: 1, icon: '💕' }
];

// Gece Dönercisi: 6 genel masa kategorisi (iç/dış değil) — mobil personel ile senkron
export const GECE_DONERCISI_CATEGORIES = [
  { id: 'salon', name: 'Salon', count: GECE_DONERCISI_TABLE_COUNT_PER_CATEGORY, icon: '🪑' },
  { id: 'bahce', name: 'Bahçe', count: GECE_DONERCISI_TABLE_COUNT_PER_CATEGORY, icon: '🌿' },
  { id: 'paket', name: 'Paket', count: GECE_DONERCISI_TABLE_COUNT_PER_CATEGORY, icon: '📦' },
  { id: 'trendyolgo', name: 'TrendyolGO', count: GECE_DONERCISI_TABLE_COUNT_PER_CATEGORY, icon: '🛒' },
  { id: 'yemeksepeti', name: 'Yemeksepeti', count: GECE_DONERCISI_TABLE_COUNT_PER_CATEGORY, icon: '🍽️' },
  { id: 'migros-yemek', name: 'Migros Yemek', count: GECE_DONERCISI_TABLE_COUNT_PER_CATEGORY, icon: '🛍️' }
];

/**
 * Tenant ID'nin Sultan Somatı olup olmadığını kontrol eder
 */
export function isSultanSomati(tenantId) {
  return tenantId === SULTAN_SOMATI_TENANT_ID;
}

/**
 * Sultan Somatı için salon bazlı masaları oluşturur
 */
export function generateSultanSomatiTables() {
  const tables = [];
  
  SULTAN_SOMATI_SALONS.forEach(salon => {
    for (let i = 1; i <= salon.count; i++) {
      tables.push({
        id: `salon-${salon.id}-${i}`,
        number: i,
        type: salon.id,
        salonId: salon.id,
        salonName: salon.name,
        name: salon.count === 1 ? salon.name : `${salon.name} ${i}`,
        icon: salon.icon
      });
    }
  });
  
  return tables;
}

/**
 * Masa ID'sinden salon bilgisini çıkarır
 */
export function getSalonFromTableId(tableId) {
  if (!tableId || !tableId.startsWith('salon-')) {
    return null;
  }
  
  const parts = tableId.split('-');
  if (parts.length < 3) return null;
  
  const salonId = parts.slice(1, -1).join('-'); // Son kısım masa numarası
  const salon = SULTAN_SOMATI_SALONS.find(s => s.id === salonId);
  
  return salon || null;
}

/**
 * Masa ID'sinden masa numarasını çıkarır
 */
export function getTableNumberFromTableId(tableId) {
  if (!tableId || !tableId.startsWith('salon-')) {
    return null;
  }
  
  const parts = tableId.split('-');
  return parseInt(parts[parts.length - 1]) || null;
}

/**
 * Salon ID'sine göre salon bilgisini döndürür
 */
export function getSalonById(salonId) {
  return SULTAN_SOMATI_SALONS.find(s => s.id === salonId) || null;
}

/**
 * Tenant ID'nin Yaka's Grill olup olmadığını kontrol eder
 */
export function isYakasGrill(tenantId) {
  return tenantId === YAKAS_GRILL_TENANT_ID;
}

/**
 * Yaka's Grill için direkt masaları oluşturur (MASA-1, MASA-2, ...)
 */
export function generateYakasGrillTables() {
  const tables = [];
  
  for (let i = 1; i <= YAKAS_GRILL_TABLE_COUNT; i++) {
    tables.push({
      id: `masa-${i}`,
      number: i,
      type: 'masa',
      name: `MASA-${i}`
    });
  }
  
  return tables;
}

// ——— Gece Dönercisi (TENANT-1769602125250) ———

/**
 * Tenant ID'nin Gece Dönercisi olup olmadığını kontrol eder
 */
export function isGeceDonercisi(tenantId) {
  return tenantId === GECE_DONERCISI_TENANT_ID;
}

/**
 * Tenant ID'nin Lacromisa olup olmadığını kontrol eder
 */
export function isLacromisa(tenantId) {
  return tenantId === LACROMISA_TENANT_ID;
}

/**
 * Gece Dönercisi için 6 kategoride 30'ar masa oluşturur (mobil personel ile senkron)
 * ID formatı: salon-1, bahce-1, paket-1, trendyolgo-1, yemeksepeti-1, migros-yemek-1
 */
export function generateGeceDonercisiTables() {
  const tables = [];
  GECE_DONERCISI_CATEGORIES.forEach(cat => {
    for (let i = 1; i <= cat.count; i++) {
      tables.push({
        id: `${cat.id}-${i}`,
        number: i,
        type: cat.id,
        categoryId: cat.id,
        categoryName: cat.name,
        name: `${cat.name} ${i}`,
        icon: cat.icon
      });
    }
  });
  return tables;
}

/**
 * Gece Dönercisi masa ID'sinden kategori bilgisini döndürür (salon, bahce, paket, trendyolgo, yemeksepeti, migros-yemek)
 * Örnek: "migros-yemek-5" -> { id: 'migros-yemek', name: 'Migros Yemek', ... }
 */
export function getCategoryFromTableIdGeceDonercisi(tableId) {
  if (!tableId) return null;
  const parts = tableId.split('-');
  if (parts.length < 2) return null;
  const num = parseInt(parts[parts.length - 1], 10);
  if (isNaN(num)) return null;
  const categoryId = parts.slice(0, -1).join('-');
  return GECE_DONERCISI_CATEGORIES.find(c => c.id === categoryId) || null;
}

/**
 * Gece Dönercisi masa ID'sinden masa numarasını döndürür
 */
export function getTableNumberFromTableIdGeceDonercisi(tableId) {
  if (!tableId) return null;
  const parts = tableId.split('-');
  const num = parseInt(parts[parts.length - 1], 10);
  return isNaN(num) ? null : num;
}

/**
 * Gece Dönercisi kategori ID'sine göre kategori bilgisini döndürür
 */
export function getCategoryByIdGeceDonercisi(categoryId) {
  return GECE_DONERCISI_CATEGORIES.find(c => c.id === categoryId) || null;
}

