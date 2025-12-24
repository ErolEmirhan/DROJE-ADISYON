// Tenant Management Service
// Tenant-ID'ye göre müessese bilgilerini ve Firebase yapılandırmalarını yönetir

// Tenant bilgilerini doğrulama ve alma
export async function getTenantInfo(tenantId) {
  try {
    // Tenant bilgilerini doğrulama için Firebase yapılandırması
    const tenantConfigFirebase = {
      apiKey: "AIzaSyBC6VxvlV3VxDnucAGxPOarYmar1PAItQM",
      authDomain: "adminself-d2c2b.firebaseapp.com",
      projectId: "adminself-d2c2b",
      storageBucket: "adminself-d2c2b.firebasestorage.app",
      messagingSenderId: "814547626980",
      appId: "1:814547626980:web:0a2e8fad7aa1ccdea675f1",
      measurementId: "G-GCRJCCL4K0"
    };

    // Firebase'i dinamik olarak yükle
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFirestore } = await import('firebase/firestore');
    const { doc, getDoc } = await import('firebase/firestore');

    // Tenant config Firebase'i başlat (eğer yoksa)
    let tenantApp;
    const appName = `tenant-config-${tenantId}`;
    try {
      // Önce mevcut app'i kontrol et
      const apps = getApps();
      const existingApp = apps.find(app => app.name === appName);
      if (existingApp) {
        tenantApp = existingApp;
      } else {
        tenantApp = initializeApp(tenantConfigFirebase, appName);
      }
    } catch (e) {
      tenantApp = initializeApp(tenantConfigFirebase, appName);
    }

    const tenantDb = getFirestore(tenantApp);

    // Tenant bilgilerini Firestore'dan al - tenantId field'ına göre query yap
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const tenantsRef = collection(tenantDb, 'tenants');
    const q = query(tenantsRef, where('tenantId', '==', tenantId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error('Tenant-ID bulunamadı');
    }

    // İlk eşleşen dokümanı al
    const tenantDoc = querySnapshot.docs[0];
    const tenantData = tenantDoc.data();

    // Firebase config'leri parse et (JSON string olarak saklanmış olabilir)
    let mainFirebaseConfig = null;
    let tablesFirebaseConfig = null;

    // firebaseApi1 -> mainFirebaseConfig
    if (tenantData.mainFirebaseConfig) {
      mainFirebaseConfig = typeof tenantData.mainFirebaseConfig === 'string' 
        ? JSON.parse(tenantData.mainFirebaseConfig) 
        : tenantData.mainFirebaseConfig;
    } else if (tenantData.firebaseApi1) {
      try {
        mainFirebaseConfig = typeof tenantData.firebaseApi1 === 'string' 
          ? JSON.parse(tenantData.firebaseApi1) 
          : tenantData.firebaseApi1;
      } catch (e) {
        console.error('firebaseApi1 parse hatası:', e);
        mainFirebaseConfig = tenantData.firebaseApi1;
      }
    }

    // firebaseApi2 -> tablesFirebaseConfig
    if (tenantData.tablesFirebaseConfig) {
      tablesFirebaseConfig = typeof tenantData.tablesFirebaseConfig === 'string' 
        ? JSON.parse(tenantData.tablesFirebaseConfig) 
        : tenantData.tablesFirebaseConfig;
    } else if (tenantData.firebaseApi2) {
      try {
        tablesFirebaseConfig = typeof tenantData.firebaseApi2 === 'string' 
          ? JSON.parse(tenantData.firebaseApi2) 
          : tenantData.firebaseApi2;
      } catch (e) {
        console.error('firebaseApi2 parse hatası:', e);
        tablesFirebaseConfig = tenantData.firebaseApi2;
      }
    }

    // Status kontrolü: isActive: false VEYA status: 'suspended' ise suspended
    const status = tenantData.status || 'active';
    const isActive = tenantData.isActive !== false && status !== 'suspended';

    // Masa sayılarını al (varsayılan: 20)
    // 0 değeri geçerli olduğu için null/undefined kontrolü yapıyoruz
    const insideTables = tenantData.insideTables !== undefined && tenantData.insideTables !== null 
      ? tenantData.insideTables 
      : (tenantData.inside_tables !== undefined && tenantData.inside_tables !== null ? tenantData.inside_tables : 20);
    const outsideTables = tenantData.outsideTables !== undefined && tenantData.outsideTables !== null 
      ? tenantData.outsideTables 
      : (tenantData.outside_tables !== undefined && tenantData.outside_tables !== null ? tenantData.outside_tables : 20);
    const packageTables = tenantData.packageTables !== undefined && tenantData.packageTables !== null 
      ? tenantData.packageTables 
      : (tenantData.package_tables !== undefined && tenantData.package_tables !== null ? tenantData.package_tables : 5);

    // Tenant bilgilerini döndür
    return {
      tenantId: tenantId,
      businessName: tenantData.businessName || tenantData.name || 'İşletme',
      mainFirebaseConfig: mainFirebaseConfig,
      tablesFirebaseConfig: tablesFirebaseConfig,
      isActive: isActive,
      themeColor: tenantData.themeColor || '#f97316', // Varsayılan turuncu
      insideTables: typeof insideTables === 'number' ? insideTables : (parseInt(insideTables) || 20),
      outsideTables: typeof outsideTables === 'number' ? outsideTables : (parseInt(outsideTables) || 20),
      packageTables: typeof packageTables === 'number' ? packageTables : (parseInt(packageTables) || 5)
    };
  } catch (error) {
    console.error('Tenant bilgisi alınamadı:', error);
    throw error;
  }
}

// Tenant bilgilerini localStorage'a kaydet
export function saveTenantInfo(tenantInfo) {
  localStorage.setItem('current_tenant', JSON.stringify(tenantInfo));
}

// Tenant bilgilerini localStorage'dan al
export function getSavedTenantInfo() {
  const saved = localStorage.getItem('current_tenant');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Tenant bilgilerini temizle
export function clearTenantInfo() {
  localStorage.removeItem('current_tenant');
}

