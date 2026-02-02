// Tenant Manager - Multi-tenant sistem yönetimi
// Tenant-ID'ye göre Firebase yapılandırmalarını ve müessese bilgilerini yönetir

// Firebase modüllerini dinamik olarak yükle (Node.js ortamı için)
let firebaseAppModule = null;
let firebaseFirestoreModule = null;

function loadFirebaseModules() {
  if (!firebaseAppModule) {
    firebaseAppModule = require('firebase/app');
    firebaseFirestoreModule = require('firebase/firestore');
  }
  return { firebaseAppModule, firebaseFirestoreModule };
}

// Tenant config Firebase (tüm tenant'ların bilgilerini tutar)
const TENANT_CONFIG_FIREBASE = {
  apiKey: "AIzaSyBC6VxvlV3VxDnucAGxPOarYmar1PAItQM",
  authDomain: "adminself-d2c2b.firebaseapp.com",
  projectId: "adminself-d2c2b",
  storageBucket: "adminself-d2c2b.firebasestorage.app",
  messagingSenderId: "814547626980",
  appId: "1:814547626980:web:0a2e8fad7aa1ccdea675f1",
  measurementId: "G-GCRJCCL4K0"
};

const LACRIMOSA_TENANT_ID = 'TENANT-1769956051654';
const LACRIMOSA_BUSINESS_NAME = 'Lacrimosa Coffee';

let tenantConfigApp = null;
let tenantConfigFirestore = null;
let currentTenantInfo = null;
let tenantStatusListener = null;
let statusChangeCallback = null;

// Tenant config Firebase'i başlat
function initTenantConfigFirebase() {
  try {
    if (!tenantConfigApp) {
      const { firebaseAppModule, firebaseFirestoreModule } = loadFirebaseModules();
      tenantConfigApp = firebaseAppModule.initializeApp(TENANT_CONFIG_FIREBASE, 'tenant-config');
      tenantConfigFirestore = firebaseFirestoreModule.getFirestore(tenantConfigApp);
      console.log('✅ Tenant Config Firebase başlatıldı');
    }
    return true;
  } catch (error) {
    console.error('❌ Tenant Config Firebase başlatılamadı:', error);
    return false;
  }
}

// Tenant bilgilerini al
async function getTenantInfo(tenantId) {
  try {
    if (!initTenantConfigFirebase()) {
      throw new Error('Tenant config Firebase başlatılamadı');
    }

    const { firebaseFirestoreModule } = loadFirebaseModules();
    
    // Tenant bilgilerini Firestore'dan al - tenantId field'ına göre query yap
    const tenantsRef = firebaseFirestoreModule.collection(tenantConfigFirestore, 'tenants');
    const q = firebaseFirestoreModule.query(
      tenantsRef, 
      firebaseFirestoreModule.where('tenantId', '==', tenantId)
    );
    const querySnapshot = await firebaseFirestoreModule.getDocs(q);

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

    if (!isActive) {
      throw new Error('Bu Tenant-ID aktif değil');
    }

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

    return {
      tenantId: tenantId,
      businessName: tenantId === LACRIMOSA_TENANT_ID ? LACRIMOSA_BUSINESS_NAME : (tenantData.businessName || tenantData.name || 'İşletme'),
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

// Mevcut tenant bilgisini al
function getCurrentTenantInfo() {
  return currentTenantInfo;
}

// Tenant bilgisini ayarla
function setCurrentTenantInfo(tenantInfo) {
  currentTenantInfo = tenantInfo;
  console.log(`✅ Tenant bilgisi ayarlandı: ${tenantInfo.businessName} (${tenantInfo.tenantId})`);
  
  // Status listener'ı başlat
  setupTenantStatusListener(tenantInfo.tenantId);
}

// Tenant status değişikliklerini dinle
async function setupTenantStatusListener(tenantId) {
  // Önceki listener'ı temizle
  if (tenantStatusListener) {
    tenantStatusListener();
    tenantStatusListener = null;
  }

  try {
    if (!initTenantConfigFirebase()) {
      console.warn('⚠️ Tenant Config Firebase başlatılamadı, status listener kurulamadı');
      return;
    }

    const { firebaseFirestoreModule } = loadFirebaseModules();
    
    // Önce tenant dokümanını bul (tenantId field'ına göre)
    const tenantsRef = firebaseFirestoreModule.collection(tenantConfigFirestore, 'tenants');
    const q = firebaseFirestoreModule.query(
      tenantsRef, 
      firebaseFirestoreModule.where('tenantId', '==', tenantId)
    );
    
    const querySnapshot = await firebaseFirestoreModule.getDocs(q);
    
    if (querySnapshot.empty) {
      console.warn('⚠️ Tenant dokümanı bulunamadı');
      return;
    }

    // Document ID'yi al
    const tenantDoc = querySnapshot.docs[0];
    const tenantDocId = tenantDoc.id;
    
    // Document'i direkt dinle
    const tenantDocRef = firebaseFirestoreModule.doc(tenantConfigFirestore, 'tenants', tenantDocId);
    
    // Önceki durumu sakla (değişiklik tespiti için)
    let previousStatus = null;
    let previousIsActive = null;
    let isFirstSnapshot = true;
    
    console.log(`🔍 Tenant listener başlatılıyor - Tenant ID: ${tenantId}`);
    console.log(`🔍 currentTenantInfo:`, currentTenantInfo);
    
    // Her snapshot'ta durumu kontrol et ve gerekirse bildir
    tenantStatusListener = firebaseFirestoreModule.onSnapshot(tenantDocRef, (docSnapshot) => {
      console.log(`📡 Tenant snapshot alındı (ilk: ${isFirstSnapshot})`);
      
      if (!docSnapshot.exists()) {
        console.warn('⚠️ Tenant dokümanı artık mevcut değil');
        return;
      }

      const tenantData = docSnapshot.data();
      const status = tenantData.status || 'active';
      // isActive: false VEYA status: 'suspended' ise suspended
      const isActive = tenantData.isActive !== false && status !== 'suspended';
      
      console.log(`📊 Tenant durumu: status=${status}, isActive=${tenantData.isActive}, hesaplanan isActive=${isActive}`);
      console.log(`📊 Önceki durum: status=${previousStatus}, isActive=${previousIsActive}`);

      // Durum değişikliği var mı kontrol et
      const statusChanged = previousStatus !== null && status !== previousStatus;
      const isActiveChanged = previousIsActive !== null && isActive !== previousIsActive;
      
      // Tenant bilgisini güncelle
      if (currentTenantInfo) {
        currentTenantInfo.status = status;
        currentTenantInfo.isActive = isActive;
      }

      // İlk snapshot'ta veya değişiklik varsa kontrol et
      const shouldCheck = isFirstSnapshot || statusChanged || isActiveChanged;
      
      if (shouldCheck) {
        // Eğer suspended durumuna geçildiyse veya zaten suspended ise
        if (!isActive || status === 'suspended') {
          console.log(`🚨 Tenant suspended! status=${status}, isActive=${isActive}, ilkSnapshot=${isFirstSnapshot}`);
          
          if (statusChangeCallback) {
            console.log('📞 Callback çağrılıyor...');
            try {
              statusChangeCallback({
                tenantId: tenantId,
                status: status,
                isActive: isActive,
                businessName: tenantData.businessName || tenantData.name || 'İşletme'
              });
              console.log('✅ Callback başarıyla çağrıldı');
            } catch (error) {
              console.error('❌ Callback çağrılırken hata:', error);
            }
          } else {
            console.error('❌ statusChangeCallback tanımlı değil!');
          }
        } else if (statusChanged || isActiveChanged) {
          console.log(`ℹ️ Tenant durumu değişti ama suspended değil: status=${status}, isActive=${isActive}`);
        }
      } else {
        console.log(`ℹ️ Tenant durumu değişmedi`);
      }

      // Önceki durumu güncelle
      previousStatus = status;
      previousIsActive = isActive;
      isFirstSnapshot = false;
    }, (error) => {
      console.error('❌ Tenant status listener hatası:', error);
    });

    console.log('👂 Tenant status listener başlatıldı');
  } catch (error) {
    console.error('❌ Tenant status listener kurulamadı:', error);
  }
}

// Status değişikliği callback'ini ayarla
function setStatusChangeCallback(callback) {
  statusChangeCallback = callback;
}

// Status listener'ı temizle
function cleanupTenantStatusListener() {
  if (tenantStatusListener) {
    tenantStatusListener();
    tenantStatusListener = null;
  }
}

// Müessese ismini al (dinamik)
function getBusinessName() {
  if (currentTenantInfo?.tenantId === LACRIMOSA_TENANT_ID) return LACRIMOSA_BUSINESS_NAME;
  return currentTenantInfo ? currentTenantInfo.businessName : 'MAKARA';
}

module.exports = {
  getTenantInfo,
  getCurrentTenantInfo,
  setCurrentTenantInfo,
  getBusinessName,
  initTenantConfigFirebase,
  setupTenantStatusListener,
  setStatusChangeCallback,
  cleanupTenantStatusListener
};

