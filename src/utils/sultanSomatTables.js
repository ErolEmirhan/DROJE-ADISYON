// SULTAN SOMATI (TENANT-1766611377865) için özel salon bazlı masa yapısı

export const SULTAN_SOMATI_TENANT_ID = 'TENANT-1766611377865';

// Salon yapısı tanımı
export const SULTAN_SOMATI_SALONS = [
  { id: 'disari', name: 'Dışarı', count: 4, icon: '☀️' },
  { id: 'kis-bahcesi', name: 'Kış Bahçesi', count: 14, icon: '🌿' },
  { id: 'osmanli-odasi', name: 'Osmanlı Odası', count: 8, icon: '🏛️' },
  { id: 'selcuklu-odasi', name: 'Selçuklu Odası', count: 10, icon: '🕌' },
  { id: 'mevlevi-odasi', name: 'Mevlevi Odası', count: 1, icon: '🕯️' },
  { id: 'ask-odasi', name: 'Aşk Odası', count: 1, icon: '💕' }
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

