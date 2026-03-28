const { app, BrowserWindow, ipcMain, Menu, dialog, webContents } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const os = require('os');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const tenantManager = require('./tenantManager');

// Firebase entegrasyonu - Tenant'a göre dinamik yüklenecek
let firebaseApp = null;
let firestore = null;
let storage = null;
let firebaseCollection = null;
let firebaseAddDoc = null;
let firebaseServerTimestamp = null;
let firebaseGetDocs = null;
let firebaseDeleteDoc = null;
let firebaseDoc = null;
let firebaseSetDoc = null;
let firebaseOnSnapshot = null;
let storageRef = null;
let storageUploadBytes = null;
let storageGetDownloadURL = null;
let storageDeleteObject = null;

// Firebase listener'ları için cleanup fonksiyonları
let categoriesListenerCleanup = null;
let productsListenerCleanup = null;
let broadcastsListenerCleanup = null;
let customerOrdersListenerCleanup = null;

// Cloudflare R2 entegrasyonu
const R2_CONFIG = {
  accountId: 'e33cde4cf4906c2179b978f47a24bc2e',
  bucketName: 'makara',
  accessKeyId: '9ed5b5b10661aee16cb19588379afe42',
  secretAccessKey: '37caee60d81510e4f8bdec63cb857fd1832e1c88069d352dd110d5300f2b9c7d',
  endpoint: 'https://e33cde4cf4906c2179b978f47a24bc2e.r2.cloudflarestorage.com',
  publicSubdomainId: 'pub-25a516669a2e4f49b458356009f7fb83', // R2.dev public subdomain ID
  publicUrl: null // R2 public domain (eğer varsa) veya custom domain - null ise R2.dev subdomain kullanılır
};

// R2 S3 Client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_CONFIG.endpoint,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
});

// Firebase'ler tenant'a göre dinamik yüklenecek - başlangıçta null
// Tenant bilgisi geldiğinde initializeTenantFirebases() çağrılacak

let mainWindow;
let dbPath;
let apiServer = null;
let io = null;
let serverPort = 3000;

// Masalar için ayrı Firebase (tenant'a göre dinamik)
let tablesFirebaseApp = null;
let tablesFirestore = null;
let tablesFirebaseCollection = null;
let tablesFirebaseDoc = null;
let tablesFirebaseSetDoc = null;

// Gece Dönercisi - Şube stokları için ayrı Firebase (gecedonercisimasalar)
const GECE_TENANT_ID = 'TENANT-1769602125250';
const GECE_MASALAR_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB9RzR5HMVDTUfduW1ix-871k5gSM55VkU',
  authDomain: 'gecedonercisimasalar.firebaseapp.com',
  projectId: 'gecedonercisimasalar',
  storageBucket: 'gecedonercisimasalar.firebasestorage.app',
  messagingSenderId: '772077442379',
  appId: '1:772077442379:web:cd19d6c85810ceda93c4ce',
  measurementId: 'G-689BHMKQ7X',
};
let geceStocksFirebaseApp = null;
let geceStocksFirestore = null;
let firebaseRunTransaction = null;
let firebaseGetDoc = null;
let firebaseUpdateDoc = null;
let firebaseQuery = null;
let firebaseWhere = null;

// Tenant'a göre Firebase'leri başlat
async function initializeTenantFirebases(tenantInfo) {
  try {
    // Önce mevcut Firebase'leri temizle
    await cleanupFirebases();

    const firebaseAppModule = require('firebase/app');
    const firebaseFirestoreModule = require('firebase/firestore');
    const firebaseStorageModule = require('firebase/storage');

    // Ana Firebase (satışlar, ürünler, kategoriler için)
    if (tenantInfo.mainFirebaseConfig) {
      const mainConfig = tenantInfo.mainFirebaseConfig;
      
      // Eğer aynı isimde bir app varsa sil
      try {
        const existingApp = firebaseAppModule.getApp('main');
        if (existingApp) {
          await firebaseAppModule.deleteApp(existingApp);
        }
      } catch (e) {
        // App yok, devam et
      }

      firebaseApp = firebaseAppModule.initializeApp(mainConfig, 'main');
      firestore = firebaseFirestoreModule.getFirestore(firebaseApp);
      storage = firebaseStorageModule.getStorage(firebaseApp);
      firebaseCollection = firebaseFirestoreModule.collection;
      firebaseAddDoc = firebaseFirestoreModule.addDoc;
      firebaseServerTimestamp = firebaseFirestoreModule.serverTimestamp;
      firebaseGetDocs = firebaseFirestoreModule.getDocs;
      firebaseDeleteDoc = firebaseFirestoreModule.deleteDoc;
      firebaseDoc = firebaseFirestoreModule.doc;
      firebaseSetDoc = firebaseFirestoreModule.setDoc;
      firebaseOnSnapshot = firebaseFirestoreModule.onSnapshot;
      firebaseRunTransaction = firebaseFirestoreModule.runTransaction;
      firebaseGetDoc = firebaseFirestoreModule.getDoc;
      firebaseUpdateDoc = firebaseFirestoreModule.updateDoc;
      firebaseQuery = firebaseFirestoreModule.query;
      firebaseWhere = firebaseFirestoreModule.where;
      storageRef = firebaseStorageModule.ref;
      storageUploadBytes = firebaseStorageModule.uploadBytes;
      storageGetDownloadURL = firebaseStorageModule.getDownloadURL;
      storageDeleteObject = firebaseStorageModule.deleteObject;
      
      console.log(`✅ Ana Firebase başlatıldı: ${mainConfig.projectId}`);
    } else {
      console.warn('⚠️ Ana Firebase config bulunamadı');
    }

    // Masalar Firebase (tables, product_stocks için)
    if (tenantInfo.tablesFirebaseConfig) {
      const tablesConfig = tenantInfo.tablesFirebaseConfig;
      
      // Eğer aynı isimde bir app varsa sil
      try {
        const existingApp = firebaseAppModule.getApp('tables');
        if (existingApp) {
          await firebaseAppModule.deleteApp(existingApp);
        }
      } catch (e) {
        // App yok, devam et
      }

      tablesFirebaseApp = firebaseAppModule.initializeApp(tablesConfig, 'tables');
      tablesFirestore = firebaseFirestoreModule.getFirestore(tablesFirebaseApp);
      tablesFirebaseCollection = firebaseFirestoreModule.collection;
      tablesFirebaseDoc = firebaseFirestoreModule.doc;
      tablesFirebaseSetDoc = firebaseFirestoreModule.setDoc;
      
      console.log(`✅ Masalar Firebase başlatıldı: ${tablesConfig.projectId}`);
    } else {
      console.warn('⚠️ Masalar Firebase config bulunamadı');
    }

    // Gece Dönercisi: şube stokları için ayrı Firebase başlat (gecedonercisimasalar)
    if (tenantInfo?.tenantId === GECE_TENANT_ID) {
      try {
        try {
          const existingApp = firebaseAppModule.getApp('gece-stocks');
          if (existingApp) {
            await firebaseAppModule.deleteApp(existingApp);
          }
        } catch (e) {
          // App yok, devam et
        }
        geceStocksFirebaseApp = firebaseAppModule.initializeApp(GECE_MASALAR_FIREBASE_CONFIG, 'gece-stocks');
        geceStocksFirestore = firebaseFirestoreModule.getFirestore(geceStocksFirebaseApp);
        console.log(`✅ Gece şube stok Firebase başlatıldı: ${GECE_MASALAR_FIREBASE_CONFIG.projectId}`);
      } catch (e) {
        console.error('❌ Gece şube stok Firebase başlatma hatası:', e);
        geceStocksFirebaseApp = null;
        geceStocksFirestore = null;
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Firebase başlatma hatası:', error);
    return false;
  }
}

// Mevcut Firebase'leri temizle
async function cleanupFirebases() {
  try {
    const firebaseAppModule = require('firebase/app');
    
    // Mevcut listener'ları temizle
    if (categoriesListenerCleanup) {
      categoriesListenerCleanup();
      categoriesListenerCleanup = null;
    }
    if (productsListenerCleanup) {
      productsListenerCleanup();
      productsListenerCleanup = null;
    }
    if (broadcastsListenerCleanup) {
      broadcastsListenerCleanup();
      broadcastsListenerCleanup = null;
    }
    if (customerOrdersListenerCleanup) {
      customerOrdersListenerCleanup();
      customerOrdersListenerCleanup = null;
    }
    
    // Tenant status listener'ı temizle
    tenantManager.cleanupTenantStatusListener();

    // Firebase app'leri sil
    try {
      if (firebaseApp) {
        await firebaseAppModule.deleteApp(firebaseApp);
        firebaseApp = null;
      }
    } catch (e) {
      // App zaten silinmiş
    }

    try {
      if (tablesFirebaseApp) {
        await firebaseAppModule.deleteApp(tablesFirebaseApp);
        tablesFirebaseApp = null;
      }
    } catch (e) {
      // App zaten silinmiş
    }

    try {
      if (geceStocksFirebaseApp) {
        await firebaseAppModule.deleteApp(geceStocksFirebaseApp);
        geceStocksFirebaseApp = null;
      }
    } catch (e) {
      // App zaten silinmiş
    }

    // Değişkenleri sıfırla
    firestore = null;
    storage = null;
    tablesFirestore = null;
    geceStocksFirestore = null;
    
    console.log('✅ Mevcut Firebase\'ler temizlendi');
  } catch (error) {
    console.error('Firebase temizleme hatası:', error);
  }
}

// Müşteri menüsü siparişlerini (internet üzerinden) Firestore'dan dinle
// Not: Bu özellik Lacrimosa Coffee (TENANT-1769956051654) için açıldı.
const LACRIMOSA_TENANT_ID = 'TENANT-1769956051654';
let isCustomerOrdersListenerInitialized = false;
const processingCustomerOrderIds = new Set();
let customerOrdersQueue = Promise.resolve();

function setupCustomerOrdersRealtimeListener() {
  if (!firestore || !firebaseCollection || !firebaseOnSnapshot || !firebaseDoc || !firebaseUpdateDoc) {
    console.warn('⚠️ Firebase başlatılamadı, müşteri sipariş listener kurulamadı');
    return null;
  }

  const tenantInfo = tenantManager.getCurrentTenantInfo();
  if (!tenantInfo || tenantInfo.tenantId !== LACRIMOSA_TENANT_ID) {
    // Diğer tenant'larda dinleme kapalı
    if (customerOrdersListenerCleanup) {
      customerOrdersListenerCleanup();
      customerOrdersListenerCleanup = null;
    }
    return null;
  }

  try {
    console.log('👂 Müşteri siparişleri için listener başlatılıyor (customerOrders)...');

    const ref = firebaseCollection(firestore, 'customerOrders');
    const q =
      (firebaseQuery && firebaseWhere)
        ? firebaseQuery(ref, firebaseWhere('status', '==', 'pending'))
        : ref;

    const unsubscribe = firebaseOnSnapshot(q, (snapshot) => {
      const isInitialLoad = !isCustomerOrdersListenerInitialized;
      if (isInitialLoad) {
        isCustomerOrdersListenerInitialized = true;
        console.log('📥 customerOrders ilk yükleme (pending siparişler varsa işlenecek)');
      }

      const changes = snapshot.docChanges();
      if (!changes || changes.length === 0) return;

      changes.forEach((change) => {
        if (change.type !== 'added' && change.type !== 'modified') return;
        const docSnap = change.doc;
        customerOrdersQueue = customerOrdersQueue
          .then(() => processCustomerOrderDoc(docSnap))
          .catch((e) => console.error('customerOrders queue hatası:', e));
      });
    }, (error) => {
      console.error('❌ customerOrders listener hatası:', error);
    });

    customerOrdersListenerCleanup = unsubscribe;
    console.log('✅ customerOrders listener aktif');
    return unsubscribe;
  } catch (e) {
    console.error('❌ customerOrders listener kurulum hatası:', e);
    return null;
  }
}

async function processCustomerOrderDoc(docSnap) {
  try {
    const docId = docSnap.id;
    if (!docId || processingCustomerOrderIds.has(docId)) return;

    const data = docSnap.data() || {};
    if ((data.status || '') !== 'pending') return;

    const tenantInfo = tenantManager.getCurrentTenantInfo();
    if (!tenantInfo || tenantInfo.tenantId !== LACRIMOSA_TENANT_ID) return;
    if (data.tenantId && data.tenantId !== tenantInfo.tenantId) return;

    processingCustomerOrderIds.add(docId);
    const docRef = firebaseDoc(firestore, 'customerOrders', docId);

    // Önce "processing" olarak işaretle (transaction ile tek cihazın sahiplenmesini sağlar)
    let claimed = false;
    if (firebaseRunTransaction) {
      claimed = await firebaseRunTransaction(firestore, async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists()) return false;
        const cur = snap.data() || {};
        if ((cur.status || '') !== 'pending') return false;
        tx.update(docRef, {
          status: 'processing',
          processingAt: firebaseServerTimestamp ? firebaseServerTimestamp() : new Date().toISOString(),
          processor: 'desktop',
        });
        return true;
      });
    } else {
      await firebaseUpdateDoc(docRef, {
        status: 'processing',
        processingAt: firebaseServerTimestamp ? firebaseServerTimestamp() : new Date().toISOString(),
        processor: 'desktop',
      });
      claimed = true;
    }
    if (!claimed) {
      processingCustomerOrderIds.delete(docId);
      return;
    }

    const tableId = String(data.tableId || data.table_id || '').trim();
    const tableName = String(data.tableName || data.table_name || '').trim();
    const tableType = String(data.tableType || data.table_type || '').trim();
    const items = Array.isArray(data.items) ? data.items : [];
    const orderNote = data.orderNote || data.order_note || null;
    const totalAmount = Number(data.totalAmount || data.total_amount || 0);

    if (!tableId || !tableType || items.length === 0) {
      throw new Error('Eksik sipariş verisi (masa/ürünler).');
    }

    // Mevcut /api/orders akışını kullan (stok, DB, yazdırma, syncSingleTableToFirebase)
    if (!apiServer) {
      throw new Error('API Server başlatılmadı (sipariş işlenemedi).');
    }

    const resp = await fetch(`http://127.0.0.1:${serverPort}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        totalAmount,
        tableId,
        tableName: tableName || tableId,
        tableType,
        orderNote,
        staffId: null,
        orderSource: 'Müşteri',
      }),
    });

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result.success) {
      throw new Error(result.error || `Sipariş işlenemedi (HTTP ${resp.status})`);
    }

    await firebaseUpdateDoc(docRef, {
      status: 'processed',
      processedAt: firebaseServerTimestamp ? firebaseServerTimestamp() : new Date().toISOString(),
      localOrderId: result.orderId || null,
      isNewOrder: result.isNewOrder === true,
    });

    // Masaüstünde müşteri siparişi sesi (renderer tarafında çalınacak)
    try {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('customer-order-received', {
          tableId,
          tableName: tableName || tableId,
          tableType,
          orderId: result.orderId || null,
          hasNote: !!orderNote,
        });
      }
    } catch {}

    console.log(`✅ Müşteri siparişi işlendi: ${docId} -> orderId=${result.orderId}`);
  } catch (e) {
    console.error('❌ Müşteri siparişi işleme hatası:', e);
    try {
      const docRef = firebaseDoc(firestore, 'customerOrders', docSnap.id);
      await firebaseUpdateDoc(docRef, {
        status: 'error',
        error: String(e?.message || e),
        errorAt: firebaseServerTimestamp ? firebaseServerTimestamp() : new Date().toISOString(),
      });
    } catch {}
  }
}

// Saat formatı helper fonksiyonu (saat:dakika:saniye)
function getFormattedTime(date = new Date()) {
  return date.toLocaleTimeString('tr-TR', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

// Gece 03:00'a göre günlük tarih hesaplama fonksiyonu
// Gece 03:00'tan önceki saatler bir önceki güne ait sayılır
function getBusinessDayDateString(date = new Date()) {
  const hour = date.getHours();
  // Eğer saat 03:00'tan önceyse, bir önceki günü döndür
  if (hour < 3) {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toLocaleDateString('tr-TR');
  }
  return date.toLocaleDateString('tr-TR');
}

// ——— Gece Dönercisi: Şube stokları helpers ———
function normalizeTrText(input) {
  try {
    return String(input || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) {
    return String(input || '').toLowerCase().trim();
  }
}

function isAllowedGeceStockCategoryName(categoryName) {
  const norm = normalizeTrText(categoryName);
  return norm === 'icecekler' || norm === 'yan urunler';
}

function shouldAffectGeceBranchStock(productId) {
  const product = db.products.find((p) => String(p.id) === String(productId));
  if (!product) return false;
  const category = db.categories.find((c) => String(c.id) === String(product.category_id));
  const categoryName = category?.name || '';
  return isAllowedGeceStockCategoryName(categoryName);
}

function isValidGeceBranch(branch) {
  return branch === 'SANCAK' || branch === 'SEKER';
}

async function decreaseGeceBranchStockItems({ branch, deviceId, items, source }) {
  if (!geceStocksFirestore || !firebaseRunTransaction || !firebaseDoc || !firebaseServerTimestamp || !firebaseCollection || !firebaseAddDoc) {
    return;
  }
  if (!isValidGeceBranch(branch)) return;
  const safeDeviceId = deviceId ? String(deviceId) : null;

  const relevant = (items || [])
    .filter((it) => it && !it.isGift && !it.isExpense)
    .map((it) => ({
      productId: String(it.id),
      qty: Math.max(0, Number(it.quantity || 0)),
      name: it.name || null,
    }))
    .filter((it) => it.qty > 0)
    .filter((it) => shouldAffectGeceBranchStock(it.productId));

  for (const it of relevant) {
    const docId = `${branch}_${it.productId}`;
    const ref = firebaseDoc(geceStocksFirestore, 'branchStocks', docId);

    try {
      const res = await firebaseRunTransaction(geceStocksFirestore, async (tx) => {
        const snap = await tx.get(ref);
        const before = snap.exists() ? Number((snap.data() || {}).stock || 0) : 0;
        const after = before - it.qty;
        tx.set(
          ref,
          {
            tenantId: GECE_TENANT_ID,
            branch,
            productId: it.productId,
            stock: after,
            updatedAt: firebaseServerTimestamp(),
            updatedByDeviceId: safeDeviceId,
          },
          { merge: true }
        );
        return { before, after };
      });

      // Hareket kaydı (opsiyonel)
      try {
        const movesRef = firebaseCollection(geceStocksFirestore, 'branchStockMoves');
        await firebaseAddDoc(movesRef, {
          tenantId: GECE_TENANT_ID,
          branch,
          productId: it.productId,
          productName: it.name,
          delta: -it.qty,
          before: res.before,
          after: res.after,
          deviceId: safeDeviceId,
          source: source || null,
          createdAt: firebaseServerTimestamp(),
        });
      } catch (e) {
        // history zorunlu değil
      }
    } catch (e) {
      // Satışı engelleme: sadece logla
      console.warn('Gece şube stok düşme hatası:', e?.message || e);
    }
  }
}

async function increaseGeceBranchStockItems({ branch, deviceId, items, source }) {
  if (!geceStocksFirestore || !firebaseRunTransaction || !firebaseDoc || !firebaseServerTimestamp || !firebaseCollection || !firebaseAddDoc) {
    return;
  }
  if (!isValidGeceBranch(branch)) return;
  const safeDeviceId = deviceId ? String(deviceId) : null;

  const relevant = (items || [])
    .filter((it) => it && !it.isGift && !it.isExpense)
    .map((it) => ({
      productId: String(it.id),
      qty: Math.max(0, Number(it.quantity || 0)),
      name: it.name || null,
    }))
    .filter((it) => it.qty > 0)
    .filter((it) => shouldAffectGeceBranchStock(it.productId));

  for (const it of relevant) {
    const docId = `${branch}_${it.productId}`;
    const ref = firebaseDoc(geceStocksFirestore, 'branchStocks', docId);

    try {
      const res = await firebaseRunTransaction(geceStocksFirestore, async (tx) => {
        const snap = await tx.get(ref);
        const before = snap.exists() ? Number((snap.data() || {}).stock || 0) : 0;
        const after = before + it.qty;
        tx.set(
          ref,
          {
            tenantId: GECE_TENANT_ID,
            branch,
            productId: it.productId,
            stock: after,
            updatedAt: firebaseServerTimestamp(),
            updatedByDeviceId: safeDeviceId,
          },
          { merge: true }
        );
        return { before, after };
      });

      // Hareket kaydı (opsiyonel)
      try {
        const movesRef = firebaseCollection(geceStocksFirestore, 'branchStockMoves');
        await firebaseAddDoc(movesRef, {
          tenantId: GECE_TENANT_ID,
          branch,
          productId: it.productId,
          productName: it.name,
          delta: it.qty,
          before: res.before,
          after: res.after,
          deviceId: safeDeviceId,
          source: source || null,
          createdAt: firebaseServerTimestamp(),
        });
      } catch (e) {
        // history zorunlu değil
      }
    } catch (e) {
      console.warn('Gece şube stok iade hatası:', e?.message || e);
    }
  }
}
let db = {
  categories: [],
  products: [],
  sales: [],
  saleItems: [],
  tableOrders: [],
  tableOrderItems: [],
  settings: {
    adminPin: '1234',
    cashierPrinter: null, // { printerName, printerType } - Kasa yazıcısı ayarı
    geceBranch: null, // Gece Dönercisi: 'SANCAK' | 'SEKER'
    geceDeviceId: null // Gece Dönercisi: cihaz id (renderer üretir)
  },
  printerAssignments: [] // { printerName, printerType, category_id }
};

// Gece Dönercisi: main process içinde aktif şube seçimi (mobil isteklerde de kullanılır)
let geceBranchSelection = { branch: null, deviceId: null };

// Gece Dönercisi: Firebase satış kayıtlarına daima #Sancak veya #Şeker olarak yazılacak şube etiketi
function getGeceBranchLabelForFirebase() {
  const b = geceBranchSelection?.branch || db.settings?.geceBranch;
  if (b === 'SANCAK') return '#Sancak';
  if (b === 'SEKER') return '#Şeker';
  return null;
}

function initDatabase(tenantId = null) {
  // Tenant'a göre database path'i oluştur
  const tenantSuffix = tenantId ? `-${tenantId}` : '';
  dbPath = path.join(app.getPath('userData'), `makara-db${tenantSuffix}.json`);
  
  // Veritabanını yükle veya yeni oluştur
  if (fs.existsSync(dbPath)) {
    try {
      const data = fs.readFileSync(dbPath, 'utf8');
      db = JSON.parse(data);
      
      // Eğer settings objesi yoksa ekle
      if (!db.settings) {
        db.settings = { adminPin: '1234', cashierPrinter: null, geceBranch: null, geceDeviceId: null };
        saveDatabase();
      }
      // cashierPrinter yoksa ekle
      if (db.settings && db.settings.cashierPrinter === undefined) {
        db.settings.cashierPrinter = null;
        saveDatabase();
      }

      // Gece şube alanları yoksa ekle
      if (db.settings && db.settings.geceBranch === undefined) {
        db.settings.geceBranch = null;
        saveDatabase();
      }
      if (db.settings && db.settings.geceDeviceId === undefined) {
        db.settings.geceDeviceId = null;
        saveDatabase();
      }

      // Aktif şube seçimini DB'den yükle (mobil siparişler için)
      geceBranchSelection = {
        branch: db.settings?.geceBranch || null,
        deviceId: db.settings?.geceDeviceId || null,
      };
      
      // Eksik diğer alanları kontrol et
      if (!db.categories) db.categories = [];
      if (!db.products) db.products = [];
      if (!db.sales) db.sales = [];
      if (!db.saleItems) db.saleItems = [];
      if (!db.tableOrders) db.tableOrders = [];
      if (!db.tableOrderItems) db.tableOrderItems = [];
      if (!db.printerAssignments) db.printerAssignments = [];
    } catch (error) {
      console.error('Veritabanı yüklenemedi, yeni oluşturuluyor:', error);
      initEmptyData();
    }
  } else {
    // Yeni tenant için temiz database oluştur (örnek veriler olmadan)
    initEmptyData();
  }
}

// Temiz database oluştur (örnek veriler olmadan)
function initEmptyData() {
  db.categories = [];
  db.products = [];
  db.sales = [];
  db.saleItems = [];
  db.tableOrders = [];
  db.tableOrderItems = [];
  db.printerAssignments = [];
  db.settings = {
    adminPin: '1234',
    cashierPrinter: null,
    geceBranch: null,
    geceDeviceId: null
  };
  
  saveDatabase();
}

// Örnek verilerle database oluştur (eski fonksiyon, geriye dönük uyumluluk için)
function initDefaultData() {
  // Örnek kategoriler
  db.categories = [
    { id: 1, name: 'Kruvasan Çeşitleri', order_index: 0 },
    { id: 2, name: 'Prag Tatlısı', order_index: 1 },
    { id: 3, name: 'Paris Tatlıları', order_index: 2 },
    { id: 4, name: 'Kahvaltılar', order_index: 3 },
    { id: 5, name: 'Sıcak İçecekler', order_index: 4 },
    { id: 6, name: 'Soğuk İçecekler', order_index: 5 }
  ];

  // Örnek ürünler
  db.products = [
    // Kruvasan Çeşitleri
    { id: 1, name: 'Sade Kruvasan', category_id: 1, price: 35.00 },
    { id: 2, name: 'Çikolatalı Kruvasan', category_id: 1, price: 40.00 },
    { id: 3, name: 'Peynirli Kruvasan', category_id: 1, price: 45.00 },
    { id: 4, name: 'Kaymaklı Kruvasan', category_id: 1, price: 42.00 },
    
    // Prag Tatlısı
    { id: 5, name: 'Klasik Prag', category_id: 2, price: 55.00 },
    { id: 6, name: 'Çilekli Prag', category_id: 2, price: 60.00 },
    { id: 7, name: 'Frambuazlı Prag', category_id: 2, price: 60.00 },
    
    // Paris Tatlıları
    { id: 8, name: 'Ekler', category_id: 3, price: 38.00 },
    { id: 9, name: 'Macaron', category_id: 3, price: 25.00 },
    { id: 10, name: 'Millefeuille', category_id: 3, price: 65.00 },
    
    // Kahvaltılar
    { id: 11, name: 'Serpme Kahvaltı', category_id: 4, price: 180.00 },
    { id: 12, name: 'Kahvaltı Tabağı', category_id: 4, price: 120.00 },
    { id: 13, name: 'Menemen', category_id: 4, price: 75.00 },
    
    // Sıcak İçecekler
    { id: 14, name: 'Türk Kahvesi', category_id: 5, price: 30.00 },
    { id: 15, name: 'Filtre Kahve', category_id: 5, price: 35.00 },
    { id: 16, name: 'Cappuccino', category_id: 5, price: 45.00 },
    { id: 17, name: 'Latte', category_id: 5, price: 45.00 },
    { id: 18, name: 'Çay', category_id: 5, price: 15.00 },
    
    // Soğuk İçecekler
    { id: 19, name: 'Ice Latte', category_id: 6, price: 50.00 },
    { id: 20, name: 'Limonata', category_id: 6, price: 35.00 },
    { id: 21, name: 'Soda', category_id: 6, price: 20.00 },
    { id: 22, name: 'Ayran', category_id: 6, price: 15.00 }
  ];

  db.sales = [];
  db.saleItems = [];
  db.tableOrders = [];
  db.tableOrderItems = [];
  db.printerAssignments = [];
  db.settings = {
    adminPin: '1234',
    cashierPrinter: null
  };
  
  saveDatabase();
}

function saveDatabase() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error('Veritabanı kaydedilemedi:', error);
  }
}

// Firebase'e kategori kaydetme fonksiyonu
async function saveCategoryToFirebase(category) {
  if (!firestore || !firebaseCollection || !firebaseDoc || !firebaseSetDoc) {
    return;
  }
  
  try {
    const categoryRef = firebaseDoc(firestore, 'categories', category.id.toString());
    await firebaseSetDoc(categoryRef, {
      id: category.id,
      name: category.name,
      order_index: category.order_index || 0
    }, { merge: true });
    console.log(`✅ Kategori Firebase'e kaydedildi: ${category.name} (ID: ${category.id})`);
  } catch (error) {
    console.error(`❌ Kategori Firebase'e kaydedilemedi (${category.name}):`, error);
  }
}

// Firebase'e ürün kaydetme fonksiyonu
async function saveProductToFirebase(product) {
  if (!firestore || !firebaseCollection || !firebaseDoc || !firebaseSetDoc) {
    return;
  }
  
  try {
    const productRef = firebaseDoc(firestore, 'products', product.id.toString());
    await firebaseSetDoc(productRef, {
      id: product.id,
      name: product.name,
      category_id: product.category_id,
      price: parseFloat(product.price) || 0,
      image: product.image || null,
      unit: product.unit || null,
      yemeksepeti_price: product.yemeksepeti_price !== undefined ? parseFloat(product.yemeksepeti_price) : null,
      trendyolgo_price: product.trendyolgo_price !== undefined ? parseFloat(product.trendyolgo_price) : null
    }, { merge: true });
    console.log(`✅ Ürün Firebase'e kaydedildi: ${product.name} (ID: ${product.id}, Fiyat: ${parseFloat(product.price) || 0})`);
  } catch (error) {
    console.error(`❌ Ürün Firebase'e kaydedilemedi (${product.name}):`, error);
  }
}

// Firebase'e (makaramasalar) ürün stok bilgisini kaydetme fonksiyonu
async function saveProductStockToFirebase(productId, stock) {
  if (!tablesFirestore || !tablesFirebaseDoc || !tablesFirebaseSetDoc) {
    return;
  }
  
  try {
    const stockRef = tablesFirebaseDoc(tablesFirestore, 'product_stocks', productId.toString());
    await tablesFirebaseSetDoc(stockRef, {
      product_id: productId,
      stock: stock || 0,
      updated_at: new Date().toISOString()
    }, { merge: true });
    console.log(`✅ Ürün stoku Firebase'e kaydedildi: Product ID: ${productId}, Stok: ${stock || 0}`);
  } catch (error) {
    console.error(`❌ Ürün stoku Firebase'e kaydedilemedi (Product ID: ${productId}):`, error);
  }
}

// Firebase'den (makaramasalar) ürün stok bilgisini çekme fonksiyonu
async function getProductStockFromFirebase(productId) {
  if (!tablesFirestore || !tablesFirebaseDoc) {
    return null;
  }
  
  try {
    const firebaseFirestoreModule = require('firebase/firestore');
    const firebaseGetDoc = firebaseFirestoreModule.getDoc;
    
    const stockRef = tablesFirebaseDoc(tablesFirestore, 'product_stocks', productId.toString());
    const stockDoc = await firebaseGetDoc(stockRef);
    
    if (stockDoc.exists()) {
      const data = stockDoc.data();
      return data.stock || 0;
    }
    return null;
  } catch (error) {
    console.error(`❌ Ürün stoku Firebase'den çekilemedi (Product ID: ${productId}):`, error);
    return null;
  }
}

// Ürün stokunu düşürme fonksiyonu
async function decreaseProductStock(productId, quantity) {
  const productIdNum = typeof productId === 'string' ? parseInt(productId) : productId;
  
  const productIndex = db.products.findIndex(p => p.id === productIdNum);
  if (productIndex === -1) {
    console.warn(`⚠️ Ürün bulunamadı (stok düşürme): Product ID: ${productIdNum}`);
    return false;
  }
  
  const product = db.products[productIndex];
  
  // Stok takibi yapılmıyorsa, stok düşürme işlemi yapma
  if (!product.trackStock) {
    console.log(`ℹ️ Stok takibi yapılmayan ürün: ${product.name} - Stok düşürülmedi`);
    return true; // Hata değil, sadece stok takibi yapılmıyor
  }
  
  // Stok bilgisini al (local veya Firebase'den)
  let currentStock = product.stock !== undefined ? (product.stock || 0) : null;
  if (currentStock === null) {
    currentStock = await getProductStockFromFirebase(productIdNum);
    if (currentStock === null) {
      currentStock = 0;
    }
  }
  
  // Stok yeterli mi kontrol et
  if (currentStock < quantity) {
    console.warn(`⚠️ Yetersiz stok: ${product.name} (Mevcut: ${currentStock}, İstenen: ${quantity})`);
    return false;
  }
  
  // Stoku düşür
  const newStock = Math.max(0, currentStock - quantity);
  
  // Local database'i güncelle
  db.products[productIndex] = {
    ...product,
    stock: newStock
  };
  
  saveDatabase();
  
  // Firebase'e kaydet
  await saveProductStockToFirebase(productIdNum, newStock);
  
  console.log(`✅ Stok düşürüldü: ${product.name} (${currentStock} → ${newStock}, -${quantity})`);
  
  // Mobil personel arayüzüne gerçek zamanlı stok güncellemesi gönder
  if (io) {
    io.emit('product-stock-update', {
      productId: productIdNum,
      stock: newStock,
      trackStock: product.trackStock
    });
  }
  
  return true;
}

// Ürün stokunu artırma fonksiyonu (iptal durumunda)
async function increaseProductStock(productId, quantity) {
  const productIdNum = typeof productId === 'string' ? parseInt(productId) : productId;
  
  const productIndex = db.products.findIndex(p => p.id === productIdNum);
  if (productIndex === -1) {
    console.warn(`⚠️ Ürün bulunamadı (stok artırma): Product ID: ${productIdNum}`);
    return false;
  }
  
  const product = db.products[productIndex];
  
  // Stok takibi yapılmıyorsa, stok artırma işlemi yapma
  if (!product.trackStock) {
    console.log(`ℹ️ Stok takibi yapılmayan ürün: ${product.name} - Stok artırılmadı`);
    return true; // Hata değil, sadece stok takibi yapılmıyor
  }
  
  // Stok bilgisini al (local veya Firebase'den)
  let currentStock = product.stock !== undefined ? (product.stock || 0) : 0;
  if (currentStock === 0 && product.stock === undefined) {
    const firebaseStock = await getProductStockFromFirebase(productIdNum);
    if (firebaseStock !== null) {
      currentStock = firebaseStock;
    }
  }
  
  // Stoku artır
  const newStock = currentStock + quantity;
  
  // Local database'i güncelle
  db.products[productIndex] = {
    ...product,
    stock: newStock
  };
  
  saveDatabase();
  
  // Firebase'e kaydet
  await saveProductStockToFirebase(productIdNum, newStock);
  
  console.log(`✅ Stok artırıldı: ${product.name} (${currentStock} → ${newStock}, +${quantity})`);
  
  // Mobil personel arayüzüne gerçek zamanlı stok güncellemesi gönder
  if (io) {
    io.emit('product-stock-update', {
      productId: productIdNum,
      stock: newStock,
      trackStock: product.trackStock
    });
  }
  
  return true;
}

// Local path'leri Firebase Storage'a yükleme (migration)
async function migrateLocalImagesToFirebase() {
  if (!storage || !storageRef || !storageUploadBytes || !storageGetDownloadURL) {
    console.warn('⚠️ Firebase Storage başlatılamadı, görsel migration yapılamadı');
    return;
  }

  try {
    console.log('🔄 Local görseller Firebase Storage\'a yükleniyor...');
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const product of db.products) {
      // Eğer görsel yoksa veya zaten Firebase Storage URL'si ise atla
      if (!product.image) {
        skippedCount++;
        continue;
      }

      // Firebase Storage veya R2 URL kontrolü
      if (product.image.includes('firebasestorage.googleapis.com') || 
          product.image.includes('r2.cloudflarestorage.com') || 
          product.image.includes('r2.dev')) {
        skippedCount++;
        continue;
      }

      // Local path kontrolü (örn: /image.jpg veya C:\... veya relative path)
      let imagePath = product.image;
      
      // Eğer absolute path değilse (relative path), public klasöründen al
      // Windows: C:\ veya \\ ile başlıyorsa absolute
      // Unix: / ile başlıyorsa absolute
      const isAbsolutePath = path.isAbsolute(imagePath) || 
                            imagePath.startsWith('http://') || 
                            imagePath.startsWith('https://');
      
      if (!isAbsolutePath) {
        // Relative path ise public klasöründen al
        if (imagePath.startsWith('/')) {
          const publicDir = path.join(__dirname, '../public');
          imagePath = path.join(publicDir, imagePath.substring(1));
        } else {
          // Sadece dosya adı ise
          const publicDir = path.join(__dirname, '../public');
          imagePath = path.join(publicDir, imagePath);
        }
      }

      // Dosya var mı kontrol et
      if (!fs.existsSync(imagePath)) {
        console.warn(`⚠️ Görsel bulunamadı: ${imagePath} (Ürün: ${product.name})`);
        // Görseli temizle
        product.image = null;
        errorCount++;
        continue;
      }

      try {
        // Firebase Storage'a yükle
        const downloadURL = await uploadImageToR2(imagePath, product.id);
        
        // Ürünü güncelle
        product.image = downloadURL;
        migratedCount++;
        console.log(`✅ Görsel yüklendi: ${product.name} -> ${downloadURL}`);
      } catch (uploadError) {
        console.error(`❌ Görsel yüklenemedi (${product.name}):`, uploadError);
        errorCount++;
        // Hata olsa bile devam et
      }
    }

    // Veritabanını kaydet
    if (migratedCount > 0) {
      saveDatabase();
      
      // Firebase'e de güncelle
      for (const product of db.products) {
        if (product.image && (product.image.includes('firebasestorage.googleapis.com') || product.image.includes('r2.cloudflarestorage.com') || product.image.includes('r2.dev'))) {
          await saveProductToFirebase(product);
        }
      }
    }

    console.log(`✅ Görsel migration tamamlandı: ${migratedCount} yüklendi, ${skippedCount} atlandı, ${errorCount} hata`);
  } catch (error) {
    console.error('❌ Görsel migration hatası:', error);
  }
}

// NOT: syncCategoriesToFirebase ve syncProductsToFirebase fonksiyonları kaldırıldı
// Artık sadece yeni ekleme/güncelleme/silme işlemlerinde Firebase'e yazma yapılıyor
// Bu sayede gereksiz read/write maliyetleri önleniyor

// Firebase'den kategorileri çek ve local database'e senkronize et
async function syncCategoriesFromFirebase() {
  if (!firestore || !firebaseCollection || !firebaseGetDocs) {
    console.warn('⚠️ Firebase başlatılamadı, kategoriler çekilemedi');
    return;
  }
  
  try {
    console.log('📥 Firebase\'den kategoriler çekiliyor...');
    const categoriesRef = firebaseCollection(firestore, 'categories');
    const snapshot = await firebaseGetDocs(categoriesRef);
    
    let addedCount = 0;
    let updatedCount = 0;
    
    snapshot.forEach((doc) => {
      const firebaseCategory = doc.data();
      const categoryId = typeof firebaseCategory.id === 'string' ? parseInt(firebaseCategory.id) : firebaseCategory.id;
      
      // Local database'de bu kategori var mı kontrol et
      const existingCategoryIndex = db.categories.findIndex(c => c.id === categoryId);
      
      if (existingCategoryIndex !== -1) {
        // Kategori mevcut, güncelle
        db.categories[existingCategoryIndex] = {
          id: categoryId,
          name: firebaseCategory.name || '',
          order_index: firebaseCategory.order_index || 0
        };
        updatedCount++;
      } else {
        // Yeni kategori, ekle
        db.categories.push({
          id: categoryId,
          name: firebaseCategory.name || '',
          order_index: firebaseCategory.order_index || 0
        });
        addedCount++;
      }
    });
    
    // ID'leri sırala ve order_index'e göre sırala
    db.categories.sort((a, b) => {
      if (a.order_index !== b.order_index) {
        return a.order_index - b.order_index;
      }
      return a.id - b.id;
    });
    
    saveDatabase();
    console.log(`✅ Firebase'den ${snapshot.size} kategori çekildi (${addedCount} yeni, ${updatedCount} güncellendi)`);
  } catch (error) {
    console.error('❌ Firebase\'den kategori çekme hatası:', error);
  }
}

// Firebase'den ürünleri çek ve local database'e senkronize et
async function syncProductsFromFirebase() {
  if (!firestore || !firebaseCollection || !firebaseGetDocs) {
    console.warn('⚠️ Firebase başlatılamadı, ürünler çekilemedi');
    return;
  }
  
  try {
    console.log('📥 Firebase\'den ürünler çekiliyor...');
    const productsRef = firebaseCollection(firestore, 'products');
    const snapshot = await firebaseGetDocs(productsRef);
    
    let addedCount = 0;
    let updatedCount = 0;
    
    snapshot.forEach((doc) => {
      const firebaseProduct = doc.data();
      const productId = typeof firebaseProduct.id === 'string' ? parseInt(firebaseProduct.id) : firebaseProduct.id;
      
      // Local database'de bu ürün var mı kontrol et
      const existingProductIndex = db.products.findIndex(p => p.id === productId);
      
      if (existingProductIndex !== -1) {
        // Ürün mevcut, güncelle
        db.products[existingProductIndex] = {
          id: productId,
          name: firebaseProduct.name || '',
          category_id: typeof firebaseProduct.category_id === 'string' ? parseInt(firebaseProduct.category_id) : firebaseProduct.category_id,
          price: parseFloat(firebaseProduct.price) || 0,
          image: firebaseProduct.image || null,
          unit: firebaseProduct.unit || null,
          yemeksepeti_price: firebaseProduct.yemeksepeti_price !== undefined && firebaseProduct.yemeksepeti_price !== null ? parseFloat(firebaseProduct.yemeksepeti_price) : undefined,
          trendyolgo_price: firebaseProduct.trendyolgo_price !== undefined && firebaseProduct.trendyolgo_price !== null ? parseFloat(firebaseProduct.trendyolgo_price) : undefined
        };
        updatedCount++;
      } else {
        // Yeni ürün, ekle
        db.products.push({
          id: productId,
          name: firebaseProduct.name || '',
          category_id: typeof firebaseProduct.category_id === 'string' ? parseInt(firebaseProduct.category_id) : firebaseProduct.category_id,
          price: parseFloat(firebaseProduct.price) || 0,
          image: firebaseProduct.image || null,
          unit: firebaseProduct.unit || null,
          yemeksepeti_price: firebaseProduct.yemeksepeti_price !== undefined && firebaseProduct.yemeksepeti_price !== null ? parseFloat(firebaseProduct.yemeksepeti_price) : undefined,
          trendyolgo_price: firebaseProduct.trendyolgo_price !== undefined && firebaseProduct.trendyolgo_price !== null ? parseFloat(firebaseProduct.trendyolgo_price) : undefined
        });
        addedCount++;
      }
    });
    
    saveDatabase();
    console.log(`✅ Firebase'den ${snapshot.size} ürün çekildi (${addedCount} yeni, ${updatedCount} güncellendi)`);
  } catch (error) {
    console.error('❌ Firebase\'den ürün çekme hatası:', error);
  }
}

// Firebase'den gerçek zamanlı kategori dinleme
let isCategoriesListenerInitialized = false;
function setupCategoriesRealtimeListener() {
  if (!firestore || !firebaseCollection || !firebaseOnSnapshot) {
    console.warn('⚠️ Firebase başlatılamadı, kategori listener kurulamadı');
    return null;
  }
  
  try {
    console.log('👂 Kategoriler için gerçek zamanlı listener başlatılıyor...');
    const categoriesRef = firebaseCollection(firestore, 'categories');
    
    const unsubscribe = firebaseOnSnapshot(categoriesRef, (snapshot) => {
      // İlk yüklemede tüm dokümanlar "added" olarak gelir - bunları sessizce işle
      const isInitialLoad = !isCategoriesListenerInitialized;
      if (isInitialLoad) {
        isCategoriesListenerInitialized = true;
        console.log('📥 İlk kategori yüklemesi tamamlandı (sessiz mod)');
        // İlk yüklemede sadece renderer'a bildir, her kategori için log yazma
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('categories-updated', db.categories);
        }
        return;
      }
      
      // Sadece gerçek değişiklikler için log yaz
      const changes = snapshot.docChanges();
      if (changes.length === 0) return;
      
      let hasChanges = false;
      changes.forEach((change) => {
        const firebaseCategory = change.doc.data();
        const categoryId = typeof firebaseCategory.id === 'string' ? parseInt(firebaseCategory.id) : firebaseCategory.id;
        
        if (change.type === 'added' || change.type === 'modified') {
          // Kategori eklendi veya güncellendi
          const existingCategoryIndex = db.categories.findIndex(c => c.id === categoryId);
          
          const categoryData = {
            id: categoryId,
            name: firebaseCategory.name || '',
            order_index: firebaseCategory.order_index || 0
          };
          
          if (existingCategoryIndex !== -1) {
            // Güncelle - sadece gerçekten değiştiyse
            const oldCategory = db.categories[existingCategoryIndex];
            const hasRealChange = oldCategory.name !== categoryData.name || 
                                 oldCategory.order_index !== categoryData.order_index;
            
            if (hasRealChange) {
              db.categories[existingCategoryIndex] = categoryData;
              console.log(`🔄 Kategori güncellendi: ${categoryData.name} (ID: ${categoryId})`);
              hasChanges = true;
            }
          } else {
            // Yeni ekle
            db.categories.push(categoryData);
            console.log(`➕ Yeni kategori eklendi: ${categoryData.name} (ID: ${categoryId})`);
            hasChanges = true;
          }
        } else if (change.type === 'removed') {
          // Kategori silindi
          const categoryIndex = db.categories.findIndex(c => c.id === categoryId);
          if (categoryIndex !== -1) {
            const deletedCategory = db.categories[categoryIndex];
            db.categories.splice(categoryIndex, 1);
            console.log(`🗑️ Kategori silindi: ${deletedCategory.name} (ID: ${categoryId})`);
            hasChanges = true;
          }
        }
      });
      
      // Sadece gerçek değişiklik varsa database'e yaz ve sırala
      if (hasChanges) {
        // ID'leri sırala ve order_index'e göre sırala
        db.categories.sort((a, b) => {
          if (a.order_index !== b.order_index) {
            return a.order_index - b.order_index;
          }
          return a.id - b.id;
        });
        
        saveDatabase();
        
        // Renderer process'e bildir
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('categories-updated', db.categories);
        }
      }
    }, (error) => {
      console.error('❌ Kategori listener hatası:', error);
    });
    
    console.log('✅ Kategoriler için gerçek zamanlı listener aktif (optimize edilmiş)');
    return unsubscribe;
  } catch (error) {
    console.error('❌ Kategori listener kurulum hatası:', error);
    return null;
  }
}

// Firebase'den gerçek zamanlı ürün dinleme
let isProductsListenerInitialized = false;
function setupProductsRealtimeListener() {
  if (!firestore || !firebaseCollection || !firebaseOnSnapshot) {
    console.warn('⚠️ Firebase başlatılamadı, ürün listener kurulamadı');
    return null;
  }
  
  try {
    console.log('👂 Ürünler için gerçek zamanlı listener başlatılıyor...');
    const productsRef = firebaseCollection(firestore, 'products');
    
    const unsubscribe = firebaseOnSnapshot(productsRef, (snapshot) => {
      // İlk yüklemede tüm dokümanlar "added" olarak gelir - bunları sessizce işle
      const isInitialLoad = !isProductsListenerInitialized;
      if (isInitialLoad) {
        isProductsListenerInitialized = true;
        console.log('📥 İlk ürün yüklemesi tamamlandı (sessiz mod)');
        // İlk yüklemede sadece renderer'a bildir, her ürün için log yazma
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('products-updated', db.products);
        }
        return;
      }
      
      // Sadece gerçek değişiklikler için log yaz
      const changes = snapshot.docChanges();
      if (changes.length === 0) return;
      
      let hasChanges = false;
      changes.forEach((change) => {
        const firebaseProduct = change.doc.data();
        const productId = typeof firebaseProduct.id === 'string' ? parseInt(firebaseProduct.id) : firebaseProduct.id;
        
        if (change.type === 'added' || change.type === 'modified') {
          // Ürün eklendi veya güncellendi
          const existingProductIndex = db.products.findIndex(p => p.id === productId);
          
          const productData = {
            id: productId,
            name: firebaseProduct.name || '',
            category_id: typeof firebaseProduct.category_id === 'string' ? parseInt(firebaseProduct.category_id) : firebaseProduct.category_id,
            price: parseFloat(firebaseProduct.price) || 0,
            image: firebaseProduct.image || null,
            unit: firebaseProduct.unit || null,
          };
          
          if (existingProductIndex !== -1) {
            // Güncelle - sadece gerçekten değiştiyse
            const oldProduct = db.products[existingProductIndex];
            const hasRealChange = oldProduct.name !== productData.name || 
                                 oldProduct.category_id !== productData.category_id ||
                                 oldProduct.price !== productData.price ||
                                 oldProduct.image !== productData.image ||
                                 oldProduct.unit !== productData.unit;
            
            if (hasRealChange) {
              db.products[existingProductIndex] = productData;
              console.log(`🔄 Ürün güncellendi: ${productData.name} (ID: ${productId})`);
              hasChanges = true;
            }
          } else {
            // Yeni ekle
            db.products.push(productData);
            console.log(`➕ Yeni ürün eklendi: ${productData.name} (ID: ${productId})`);
            hasChanges = true;
          }
        } else if (change.type === 'removed') {
          // Ürün silindi
          const productIndex = db.products.findIndex(p => p.id === productId);
          if (productIndex !== -1) {
            const deletedProduct = db.products[productIndex];
            db.products.splice(productIndex, 1);
            console.log(`🗑️ Ürün silindi: ${deletedProduct.name} (ID: ${productId})`);
            hasChanges = true;
          }
        }
      });
      
      // Sadece gerçek değişiklik varsa database'e yaz
      if (hasChanges) {
        saveDatabase();
        
        // Renderer process'e bildir
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('products-updated', db.products);
        }
      }
    }, (error) => {
      console.error('❌ Ürün listener hatası:', error);
    });
    
    console.log('✅ Ürünler için gerçek zamanlı listener aktif (optimize edilmiş)');
    return unsubscribe;
  } catch (error) {
    console.error('❌ Ürün listener kurulum hatası:', error);
    return null;
  }
}

// Firebase'den gerçek zamanlı broadcast mesajı dinleme
let isBroadcastsListenerInitialized = false;
function setupBroadcastsRealtimeListener() {
  if (!firestore || !firebaseCollection || !firebaseOnSnapshot) {
    console.warn('⚠️ Firebase başlatılamadı, broadcast listener kurulamadı');
    return null;
  }
  
  try {
    console.log('👂 Broadcast mesajları için gerçek zamanlı listener başlatılıyor...');
    const broadcastsRef = firebaseCollection(firestore, 'broadcasts');
    
    const unsubscribe = firebaseOnSnapshot(broadcastsRef, (snapshot) => {
      // İlk yüklemede tüm dokümanlar "added" olarak gelir - bunları sessizce işle
      const isInitialLoad = !isBroadcastsListenerInitialized;
      if (isInitialLoad) {
        isBroadcastsListenerInitialized = true;
        console.log('📥 İlk broadcast yüklemesi tamamlandı (sessiz mod)');
        return;
      }
      
      // Sadece yeni eklenen mesajları işle
      const changes = snapshot.docChanges();
      if (changes.length === 0) return;
      
      changes.forEach(async (change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const messageId = change.doc.id;
          console.log('📢 Yeni broadcast mesajı alındı:', data.message, 'ID:', messageId);
          
          // Tenant bilgisini al
          const tenantInfo = tenantManager.getCurrentTenantInfo();
          const tenantId = tenantInfo?.tenantId;
          
          // Bu mesaj daha önce okunmuş mu kontrol et
          let isRead = false;
          if (tenantId && firestore && firebaseCollection && firebaseGetDocs) {
            try {
              const readsRef = firebaseCollection(firestore, 'broadcast_reads');
              const readsSnapshot = await firebaseGetDocs(readsRef);
              
              isRead = readsSnapshot.docs.some(doc => {
                const readData = doc.data();
                return readData.messageId === messageId && readData.tenantId === tenantId;
              });
              
              if (isRead) {
                console.log('📢 Mesaj zaten okunmuş, gönderilmiyor:', messageId);
                return;
              }
            } catch (error) {
              console.error('❌ Okunma kontrolü hatası:', error);
              // Hata durumunda gönder (güvenli taraf)
            }
          }
          
          // Socket.IO ile tüm clientlara gönder
          if (io) {
            io.emit('broadcast-message', {
              id: messageId,
              message: data.message,
              date: data.date,
              time: data.time
            });
            console.log('✅ Broadcast mesajı tüm clientlara gönderildi:', messageId);
          }
          
          // Desktop uygulamaya da gönder
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('broadcast-message', {
              id: messageId,
              message: data.message,
              date: data.date,
              time: data.time
            });
          }
        }
      });
    }, (error) => {
      console.error('❌ Broadcast listener hatası:', error);
    });
    
    console.log('✅ Broadcast mesajları için gerçek zamanlı listener aktif');
    return unsubscribe;
  } catch (error) {
    console.error('❌ Broadcast listener kurulum hatası:', error);
    return null;
  }
}

function createWindow() {
  // Menü çubuğunu kaldır
  Menu.setApplicationMenu(null);

  // Launcher için büyük pencere (profesyonel kurumsal görünüm)
  const screenSize = require('electron').screen.getPrimaryDisplay().workAreaSize;
  const launcherWidth = 1400;
  const launcherHeight = 900;

  mainWindow = new BrowserWindow({
    width: launcherWidth,
    height: launcherHeight,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: true // DevTools'u etkinleştir
    },
    frame: false,
    title: `${tenantManager.getBusinessName()} POS`,
    backgroundColor: '#f0f4ff',
    autoHideMenuBar: true, // Menü çubuğunu gizle
    center: true, // Pencereyi ekranın ortasına yerleştir
    resizable: false, // Launcher için boyutlandırılamaz
    fullscreen: false, // Launcher için tam ekran değil
    kiosk: false // Launcher için kiosk modu kapalı
  });

  // F12 ile DevTools aç/kapa
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    // Konsol kapalı başlatılsın
    // mainWindow.webContents.openDevTools(); // Kaldırıldı
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Pencere kapatıldığında
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Tenant Management IPC Handlers
ipcMain.handle('set-tenant-info', async (event, tenantInfo) => {
  try {
    console.log('🔄 Tenant bilgisi ayarlanıyor:', tenantInfo.tenantId);
    
    // ÖNCE Status değişikliği callback'ini ayarla (listener başlatılmadan önce!)
    tenantManager.setStatusChangeCallback((statusInfo) => {
      console.log('⚠️ Tenant status callback çağrıldı:', statusInfo);
      console.log('⚠️ isActive:', statusInfo.isActive, 'status:', statusInfo.status);
      
      // isActive: false veya status: 'suspended' durumunda bildirim gönder
      if (!statusInfo.isActive || statusInfo.status === 'suspended') {
        console.log('🚨 Tenant suspended - renderer\'a bildirim gönderiliyor');
        // Renderer'a bildir
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('tenant-suspended', {
            message: 'Hesabınız yönetici tarafından askıya alınmıştır. Lütfen yönetici ile iletişime geçiniz.',
            businessName: statusInfo.businessName
          });
          console.log('✅ tenant-suspended event gönderildi');
        } else {
          console.error('❌ mainWindow veya webContents mevcut değil');
        }
      } else {
        console.log('ℹ️ Tenant aktif, bildirim gönderilmiyor');
      }
    });
    
    // SONRA Tenant bilgisini kaydet (bu listener'ı başlatacak)
    tenantManager.setCurrentTenantInfo(tenantInfo);
    
    // Mevcut veritabanını kaydet (eğer varsa)
    if (dbPath && fs.existsSync(dbPath)) {
      saveDatabase();
    }
    
    // Yeni tenant için database'i başlat
    initDatabase(tenantInfo.tenantId);
    
    // Firebase'leri tenant'a göre başlat
    const firebaseInitialized = await initializeTenantFirebases(tenantInfo);
    
    if (!firebaseInitialized) {
      return { success: false, error: 'Firebase başlatılamadı' };
    }
    
    // Pencere başlığını güncelle
    if (mainWindow) {
      mainWindow.setTitle(`${tenantInfo.businessName} POS`);
    }
    
    // Firebase'den verileri senkronize et
    setTimeout(async () => {
      console.log('🔄 Firebase senkronizasyonu başlatılıyor...');
      
      // Kategorileri ve ürünleri çek
      await syncCategoriesFromFirebase();
      await syncProductsFromFirebase();
      
      // Gerçek zamanlı listener'ları başlat
      setupCategoriesRealtimeListener();
      setupProductsRealtimeListener();
      setupBroadcastsRealtimeListener();
      setupCustomerOrdersRealtimeListener();
      
      console.log('✅ Firebase senkronizasyonu tamamlandı');
      
      // Renderer'a bildir
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('tenant-changed', tenantInfo);
      }
    }, 1000);
    
    return { success: true, tenantInfo };
  } catch (error) {
    console.error('Tenant bilgisi ayarlama hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-tenant-info', () => {
  const tenantInfo = tenantManager.getCurrentTenantInfo();
  return tenantInfo || null;
});

ipcMain.handle('get-business-name', () => {
  return tenantManager.getBusinessName();
});

// Gece Dönercisi: renderer -> main şube seçimi aktarımı (mobil endpoint'ler bu değeri kullanır)
ipcMain.handle('set-gece-branch-selection', async (event, payload) => {
  try {
    const tenantInfo = tenantManager.getCurrentTenantInfo();
    if (!tenantInfo || tenantInfo.tenantId !== GECE_TENANT_ID) {
      return { success: false, error: 'Bu tenant için şube seçimi aktif değil' };
    }

    const branch = payload?.branch;
    const deviceId = payload?.deviceId ? String(payload.deviceId) : null;

    if (!isValidGeceBranch(branch)) {
      return { success: false, error: 'Geçersiz şube. SANCAK veya ŞEKER olmalı.' };
    }

    geceBranchSelection = { branch, deviceId };

    if (!db.settings) db.settings = { adminPin: '1234', cashierPrinter: null, geceBranch: null, geceDeviceId: null };
    db.settings.geceBranch = branch;
    db.settings.geceDeviceId = deviceId;
    saveDatabase();

    return { success: true, branch, deviceId };
  } catch (e) {
    console.error('set-gece-branch-selection hatası:', e);
    return { success: false, error: e.message || 'Şube seçimi kaydedilemedi' };
  }
});

// IPC Handlers
ipcMain.handle('get-categories', () => {
  return db.categories.sort((a, b) => a.order_index - b.order_index);
});

ipcMain.handle('create-category', (event, categoryData) => {
  const { name } = categoryData;
  
  if (!name || name.trim() === '') {
    return { success: false, error: 'Kategori adı boş olamaz' };
  }
  
  // Aynı isimde kategori var mı kontrol et
  const existingCategory = db.categories.find(c => c.name.toLowerCase().trim() === name.toLowerCase().trim());
  if (existingCategory) {
    return { success: false, error: 'Bu isimde bir kategori zaten mevcut' };
  }
  
  const newId = db.categories.length > 0 
    ? Math.max(...db.categories.map(c => c.id)) + 1 
    : 1;
  
  const maxOrderIndex = db.categories.length > 0
    ? Math.max(...db.categories.map(c => c.order_index || 0))
    : -1;
  
  const newCategory = {
    id: newId,
    name: name.trim(),
    order_index: maxOrderIndex + 1
  };
  
  db.categories.push(newCategory);
  saveDatabase();
  
  // Firebase'e kaydet
  saveCategoryToFirebase(newCategory).catch(err => {
    console.error('Firebase kategori kaydetme hatası:', err);
  });
  
  return { success: true, category: newCategory };
});

// Kategori silme handler'ı
ipcMain.handle('update-category', (event, categoryId, categoryData) => {
  const { name } = categoryData;
  
  if (!name || name.trim() === '') {
    return { success: false, error: 'Kategori adı boş olamaz' };
  }
  
  const category = db.categories.find(c => c.id === categoryId);
  if (!category) {
    return { success: false, error: 'Kategori bulunamadı' };
  }
  
  // Aynı isimde başka bir kategori var mı kontrol et (kendisi hariç)
  const existingCategory = db.categories.find(c => 
    c.id !== categoryId && c.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  if (existingCategory) {
    return { success: false, error: 'Bu isimde bir kategori zaten mevcut' };
  }
  
  // Kategori adını güncelle
  category.name = name.trim();
  
  saveDatabase();
  
  // Firebase'e kaydet
  saveCategoryToFirebase(category).catch(err => {
    console.error('Firebase kategori güncelleme hatası:', err);
  });
  
  return { success: true, category };
});

ipcMain.handle('delete-category', async (event, categoryId) => {
  const category = db.categories.find(c => c.id === categoryId);
  
  if (!category) {
    return { success: false, error: 'Kategori bulunamadı' };
  }
  
  // Bu kategorideki tüm ürünleri bul
  const productsInCategory = db.products.filter(p => p.category_id === categoryId);
  
  // Kategorideki tüm ürünleri sil
  if (productsInCategory.length > 0) {
    // Her ürünü sil
    productsInCategory.forEach(product => {
      // Ürünü products listesinden kaldır
      const productIndex = db.products.findIndex(p => p.id === product.id);
      if (productIndex !== -1) {
        db.products.splice(productIndex, 1);
      }
      
      // Ürünle ilgili satış itemlarını bul ve sil
      const saleItems = db.saleItems.filter(si => si.product_id === product.id);
      saleItems.forEach(item => {
        const itemIndex = db.saleItems.findIndex(si => si.id === item.id);
        if (itemIndex !== -1) {
          db.saleItems.splice(itemIndex, 1);
        }
      });
      
      // Ürünle ilgili masa sipariş itemlarını bul ve sil
      const tableOrderItems = db.tableOrderItems.filter(oi => oi.product_id === product.id);
      tableOrderItems.forEach(item => {
        const itemIndex = db.tableOrderItems.findIndex(oi => oi.id === item.id);
        if (itemIndex !== -1) {
          db.tableOrderItems.splice(itemIndex, 1);
        }
      });
    });
    
    // Firebase'den tüm ürünleri sil
    if (firestore && firebaseDoc && firebaseDeleteDoc) {
      try {
        for (const product of productsInCategory) {
          try {
            const productRef = firebaseDoc(firestore, 'products', product.id.toString());
            await firebaseDeleteDoc(productRef);
            console.log(`✅ Ürün Firebase'den silindi: ${product.name} (ID: ${product.id})`);
          } catch (productError) {
            console.error(`❌ Ürün Firebase'den silinirken hata (ID: ${product.id}):`, productError.message);
            // Bir ürün silinemediyse diğerlerini denemeye devam et
          }
        }
        console.log(`✅ ${productsInCategory.length} ürün Firebase'den silindi`);
      } catch (error) {
        console.error('❌ Firebase\'den ürün silme hatası:', error);
        console.error('Hata detayları:', error.message, error.code);
      }
    } else {
      console.warn('⚠️ Firebase başlatılamadı, ürünler sadece local database\'den silindi');
    }
  }
  
  // Kategoriye atanmış yazıcı var mı kontrol et
  const printerAssignments = db.printerAssignments.filter(pa => pa.category_id === categoryId);
  if (printerAssignments.length > 0) {
    // Yazıcı atamalarını kaldır
    db.printerAssignments = db.printerAssignments.filter(pa => pa.category_id !== categoryId);
  }
  
  // Kategoriyi sil
  const categoryIndex = db.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex !== -1) {
    db.categories.splice(categoryIndex, 1);
    saveDatabase();
    
    // Firebase'den kategoriyi sil
    if (firestore && firebaseDoc && firebaseDeleteDoc) {
      try {
        const categoryRef = firebaseDoc(firestore, 'categories', categoryId.toString());
        await firebaseDeleteDoc(categoryRef);
        console.log(`✅ Kategori Firebase'den silindi: ${category.name} (ID: ${categoryId})`);
      } catch (error) {
        console.error('❌ Firebase\'den kategori silme hatası:', error);
        console.error('Hata detayları:', error.message, error.code);
        // Hata olsa bile local'den silindi, devam et
      }
    } else {
      console.warn('⚠️ Firebase başlatılamadı, kategori sadece local database\'den silindi');
    }
    
    return { success: true, deletedProducts: productsInCategory.length };
  }
  
  return { success: false, error: 'Kategori silinemedi' };
});

ipcMain.handle('get-products', async (event, categoryId) => {
  let products = categoryId 
    ? db.products.filter(p => p.category_id === categoryId)
    : db.products;
  
  // Her ürün için stok bilgisini Firebase'den çek (eğer local'de yoksa)
  const productsWithStock = await Promise.all(products.map(async (product) => {
    // Eğer local'de stok bilgisi varsa onu kullan
    if (product.stock !== undefined) {
      return product;
    }
    
    // Firebase'den çek
    const firebaseStock = await getProductStockFromFirebase(product.id);
    if (firebaseStock !== null) {
      // Local'e kaydet
      const productIndex = db.products.findIndex(p => p.id === product.id);
      if (productIndex !== -1) {
        db.products[productIndex] = {
          ...db.products[productIndex],
          stock: firebaseStock
        };
      }
      return {
        ...product,
        stock: firebaseStock
      };
    }
    
    // Stok bilgisi yoksa 0 olarak döndür
    return {
      ...product,
      stock: 0
    };
  }));
  
  // Database'i kaydet (stok bilgileri güncellendi)
  saveDatabase();
  
  return productsWithStock;
});

ipcMain.handle('create-sale', async (event, saleData) => {
  const { items, totalAmount, paymentMethod, orderNote, orderSource, staff_name, branch, deviceId } = saleData;
  
  const now = new Date();
  const saleDate = getBusinessDayDateString(now);
  const saleTime = getFormattedTime(now);

  const tenantInfo = tenantManager.getCurrentTenantInfo();
  const isGeceDonercisiTenant = tenantInfo?.tenantId === GECE_TENANT_ID;

  if (isGeceDonercisiTenant) {
    // Gece Dönercisi: stok düşümü şube bazlı (0 altına düşmez, satışı engellemez)
    await decreaseGeceBranchStockItems({
      branch,
      deviceId,
      items,
      source: 'desktop-create-sale',
    });
  } else {
    // Diğer tenant'lar: stok kontrolü ve düşürme (sadece stok takibi yapılan ürünler için)
    for (const item of items) {
      if (!item.isGift && !item.isExpense) { // İkram ve masraf ürünleri stoktan düşmez
        const product = db.products.find(p => p.id === item.id);
        // Sadece stok takibi yapılan ürünler için kontrol et
        if (product && product.trackStock) {
          const stockDecreased = await decreaseProductStock(item.id, item.quantity);
          if (!stockDecreased) {
            return { 
              success: false, 
              error: `${item.name} için yetersiz stok` 
            };
          }
        }
      }
    }
  }

  // Yeni satış ID'si
  const saleId = db.sales.length > 0 
    ? Math.max(...db.sales.map(s => s.id)) + 1 
    : 1;

  // Satış ekle
  db.sales.push({
    id: saleId,
    total_amount: totalAmount,
    payment_method: paymentMethod,
    sale_date: saleDate,
    sale_time: saleTime,
    staff_name: staff_name || null
  });

  // Satış itemlarını ekle
  items.forEach(item => {
    const itemId = db.saleItems.length > 0 
      ? Math.max(...db.saleItems.map(si => si.id)) + 1 
      : 1;
      
    db.saleItems.push({
      id: itemId,
      sale_id: saleId,
      product_id: item.id,
      product_name: item.name,
      quantity: item.quantity,
      price: item.price,
      isGift: item.isGift || false
    });
  });

  saveDatabase();

  // Firebase'e kaydet
  if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
    try {
      const salesRef = firebaseCollection(firestore, 'sales');
      
      // Items'ı string formatına çevir
      const itemsText = items.map(item => {
        const giftText = item.isGift ? ' (İKRAM)' : '';
        return `${item.name} x${item.quantity}${giftText}`;
      }).join(', ');

      const firebaseData = {
        sale_id: saleId,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        sale_date: saleDate,
        sale_time: saleTime,
        staff_name: staff_name || null,
        order_source: orderSource || null, // 'Trendyol', 'Yemeksepeti', or null
        items: itemsText,
        items_array: items.map(item => ({
          product_id: item.id,
          product_name: item.name,
          quantity: item.quantity,
          price: item.price,
          isGift: item.isGift || false
        })),
        created_at: firebaseServerTimestamp(),
        ...(isGeceDonercisiTenant ? { branch: getGeceBranchLabelForFirebase() || undefined } : {})
      };

      await firebaseAddDoc(salesRef, firebaseData);
      console.log('✅ Satış Firebase\'e başarıyla kaydedildi:', saleId);
    } catch (error) {
      console.error('❌ Firebase\'e kaydetme hatası:', error);
      console.error('Hata detayları:', error.message, error.stack);
    }
  } else {
    console.warn('⚠️ Firebase başlatılamadı, satış sadece local database\'e kaydedildi');
  }

  return { success: true, saleId };
});

ipcMain.handle('get-sales', () => {
  const salesList = Array.isArray(db.sales) ? db.sales : [];
  const itemsList = Array.isArray(db.saleItems) ? db.saleItems : [];
  // Satışları ve itemları birleştir
  const salesWithItems = salesList.map(sale => {
    const saleItems = itemsList.filter(si => si.sale_id === sale.id);
    
    // Items string'i (eski format için uyumluluk)
    const items = saleItems
      .map(si => {
        const giftText = si.isGift ? ' (İKRAM)' : '';
        return `${si.product_name} x${si.quantity}${giftText}`;
      })
      .join(', ');
    
    // Items array (gerçek veriler için - personel bilgisi dahil)
    const itemsArray = saleItems.map(si => ({
      product_id: si.product_id,
      product_name: si.product_name,
      quantity: si.quantity,
      price: si.price,
      isGift: si.isGift || false,
      staff_id: si.staff_id || null,
      staff_name: si.staff_name || null // Her item için personel bilgisi
    }));
    
    return {
      ...sale,
      items: items || 'Ürün bulunamadı',
      items_array: itemsArray // Gerçek item detayları (personel bilgisi dahil)
    };
  });
  
  // En yeni satışlar önce
  return salesWithItems.sort((a, b) => b.id - a.id).slice(0, 100);
});

// Son 12 saatin satışlarını getir
ipcMain.handle('get-recent-sales', (event, hours = 12) => {
  const now = new Date();
  const hoursAgo = new Date(now.getTime() - (hours * 60 * 60 * 1000));
  
  // Satışları ve itemları birleştir
  const salesWithItems = db.sales.map(sale => {
    const saleItems = db.saleItems.filter(si => si.sale_id === sale.id);
    
    // Items string'i (eski format için uyumluluk)
    const items = saleItems
      .map(si => {
        const giftText = si.isGift ? ' (İKRAM)' : '';
        return `${si.product_name} x${si.quantity}${giftText}`;
      })
      .join(', ');
    
    // Items array (gerçek veriler için - personel bilgisi dahil)
    const itemsArray = saleItems.map(si => ({
      product_id: si.product_id,
      product_name: si.product_name,
      quantity: si.quantity,
      price: si.price,
      isGift: si.isGift || false,
      staff_id: si.staff_id || null,
      staff_name: si.staff_name || null
    }));
    
    return {
      ...sale,
      items: items || 'Ürün bulunamadı',
      items_array: itemsArray
    };
  });
  
  // Son 12 saat içindeki satışları filtrele
  const recentSales = salesWithItems.filter(sale => {
    try {
      // Tarih ve saat bilgisini parse et
      const [day, month, year] = sale.sale_date.split('.');
      const [hours, minutes, seconds] = (sale.sale_time || '00:00:00').split(':');
      const saleDate = new Date(year, month - 1, day, hours || 0, minutes || 0, seconds || 0);
      
      return saleDate >= hoursAgo;
    } catch (error) {
      return false;
    }
  });
  
  // En yeni satışlar önce
  return recentSales.sort((a, b) => {
    try {
      const [dayA, monthA, yearA] = a.sale_date.split('.');
      const [hoursA, minutesA, secondsA] = (a.sale_time || '00:00:00').split(':');
      const dateA = new Date(yearA, monthA - 1, dayA, hoursA || 0, minutesA || 0, secondsA || 0);
      
      const [dayB, monthB, yearB] = b.sale_date.split('.');
      const [hoursB, minutesB, secondsB] = (b.sale_time || '00:00:00').split(':');
      const dateB = new Date(yearB, monthB - 1, dayB, hoursB || 0, minutesB || 0, secondsB || 0);
      
      return dateB - dateA;
    } catch (error) {
      return 0;
    }
  });
});

ipcMain.handle('get-sale-details', (event, saleId) => {
  const sale = db.sales.find(s => s.id === saleId);
  const items = db.saleItems.filter(si => si.sale_id === saleId);
  
  return { sale, items };
});

// Tüm satışları sil
ipcMain.handle('delete-all-sales', async (event) => {
  try {
    console.log('🗑️ Tüm satışlar siliniyor...');
    
    // Local database'den tüm satışları sil
    const salesCount = db.sales.length;
    const saleItemsCount = db.saleItems.length;
    
    db.sales = [];
    db.saleItems = [];
    
    saveDatabase();
    console.log(`✅ Local database'den ${salesCount} satış ve ${saleItemsCount} satış item'ı silindi`);
    
    // Firebase'den de tüm satışları sil
    if (firestore && firebaseCollection && firebaseGetDocs && firebaseDeleteDoc) {
      try {
        const salesRef = firebaseCollection(firestore, 'sales');
        const snapshot = await firebaseGetDocs(salesRef);
        
        let deletedCount = 0;
        const deletePromises = [];
        
        snapshot.forEach((doc) => {
          deletePromises.push(firebaseDeleteDoc(doc.ref));
          deletedCount++;
        });
        
        await Promise.all(deletePromises);
        console.log(`✅ Firebase'den ${deletedCount} satış silindi`);
      } catch (firebaseError) {
        console.error('❌ Firebase\'den silme hatası:', firebaseError);
        // Firebase hatası olsa bile local database'den silindi, devam et
      }
    } else {
      console.warn('⚠️ Firebase başlatılamadı, sadece local database temizlendi');
    }
    
    return { 
      success: true, 
      message: `${salesCount} satış başarıyla silindi`,
      deletedCount: salesCount
    };
  } catch (error) {
    console.error('❌ Satış silme hatası:', error);
    return { 
      success: false, 
      error: error.message || 'Satışlar silinirken bir hata oluştu' 
    };
  }
});

// Table Order IPC Handlers
ipcMain.handle('create-table-order', async (event, orderData) => {
  const { items, totalAmount, tableId, tableName, tableType, orderNote, orderSource, branch, deviceId } = orderData;
  
  // Eğer orderSource gönderilmemişse, tableType'a göre otomatik belirle (mobil personel senkronu için)
  let finalOrderSource = orderSource;
  if (!finalOrderSource && tableType) {
    if (tableType === 'yemeksepeti') {
      finalOrderSource = 'Yemeksepeti';
    } else if (tableType === 'trendyolgo') {
      finalOrderSource = 'Trendyol';
    } else if (tableType === 'migros-yemek') {
      finalOrderSource = 'Migros Yemek';
    }
  }
  
  const now = new Date();
  const orderDate = now.toLocaleDateString('tr-TR');
  const orderTime = getFormattedTime(now);

  // Mevcut sipariş var mı kontrol et
  const existingOrder = (db.tableOrders || []).find(
    o => o.table_id === tableId && o.status === 'pending'
  );

  let orderId;
  let isNewOrder = false;

  const tenantInfo = tenantManager.getCurrentTenantInfo();
  const isGeceDonercisiTenant = tenantInfo?.tenantId === GECE_TENANT_ID;

  if (isGeceDonercisiTenant) {
    // Gece Dönercisi: masaya kaydedilen ürünlerde şube stok düşümü (0 altına düşmez, siparişi engellemez)
    await decreaseGeceBranchStockItems({
      branch,
      deviceId,
      items,
      source: 'desktop-create-table-order',
    });
  } else {
    // Diğer tenant'lar: stok kontrolü ve düşürme (sadece stok takibi yapılan ürünler için)
    for (const item of items) {
      if (!item.isGift) { // İkram edilen ürünler stoktan düşmez
        const product = db.products.find(p => p.id === item.id);
        // Sadece stok takibi yapılan ürünler için kontrol et
        if (product && product.trackStock) {
          const stockDecreased = await decreaseProductStock(item.id, item.quantity);
          if (!stockDecreased) {
            return { 
              success: false, 
              error: `${item.name} için yetersiz stok` 
            };
          }
        }
      }
    }
  }

  if (existingOrder) {
    // Mevcut siparişe ekle
    // Her sipariş için ayrı kayıt oluştur (aynı ürün olsa bile, farklı saat bilgisiyle)
    // Böylece kategori bazlı yazdırmada her siparişin kendi bilgileri kullanılır
    orderId = existingOrder.id;
    items.forEach(newItem => {
      const itemId = (db.tableOrderItems || []).length > 0 
        ? Math.max(...db.tableOrderItems.map(oi => oi.id)) + 1 
        : 1;
      if (!db.tableOrderItems) db.tableOrderItems = [];
      db.tableOrderItems.push({
        id: itemId,
        order_id: orderId,
        product_id: newItem.id,
        product_name: newItem.name,
        quantity: newItem.quantity,
        price: newItem.price,
        portion: newItem.portion || null,
        onionOption: newItem.onionOption || null,
        extraNote: newItem.extraNote || null,
        donerOptionsText: newItem.donerOptionsText || null,
        donerKey: newItem.donerKey || null,
        isGift: newItem.isGift || false,
        staff_id: null, // Electron'dan eklenen ürünler için staff bilgisi yok
        staff_name: null,
        added_date: orderDate,
        added_time: orderTime
      });
    });
    // Toplam tutarı güncelle
    const existingTotal = existingOrder.total_amount || 0;
    existingOrder.total_amount = existingTotal + totalAmount;
    if (orderNote) {
      existingOrder.order_note = orderNote;
    }
    // Mevcut siparişe order_source'u güncelle (eğer yeni siparişte varsa)
    if (finalOrderSource && !existingOrder.order_source) {
      existingOrder.order_source = finalOrderSource;
    }
  } else {
    // Yeni sipariş oluştur
    isNewOrder = true;
    orderId = db.tableOrders.length > 0 
      ? Math.max(...db.tableOrders.map(o => o.id)) + 1 
      : 1;

    db.tableOrders.push({
      id: orderId,
      table_id: tableId,
      table_name: tableName,
      table_type: tableType,
      total_amount: totalAmount,
      order_date: orderDate,
      order_time: orderTime,
      status: 'pending',
      order_note: orderNote || null,
      order_source: finalOrderSource || null // 'Trendyol', 'Yemeksepeti', or null
    });

    // Sipariş itemlarını ekle
    items.forEach(item => {
      const itemId = db.tableOrderItems.length > 0 
        ? Math.max(...db.tableOrderItems.map(oi => oi.id)) + 1 
        : 1;
        
      if (!db.tableOrderItems) db.tableOrderItems = [];
      db.tableOrderItems.push({
        id: itemId,
        order_id: orderId,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        price: item.price,
        portion: item.portion || null,
        onionOption: item.onionOption || null,
        extraNote: item.extraNote || null,
        donerOptionsText: item.donerOptionsText || null,
        donerKey: item.donerKey || null,
        isGift: item.isGift || false,
        staff_id: null,
        staff_name: null,
        added_date: orderDate,
        added_time: orderTime
      });
    });
  }

  saveDatabase();
  
  // Yeni Firebase'e sadece bu masayı kaydet (makaramasalar)
  syncSingleTableToFirebase(tableId).catch(err => {
    console.error('Masa Firebase kaydetme hatası:', err);
  });
  
  // Electron renderer process'e güncelleme gönder
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('new-order-created', { 
      orderId, 
      tableId,
      tableName, 
      tableType,
      totalAmount: existingOrder ? existingOrder.total_amount : totalAmount,
      isNewOrder
    });
  }
  
  // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder
  if (io) {
    io.emit('table-update', {
      tableId: tableId,
      hasOrder: true
    });
  }
  
  return { success: true, orderId, isNewOrder };
});

ipcMain.handle('get-table-orders', (event, tableId) => {
  if (tableId) {
    // Belirli bir masa için siparişler
    return db.tableOrders.filter(o => o.table_id === tableId);
  }
  // Tüm masa siparişleri
  return db.tableOrders;
});

ipcMain.handle('get-table-order-items', (event, orderId) => {
  return db.tableOrderItems.filter(oi => oi.order_id === orderId);
});

// Mevcut masa siparişine ürün ekle (örn. Su Ekle)
ipcMain.handle('add-item-to-table-order', async (event, orderId, product, quantity = 1) => {
  const order = db.tableOrders.find(o => o.id === orderId);
  if (!order) return { success: false, error: 'Sipariş bulunamadı' };
  if (order.status !== 'pending') return { success: false, error: 'Sadece bekleyen siparişe ürün eklenebilir' };
  const productId = product?.id != null ? product.id : null;
  const productName = product?.name || 'Ürün';
  const price = Number(product?.price ?? 0);
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  const orderDate = order.order_date || getBusinessDayDateString(new Date());
  const orderTime = order.order_time || getFormattedTime(new Date());
  const newId = db.tableOrderItems.length > 0 ? Math.max(...db.tableOrderItems.map(oi => oi.id)) + 1 : 1;
  if (!db.tableOrderItems) db.tableOrderItems = [];
  db.tableOrderItems.push({
    id: newId,
    order_id: orderId,
    product_id: productId,
    product_name: productName,
    quantity: qty,
    price,
    portion: null,
    onionOption: null,
    extraNote: null,
    donerOptionsText: null,
    donerKey: null,
    isGift: false,
    staff_id: null,
    staff_name: null,
    added_date: orderDate,
    added_time: orderTime,
  });
  const orderIndex = db.tableOrders.findIndex(o => o.id === orderId);
  if (orderIndex !== -1) {
    db.tableOrders[orderIndex].total_amount = Number(db.tableOrders[orderIndex].total_amount || 0) + price * qty;
  }
  saveDatabase();
  const tableId = order.table_id;
  syncSingleTableToFirebase(tableId).catch(err => console.error('Masa Firebase sync:', err));
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('table-order-updated', { tableId });
  }
  return { success: true, itemId: newId };
});

// Masa siparişinden ürün iptal etme
ipcMain.handle('cancel-table-order-item', async (event, itemId, cancelQuantity, cancelReason = null, staffId = null) => {
  const item = db.tableOrderItems.find(oi => oi.id === itemId);
  if (!item) {
    return { success: false, error: 'Ürün bulunamadı' };
  }

  const order = db.tableOrders.find(o => o.id === item.order_id);
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı' };
  }

  if (order.status !== 'pending') {
    return { success: false, error: 'Bu sipariş zaten tamamlanmış veya iptal edilmiş' };
  }

  const tenantId = tenantManager.getCurrentTenantInfo()?.tenantId || null;
  const isGeceDonercisi = tenantId === 'TENANT-1769602125250';

  // Müdür kontrolü (sadece mobil personel arayüzünden gelen istekler için)
  if (staffId) {
    const staff = (db.staff || []).find(s => s.id === staffId);
    if (!isGeceDonercisi && (!staff || !staff.is_manager)) {
      return { 
        success: false, 
        error: 'İptal yetkisi yok. İptal ettirmek için lütfen müdürle görüşünüz.' 
      };
    }
  }

  // İptal edilecek miktarı belirle
  const quantityToCancel = cancelQuantity || item.quantity;
  if (quantityToCancel <= 0 || quantityToCancel > item.quantity) {
    return { success: false, error: 'Geçersiz iptal miktarı' };
  }

  // Ürün bilgilerini al (kategori ve yazıcı için)
  const product = db.products.find(p => p.id === item.product_id);
  if (!product) {
    return { success: false, error: 'Ürün bilgisi bulunamadı' };
  }

  // Kategori bilgisini al
  const category = db.categories.find(c => c.id === product.category_id);
  const categoryName = category ? category.name : 'Diğer';

  // Bu kategoriye atanmış yazıcıyı bul
  const assignment = db.printerAssignments.find(a => {
    const assignmentCategoryId = typeof a.category_id === 'string' ? parseInt(a.category_id) : a.category_id;
    return assignmentCategoryId === product.category_id;
  });

  if (!assignment) {
    return { success: false, error: 'Bu ürünün kategorisine yazıcı atanmamış' };
  }

  // Gece Dönercisi: iptal açıklaması zorunlu değil
  if (!isGeceDonercisi) {
    if (!cancelReason || cancelReason.trim() === '') {
      return { success: false, requiresReason: true, error: 'İptal açıklaması zorunludur' };
    }
    cancelReason = cancelReason.trim();
  } else {
    cancelReason = (cancelReason && cancelReason.trim()) ? cancelReason.trim() : '';
  }

  // Stok iadesi (iptal gerçekten yapılacaksa) — Gece Dönercisi: şube stoklarına, diğerleri: normal stok
  if (!item.isGift) {
    if (isGeceDonercisi) {
      const activeBranch = geceBranchSelection.branch || db.settings?.geceBranch || null;
      const activeDeviceId = geceBranchSelection.deviceId || db.settings?.geceDeviceId || null;
      await increaseGeceBranchStockItems({
        branch: activeBranch,
        deviceId: activeDeviceId,
        items: [{ id: item.product_id, quantity: quantityToCancel, name: item.product_name, isGift: false }],
        source: 'desktop-cancel-table-order-item',
      });
    } else {
      await increaseProductStock(item.product_id, quantityToCancel);
    }
  }
      
      // İptal fişi yazdır (sadece açıklama varsa) - arka planda
      const now = new Date();
      const cancelDate = now.toLocaleDateString('tr-TR');
      const cancelTime = getFormattedTime(now);

      const cancelReceiptData = {
        tableName: order.table_name,
        tableType: order.table_type,
        productName: item.product_name,
        quantity: quantityToCancel,
        price: item.price,
        cancelDate: cancelDate,
        cancelTime: cancelTime,
        categoryName: categoryName
      };

      // Yazıcıya gönderme işlemini arka planda yap (await kullanmadan)
      printCancelReceipt(assignment.printerName, assignment.printerType, cancelReceiptData).catch(error => {
        console.error('İptal fişi yazdırma hatası:', error);
        // Yazdırma hatası olsa bile iptal işlemi zaten tamamlandı
      });

  // İptal edilecek tutarı hesapla (ikram değilse)
  const cancelAmount = item.isGift ? 0 : (item.price * quantityToCancel);

  // Masa siparişinin toplam tutarını güncelle
  order.total_amount = Math.max(0, order.total_amount - cancelAmount);

  // İptal açıklamasını kaydet
  if (quantityToCancel >= item.quantity) {
    // Tüm ürün iptal ediliyorsa, item'ı silmeden önce açıklamayı kaydet
    item.cancel_reason = cancelReason.trim();
    item.cancel_date = new Date().toISOString();
    const itemIndex = db.tableOrderItems.findIndex(oi => oi.id === itemId);
    if (itemIndex !== -1) {
      db.tableOrderItems.splice(itemIndex, 1);
    }
  } else {
    // Sadece bir kısmı iptal ediliyorsa, quantity'yi azalt ve açıklamayı kaydet
    item.quantity -= quantityToCancel;
    item.cancel_reason = cancelReason.trim();
    item.cancel_date = new Date().toISOString();
  }

  saveDatabase();

  // Firebase'e iptal kaydı ekle - arka planda
  if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
    const now = new Date();
    const cancelDate = now.toLocaleDateString('tr-TR');
    const cancelTime = getFormattedTime(now);
    
    // Siparişi oluşturan garson bilgisini bul
    const orderStaffName = order.staff_name || item.staff_name || null;
    
    // İptal eden personel bilgisi
    const cancelStaff = staffId ? (db.staff || []).find(s => s.id === staffId) : null;
    const cancelStaffName = cancelStaff ? `${cancelStaff.name} ${cancelStaff.surname}` : null;
    const cancelStaffIsManager = cancelStaff ? (cancelStaff.is_manager || false) : false;
    
    const cancelRef = firebaseCollection(firestore, 'cancels');
    // Firebase kaydetme işlemini arka planda yap (await kullanmadan)
    firebaseAddDoc(cancelRef, {
      item_id: itemId,
      order_id: order.id,
      table_id: order.table_id,
      table_name: order.table_name,
      table_type: order.table_type,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: quantityToCancel,
      price: item.price,
      cancel_reason: cancelReason,
      cancel_date: cancelDate,
      cancel_time: cancelTime,
      staff_id: staffId || null,
      staff_name: cancelStaffName,
      staff_is_manager: cancelStaffIsManager,
      order_staff_name: orderStaffName, // Siparişi oluşturan garson
      source: 'desktop', // 'desktop' veya 'mobile'
      created_at: firebaseServerTimestamp()
    }).then(() => {
      console.log('✅ İptal kaydı Firebase\'e başarıyla kaydedildi');
    }).catch(error => {
      console.error('❌ Firebase\'e iptal kaydı kaydedilemedi:', error);
    });
  }

  // Electron renderer process'e güncelleme gönder
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('table-order-updated', { 
      orderId: order.id,
      tableId: order.table_id
    });
  }

  // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder
  if (io) {
    io.emit('table-update', {
      tableId: order.table_id,
      hasOrder: order.total_amount > 0
    });
  }

  // Yeni Firebase'e sadece bu masayı kaydet (makaramasalar)
  syncSingleTableToFirebase(order.table_id).catch(err => {
    console.error('Masa Firebase kaydetme hatası:', err);
  });

  return { success: true, remainingAmount: order.total_amount };
});

// Toplu iptal handler - birden fazla item'ı tek fişte iptal et
ipcMain.handle('cancel-table-order-items-bulk', async (event, itemsToCancel, cancelReason = null, staffId = null) => {
  // itemsToCancel: [{ itemId, quantity }, ...]
  if (!itemsToCancel || itemsToCancel.length === 0) {
    return { success: false, error: 'İptal edilecek ürün bulunamadı' };
  }

  // İlk item'dan order bilgisini al
  const firstItem = db.tableOrderItems.find(oi => oi.id === itemsToCancel[0].itemId);
  if (!firstItem) {
    return { success: false, error: 'Ürün bulunamadı' };
  }

  const order = db.tableOrders.find(o => o.id === firstItem.order_id);
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı' };
  }

  if (order.status !== 'pending') {
    return { success: false, error: 'Bu sipariş zaten tamamlanmış veya iptal edilmiş' };
  }

  const tenantIdBulk = tenantManager.getCurrentTenantInfo()?.tenantId || null;
  const isGeceDonercisiBulk = tenantIdBulk === 'TENANT-1769602125250';
  const activeBranchBulk = isGeceDonercisiBulk ? (geceBranchSelection.branch || db.settings?.geceBranch || null) : null;
  const activeDeviceIdBulk = isGeceDonercisiBulk ? (geceBranchSelection.deviceId || db.settings?.geceDeviceId || null) : null;

  // Müdür kontrolü (sadece mobil personel arayüzünden gelen istekler için)
  if (staffId) {
    const staff = (db.staff || []).find(s => s.id === staffId);
    if (!isGeceDonercisiBulk && (!staff || !staff.is_manager)) {
      return { 
        success: false, 
        error: 'İptal yetkisi yok. İptal ettirmek için lütfen müdürle görüşünüz.' 
      };
    }
  }

  // Gece Dönercisi: iptal açıklaması zorunlu değil
  if (!isGeceDonercisiBulk && (!cancelReason || cancelReason.trim() === '')) {
    return { success: false, requiresReason: true, error: 'İptal açıklaması zorunludur' };
  }
  cancelReason = (cancelReason && cancelReason.trim()) ? cancelReason.trim() : '';

  // Tüm item'ları iptal et ve toplam bilgilerini topla
  let totalCancelAmount = 0;
  const cancelItems = [];
  const categoryGroups = new Map(); // categoryId -> { items: [], totalQuantity, totalAmount }

  for (const cancelItem of itemsToCancel) {
    const item = db.tableOrderItems.find(oi => oi.id === cancelItem.itemId);
    if (!item) continue;

    const quantityToCancel = cancelItem.quantity || item.quantity;
    if (quantityToCancel <= 0 || quantityToCancel > item.quantity) continue;

    // Ürün bilgilerini al
    const product = db.products.find(p => p.id === item.product_id);
    if (!product) continue;

    const category = db.categories.find(c => c.id === product.category_id);
    const categoryName = category ? category.name : 'Diğer';

    // Kategoriye göre grupla
    if (!categoryGroups.has(product.category_id)) {
      const assignment = db.printerAssignments.find(a => {
        const assignmentCategoryId = typeof a.category_id === 'string' ? parseInt(a.category_id) : a.category_id;
        return assignmentCategoryId === product.category_id;
      });

      if (!assignment) continue; // Yazıcı ataması yoksa atla

      categoryGroups.set(product.category_id, {
        categoryName,
        printerName: assignment.printerName,
        printerType: assignment.printerType,
        items: [],
        totalQuantity: 0,
        totalAmount: 0
      });
    }

    // Stok iadesi (iptal gerçekten yapılacaksa) — Gece Dönercisi: şube stoklarına, diğerleri: normal stok
    if (!item.isGift) {
      if (isGeceDonercisiBulk) {
        await increaseGeceBranchStockItems({
          branch: activeBranchBulk,
          deviceId: activeDeviceIdBulk,
          items: [{ id: item.product_id, quantity: quantityToCancel, name: item.product_name, isGift: false }],
          source: 'desktop-cancel-table-order-items-bulk',
        });
      } else {
        await increaseProductStock(item.product_id, quantityToCancel);
      }
    }

    const categoryGroup = categoryGroups.get(product.category_id);
    categoryGroup.items.push({
      productName: item.product_name,
      quantity: quantityToCancel,
      price: item.price
    });
    categoryGroup.totalQuantity += quantityToCancel;
    categoryGroup.totalAmount += item.isGift ? 0 : (item.price * quantityToCancel);

    // İptal edilecek tutarı hesapla
    const cancelAmount = item.isGift ? 0 : (item.price * quantityToCancel);
    totalCancelAmount += cancelAmount;

    // Item'ı güncelle veya sil
    if (quantityToCancel >= item.quantity) {
      item.cancel_reason = cancelReason;
      item.cancel_date = new Date().toISOString();
      const itemIndex = db.tableOrderItems.findIndex(oi => oi.id === cancelItem.itemId);
      if (itemIndex !== -1) {
        db.tableOrderItems.splice(itemIndex, 1);
      }
    } else {
      item.quantity -= quantityToCancel;
      item.cancel_reason = cancelReason;
      item.cancel_date = new Date().toISOString();
    }

    cancelItems.push({
      itemId: cancelItem.itemId,
      productName: item.product_name,
      quantity: quantityToCancel,
      price: item.price
    });
  }

  // Masa siparişinin toplam tutarını güncelle
  order.total_amount = Math.max(0, order.total_amount - totalCancelAmount);

  saveDatabase();

  // Her kategori için tek bir fiş yazdır
  const now = new Date();
  const cancelDate = now.toLocaleDateString('tr-TR');
  const cancelTime = getFormattedTime(now);

  for (const [categoryId, categoryGroup] of categoryGroups) {
    try {
      // Tek fiş için toplam bilgileriyle yazdır
      const cancelReceiptData = {
        tableName: order.table_name,
        tableType: order.table_type,
        productName: categoryGroup.items.length === 1 
          ? categoryGroup.items[0].productName 
          : `${categoryGroup.items.length} Farklı Ürün`,
        quantity: categoryGroup.totalQuantity,
        price: categoryGroup.items.length === 1 
          ? categoryGroup.items[0].price 
          : categoryGroup.totalAmount / categoryGroup.totalQuantity, // Ortalama fiyat
        cancelDate,
        cancelTime,
        categoryName: categoryGroup.categoryName,
        items: categoryGroup.items // Detaylı ürün listesi
      };

      await printCancelReceipt(categoryGroup.printerName, categoryGroup.printerType, cancelReceiptData);
    } catch (error) {
      console.error('İptal fişi yazdırma hatası:', error);
      // Yazdırma hatası olsa bile iptal işlemini devam ettir
    }
  }

  // Firebase'e iptal kayıtları ekle
  if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
    try {
      const orderStaffName = order.staff_name || firstItem.staff_name || null;
      const cancelStaff = staffId ? (db.staff || []).find(s => s.id === staffId) : null;
      const cancelStaffName = cancelStaff ? `${cancelStaff.name} ${cancelStaff.surname}` : null;
      const cancelStaffIsManager = cancelStaff ? (cancelStaff.is_manager || false) : false;

      const cancelRef = firebaseCollection(firestore, 'cancels');
      
      for (const cancelItem of cancelItems) {
        await firebaseAddDoc(cancelRef, {
          item_id: cancelItem.itemId,
          order_id: order.id,
          table_id: order.table_id,
          table_name: order.table_name,
          table_type: order.table_type,
          product_name: cancelItem.productName,
          quantity: cancelItem.quantity,
          price: cancelItem.price,
          cancel_reason: cancelReason,
          cancel_date: cancelDate,
          cancel_time: cancelTime,
          staff_id: staffId || null,
          staff_name: cancelStaffName,
          staff_is_manager: cancelStaffIsManager,
          order_staff_name: orderStaffName,
          source: 'desktop',
          created_at: firebaseServerTimestamp()
        });
      }
      console.log('✅ Toplu iptal kayıtları Firebase\'e başarıyla kaydedildi');
    } catch (error) {
      console.error('❌ Firebase\'e iptal kayıtları kaydedilemedi:', error);
    }
  }

  // Electron renderer process'e güncelleme gönder
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('table-order-updated', { 
      orderId: order.id,
      tableId: order.table_id
    });
  }

  // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder
  if (io) {
    io.emit('table-update', {
      tableId: order.table_id,
      hasOrder: order.total_amount > 0
    });
  }

  // Yeni Firebase'e sadece bu masayı kaydet
  syncSingleTableToFirebase(order.table_id).catch(err => {
    console.error('Masa Firebase kaydetme hatası:', err);
  });

  return { success: true, remainingAmount: order.total_amount };
});

// Masa siparişini başka bir masaya aktar
ipcMain.handle('transfer-table-order', async (event, sourceTableId, targetTableId) => {
  // Kaynak masanın siparişini bul
  const sourceOrder = db.tableOrders.find(
    o => o.table_id === sourceTableId && o.status === 'pending'
  );

  if (!sourceOrder) {
    return { success: false, error: 'Kaynak masada aktif sipariş bulunamadı' };
  }

  // Hedef masada aktif sipariş var mı kontrol et
  const targetOrder = db.tableOrders.find(
    o => o.table_id === targetTableId && o.status === 'pending'
  );

  if (targetOrder) {
    return { success: false, error: 'Hedef masada zaten aktif bir sipariş var' };
  }

  // Kaynak masanın sipariş itemlarını al
  const sourceItems = db.tableOrderItems.filter(oi => oi.order_id === sourceOrder.id);

  if (sourceItems.length === 0) {
    return { success: false, error: 'Aktarılacak ürün bulunamadı' };
  }

  // Hedef masa bilgilerini al (masa adı ve tipi)
  let targetTableName = '';
  let targetTableType = sourceOrder.table_type; // Varsayılan olarak kaynak masanın tipi

  // Masa ID'sinden masa bilgilerini çıkar (Gece Dönercisi: salon-1, bahce-1, ...; Lacromisa: Salon/Bahçe)
  const tenantInfoTransfer = tenantManager.getCurrentTenantInfo();
  const isLacromisaTransfer = tenantInfoTransfer?.tenantId === LACRIMOSA_TENANT_ID;
  if (targetTableId.startsWith('inside-')) {
    const num = targetTableId.replace('inside-', '');
    targetTableName = isLacromisaTransfer ? `Salon ${num}` : `İçeri ${num}`;
    targetTableType = 'inside';
  } else if (targetTableId.startsWith('outside-')) {
    const num = targetTableId.replace('outside-', '');
    targetTableName = isLacromisaTransfer ? `Bahçe ${num}` : `Dışarı ${num}`;
    targetTableType = 'outside';
  } else if (targetTableId.startsWith('package-')) {
    const parts = targetTableId.split('-');
    targetTableName = `Paket ${parts[parts.length - 1]}`;
    targetTableType = parts[1] || sourceOrder.table_type; // package-{type}-{number}
  } else if (/^(salon|bahce|paket|trendyolgo|yemeksepeti|migros-yemek)-\d+$/.test(targetTableId)) {
    const parts = targetTableId.split('-');
    const num = parts.pop();
    const categoryId = parts.join('-');
    const displayNames = { salon: 'Salon', bahce: 'Bahçe', paket: 'Paket', trendyolgo: 'TrendyolGO', yemeksepeti: 'Yemeksepeti', 'migros-yemek': 'Migros Yemek' };
    targetTableName = `${displayNames[categoryId] || categoryId} ${num}`;
    targetTableType = categoryId;
  }

  // Kaynak siparişin tüm bilgilerini koru (order_date, order_time, order_note, total_amount)
  // Sadece table_id, table_name ve table_type'ı güncelle
  sourceOrder.table_id = targetTableId;
  sourceOrder.table_name = targetTableName;
  sourceOrder.table_type = targetTableType;

  // Tüm itemların order_id'si zaten doğru (aynı order'a ait oldukları için değişmeyecek)
  // Ancak emin olmak için kontrol edelim
  sourceItems.forEach(item => {
    if (item.order_id !== sourceOrder.id) {
      item.order_id = sourceOrder.id;
    }
  });

  saveDatabase();

  // Electron renderer process'e güncelleme gönder
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('table-order-updated', { 
      orderId: sourceOrder.id,
      tableId: targetTableId,
      sourceTableId: sourceTableId
    });
  }

  // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder
  if (io) {
    io.emit('table-update', {
      tableId: sourceTableId,
      hasOrder: false
    });
    io.emit('table-update', {
      tableId: targetTableId,
      hasOrder: true
    });
  }

  // Yeni Firebase'e hem kaynak hem hedef masayı kaydet (makaramasalar)
  syncSingleTableToFirebase(sourceTableId).catch(err => {
    console.error('Kaynak masa Firebase kaydetme hatası:', err);
  });
  syncSingleTableToFirebase(targetTableId).catch(err => {
    console.error('Hedef masa Firebase kaydetme hatası:', err);
  });

  return { 
    success: true, 
    orderId: sourceOrder.id,
    sourceTableId: sourceTableId,
    targetTableId: targetTableId
  };
});

// Tüm masayı iptal et - hiçbir kayıt tutmadan, sanki hiç açılmamış gibi
ipcMain.handle('cancel-entire-table-order', async (event, orderId) => {
  const order = db.tableOrders.find(o => o.id === orderId);
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı' };
  }

  if (order.status !== 'pending') {
    return { success: false, error: 'Bu sipariş zaten tamamlanmış veya iptal edilmiş' };
  }

  const tableId = order.table_id;

  // Tüm sipariş item'larını bul ve sil
  const orderItems = db.tableOrderItems.filter(oi => oi.order_id === orderId);

  // Stok iadesi: masaya girilen ürünler iptal olursa stoklara geri iade edilir
  const tenantId = tenantManager.getCurrentTenantInfo()?.tenantId || null;
  const isGeceDonercisiTenant = tenantId === GECE_TENANT_ID;
  if (orderItems && orderItems.length > 0) {
    if (isGeceDonercisiTenant) {
      const activeBranch = geceBranchSelection.branch || db.settings?.geceBranch || null;
      const activeDeviceId = geceBranchSelection.deviceId || db.settings?.geceDeviceId || null;
      await increaseGeceBranchStockItems({
        branch: activeBranch,
        deviceId: activeDeviceId,
        items: orderItems.map((it) => ({
          id: it.product_id,
          quantity: it.quantity,
          name: it.product_name,
          isGift: it.isGift || false,
          isExpense: false,
        })),
        source: 'desktop-cancel-entire-table-order',
      });
    } else {
      for (const it of orderItems) {
        if (!it.isGift) {
          await increaseProductStock(it.product_id, it.quantity);
        }
      }
    }
  }

  // Fiş yazdırma - hiçbir şey yazdırılmayacak
  // Firebase kaydı - hiçbir kayıt tutulmayacak
  
  // Sadece siparişi ve item'ları sil
  const orderIndex = db.tableOrders.findIndex(o => o.id === orderId);
  if (orderIndex !== -1) {
    db.tableOrders.splice(orderIndex, 1);
  }

  // Tüm item'ları sil
  orderItems.forEach(item => {
    const itemIndex = db.tableOrderItems.findIndex(oi => oi.id === item.id);
    if (itemIndex !== -1) {
      db.tableOrderItems.splice(itemIndex, 1);
    }
  });

  saveDatabase();

  // Yeni Firebase'e masayı boş olarak kaydet (makaramasalar)
  syncSingleTableToFirebase(tableId).catch(err => {
    console.error('Masa Firebase kaydetme hatası:', err);
  });

  // Electron renderer process'e güncelleme gönder
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('table-order-updated', { 
      orderId: orderId,
      tableId: tableId
    });
  }

  // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder (masa artık boş)
  if (io) {
    io.emit('table-update', {
      tableId: tableId,
      hasOrder: false
    });
  }

  return { success: true };
});

ipcMain.handle('complete-table-order', async (event, orderId, paymentMethod = 'Nakit') => {
  const order = db.tableOrders.find(o => o.id === orderId);
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı' };
  }

  if (order.status !== 'pending') {
    return { success: false, error: 'Bu sipariş zaten tamamlanmış veya iptal edilmiş' };
  }

  // Ödeme yöntemi kontrolü
  if (!paymentMethod || (paymentMethod !== 'Nakit' && paymentMethod !== 'Kredi Kartı' && paymentMethod !== 'Online')) {
    return { success: false, error: 'Geçerli bir ödeme yöntemi seçilmedi' };
  }

  // Sipariş durumunu tamamlandı olarak işaretle
  order.status = 'completed';

  // Satış geçmişine ekle (seçilen ödeme yöntemi ile)
  const now = new Date();
  const saleDate = getBusinessDayDateString(now);
  const saleTime = getFormattedTime(now);

  // Yeni satış ID'si
  const saleId = db.sales.length > 0 
    ? Math.max(...db.sales.map(s => s.id)) + 1 
    : 1;

  // Satış itemlarını al
  const orderItems = db.tableOrderItems.filter(oi => oi.order_id === orderId);

  // Staff bilgilerini topla (varsa) - En çok ürün ekleyen personel ana personel olarak kaydedilir
  const staffCounts = {};
  orderItems.forEach(item => {
    if (item.staff_name) {
      if (!staffCounts[item.staff_name]) {
        staffCounts[item.staff_name] = 0;
      }
      staffCounts[item.staff_name] += item.quantity;
    }
  });
  
  // En çok ürün ekleyen personel ana personel
  const mainStaffName = Object.keys(staffCounts).length > 0
    ? Object.keys(staffCounts).reduce((a, b) => staffCounts[a] > staffCounts[b] ? a : b)
    : null;

  // Satış ekle (seçilen ödeme yöntemi ile)
  db.sales.push({
    id: saleId,
    total_amount: order.total_amount,
    payment_method: paymentMethod,
    sale_date: saleDate,
    sale_time: saleTime,
    table_name: order.table_name,
    table_type: order.table_type,
    staff_name: mainStaffName // Ana personel bilgisi
  });

  // Satış itemlarını ekle - Her item için personel bilgisini de kaydet
  orderItems.forEach(item => {
    const itemId = db.saleItems.length > 0 
      ? Math.max(...db.saleItems.map(si => si.id)) + 1 
      : 1;
      
    db.saleItems.push({
      id: itemId,
      sale_id: saleId,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      isGift: item.isGift || false,
      staff_id: item.staff_id || null, // Her ürün için personel bilgisi
      staff_name: item.staff_name || null
    });
  });

  saveDatabase();

  // Firebase'e kaydet
  if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
    try {
      const salesRef = firebaseCollection(firestore, 'sales');
      
      // Items'ı string formatına çevir
      const itemsText = orderItems.map(item => {
        const giftText = item.isGift ? ' (İKRAM)' : '';
        return `${item.product_name} x${item.quantity}${giftText}`;
      }).join(', ');

      // Staff bilgilerini topla (varsa)
      const staffNames = [...new Set(orderItems.filter(oi => oi.staff_name).map(oi => oi.staff_name))];
      const staffName = staffNames.length > 0 ? staffNames.join(', ') : null;

      const tenantInfoComplete = tenantManager.getCurrentTenantInfo();
      const isGeceComplete = tenantInfoComplete?.tenantId === GECE_TENANT_ID;
      await firebaseAddDoc(salesRef, {
        sale_id: saleId,
        total_amount: order.total_amount,
        payment_method: paymentMethod,
        sale_date: saleDate,
        sale_time: saleTime,
        table_name: order.table_name,
        table_type: order.table_type,
        staff_name: staffName,
        order_source: order.order_source || null, // 'Trendyol', 'Yemeksepeti', or null
        items: itemsText,
        items_array: orderItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          price: item.price,
          isGift: item.isGift || false,
          staff_id: item.staff_id || null,
          staff_name: item.staff_name || null // Her item için personel bilgisi
        })),
        created_at: firebaseServerTimestamp(),
        ...(isGeceComplete ? { branch: getGeceBranchLabelForFirebase() || undefined } : {})
      });
      console.log('Masa siparişi Firebase\'e kaydedildi:', saleId);
    } catch (error) {
      console.error('Firebase\'e kaydetme hatası:', error);
    }
  }

  // Yeni Firebase'e masayı boş olarak kaydet (makaramasalar)
  syncSingleTableToFirebase(order.table_id).catch(err => {
    console.error('Masa Firebase kaydetme hatası:', err);
  });

  // Electron renderer process'e güncelleme gönder
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('table-order-updated', { 
      orderId: order.id,
      tableId: order.table_id
    });
  }

  // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder (masa artık boş)
  if (io) {
    io.emit('table-update', {
      tableId: order.table_id,
      hasOrder: false
    });
  }

  return { success: true, saleId };
});

// Kısmi ödeme için masa siparişi tutarını güncelle ve satış kaydı oluştur
ipcMain.handle('update-table-order-amount', async (event, orderId, paidAmount) => {
  const order = db.tableOrders.find(o => o.id === orderId);
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı' };
  }

  if (order.status !== 'pending') {
    return { success: false, error: 'Bu sipariş zaten tamamlanmış veya iptal edilmiş' };
  }

  // Masa siparişi tutarını güncelle (kısmi ödeme düşülür)
  order.total_amount = Math.max(0, order.total_amount - paidAmount);

  // Eğer tutar 0 veya negatifse siparişi tamamlandı olarak işaretle
  if (order.total_amount <= 0.01) {
    order.status = 'completed';
    // Yeni Firebase'e masayı boş olarak kaydet (makaramasalar)
    syncSingleTableToFirebase(order.table_id).catch(err => {
      console.error('Masa Firebase kaydetme hatası:', err);
    });
    
    // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder (masa artık boş)
    if (io) {
      io.emit('table-update', {
        tableId: order.table_id,
        hasOrder: false
      });
    }
  } else {
    // Yeni Firebase'e masayı güncelle (makaramasalar)
    syncSingleTableToFirebase(order.table_id).catch(err => {
      console.error('Masa Firebase kaydetme hatası:', err);
    });
    
    // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder (masa hala dolu)
    if (io) {
      io.emit('table-update', {
        tableId: order.table_id,
        hasOrder: true
      });
    }
  }

  saveDatabase();
  return { success: true, remainingAmount: order.total_amount };
});

// Kısmi ödeme için satış kaydı oluştur
ipcMain.handle('create-partial-payment-sale', async (event, saleData) => {
  const now = new Date();
  const saleDate = getBusinessDayDateString(now);
  const saleTime = getFormattedTime(now);

  // Yeni satış ID'si
  const saleId = db.sales.length > 0 
    ? Math.max(...db.sales.map(s => s.id)) + 1 
    : 1;

  // Satış itemlarını al (kısmi ödeme için tüm ürünleri göster, sadece ödeme yöntemi farklı)
  const orderItems = db.tableOrderItems.filter(oi => oi.order_id === saleData.orderId);

  // Staff bilgilerini topla (varsa) - En çok ürün ekleyen personel ana personel olarak kaydedilir
  const staffCounts = {};
  orderItems.forEach(item => {
    if (item.staff_name) {
      if (!staffCounts[item.staff_name]) {
        staffCounts[item.staff_name] = 0;
      }
      staffCounts[item.staff_name] += item.quantity;
    }
  });
  
  // En çok ürün ekleyen personel ana personel
  const mainStaffName = Object.keys(staffCounts).length > 0
    ? Object.keys(staffCounts).reduce((a, b) => staffCounts[a] > staffCounts[b] ? a : b)
    : null;

  // Satış ekle
  db.sales.push({
    id: saleId,
    total_amount: saleData.totalAmount,
    payment_method: saleData.paymentMethod,
    sale_date: saleDate,
    sale_time: saleTime,
    table_name: saleData.tableName,
    table_type: saleData.tableType,
    staff_name: mainStaffName // Ana personel bilgisi
  });

  // Satış itemlarını ekle - Her item için personel bilgisini de kaydet
  orderItems.forEach(item => {
    const itemId = db.saleItems.length > 0 
      ? Math.max(...db.saleItems.map(si => si.id)) + 1 
      : 1;
    
    db.saleItems.push({
      id: itemId,
      sale_id: saleId,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      isGift: item.isGift || false,
      staff_id: item.staff_id || null, // Her ürün için personel bilgisi
      staff_name: item.staff_name || null
    });
  });

  saveDatabase();

  // Firebase'e kaydet
  if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
    try {
      const salesRef = firebaseCollection(firestore, 'sales');
      
      // Items'ı string formatına çevir
      const itemsText = orderItems.map(item => {
        const giftText = item.isGift ? ' (İKRAM)' : '';
        return `${item.product_name} x${item.quantity}${giftText}`;
      }).join(', ');

      // Staff bilgilerini topla (varsa)
      const staffNames = [...new Set(orderItems.filter(oi => oi.staff_name).map(oi => oi.staff_name))];
      const staffName = staffNames.length > 0 ? staffNames.join(', ') : null;

      const tenantInfoPartial = tenantManager.getCurrentTenantInfo();
      const isGecePartial = tenantInfoPartial?.tenantId === GECE_TENANT_ID;
      await firebaseAddDoc(salesRef, {
        sale_id: saleId,
        total_amount: saleData.totalAmount,
        payment_method: saleData.paymentMethod,
        sale_date: saleDate,
        sale_time: saleTime,
        table_name: saleData.tableName,
        table_type: saleData.tableType,
        staff_name: staffName,
        items: itemsText,
        items_array: orderItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          price: item.price,
          isGift: item.isGift || false,
          staff_id: item.staff_id || null,
          staff_name: item.staff_name || null // Her item için personel bilgisi
        })),
        created_at: firebaseServerTimestamp(),
        ...(isGecePartial ? { branch: getGeceBranchLabelForFirebase() || undefined } : {})
      });
      console.log('Kısmi ödeme satışı Firebase\'e kaydedildi:', saleId);
    } catch (error) {
      console.error('Firebase\'e kaydetme hatası:', error);
    }
  }

  return { success: true, saleId };
});

// Tutar ile ödeme al (Gece Dönercisi TENANT-1769602125250: tutar girerek tüm hesaptan düş)
// Satış kaydı oluşturulur → satış geçmişi ve ciroya dahil edilir.
ipcMain.handle('pay-table-order-by-amount', async (event, orderId, amount, paymentMethod) => {
  const order = db.tableOrders.find(o => o.id === orderId);
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı' };
  }

  if (order.status !== 'pending') {
    return { success: false, error: 'Bu sipariş zaten tamamlanmış veya iptal edilmiş' };
  }

  const payAmount = Number(amount);
  if (isNaN(payAmount) || payAmount <= 0) {
    return { success: false, error: 'Geçerli bir tutar girin' };
  }
  if (payAmount > order.total_amount) {
    return { success: false, error: `Tutar kalan hesaptan (₺${order.total_amount.toFixed(2)}) fazla olamaz` };
  }

  if (!paymentMethod || (paymentMethod !== 'Nakit' && paymentMethod !== 'Kredi Kartı' && paymentMethod !== 'Online')) {
    return { success: false, error: 'Geçerli bir ödeme yöntemi seçin' };
  }

  // Veritabanı dizilerinin varlığını garanti et (satış geçmişi / ciro için gerekli)
  if (!Array.isArray(db.sales)) db.sales = [];
  if (!Array.isArray(db.saleItems)) db.saleItems = [];

  const now = new Date();
  const saleDate = getBusinessDayDateString(now);
  const saleTime = getFormattedTime(now);

  // 1) Önce satış kaydı oluştur (get-sales ve ciro raporları bu kayıtları kullanır)
  const saleId = db.sales.length > 0 ? Math.max(...db.sales.map(s => s.id)) + 1 : 1;
  db.sales.push({
    id: saleId,
    total_amount: payAmount,
    payment_method: paymentMethod,
    sale_date: saleDate,
    sale_time: saleTime,
    table_name: order.table_name,
    table_type: order.table_type,
    staff_name: null,
    order_id: order.id,
    isExpense: false
  });

  const saleItemId = db.saleItems.length > 0 ? Math.max(...db.saleItems.map(si => si.id)) + 1 : 1;
  db.saleItems.push({
    id: saleItemId,
    sale_id: saleId,
    product_id: null,
    product_name: `Tutar ile Ödeme (${paymentMethod})`,
    quantity: 1,
    price: payAmount,
    isGift: false,
    staff_id: null,
    staff_name: null
  });

  // 2) Siparişi güncelle: tutar bazlı ödemeler listesi + kalan bakiye
  if (!Array.isArray(order.amount_payments)) order.amount_payments = [];
  order.amount_payments.push({
    amount: payAmount,
    method: paymentMethod,
    date: now.toLocaleDateString('tr-TR'),
    time: saleTime
  });
  order.total_amount = Math.max(0, order.total_amount - payAmount);

  if (order.total_amount <= 0.01) {
    order.status = 'completed';
    syncSingleTableToFirebase(order.table_id).catch(err => {
      console.error('Masa Firebase kaydetme hatası:', err);
    });
    if (io) io.emit('table-update', { tableId: order.table_id, hasOrder: false });
  } else {
    syncSingleTableToFirebase(order.table_id).catch(err => {
      console.error('Masa Firebase kaydetme hatası:', err);
    });
    if (io) io.emit('table-update', { tableId: order.table_id, hasOrder: true });
  }

  // 3) Tek seferde diske yaz (satış + sipariş güncellemesi birlikte)
  saveDatabase();

  // 4) Firebase senkronizasyonu — Gece Dönercisi: branch daima #Sancak veya #Şeker
  if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
    try {
      const salesRef = firebaseCollection(firestore, 'sales');
      await firebaseAddDoc(salesRef, {
        sale_id: saleId,
        total_amount: payAmount,
        payment_method: paymentMethod,
        sale_date: saleDate,
        sale_time: saleTime,
        table_name: order.table_name,
        table_type: order.table_type,
        staff_name: null,
        items: `Tutar ile Ödeme (${paymentMethod}) x1`,
        items_array: [{
          product_id: null,
          product_name: `Tutar ile Ödeme (${paymentMethod})`,
          quantity: 1,
          price: payAmount,
          isGift: false,
          staff_id: null,
          staff_name: null
        }],
        created_at: firebaseServerTimestamp(),
        branch: getGeceBranchLabelForFirebase() || undefined
      });
    } catch (err) {
      console.error('Firebase tutar ile ödeme kaydetme hatası:', err);
    }
  }

  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('table-order-updated', { orderId: order.id, tableId: order.table_id });
  }
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('sales-updated');
  }

  return { success: true, remainingAmount: order.total_amount, saleId };
});

// Ürün bazlı ödeme al (yeni sistem)
ipcMain.handle('pay-table-order-item', async (event, itemId, paymentMethod, paidQuantity = null) => {
  const item = db.tableOrderItems.find(oi => oi.id === itemId);
  if (!item) {
    return { success: false, error: 'Ürün bulunamadı' };
  }

  const order = db.tableOrders.find(o => o.id === item.order_id);
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı' };
  }

  if (order.status !== 'pending') {
    return { success: false, error: 'Bu sipariş zaten tamamlanmış veya iptal edilmiş' };
  }

  // Ödenecek miktarı belirle
  const quantityToPay = paidQuantity !== null ? paidQuantity : item.quantity;
  
  // Miktar kontrolü
  if (quantityToPay <= 0 || quantityToPay > item.quantity) {
    return { success: false, error: 'Geçersiz miktar' };
  }

  // Ödenmiş miktarı kontrol et
  const currentPaidQuantity = item.paid_quantity || 0;
  const remainingQuantity = item.quantity - currentPaidQuantity;
  
  if (quantityToPay > remainingQuantity) {
    return { success: false, error: `Sadece ${remainingQuantity} adet için ödeme alınabilir` };
  }

  // Yeni ödenen miktar
  const newPaidQuantity = currentPaidQuantity + quantityToPay;

  // Ürün tutarını hesapla (ikram değilse)
  const itemAmount = item.isGift ? 0 : (item.price * quantityToPay);

  // Ödenen miktarı güncelle
  item.paid_quantity = newPaidQuantity;
  
  // Eğer tüm miktar ödendiyse, ürünü tamamen ödendi olarak işaretle
  if (newPaidQuantity >= item.quantity) {
    item.is_paid = true;
  }
  
  // Ödeme yöntemi ve tarih bilgilerini güncelle (ilk ödeme ise)
  if (currentPaidQuantity === 0) {
    item.payment_method = paymentMethod;
    item.paid_date = new Date().toLocaleDateString('tr-TR');
    item.paid_time = getFormattedTime(new Date());
  } else {
    // Kısmi ödemeler için ödeme yöntemlerini birleştir
    item.payment_method = `${item.payment_method}, ${paymentMethod}`;
  }

  // Masa siparişi tutarını güncelle
  order.total_amount = Math.max(0, order.total_amount - itemAmount);

  // Eğer tüm ürünlerin ödemesi alındıysa siparişi tamamlandı olarak işaretle
  const unpaidItems = db.tableOrderItems.filter(oi => {
    if (oi.order_id !== order.id || oi.isGift) return false;
    const paidQty = oi.paid_quantity || 0;
    return paidQty < oi.quantity;
  });
  if (unpaidItems.length === 0) {
    order.status = 'completed';
  }

  saveDatabase();

  // Satış kaydı oluştur (sadece bu ürün için)
  const now = new Date();
  const saleDate = getBusinessDayDateString(now);
  const saleTime = getFormattedTime(now);

  const saleId = db.sales.length > 0 
    ? Math.max(...db.sales.map(s => s.id)) + 1 
    : 1;

  // Satış ekle
  db.sales.push({
    id: saleId,
    total_amount: itemAmount,
    payment_method: paymentMethod,
    sale_date: saleDate,
    sale_time: saleTime,
    table_name: order.table_name,
    table_type: order.table_type,
    staff_name: item.staff_name || null
  });

  // Satış itemını ekle (sadece ödenen miktar için)
  const saleItemId = db.saleItems.length > 0 
    ? Math.max(...db.saleItems.map(si => si.id)) + 1 
    : 1;
    
  db.saleItems.push({
    id: saleItemId,
    sale_id: saleId,
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: quantityToPay, // Ödenen miktar
    price: item.price,
    isGift: item.isGift || false,
    staff_id: item.staff_id || null,
    staff_name: item.staff_name || null
  });

  saveDatabase();

  // Firebase'e kaydet
  if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
    try {
      const salesRef = firebaseCollection(firestore, 'sales');
      
      const itemsText = `${item.product_name} x${quantityToPay}${item.isGift ? ' (İKRAM)' : ''}`;

      const tenantInfoItem = tenantManager.getCurrentTenantInfo();
      const isGeceItem = tenantInfoItem?.tenantId === GECE_TENANT_ID;
      await firebaseAddDoc(salesRef, {
        sale_id: saleId,
        total_amount: itemAmount,
        payment_method: paymentMethod,
        sale_date: saleDate,
        sale_time: saleTime,
        table_name: order.table_name,
        table_type: order.table_type,
        staff_name: item.staff_name || null,
        items: itemsText,
        items_array: [{
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: quantityToPay, // Ödenen miktar
          price: item.price,
          isGift: item.isGift || false,
          staff_id: item.staff_id || null,
          staff_name: item.staff_name || null
        }],
        created_at: firebaseServerTimestamp(),
        ...(isGeceItem ? { branch: getGeceBranchLabelForFirebase() || undefined } : {})
      });
      console.log('Ürün ödemesi Firebase\'e kaydedildi:', saleId);
    } catch (error) {
      console.error('Firebase\'e kaydetme hatası:', error);
    }
  }

  // Electron renderer process'e güncelleme gönder
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('table-order-updated', { 
      orderId: order.id,
      tableId: order.table_id
    });
  }

  // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder
  if (io) {
    io.emit('table-update', {
      tableId: order.table_id,
      hasOrder: order.total_amount > 0
    });
  }

  // Yeni Firebase'e sadece bu masayı kaydet (makaramasalar)
  syncSingleTableToFirebase(order.table_id).catch(err => {
    console.error('Masa Firebase kaydetme hatası:', err);
  });

  return { success: true, remainingAmount: order.total_amount, saleId };
});

// Settings IPC Handlers
ipcMain.handle('change-password', (event, currentPin, newPin) => {
  try {
    // Settings objesini kontrol et ve yoksa oluştur
    if (!db.settings) {
      db.settings = { adminPin: '1234' };
      saveDatabase();
    }
    
    // Mevcut PIN kontrolü
    const currentStoredPin = db.settings.adminPin || '1234';
    if (currentStoredPin !== currentPin) {
      return { success: false, error: 'Mevcut parola hatalı' };
    }
    
    // Yeni PIN validasyonu
    if (!newPin || newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      return { success: false, error: 'Parola 4 haneli rakam olmalıdır' };
    }
    
    // PIN'i güncelle
    db.settings.adminPin = newPin;
    saveDatabase();
    return { success: true };
  } catch (error) {
    console.error('Parola değiştirme hatası:', error);
    return { success: false, error: 'Bir hata oluştu: ' + error.message };
  }
});

ipcMain.handle('get-admin-pin', () => {
  try {
    if (!db.settings) {
      db.settings = { adminPin: '1234' };
      saveDatabase();
    }
    return db.settings.adminPin || '1234';
  } catch (error) {
    console.error('PIN okuma hatası:', error);
    return '1234';
  }
});

// Product Management IPC Handlers
ipcMain.handle('create-product', (event, productData) => {
  const { name, category_id, price, image } = productData;
  
  const newId = db.products.length > 0 
    ? Math.max(...db.products.map(p => p.id)) + 1 
    : 1;
  
  const newProduct = {
    id: newId,
    name,
    category_id,
    price: parseFloat(price),
    image: image || null
  };
  
  db.products.push(newProduct);
  saveDatabase();
  
  // Firebase'e kaydet
  saveProductToFirebase(newProduct).catch(err => {
    console.error('Firebase ürün kaydetme hatası:', err);
  });
  
  // Eğer görsel varsa Firebase'e kaydet
  if (image) {
    // URL kontrolü (http veya https ile başlayan URL'ler)
    const isUrl = image.startsWith('http://') || image.startsWith('https://');
    
    if (isUrl && image.includes('r2.dev') && image.includes('temp_')) {
      // Temp görsel ise
      updateTempImageRecordInFirebase(image, newProduct.id, newProduct.name, newProduct.category_id, newProduct.price).catch(err => {
        console.error('Firebase temp görsel kaydı güncelleme hatası:', err);
      });
    } else if (isUrl) {
      // Normal URL ise (R2 veya başka bir URL)
      updateImageRecordInFirebase(newProduct.id, image, newProduct.name, newProduct.category_id, newProduct.price).catch(err => {
        console.error('Firebase görsel kaydı güncelleme hatası:', err);
      });
    } else if (image.includes('r2.dev') || image.includes('r2.cloudflarestorage.com')) {
      // R2 URL'i ama http/https ile başlamıyorsa (eski format)
      updateImageRecordInFirebase(newProduct.id, image, newProduct.name, newProduct.category_id, newProduct.price).catch(err => {
        console.error('Firebase görsel kaydı güncelleme hatası:', err);
      });
    }
  }
  
  return { success: true, product: newProduct };
});

ipcMain.handle('update-product', async (event, productData) => {
  const { id, name, category_id, price, image, yemeksepeti_price, trendyolgo_price } = productData;
  
  const productIndex = db.products.findIndex(p => p.id === id);
  if (productIndex === -1) {
    return { success: false, error: 'Ürün bulunamadı' };
  }
  
  const oldProduct = db.products[productIndex];
  const oldImage = oldProduct.image;
  const isOldBase64 = oldImage && oldImage.startsWith('data:');
  const isNewBase64 = image && image.startsWith('data:');

  // Eğer görsel değiştiyse ve eski görsel URL (R2/Storage) ise, eski görseli sil (base64 silinmez)
  if (oldImage && oldImage !== image && !isOldBase64 && (oldImage.includes('firebasestorage.googleapis.com') || oldImage.includes('r2.cloudflarestorage.com') || oldImage.includes('r2.dev'))) {
    await deleteImageFromR2(oldImage);
  }
  
  // Platform fiyatlarını güncelle (null, undefined veya sayı olabilir)
  let updatedYemeksepetiPrice = db.products[productIndex].yemeksepeti_price;
  let updatedTrendyolgoPrice = db.products[productIndex].trendyolgo_price;
  
  if (yemeksepeti_price !== undefined) {
    updatedYemeksepetiPrice = yemeksepeti_price !== null && yemeksepeti_price !== '' 
      ? parseFloat(yemeksepeti_price) 
      : null;
  }
  
  if (trendyolgo_price !== undefined) {
    updatedTrendyolgoPrice = trendyolgo_price !== null && trendyolgo_price !== '' 
      ? parseFloat(trendyolgo_price) 
      : null;
  }
  
  db.products[productIndex] = {
    ...db.products[productIndex],
    name,
    category_id,
    price: parseFloat(price),
    image: image || null,
    yemeksepeti_price: updatedYemeksepetiPrice,
    trendyolgo_price: updatedTrendyolgoPrice
  };
  
  saveDatabase();
  
  // Firebase'e kaydet
  saveProductToFirebase(db.products[productIndex]).catch(err => {
    console.error('Firebase ürün güncelleme hatası:', err);
  });
  
  // Base64 değilse (URL ise) images koleksiyonuna kayıt güncelle; base64 doğrudan ürün dokümanında
  if (image && !isNewBase64) {
    const isUrl = image.startsWith('http://') || image.startsWith('https://');
    if (isUrl && image.includes('temp_')) {
      updateTempImageRecordInFirebase(image, id, name, category_id, parseFloat(price)).catch(err => {
        console.error('Firebase temp görsel kaydı güncelleme hatası:', err);
      });
    } else if (isUrl || image.includes('r2.dev') || image.includes('r2.cloudflarestorage.com')) {
      updateImageRecordInFirebase(id, image, name, category_id, parseFloat(price)).catch(err => {
        console.error('Firebase görsel kaydı güncelleme hatası:', err);
      });
    }
  }
  
  return { success: true, product: db.products[productIndex] };
});

// Stok güncelleme IPC handler
ipcMain.handle('adjust-product-stock', async (event, productId, adjustment) => {
  const productIdNum = typeof productId === 'string' ? parseInt(productId) : productId;
  
  const productIndex = db.products.findIndex(p => p.id === productIdNum);
  if (productIndex === -1) {
    return { success: false, error: 'Ürün bulunamadı' };
  }
  
  const product = db.products[productIndex];
  
  // Stok takibini aktif et (eğer henüz aktif değilse)
  if (!product.trackStock) {
    db.products[productIndex] = {
      ...product,
      trackStock: true,
      stock: 0
    };
    product.trackStock = true;
    product.stock = 0;
  }
  
  const currentStock = product.stock !== undefined ? (product.stock || 0) : 0;
  const newStock = Math.max(0, currentStock + adjustment);
  
  // Ürün stokunu güncelle
  db.products[productIndex] = {
    ...product,
    trackStock: true,
    stock: newStock
  };
  
  saveDatabase();
  
  // Firebase'e kaydet (makaramasalar)
  await saveProductStockToFirebase(productIdNum, newStock);
  
  console.log(`✅ Ürün stoku güncellendi: ${product.name} (${currentStock} → ${newStock})`);
  
  // Mobil personel arayüzüne gerçek zamanlı stok güncellemesi gönder
  if (io) {
    io.emit('product-stock-update', {
      productId: productIdNum,
      stock: newStock,
      trackStock: true
    });
  }
  
  return { success: true, product: db.products[productIndex], newStock };
});

// Stok takibini açma/kapama IPC handler
ipcMain.handle('toggle-product-stock-tracking', async (event, productId, trackStock) => {
  const productIdNum = typeof productId === 'string' ? parseInt(productId) : productId;
  
  const productIndex = db.products.findIndex(p => p.id === productIdNum);
  if (productIndex === -1) {
    return { success: false, error: 'Ürün bulunamadı' };
  }
  
  const product = db.products[productIndex];
  
  // Stok takibini aç/kapat
  db.products[productIndex] = {
    ...product,
    trackStock: trackStock === true
  };
  
  // Eğer stok takibi kapatılıyorsa, stok bilgisini sıfırla (opsiyonel)
  if (!trackStock) {
    db.products[productIndex].stock = undefined;
  }
  
  saveDatabase();
  
  console.log(`✅ Ürün stok takibi ${trackStock ? 'açıldı' : 'kapatıldı'}: ${product.name}`);
  
  // Mobil personel arayüzüne gerçek zamanlı stok güncellemesi gönder
  if (io) {
    const currentStock = db.products[productIndex].stock !== undefined ? (db.products[productIndex].stock || 0) : 0;
    io.emit('product-stock-update', {
      productId: productIdNum,
      stock: trackStock ? currentStock : null,
      trackStock: trackStock
    });
  }
  
  return { success: true, product: db.products[productIndex] };
});

// Mevcut tüm ürünler için Firebase'de image kaydı oluştur
ipcMain.handle('create-image-records-for-all-products', async (event) => {
  if (!firestore || !firebaseCollection || !firebaseGetDocs || !firebaseAddDoc || !firebaseServerTimestamp) {
    return { success: false, error: 'Firebase başlatılamadı' };
  }
  
  try {
    console.log('🔄 Tüm ürünler için Firebase image kayıtları oluşturuluyor...');
    
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Mevcut images koleksiyonunu çek
    const imagesRef = firebaseCollection(firestore, 'images');
    const imagesSnapshot = await firebaseGetDocs(imagesRef);
    
    // Mevcut product_id'leri topla
    const existingProductIds = new Set();
    imagesSnapshot.forEach((doc) => {
      const imageData = doc.data();
      if (imageData.product_id) {
        existingProductIds.add(imageData.product_id);
      }
    });
    
    // Tüm ürünleri işle
    for (const product of db.products) {
      // Eğer bu ürün için zaten image kaydı varsa atla
      if (existingProductIds.has(product.id)) {
        skippedCount++;
        continue;
      }
      
      // Eğer ürünün görseli yoksa atla
      if (!product.image) {
        skippedCount++;
        continue;
      }
      
      try {
        // URL'den path'i çıkar
        let filePath = '';
        try {
          if (product.image.includes('/images/')) {
            const urlParts = product.image.split('/images/');
            if (urlParts.length > 1) {
              filePath = `images/${urlParts[1]}`;
            }
          } else {
            const urlModule = require('url');
            try {
              const urlObj = new urlModule.URL(product.image);
              filePath = urlObj.pathname.substring(1) || product.image;
            } catch (urlError) {
              filePath = product.image;
            }
          }
        } catch (error) {
          filePath = product.image;
        }
        
        // Firebase'e kaydet
        await firebaseAddDoc(imagesRef, {
          product_id: product.id,
          category_id: product.category_id || null,
          product_name: product.name || null,
          product_price: product.price || null,
          url: product.image,
          path: filePath || product.image,
          uploaded_at: firebaseServerTimestamp(),
          created_at: new Date().toISOString()
        });
        
        createdCount++;
        console.log(`✅ Image kaydı oluşturuldu: ${product.name} (ID: ${product.id})`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Image kaydı oluşturulamadı (${product.name}):`, error.message);
      }
    }
    
    console.log(`✅ Image kayıtları oluşturma tamamlandı: ${createdCount} oluşturuldu, ${skippedCount} atlandı, ${errorCount} hata`);
    
    return { 
      success: true, 
      created: createdCount, 
      skipped: skippedCount, 
      errors: errorCount 
    };
  } catch (error) {
    console.error('❌ Image kayıtları oluşturma hatası:', error);
    return { success: false, error: error.message };
  }
});

// Firebase'den images koleksiyonunu çek
ipcMain.handle('get-firebase-images', async (event) => {
  if (!firestore || !firebaseCollection || !firebaseGetDocs) {
    return { success: false, error: 'Firebase başlatılamadı', images: [] };
  }
  
  try {
    const imagesRef = firebaseCollection(firestore, 'images');
    const snapshot = await firebaseGetDocs(imagesRef);
    
    const images = [];
    snapshot.forEach((doc) => {
      const imageData = doc.data();
      images.push({
        id: doc.id,
        product_id: imageData.product_id || null,
        category_id: imageData.category_id || null,
        product_name: imageData.product_name || null,
        product_price: imageData.product_price || null,
        url: imageData.url || '',
        path: imageData.path || '',
        uploaded_at: imageData.uploaded_at ? imageData.uploaded_at.toDate().toISOString() : null,
        created_at: imageData.created_at || null
      });
    });
    
    // URL'e göre sırala
    images.sort((a, b) => {
      if (a.product_name && b.product_name) {
        return a.product_name.localeCompare(b.product_name);
      }
      return (a.url || '').localeCompare(b.url || '');
    });
    
    return { success: true, images };
  } catch (error) {
    console.error('❌ Firebase images çekme hatası:', error);
    return { success: false, error: error.message, images: [] };
  }
});

// Ürün stokunu getir (Firebase'den)
ipcMain.handle('get-product-stock', async (event, productId) => {
  const productIdNum = typeof productId === 'string' ? parseInt(productId) : productId;
  
  const product = db.products.find(p => p.id === productIdNum);
  if (!product) {
    return { success: false, error: 'Ürün bulunamadı' };
  }
  
  // Önce local'den kontrol et
  if (product.stock !== undefined) {
    return { success: true, stock: product.stock || 0 };
  }
  
  // Firebase'den çek
  const firebaseStock = await getProductStockFromFirebase(productIdNum);
  if (firebaseStock !== null) {
    // Local'e kaydet
    const productIndex = db.products.findIndex(p => p.id === productIdNum);
    if (productIndex !== -1) {
      db.products[productIndex] = {
        ...product,
        stock: firebaseStock
      };
      saveDatabase();
    }
    return { success: true, stock: firebaseStock };
  }
  
  return { success: true, stock: 0 };
});

// Kategori bazında toplu "kalmadı" işaretleme IPC handler
ipcMain.handle('mark-category-out-of-stock', async (event, categoryId) => {
  const categoryIdNum = typeof categoryId === 'string' ? parseInt(categoryId) : categoryId;
  
  // Kategorideki tüm ürünleri bul
  const categoryProducts = db.products.filter(p => p.category_id === categoryIdNum);
  
  if (categoryProducts.length === 0) {
    return { success: false, error: 'Bu kategoride ürün bulunamadı' };
  }
  
  const updatedProducts = [];
  
  // Her ürün için stok takibini aç ve stoku 0 yap
  for (const product of categoryProducts) {
    const productIndex = db.products.findIndex(p => p.id === product.id);
    if (productIndex !== -1) {
      // Stok takibini aç ve stoku 0 yap
      db.products[productIndex] = {
        ...product,
        trackStock: true,
        stock: 0
      };
      
      // Firebase'e kaydet
      await saveProductStockToFirebase(product.id, 0);
      
      updatedProducts.push(db.products[productIndex]);
      
      // Mobil personel arayüzüne gerçek zamanlı stok güncellemesi gönder
      if (io) {
        io.emit('product-stock-update', {
          productId: product.id,
          stock: 0,
          trackStock: true
        });
      }
    }
  }
  
  saveDatabase();
  
  console.log(`✅ Kategori "kalmadı" olarak işaretlendi: ${categoryProducts.length} ürün güncellendi`);
  
  return { 
    success: true, 
    updatedCount: updatedProducts.length,
    products: updatedProducts 
  };
});

ipcMain.handle('delete-product', async (event, productId) => {
  // productId'yi number'a çevir (tip uyumluluğu için)
  const productIdNum = typeof productId === 'string' ? parseInt(productId) : productId;
  
  const productIndex = db.products.findIndex(p => p.id === productIdNum);
  if (productIndex === -1) {
    console.error(`❌ Ürün bulunamadı: ID=${productIdNum} (tip: ${typeof productIdNum})`);
    console.error('Mevcut ürün ID\'leri:', db.products.map(p => ({ id: p.id, name: p.name })));
    return { success: false, error: 'Ürün bulunamadı' };
  }
  
  const product = db.products[productIndex];
  console.log(`🗑️ Ürün siliniyor: ${product.name} (ID: ${productIdNum})`);
  
  // Eğer ürünün Firebase Storage'da görseli varsa, onu da sil
  if (product.image && (product.image.includes('firebasestorage.googleapis.com') || product.image.includes('r2.cloudflarestorage.com') || product.image.includes('r2.dev'))) {
    try {
      await deleteImageFromR2(product.image);
      console.log(`✅ Ürün görseli R2'den silindi`);
    } catch (error) {
      console.error('⚠️ Görsel silme hatası (devam ediliyor):', error.message);
    }
  }
  
  // Local database'den sil
  db.products.splice(productIndex, 1);
  saveDatabase();
  console.log(`✅ Ürün local database'den silindi: ${product.name}`);
  
  // Firebase'den ürünü sil
  if (firestore && firebaseDoc && firebaseDeleteDoc) {
    try {
      // Hem string hem number ID'yi dene
      let productRef = firebaseDoc(firestore, 'products', productIdNum.toString());
      try {
        await firebaseDeleteDoc(productRef);
        console.log(`✅ Ürün Firebase'den silindi: ${product.name} (ID: ${productIdNum})`);
      } catch (error) {
        // Eğer string ID ile bulunamazsa, number ID ile dene
        if (error.code === 'not-found' || error.message?.includes('not found')) {
          console.warn(`⚠️ String ID ile bulunamadı, number ID deneniyor...`);
          productRef = firebaseDoc(firestore, 'products', productIdNum.toString());
          await firebaseDeleteDoc(productRef);
          console.log(`✅ Ürün Firebase'den silindi (number ID ile): ${product.name}`);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('❌ Firebase\'den ürün silme hatası:', error);
      console.error('Hata detayları:', error.message, error.code);
      // Hata olsa bile local'den silindi, devam et
      // Ama kullanıcıya bilgi ver
      return { 
        success: true, 
        warning: 'Ürün local database\'den silindi ancak Firebase\'den silinirken bir hata oluştu. Lütfen Firebase\'i kontrol edin.' 
      };
    }
  } else {
    console.warn('⚠️ Firebase başlatılamadı, ürün sadece local database\'den silindi');
  }
  
  console.log(`✅ Ürün başarıyla silindi: ${product.name}`);
  return { success: true };
});

// Cloudflare R2'ye görsel yükleme fonksiyonu
async function uploadImageToR2(filePath, productId = null) {
  try {
    // Dosyayı oku
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const fileExt = path.extname(fileName);
    
    // MIME type belirle
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    const contentType = mimeTypes[fileExt.toLowerCase()] || 'image/jpeg';
    
    // Benzersiz dosya adı oluştur (ürün ID + timestamp)
    const timestamp = Date.now();
    const uniqueFileName = productId 
      ? `images/products/${productId}_${timestamp}${fileExt}`
      : `images/products/temp_${timestamp}${fileExt}`;
    
    // R2'ye yükle
    const command = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: uniqueFileName,
      Body: fileBuffer,
      ContentType: contentType,
      // Public read için ACL (R2'de public bucket ise gerekli olmayabilir)
    });
    
    await r2Client.send(command);
    console.log(`✅ Görsel R2'ye yüklendi: ${uniqueFileName}`);
    
    // Public URL oluştur
    // R2.dev subdomain formatı: https://pub-{subdomain-id}.r2.dev/path
    // Eğer custom domain varsa onu kullan, yoksa R2.dev public subdomain kullan
    // Not: R2.dev subdomain Cloudflare dashboard'dan etkinleştirilmiş olmalı
    let publicUrl;
    if (R2_CONFIG.publicUrl) {
      publicUrl = `${R2_CONFIG.publicUrl}/${uniqueFileName}`;
    } else if (R2_CONFIG.publicSubdomainId) {
      // Doğru R2.dev public subdomain formatı: pub-{subdomain-id}.r2.dev
      publicUrl = `https://${R2_CONFIG.publicSubdomainId}.r2.dev/${uniqueFileName}`;
    } else {
      // Fallback: eski format (kullanılmamalı)
      publicUrl = `https://${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.dev/${uniqueFileName}`;
    }
    
    console.log(`✅ Görsel URL oluşturuldu: ${publicUrl}`);
    
    // Firebase Firestore'a images koleksiyonuna kaydet (ürün bilgileriyle birlikte)
    if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp && productId) {
      try {
        // Ürün bilgilerini local database'den al
        const product = db.products.find(p => p.id === productId);
        
        if (product) {
          const imagesRef = firebaseCollection(firestore, 'images');
          await firebaseAddDoc(imagesRef, {
            product_id: productId,
            category_id: product.category_id || null,
            product_name: product.name || null,
            product_price: product.price || null,
            url: publicUrl,
            path: uniqueFileName,
            uploaded_at: firebaseServerTimestamp(),
            created_at: new Date().toISOString()
          });
          console.log(`✅ Görsel URL Firebase database'e kaydedildi (images koleksiyonu) - Ürün: ${product.name}`);
        } else {
          // Ürün bulunamadıysa sadece temel bilgileri kaydet
          const imagesRef = firebaseCollection(firestore, 'images');
          await firebaseAddDoc(imagesRef, {
            product_id: productId,
            category_id: null,
            product_name: null,
            product_price: null,
            url: publicUrl,
            path: uniqueFileName,
            uploaded_at: firebaseServerTimestamp(),
            created_at: new Date().toISOString()
          });
          console.log(`✅ Görsel URL Firebase database'e kaydedildi (images koleksiyonu) - Ürün bilgisi bulunamadı`);
        }
      } catch (firebaseError) {
        console.warn('⚠️ Firebase database kayıt hatası (devam ediliyor):', firebaseError.message);
      }
    } else if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
      // productId yoksa (temp görsel) sadece URL'yi kaydet
      try {
        const imagesRef = firebaseCollection(firestore, 'images');
        await firebaseAddDoc(imagesRef, {
          product_id: null,
          category_id: null,
          product_name: null,
          product_price: null,
          url: publicUrl,
          path: uniqueFileName,
          uploaded_at: firebaseServerTimestamp(),
          created_at: new Date().toISOString()
        });
        console.log(`✅ Görsel URL Firebase database'e kaydedildi (images koleksiyonu) - Geçici görsel`);
      } catch (firebaseError) {
        console.warn('⚠️ Firebase database kayıt hatası (devam ediliyor):', firebaseError.message);
      }
    }
    
    return publicUrl;
  } catch (error) {
    console.error('❌ R2 yükleme hatası:', error);
    throw error;
  }
}

// 0 maliyet yaklaşım: görseli küçültüp dataURL olarak döndür (Firestore'a direkt yazılabilir)
// Firestore doküman limiti için görseli küçük tutuyoruz (WebP ~512px).
async function convertImageFileToInlineDataUrl(filePath) {
  // rotate(): EXIF orientation düzeltmesi
  // withoutEnlargement: küçük görselleri büyütmez
  const base = sharp(filePath).rotate().resize({
    width: 512,
    height: 512,
    fit: 'inside',
    withoutEnlargement: true
  });

  // Kaliteyi adaptif düşür (çok büyükse)
  let quality = 72;
  let buffer = await base.webp({ quality }).toBuffer();
  const targetBytes = 220 * 1024; // ~220KB hedef (güvenli)
  while (buffer.length > targetBytes && quality > 46) {
    quality -= 8;
    buffer = await base.webp({ quality }).toBuffer();
  }

  // Hala çok büyükse bir kez daha küçült
  if (buffer.length > 420 * 1024) {
    const smaller = sharp(filePath).rotate().resize({
      width: 420,
      height: 420,
      fit: 'inside',
      withoutEnlargement: true
    });
    quality = Math.min(quality, 60);
    buffer = await smaller.webp({ quality }).toBuffer();
  }

  return {
    dataUrl: `data:image/webp;base64,${buffer.toString('base64')}`,
    bytes: buffer.length,
    format: 'webp',
    quality
  };
}

// Firebase images koleksiyonunda görsel kaydını güncelle (ürün güncellendiğinde)
async function updateImageRecordInFirebase(productId, imageUrl, productName, categoryId, productPrice) {
  if (!firestore || !firebaseCollection || !firebaseGetDocs || !firebaseDoc || !firebaseSetDoc) {
    return;
  }
  
  try {
    const imagesRef = firebaseCollection(firestore, 'images');
    const snapshot = await firebaseGetDocs(imagesRef);
    
    // Bu URL için görsel kaydı var mı kontrol et (product_id veya URL ile)
    let imageDocFound = null;
    snapshot.forEach((doc) => {
      const imageData = doc.data();
      // URL eşleşiyorsa veya aynı ürün için başka bir görsel varsa
      if (imageData.url === imageUrl || (imageData.product_id === productId && imageData.url !== imageUrl)) {
        imageDocFound = { docId: doc.id, data: imageData };
      }
    });
    
    if (imageDocFound) {
      // Mevcut kaydı güncelle
      const imageDocRef = firebaseDoc(firestore, 'images', imageDocFound.docId);
      await firebaseSetDoc(imageDocRef, {
        ...imageDocFound.data,
        product_id: productId,
        category_id: categoryId,
        product_name: productName,
        product_price: productPrice,
        url: imageUrl,
        updated_at: firebaseServerTimestamp()
      }, { merge: true });
      console.log(`✅ Görsel kaydı Firebase'de güncellendi - Ürün: ${productName}`);
    } else {
      // Kayıt yoksa yeni kayıt ekle
      // URL'den path'i çıkar
      let filePath = '';
      try {
        if (imageUrl.includes('/images/')) {
          const urlParts = imageUrl.split('/images/');
          if (urlParts.length > 1) {
            filePath = `images/${urlParts[1]}`;
          }
        } else {
          const urlModule = require('url');
          try {
            const urlObj = new urlModule.URL(imageUrl);
            filePath = urlObj.pathname.substring(1) || imageUrl;
          } catch (urlError) {
            // URL parse edilemezse, URL'in kendisini path olarak kullan
            filePath = imageUrl;
          }
        }
      } catch (error) {
        // Hata durumunda URL'in kendisini path olarak kullan
        filePath = imageUrl;
      }
      
      // Path boş değilse kaydet
      await firebaseAddDoc(imagesRef, {
        product_id: productId,
        category_id: categoryId,
        product_name: productName,
        product_price: productPrice,
        url: imageUrl,
        path: filePath || imageUrl,
        uploaded_at: firebaseServerTimestamp(),
        created_at: new Date().toISOString()
      });
      console.log(`✅ Görsel kaydı Firebase'e eklendi - Ürün: ${productName}`);
    }
  } catch (firebaseError) {
    console.warn('⚠️ Firebase görsel kaydı güncelleme hatası (devam ediliyor):', firebaseError.message);
  }
}

// Temp görsel kaydını güncelle (ürün oluşturulduğunda temp görseli gerçek ürün görseline dönüştür)
async function updateTempImageRecordInFirebase(imageUrl, productId, productName, categoryId, productPrice) {
  if (!firestore || !firebaseCollection || !firebaseGetDocs || !firebaseDoc || !firebaseSetDoc) {
    return;
  }
  
  try {
    const imagesRef = firebaseCollection(firestore, 'images');
    const snapshot = await firebaseGetDocs(imagesRef);
    
    // Bu URL için temp görsel kaydı var mı kontrol et
    let tempImageDocFound = null;
    snapshot.forEach((doc) => {
      const imageData = doc.data();
      // URL eşleşiyorsa ve product_id null ise (temp görsel)
      if (imageData.url === imageUrl && (imageData.product_id === null || imageData.path.includes('temp_'))) {
        tempImageDocFound = { docId: doc.id, data: imageData };
      }
    });
    
    if (tempImageDocFound) {
      // Temp görsel kaydını güncelle
      const imageDocRef = firebaseDoc(firestore, 'images', tempImageDocFound.docId);
      await firebaseSetDoc(imageDocRef, {
        ...tempImageDocFound.data,
        product_id: productId,
        category_id: categoryId,
        product_name: productName,
        product_price: productPrice,
        updated_at: firebaseServerTimestamp()
      }, { merge: true });
      console.log(`✅ Temp görsel kaydı Firebase'de güncellendi - Ürün: ${productName} (ID: ${productId})`);
    } else {
      // Temp görsel kaydı bulunamadıysa yeni kayıt oluştur
      let filePath = '';
      try {
        if (imageUrl.includes('/images/')) {
          const urlParts = imageUrl.split('/images/');
          if (urlParts.length > 1) {
            filePath = `images/${urlParts[1]}`;
          }
        } else {
          const urlModule = require('url');
          try {
            const urlObj = new urlModule.URL(imageUrl);
            filePath = urlObj.pathname.substring(1) || imageUrl;
          } catch (urlError) {
            // URL parse edilemezse, URL'in kendisini path olarak kullan
            filePath = imageUrl;
          }
        }
      } catch (error) {
        // Hata durumunda URL'in kendisini path olarak kullan
        filePath = imageUrl;
      }
      
      await firebaseAddDoc(imagesRef, {
        product_id: productId,
        category_id: categoryId,
        product_name: productName,
        product_price: productPrice,
        url: imageUrl,
        path: filePath || imageUrl,
        uploaded_at: firebaseServerTimestamp(),
        created_at: new Date().toISOString()
      });
      console.log(`✅ Görsel kaydı Firebase'e eklendi - Ürün: ${productName} (ID: ${productId})`);
    }
  } catch (firebaseError) {
    console.warn('⚠️ Firebase temp görsel kaydı güncelleme hatası (devam ediliyor):', firebaseError.message);
  }
}

// R2'den görsel silme fonksiyonu
async function deleteImageFromR2(imageURL) {
  if (!imageURL || typeof imageURL !== 'string') {
    return;
  }

  try {
    // URL'den dosya yolunu çıkar
    // R2 URL formatları:
    // https://makara.public.r2.dev/images/products/123_timestamp.jpg
    // https://account-id.r2.cloudflarestorage.com/bucket/images/products/123_timestamp.jpg
    let filePath = '';
    
    if (imageURL.includes('/images/')) {
      // Public domain veya custom domain kullanılıyorsa
      const urlParts = imageURL.split('/images/');
      if (urlParts.length > 1) {
        filePath = `images/${urlParts[1]}`;
      }
    } else if (imageURL.includes(R2_CONFIG.bucketName)) {
      // R2 endpoint kullanılıyorsa
      const urlParts = imageURL.split(`/${R2_CONFIG.bucketName}/`);
      if (urlParts.length > 1) {
        filePath = urlParts[1].split('?')[0]; // Query string'i temizle
      }
    }
    
    if (!filePath) {
      console.warn('⚠️ Geçersiz R2 URL formatı:', imageURL);
      return;
    }
    
    // R2'den sil
    const command = new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: filePath,
    });
    
    await r2Client.send(command);
    console.log(`✅ Görsel R2'den silindi: ${filePath}`);
    
    // Firebase Firestore'dan da sil (images koleksiyonu)
    if (firestore && firebaseCollection && firebaseGetDocs && firebaseDeleteDoc && firebaseDoc) {
      try {
        const imagesRef = firebaseCollection(firestore, 'images');
        const snapshot = await firebaseGetDocs(imagesRef);
        
        const deletePromises = [];
        snapshot.forEach((doc) => {
          const imageData = doc.data();
          if (imageData.url === imageURL || imageData.path === filePath) {
            const imageDocRef = firebaseDoc(firestore, 'images', doc.id);
            deletePromises.push(firebaseDeleteDoc(imageDocRef));
          }
        });
        
        if (deletePromises.length > 0) {
          await Promise.all(deletePromises);
          console.log(`✅ Görsel Firebase database'den silindi (images koleksiyonu)`);
        }
      } catch (firebaseError) {
        console.warn('⚠️ Firebase database silme hatası (devam ediliyor):', firebaseError.message);
      }
    }
  } catch (error) {
    console.error('❌ R2 silme hatası:', error);
    // Hata olsa bile devam et, kritik değil
  }
}

// File selection handler
ipcMain.handle('select-image-file', async (event, productId = null) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Görsel Seç',
      filters: [
        { name: 'Resim Dosyaları', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'Tüm Dosyalar', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    if (!filePath) {
      return { success: false, error: 'Dosya seçilmedi' };
    }

    // Dosya var mı kontrol et
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Dosya bulunamadı' };
    }

    // Görseli base64 (data URL) olarak döndür; Firestore'da image alanına kaydedilir, Firebase'den aynı formatta çekilir
    const converted = await convertImageFileToInlineDataUrl(filePath);
    const dataUrl = converted.dataUrl;

    // Düzenleme modunda (productId verildiyse) anında kaydet
    if (productId != null) {
      const productIdNum = typeof productId === 'string' ? parseInt(productId, 10) : productId;
      const idx = db.products.findIndex(p => p.id === productIdNum);
      if (idx !== -1) {
        db.products[idx] = { ...db.products[idx], image: dataUrl };
        saveDatabase();
        saveProductToFirebase(db.products[idx]).catch(err => {
          console.error('Firebase ürün (base64 görsel) güncelleme hatası:', err);
        });
      }
    }

    return {
      success: true,
      path: dataUrl,
      isInlineDataUrl: true,
      bytes: converted.bytes,
      format: converted.format,
      quality: converted.quality,
      autoSaved: productId != null
    };

  } catch (error) {
    console.error('Dosya seçme hatası:', error);
    return { success: false, error: error.message };
  }
});

// Auto Updater Configuration
autoUpdater.autoDownload = false; // Otomatik indirme kapalı - kullanıcı manuel indirecek
autoUpdater.autoInstallOnAppQuit = false; // Otomatik kurulum kapalı

// Log dosyası oluştur
const logPath = path.join(app.getPath('userData'), 'update-log.txt');

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, logMessage, 'utf8');
    console.log(message); // Console'a da yaz
  } catch (error) {
    console.error('Log yazma hatası:', error);
  }
}

// GitHub update server URL'ini manuel olarak ayarla
if (app.isPackaged) {
  const feedURL = {
    provider: 'github',
    owner: 'ErolEmirhan',
    repo: 'DROJE-ADISYON'
  };
  autoUpdater.setFeedURL(feedURL);
  writeLog(`Auto-updater yapılandırıldı: ${feedURL.owner}/${feedURL.repo}`);
  writeLog(`Update URL: https://github.com/${feedURL.owner}/${feedURL.repo}/releases/latest/download/latest.yml`);
  writeLog(`Mevcut uygulama versiyonu: ${app.getVersion()}`);
}

// Update event handlers
autoUpdater.on('checking-for-update', () => {
  const msg = `Güncelleme kontrol ediliyor... (Mevcut: ${app.getVersion()})`;
  writeLog(msg);
  console.log('🔍 Güncelleme kontrol ediliyor...');
});

autoUpdater.on('update-available', (info) => {
  const msg = `Yeni güncelleme mevcut: ${info.version} - Kullanıcıdan indirme onayı bekleniyor...`;
  writeLog(msg);
  console.log('📥 Yeni güncelleme bulundu:', info);
  console.log('📥 Güncelleme detayları:', JSON.stringify(info, null, 2));
  
  // Tüm pencerelere bildir (launcher dahil)
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
    console.log('✅ Ana pencereye güncelleme bildirimi gönderildi');
  }
  // Tüm BrowserWindow'lara gönder (launcher için)
  const windows = BrowserWindow.getAllWindows();
  console.log(`📤 ${windows.length} pencere bulundu, güncelleme bildirimi gönderiliyor...`);
  windows.forEach((win, index) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-available', info);
      console.log(`✅ Pencere ${index + 1}'e güncelleme bildirimi gönderildi`);
    }
  });
});

autoUpdater.on('update-not-available', (info) => {
  const currentVersion = app.getVersion();
  const msg = `Güncelleme yok - Mevcut versiyon: ${currentVersion}, En son sürüm: ${info.version || currentVersion}`;
  writeLog(msg);
  console.log('✅ En güncel versiyonu kullanıyorsunuz:', currentVersion);
  console.log('📋 Güncelleme bilgisi:', JSON.stringify(info, null, 2));
  
  // Tüm pencerelere bildir (launcher dahil)
  const windows = BrowserWindow.getAllWindows();
  console.log(`📤 ${windows.length} pencere bulundu, güncelleme yok bildirimi gönderiliyor...`);
  windows.forEach((win, index) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-not-available', info);
      console.log(`✅ Pencere ${index + 1}'e güncelleme yok bildirimi gönderildi`);
    }
  });
});

autoUpdater.on('error', (err) => {
  const msg = `Güncelleme hatası: ${err.message || err}`;
  writeLog(msg);
  console.error('❌ Güncelleme hatası:', err);
  
  // Tüm pencerelere bildir (launcher dahil)
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err.message || err.toString());
  }
  // Tüm BrowserWindow'lara gönder (launcher için)
  BrowserWindow.getAllWindows().forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-error', err.message || err.toString());
    }
  });
});

autoUpdater.on('download-progress', (progressObj) => {
  // Tüm pencerelere bildir (launcher dahil)
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
  // Tüm BrowserWindow'lara gönder (launcher için)
  BrowserWindow.getAllWindows().forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-download-progress', progressObj);
    }
  });
});

autoUpdater.on('update-downloaded', (info) => {
  const msg = `Güncelleme indirildi: ${info.version} - Kullanıcıdan kurulum onayı bekleniyor...`;
  writeLog(msg);
  console.log('✅ Güncelleme indirildi:', info.version);
  
  // Tüm pencerelere bildir (launcher dahil)
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
  // Tüm BrowserWindow'lara gönder (launcher için)
  BrowserWindow.getAllWindows().forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-downloaded', info);
    }
  });
  // Otomatik kurulum yapılmıyor - kullanıcı manuel olarak kurulum yapacak
});

// IPC Handlers for update
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    writeLog('Development modunda güncelleme kontrol edilemez');
    return { available: false, message: 'Development modunda güncelleme kontrol edilemez' };
  }
  try {
    writeLog('Güncelleme kontrolü başlatılıyor...');
    const result = await autoUpdater.checkForUpdates();
    writeLog(`Güncelleme kontrolü tamamlandı. Result: ${JSON.stringify(result)}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error.message || error.toString();
    writeLog(`Güncelleme kontrolü hatası: ${errorMsg}`);
    console.error('Güncelleme kontrolü hatası:', error);
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  // isSilent: true = Windows dialog'unu gösterme, direkt yükle
  // isForceRunAfter: true = Yüklemeden sonra otomatik çalıştır
  autoUpdater.quitAndInstall(true, true);
});

// Print Receipt Handler
ipcMain.handle('print-receipt', async (event, receiptData) => {
  console.log('\n=== YAZDIRMA İŞLEMİ BAŞLADI ===');
  console.log('📄 ReceiptData:', JSON.stringify(receiptData, null, 2));
  
  try {
    if (!mainWindow) {
      console.error('❌ Ana pencere bulunamadı');
      return { success: false, error: 'Ana pencere bulunamadı' };
    }

    // CashierOnly kontrolü - eğer sadece kasa yazıcısından yazdırılacaksa kategori bazlı yazdırma yapma
    const cashierOnly = receiptData.cashierOnly || false;
    
    if (cashierOnly) {
      console.log('\n💰 SADECE KASA YAZICISI MODU');
      console.log('   Kategori bazlı yazdırma atlanıyor, sadece kasa yazıcısından yazdırılacak');
      
      // Kasa yazıcısını kontrol et
      const cashierPrinter = db.settings.cashierPrinter;
      
      if (!cashierPrinter || !cashierPrinter.printerName) {
        console.error('   ❌ Kasa yazıcısı ayarlanmamış!');
        return { success: false, error: 'Kasa yazıcısı ayarlanmamış. Lütfen ayarlardan kasa yazıcısı seçin.' };
      }
      
      console.log(`   ✓ Kasa yazıcısı bulundu: "${cashierPrinter.printerName}" (${cashierPrinter.printerType})`);
      
      // Tüm ürünlerin toplam tutarını hesapla (ikram edilenler hariç)
      const totalAmount = receiptData.items.reduce((sum, item) => {
        if (item.isGift) return sum;
        return sum + (item.price * item.quantity);
      }, 0);
      
      const cashierReceiptData = {
        ...receiptData,
        items: receiptData.items, // TÜM ürünler
        totalAmount: totalAmount
      };
      
      console.log(`   🖨️ Kasa yazıcısına yazdırılıyor: "${cashierPrinter.printerName}"`);
      console.log(`   Toplam ${receiptData.items.length} ürün, Toplam tutar: ₺${totalAmount.toFixed(2)}`);
      
      const result = await printToPrinter(
        cashierPrinter.printerName, 
        cashierPrinter.printerType, 
        cashierReceiptData, 
        false, // isProductionReceipt = false (tam fiş)
        null
      );
      
      if (result.success) {
        console.log(`   ✅ Fiş yazdırma başarılı`);
        return { success: true, results: [result], error: null };
      } else {
        console.error(`   ❌ Fiş yazdırma başarısız: ${result.error}`);
        return { success: false, error: result.error, results: [result] };
      }
    }
    
    // 1. ReceiptData içindeki item'ları kategorilere göre grupla
    console.log('\n📦 Ürünler kategorilere göre gruplanıyor...');
    const items = receiptData.items || [];
    console.log(`   Toplam ${items.length} ürün bulundu`);
    
    // Her item için kategori bilgisini bul
    const categoryItemsMap = new Map(); // category_id -> items[]
    
    for (const item of items) {
      // Item içinde category_id var mı kontrol et
      let categoryId = item.category_id;
      
      // Eğer yoksa, ürün bilgisinden al
      if (!categoryId && item.id) {
        const product = db.products.find(p => p.id === item.id);
        if (product) {
          categoryId = product.category_id;
          console.log(`   Ürün "${item.name}" için kategori ID bulundu: ${categoryId}`);
        }
      }
      
      // Eğer hala yoksa, ürün adına göre bul
      if (!categoryId) {
        const product = db.products.find(p => p.name === item.name);
        if (product) {
          categoryId = product.category_id;
          console.log(`   Ürün adından kategori ID bulundu: ${categoryId}`);
        }
      }
      
      if (categoryId) {
        if (!categoryItemsMap.has(categoryId)) {
          categoryItemsMap.set(categoryId, []);
        }
        categoryItemsMap.get(categoryId).push(item);
        console.log(`   ✓ "${item.name}" -> Kategori ID: ${categoryId}`);
      } else {
        console.warn(`   ⚠️ "${item.name}" için kategori bulunamadı, varsayılan yazıcı kullanılacak`);
        // Kategori bulunamazsa, özel bir key kullan
        if (!categoryItemsMap.has('no-category')) {
          categoryItemsMap.set('no-category', []);
        }
        categoryItemsMap.get('no-category').push(item);
      }
    }
    
    console.log(`\n📋 Kategori grupları oluşturuldu: ${categoryItemsMap.size} kategori`);
    categoryItemsMap.forEach((items, categoryId) => {
      console.log(`   - Kategori ID ${categoryId}: ${items.length} ürün`);
    });
    
    // 2. Kasa yazıcısını kontrol et
    console.log('\n💰 Kasa yazıcısı kontrol ediliyor...');
    const cashierPrinter = db.settings.cashierPrinter;
    
    if (cashierPrinter && cashierPrinter.printerName) {
      console.log(`   ✓ Kasa yazıcısı bulundu: "${cashierPrinter.printerName}" (${cashierPrinter.printerType})`);
    } else {
      console.log(`   ⚠️ Kasa yazıcısı ayarlanmamış`);
    }
    
    // 3. Her kategori için atanmış yazıcıları bul
    console.log('\n🖨️ Yazıcı atamaları kontrol ediliyor...');
    console.log(`   Toplam ${db.printerAssignments.length} yazıcı ataması var`);
    
    // 2. Kategorileri yazıcılara göre grupla (aynı yazıcıya atanmış kategorileri birleştir)
    const printerGroupsMap = new Map(); // printerKey -> { printerName, printerType, categories: [{ categoryId, items }] }
    
    categoryItemsMap.forEach((categoryItems, categoryId) => {
      console.log(`\n   Kategori ID ${categoryId} için yazıcı aranıyor...`);
      
      // Bu kategori için atanmış yazıcıyı bul
      const categoryIdNum = typeof categoryId === 'string' && categoryId !== 'no-category' ? parseInt(categoryId) : categoryId;
      
      const assignment = db.printerAssignments.find(a => {
        const assignmentCategoryId = typeof a.category_id === 'string' ? parseInt(a.category_id) : a.category_id;
        return assignmentCategoryId === categoryIdNum;
      });
      
      if (!assignment) {
        console.warn(`   ⚠️ Kategori ID ${categoryId} için yazıcı ataması bulunamadı, atlanıyor`);
        return; // Kategori ataması yoksa atla
      }
      
      console.log(`   ✓ Yazıcı ataması bulundu: "${assignment.printerName}"`);
      
      // Yazıcı key'i oluştur (aynı yazıcıyı gruplamak için)
      const printerKey = `${assignment.printerName}::${assignment.printerType}`;
      
      if (!printerGroupsMap.has(printerKey)) {
        printerGroupsMap.set(printerKey, {
          printerName: assignment.printerName,
          printerType: assignment.printerType,
          categories: []
        });
      }
      
      // Bu kategoriyi yazıcı grubuna ekle
      printerGroupsMap.get(printerKey).categories.push({
        categoryId,
        items: categoryItems
      });
    });
    
    console.log(`\n🖨️ Yazıcı grupları oluşturuldu: ${printerGroupsMap.size} yazıcı`);
    printerGroupsMap.forEach((group, key) => {
      console.log(`   - "${group.printerName}": ${group.categories.length} kategori`);
    });
    
    // 3. Her yazıcı için tek bir yazdırma işi oluştur (kategoriler birleştirilmiş)
    const printJobs = [];
    
    printerGroupsMap.forEach((group, printerKey) => {
      // Tüm kategorilerin ürünlerini birleştir
      const allItems = [];
      group.categories.forEach(cat => {
        allItems.push(...cat.items);
      });
      
      // Toplam tutarı hesapla (ikram edilenler hariç)
      const totalAmount = allItems.reduce((sum, item) => {
        if (item.isGift) return sum;
        return sum + (item.price * item.quantity);
      }, 0);
      
      const combinedReceiptData = {
        ...receiptData,
        items: allItems, // Tüm kategorilerin ürünleri birleştirilmiş
        totalAmount: totalAmount
      };
      
      printJobs.push({
        printerName: group.printerName,
        printerType: group.printerType,
        categoryId: 'combined', // Birleştirilmiş kategoriler
        items: allItems,
        receiptData: combinedReceiptData,
        isCashierReceipt: false,
        isProductionReceipt: true
      });
      
      console.log(`   ✓ "${group.printerName}" için birleşik yazdırma işi oluşturuldu: ${allItems.length} ürün, ${group.categories.length} kategori`);
    });
    
    // Kasa yazıcısına tam fiş ekle (sadece masa siparişi değilse - hızlı satış için)
    // Masa siparişleri için kasa yazıcısına yazdırma yapma (sadece kategori bazlı yazıcılara yazdır)
    const isTableOrder = receiptData.tableName || receiptData.order_id;
    
    if (!isTableOrder && cashierPrinter && cashierPrinter.printerName) {
      // Tüm ürünlerin toplam tutarını hesapla (ikram edilenler hariç)
      const totalAmount = items.reduce((sum, item) => {
        if (item.isGift) return sum;
        return sum + (item.price * item.quantity);
      }, 0);
      
      const cashierReceiptData = {
        ...receiptData,
        items: items, // TÜM ürünler
        totalAmount: totalAmount
      };
      
      // Kasa yazıcısını en başa ekle
      printJobs.unshift({
        printerName: cashierPrinter.printerName,
        printerType: cashierPrinter.printerType,
        categoryId: 'cashier',
        items: items, // TÜM ürünler
        receiptData: cashierReceiptData,
        isCashierReceipt: true,
        isProductionReceipt: false
      });
      
      console.log(`\n💰 Kasa yazıcısı yazdırma işi eklendi: "${cashierPrinter.printerName}"`);
      console.log(`   Toplam ${items.length} ürün, Toplam tutar: ₺${totalAmount.toFixed(2)}`);
    } else if (isTableOrder) {
      console.log(`\n📋 Masa siparişi tespit edildi - Kasa yazıcısına yazdırma atlanıyor (sadece kategori bazlı yazıcılara yazdırılacak)`);
    }
    
    // Kategori yazıcıları için üretim fişi olarak işaretle
    printJobs.forEach((job) => {
      if (!job.isCashierReceipt) {
        job.isProductionReceipt = true;
        job.isCashierReceipt = false;
      }
    });
    
    console.log(`\n🎯 Toplam ${printJobs.length} yazdırma işi oluşturuldu`);
    printJobs.forEach((job, index) => {
      const receiptType = job.isCashierReceipt ? '💰 KASA FİŞİ' : '🏭 ÜRETİM FİŞİ';
      console.log(`   ${index + 1}. ${receiptType}`);
      console.log(`      Yazıcı: "${job.printerName || 'Varsayılan'}" (${job.printerType})`);
      console.log(`      Kategori: ${job.categoryId}, Ürün sayısı: ${job.items.length}`);
    });
    
    // 3. Her yazdırma işini sırayla gerçekleştir
    const printResults = [];
    
    for (let i = 0; i < printJobs.length; i++) {
      const job = printJobs[i];
      console.log(`\n🖨️ YAZDIRMA ${i + 1}/${printJobs.length} BAŞLIYOR`);
      console.log(`   Yazıcı: "${job.printerName || 'Varsayılan yazıcı'}"`);
      console.log(`   Tip: ${job.printerType}`);
      console.log(`   Kategori ID: ${job.categoryId}`);
      console.log(`   Ürün sayısı: ${job.items.length}`);
      
      const result = await printToPrinter(
        job.printerName, 
        job.printerType, 
        job.receiptData, 
        job.isProductionReceipt || false, 
        job.items
      );
      printResults.push(result);
      
      if (!result.success) {
        console.error(`   ❌ Yazdırma başarısız: ${result.error}`);
      } else {
        console.log(`   ✅ Yazdırma başarılı`);
      }
      
      // Yazıcılar arası kısa bekleme
      if (i < printJobs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const successCount = printResults.filter(r => r.success).length;
    
    console.log(`\n=== YAZDIRMA İŞLEMİ TAMAMLANDI ===`);
    console.log(`   Toplam ${printResults.length} iş, ${successCount} başarılı`);
    
    // Yazdırma işlemleri tamamlandı - her zaman success dön
    return { 
      success: true, 
      results: printResults,
      error: null
    };
  } catch (error) {
    console.error('\n❌❌❌ YAZDIRMA HATASI ❌❌❌');
    console.error('Hata mesajı:', error.message);
    console.error('Hata detayı:', error.stack);
    return { success: false, error: error.message };
  }
});

// Yazıcıya yazdırma fonksiyonu
async function printToPrinter(printerName, printerType, receiptData, isProductionReceipt = false, productionItems = null) {
  let printWindow = null;
  
  try {
    const receiptType = isProductionReceipt ? 'ÜRETİM FİŞİ' : 'KASA FİŞİ';
    console.log(`   [printToPrinter] ${receiptType} yazdırılıyor: "${printerName || 'Varsayılan'}"`);
    
    // Fiş içeriğini HTML olarak oluştur
    const receiptHTML = isProductionReceipt 
      ? generateProductionReceiptHTML(productionItems || receiptData.items, receiptData)
      : generateReceiptHTML(receiptData);

    // Gizli bir pencere oluştur ve fiş içeriğini yükle
    printWindow = new BrowserWindow({
      show: false,
      width: 220, // 58mm ≈ 220px (72 DPI'da)
      height: 3000, // Yüksekliği daha da artırdık - tüm içeriğin kesinlikle görünmesi için
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // HTML içeriğini data URL olarak yükle
    console.log('Yazdırma penceresi oluşturuldu, HTML yükleniyor...');
    
    // Yazdırma işlemini Promise ile sarmalıyoruz
    let printResolve, printReject;
    const printPromise = new Promise((resolve, reject) => {
      printResolve = resolve;
      printReject = reject;
    });

    // Hem did-finish-load hem de dom-ready event'lerini dinle
    let printStarted = false;
    const startPrint = () => {
      if (printStarted) return;
      printStarted = true;
      
      console.log('İçerik yüklendi, yazdırma başlatılıyor...');
      
      // İçeriğin tamamen render edilmesi için daha uzun bir bekleme
      setTimeout(async () => {
        console.log('Yazdırma komutu gönderiliyor (varsayılan yazıcıya)...');
        
        // İçeriğin tamamen render edildiğinden emin olmak için scroll yüksekliğini kontrol et ve pencere boyutunu ayarla
        try {
          const scrollHeight = await printWindow.webContents.executeJavaScript(`
            (function() {
              document.body.style.minHeight = 'auto';
              document.body.style.height = 'auto';
              document.documentElement.style.height = 'auto';
              const height = Math.max(
                document.body.scrollHeight, 
                document.body.offsetHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
              );
              return height;
            })();
          `);
          
          console.log('Sayfa yüksekliği:', scrollHeight, 'px');
          
          // Pencere yüksekliğini içeriğe göre ayarla (en az 2000px, içerik daha uzunsa onu kullan)
          const windowHeight = Math.max(3000, scrollHeight + 200);
          printWindow.setSize(220, windowHeight);
          console.log('Pencere yüksekliği ayarlandı:', windowHeight, 'px');
          
          // Ekstra bir kısa bekleme - pencere boyutu değişikliğinin uygulanması için
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.log('Yükseklik kontrolü hatası:', error);
        }
        
        // Yazıcı adını belirle
        let targetPrinterName = printerName;
        
        if (targetPrinterName) {
          console.log(`   🎯 Yazıcı adı belirtildi: "${targetPrinterName}"`);
          console.log(`   🔍 Yazıcının sistemde mevcut olup olmadığı kontrol ediliyor...`);
          
          // Sistem yazıcılarını al
          try {
            const powershellCmd = `Get-WmiObject Win32_Printer | Select-Object Name | ConvertTo-Json`;
            const result = execSync(`powershell -Command "${powershellCmd}"`, { 
              encoding: 'utf-8',
              timeout: 5000 
            });
            
            const printersData = JSON.parse(result);
            const printersArray = Array.isArray(printersData) ? printersData : [printersData];
            const availablePrinters = printersArray.map(p => p.Name || '').filter(n => n);
            
            console.log(`   📋 Sistemde ${availablePrinters.length} yazıcı bulundu`);
            
            // Yazıcı adını kontrol et (tam eşleşme veya kısmi eşleşme)
            const exactMatch = availablePrinters.find(p => p === targetPrinterName);
            const partialMatch = availablePrinters.find(p => p.includes(targetPrinterName) || targetPrinterName.includes(p));
            
            if (exactMatch) {
              targetPrinterName = exactMatch;
              console.log(`   ✅ Yazıcı bulundu (tam eşleşme): "${targetPrinterName}"`);
            } else if (partialMatch) {
              targetPrinterName = partialMatch;
              console.log(`   ✅ Yazıcı bulundu (kısmi eşleşme): "${targetPrinterName}"`);
            } else {
              console.warn(`   ⚠️ Yazıcı "${targetPrinterName}" sistemde bulunamadı!`);
              console.log(`   📋 Mevcut yazıcılar:`, availablePrinters);
              console.log(`   → Varsayılan yazıcı kullanılacak`);
              targetPrinterName = null; // Varsayılan yazıcıya yazdır
            }
          } catch (error) {
            console.error(`   ❌ Yazıcı kontrolü hatası:`, error.message);
            console.log(`   → Belirtilen yazıcı adı kullanılacak: "${targetPrinterName}"`);
          }
        } else {
          console.log(`   ℹ️ Yazıcı adı belirtilmedi, varsayılan yazıcı kullanılacak`);
        }
        
        // Yazdırma seçenekleri
        const printOptions = {
          silent: true, // Dialog gösterme
          printBackground: true,
          margins: {
            marginType: 'none' // Kenar boşluğu yok
          },
          landscape: false, // Dikey yönlendirme
          scaleFactor: 100,
          pagesPerSheet: 1,
          collate: false,
          color: false, // Siyah-beyaz (termal yazıcılar için)
          copies: 1,
          duplex: 'none'
        };
        
        // Yazıcı adı belirtilmişse ekle
        if (targetPrinterName) {
          printOptions.deviceName = targetPrinterName;
          console.log(`   📤 Yazdırma seçenekleri:`);
          console.log(`      - Yazıcı: "${targetPrinterName}"`);
          console.log(`      - Tip: ${printerType}`);
        } else {
          console.log(`   📤 Varsayılan yazıcıya yazdırılacak`);
        }

        console.log(`   🖨️ Yazdırma komutu gönderiliyor...`);
        printWindow.webContents.print(printOptions, (success, errorType) => {
          console.log(`\n   📥 Yazdırma callback alındı`);
          console.log(`      - Başarılı: ${success}`);
          console.log(`      - Yazıcı: "${targetPrinterName || 'Varsayılan'}"`);
          console.log(`      - Tip: ${printerType}`);
          
          if (!success) {
            console.error(`      ❌ Yazdırma başarısız!`);
            console.error(`      Hata tipi: ${errorType}`);
            printReject(new Error(errorType || 'Yazdırma başarısız'));
          } else {
            console.log(`      ✅ Yazdırma başarılı!`);
            console.log(`      🖨️ "${targetPrinterName || 'Varsayılan yazıcı'}" yazıcısına yazdırıldı`);
            printResolve(true);
          }
          
          // Yazdırma işlemi tamamlandıktan sonra pencereyi kapat
          setTimeout(() => {
            if (printWindow && !printWindow.isDestroyed()) {
              printWindow.close();
              printWindow = null;
            }
          }, 1000);
        });
        }, 2000); // 2 saniye bekle - içeriğin tamamen render edilmesi için
    };

    printWindow.webContents.once('did-finish-load', () => {
      console.log('did-finish-load event tetiklendi');
      startPrint();
    });

    printWindow.webContents.once('dom-ready', () => {
      console.log('dom-ready event tetiklendi');
      startPrint();
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);
    console.log('HTML URL yüklendi');

    // Fallback: Eğer 3 saniye içinde hiçbir event tetiklenmezse yine de yazdır
    setTimeout(() => {
      console.log('Fallback timeout: Yazdırma zorla başlatılıyor...');
      startPrint();
    }, 3000);

    // Yazdırma işleminin tamamlanmasını bekle (max 10 saniye)
    await Promise.race([
      printPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Yazdırma timeout')), 10000))
    ]);

    console.log(`   [printToPrinter] Yazdırma işlemi tamamlandı`);
    return { success: true, printerName: targetPrinterName || 'Varsayılan' };
  } catch (error) {
    console.error(`   [printToPrinter] Hata:`, error.message);
    console.error(`   Hata detayı:`, error.stack);
    
    // Hata durumunda pencereyi temizle
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.close();
    }
    
    return { success: false, error: error.message, printerName: printerName || 'Varsayılan' };
  }
}

// Üretim fişi HTML içeriğini oluştur (fiyat yok, sadece ürün bilgileri)
function generateProductionReceiptHTML(items, receiptData) {
  // Yaka's Grill kontrolü
  const tenantInfo = tenantManager.getCurrentTenantInfo();
  const isYakasGrill = tenantInfo?.tenantId === 'TENANT-1766340222641';
  const productNameFontSize = isYakasGrill ? '2em' : 'inherit';
  
  const itemsHTML = items.map(item => {
    const isGift = item.isGift || false;
    
    if (isGift) {
      return `
      <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #ccc;">
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-style: italic; margin-bottom: 4px; font-family: 'Montserrat', sans-serif;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="text-decoration: line-through; color: #999; font-size: ${productNameFontSize};">${item.name}</span>
            <span style="font-size: 8px; background: #dcfce7; color: #16a34a; padding: 2px 4px; border-radius: 3px; font-weight: 900;">İKRAM</span>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #000; font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">
          <span>${item.quantity} adet</span>
        </div>
        ${item.extraNote ? `
        <div style="font-size: 9px; color: #666; font-style: italic; margin-top: 4px; font-family: 'Montserrat', sans-serif;">
          📝 ${item.extraNote}
        </div>
        ` : ''}
      </div>
    `;
    }
    
    return `
      <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #ccc;">
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-style: italic; margin-bottom: 4px; font-family: 'Montserrat', sans-serif; color: #000 !important;">
          <span style="color: #000 !important; font-size: ${productNameFontSize};">${item.name}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #000; font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">
          <span>${item.quantity} adet</span>
        </div>
        ${item.extraNote ? `
        <div style="font-size: 9px; color: #666; font-style: italic; margin-top: 4px; font-family: 'Montserrat', sans-serif;">
          📝 ${item.extraNote}
        </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@900&display=swap" rel="stylesheet">
      <style>
        @media print {
          @page {
            size: 58mm auto;
            margin: 0;
            min-height: 100%;
          }
          body {
            margin: 0;
            padding: 10px 10px 20px 10px;
            height: auto;
            min-height: 100%;
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          * {
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        * {
          box-sizing: border-box;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-style: italic;
        }
        p, span, div {
          color: #000;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-style: italic;
        }
        body {
          font-family: 'Montserrat', sans-serif;
          width: 58mm;
          max-width: 58mm;
          padding: 10px 10px 25px 10px;
          margin: 0;
          font-size: 12px;
          font-weight: 900;
          font-style: italic;
          min-height: 100%;
          height: auto;
          overflow: visible;
          color: #000;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }
        html {
          height: auto;
          min-height: 100%;
        }
        .header {
          text-align: center;
          margin-bottom: 10px;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-style: italic;
        }
        .header h3 {
          font-size: 16px;
          font-weight: 900;
          font-style: italic;
          margin: 5px 0;
          font-family: 'Montserrat', sans-serif;
        }
        .info {
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
          padding: 8px 0;
          margin: 10px 0;
          font-size: 10px;
          color: #000;
          font-weight: 900;
          font-style: italic;
          font-family: 'Montserrat', sans-serif;
        }
        .info div {
          display: flex;
          justify-content: space-between;
          margin: 3px 0;
        }
        .items {
          margin: 10px 0;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-style: italic;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          margin-bottom: 15px;
          padding-top: 15px;
          padding-bottom: 15px;
          border-top: 3px solid #000;
          font-size: 12px;
          font-weight: 900;
          font-style: italic;
          color: #000;
          page-break-inside: avoid;
          display: block;
          font-family: 'Montserrat', sans-serif;
        }
        .header {
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h3>${tenantManager.getBusinessName()}</h3>
        <p style="font-size: 10px; margin: 0; font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">ÜRETİM FİŞİ</p>
      </div>
      
      <div class="info">
        <div>
          <span>Tarih:</span>
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">${receiptData.sale_date || new Date().toLocaleDateString('tr-TR')}</span>
        </div>
        <div>
          <span>Saat:</span>
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">${receiptData.sale_time || getFormattedTime(new Date())}</span>
        </div>
        ${receiptData.sale_id ? `
        <div>
          <span>Fiş No:</span>
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">#${receiptData.sale_id}</span>
        </div>
        ` : ''}
        ${receiptData.order_id ? `
        <div>
          <span>Sipariş No:</span>
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">#${receiptData.order_id}</span>
        </div>
        ` : ''}
      </div>

      <div class="items">
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-style: italic; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px solid #000; font-family: 'Montserrat', sans-serif;">
          <span>Ürün</span>
          <span>Adet</span>
        </div>
        ${itemsHTML}
      </div>
      
      ${receiptData.orderNote ? `
      <div style="margin: 10px 0; padding: 8px; background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px;">
        <p style="font-size: ${isYakasGrill ? '20px' : '10px'}; font-weight: 900; font-style: italic; color: #d97706; margin: 0 0 4px 0; font-family: 'Montserrat', sans-serif;">📝 Sipariş Notu:</p>
        <p style="font-size: ${isYakasGrill ? '20px' : '10px'}; font-weight: 900; font-style: italic; color: #92400e; margin: 0; font-family: 'Montserrat', sans-serif;">${receiptData.orderNote}</p>
      </div>
      ` : ''}
    </body>
    </html>
  `;
}

// Fiş HTML içeriğini oluştur
function generateReceiptHTML(receiptData) {
  // Yaka's Grill kontrolü
  const tenantInfo = tenantManager.getCurrentTenantInfo();
  const isYakasGrill = tenantInfo?.tenantId === 'TENANT-1766340222641';
  
  const itemsHTML = receiptData.items.map(item => {
    const isGift = item.isGift || false;
    const displayPrice = isGift ? 0 : item.price;
    const itemTotal = isGift ? 0 : (item.price * item.quantity);
    const originalTotal = item.price * item.quantity;
    
    // Porsiyon bilgisi - varsa göster (0 hariç tüm değerler için)
    let portion = item.portion;
    if (portion === null || portion === undefined || portion === 0 || portion === '0' || portion === '') {
      portion = null;
    } else {
      // Porsiyon değerini sayıya çevir
      portion = typeof portion === 'string' ? parseFloat(portion) : portion;
      if (isNaN(portion) || portion === 0) {
        portion = null;
      }
    }
    const portionText = portion ? ` (${portion.toString().replace('.', ',')} porsiyon)` : '';
    
    // Debug: Porsiyon bilgisini logla
    if (portion) {
      console.log(`   [generateReceiptHTML] Ürün: ${item.name}, Porsiyon: ${portion}`);
    }
    
    if (isGift) {
      return `
      <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #ccc;">
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-style: italic; margin-bottom: 4px; font-family: 'Montserrat', sans-serif;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="text-decoration: line-through; color: #999;">${item.name}${portionText}</span>
            <span style="font-size: 8px; background: #dcfce7; color: #16a34a; padding: 2px 4px; border-radius: 3px; font-weight: 900;">İKRAM</span>
          </div>
          <div style="text-align: right;">
            <div style="text-decoration: line-through; color: #999; font-size: 10px;">₺${originalTotal.toFixed(2)}</div>
            <span style="color: #16a34a; font-weight: 900;">₺0.00</span>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #000; font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">
          <span>${item.quantity} adet${portionText} × <span style="text-decoration: line-through; color: #999;">₺${item.price.toFixed(2)}</span> <span style="color: #16a34a;">₺0.00</span></span>
        </div>
      </div>
    `;
    }
    
    return `
      <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #ccc;">
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-style: italic; margin-bottom: 4px; font-family: 'Montserrat', sans-serif; color: #000 !important;">
          <span style="color: #000 !important;">${item.name}${portionText}</span>
          <span style="color: #000 !important;">₺${itemTotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #000; font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">
          <span>${item.quantity} adet${portionText} × ₺${item.price.toFixed(2)}</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@900&display=swap" rel="stylesheet">
      <style>
        @media print {
          @page {
            size: 58mm auto;
            margin: 0;
            min-height: 100%;
          }
          body {
            margin: 0;
            padding: 10px 10px 20px 10px;
            height: auto;
            min-height: 100%;
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          * {
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        * {
          box-sizing: border-box;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-style: italic;
        }
        p, span, div {
          color: #000;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-style: italic;
        }
        body {
          font-family: 'Montserrat', sans-serif;
          width: 58mm;
          max-width: 58mm;
          padding: 10px 10px 25px 10px;
          margin: 0;
          font-size: 12px;
          font-weight: 900;
          font-style: italic;
          min-height: 100%;
          height: auto;
          overflow: visible;
          color: #000;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }
        html {
          height: auto;
          min-height: 100%;
        }
        .header {
          text-align: center;
          margin-bottom: 10px;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-style: italic;
        }
        .header h3 {
          font-size: 16px;
          font-weight: 900;
          font-style: italic;
          margin: 5px 0;
          font-family: 'Montserrat', sans-serif;
        }
        .info {
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
          padding: 8px 0;
          margin: 10px 0;
          font-size: 10px;
          color: #000;
          font-weight: 900;
          font-style: italic;
          font-family: 'Montserrat', sans-serif;
        }
        .info div {
          display: flex;
          justify-content: space-between;
          margin: 3px 0;
        }
        .items {
          margin: 10px 0;
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-style: italic;
        }
        .total {
          border-top: 3px solid #000;
          padding-top: 10px;
          margin-top: 15px;
          margin-bottom: 10px;
          font-weight: 900;
          font-style: italic;
          color: #000;
          font-family: 'Montserrat', sans-serif;
        }
        .total div {
          display: flex;
          justify-content: space-between;
          margin: 4px 0;
          font-weight: 900;
          font-style: italic;
          color: #000;
          font-family: 'Montserrat', sans-serif;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          margin-bottom: 15px;
          padding-top: 15px;
          padding-bottom: 15px;
          border-top: 3px solid #000;
          font-size: 12px;
          font-weight: 900;
          font-style: italic;
          color: #000;
          page-break-inside: avoid;
          display: block;
          font-family: 'Montserrat', sans-serif;
        }
        .header {
          page-break-inside: avoid;
        }
        .total {
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h3>${tenantManager.getBusinessName()}</h3>
        <p style="font-size: 10px; margin: 0; font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">${receiptData.tableName ? 'Masa Siparişi' : 'Satış Fişi'}</p>
      </div>
      
      <div class="info">
        ${receiptData.tableName ? `
        <div>
          <span>Masa:</span>
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">${receiptData.tableName}</span>
        </div>
        ` : ''}
        <div>
          <span>Tarih:</span>
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">${receiptData.sale_date || new Date().toLocaleDateString('tr-TR')}</span>
        </div>
        <div>
          <span>Saat:</span>
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">${receiptData.sale_time || getFormattedTime(new Date())}</span>
        </div>
        ${receiptData.sale_id ? `
        <div>
          <span>Fiş No:</span>
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">#${receiptData.sale_id}</span>
        </div>
        ` : ''}
        ${receiptData.order_id ? `
        <div>
          <span>Sipariş No:</span>
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">#${receiptData.order_id}</span>
        </div>
        ` : ''}
      </div>

      <div class="items">
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-style: italic; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px solid #000; font-family: 'Montserrat', sans-serif;">
          <span>Ürün</span>
          <span>Toplam</span>
        </div>
        ${itemsHTML}
      </div>
      
      ${receiptData.orderNote ? `
      <div style="margin: 10px 0; padding: 8px; background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px;">
        <p style="font-size: ${isYakasGrill ? '20px' : '10px'}; font-weight: 900; font-style: italic; color: #d97706; margin: 0 0 4px 0; font-family: 'Montserrat', sans-serif;">📝 Sipariş Notu:</p>
        <p style="font-size: ${isYakasGrill ? '20px' : '10px'}; font-weight: 900; font-style: italic; color: #92400e; margin: 0; font-family: 'Montserrat', sans-serif;">${receiptData.orderNote}</p>
      </div>
      ` : ''}

      <div class="total">
        <div>
          <span>TOPLAM:</span>
          <span>₺${receiptData.items.reduce((sum, item) => {
            // İkram edilen ürünleri toplamdan çıkar
            if (item.isGift) return sum;
            return sum + (item.price * item.quantity);
          }, 0).toFixed(2)}</span>
        </div>
        <div style="font-size: 11px; color: #000; font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">
          <span>Ödeme:</span>
          <span>${receiptData.paymentMethod || 'Nakit'}</span>
        </div>
      </div>

    </body>
    </html>
  `;
}

app.whenReady().then(() => {
  // İlk database'i başlat (tenant bilgisi yoksa varsayılan)
  initDatabase();
  createWindow();
  startAPIServer();

  // Firebase senkronizasyonu tenant bilgisi geldiğinde yapılacak
  // set-tenant-info handler'ında yapılıyor

  // Uygulama paketlenmişse güncelleme kontrolü yap
  if (app.isPackaged) {
    writeLog(`Uygulama başlatıldı - Versiyon: ${app.getVersion()}`);
    writeLog('Güncelleme kontrolü başlatılıyor...');
    
    // İlk açılışta kontrol et
    setTimeout(() => {
      writeLog('Güncelleme kontrolü yapılıyor...');
      autoUpdater.checkForUpdates().catch(err => {
        writeLog(`Güncelleme kontrolü hatası: ${err.message || err}`);
      });
    }, 3000); // 3 saniye bekle, uygulama tam yüklensin
    
    // Her 4 saatte bir kontrol et
    setInterval(() => {
      writeLog('Periyodik güncelleme kontrolü...');
      autoUpdater.checkForUpdates().catch(err => {
        writeLog(`Güncelleme kontrolü hatası: ${err.message || err}`);
      });
    }, 4 * 60 * 60 * 1000); // 4 saat
  } else {
    writeLog('Development modu - güncelleme kontrolü yapılmıyor');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Single instance - sadece bir pencere açık olsun
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    saveDatabase();
    app.quit();
  }
});

app.on('before-quit', () => {
  saveDatabase();
});

// Uygulamayı kapat
// Printer Management IPC Handlers
ipcMain.handle('get-printers', async () => {
  try {
    console.log('=== YAZICI LİSTELEME BAŞLADI ===');
    
    // Windows PowerShell komutu ile yazıcıları ve port bilgilerini al
    let printersData = [];
    
    console.log('📋 Windows sisteminden yazıcılar alınıyor...');
    try {
      // PowerShell komutu ile yazıcıları ve port bilgilerini al
      const powershellCmd = `Get-WmiObject Win32_Printer | Select-Object Name, DisplayName, Description, Status, Default, PortName | ConvertTo-Json`;
      console.log('   PowerShell komutu çalıştırılıyor...');
      
      const result = execSync(`powershell -Command "${powershellCmd}"`, { 
        encoding: 'utf-8',
        timeout: 10000 
      });
      
      console.log('   PowerShell çıktısı alındı, uzunluk:', result.length, 'karakter');
      console.log('   İlk 500 karakter:', result.substring(0, 500));
      
      if (result && result.trim()) {
        const parsed = JSON.parse(result);
        printersData = Array.isArray(parsed) ? parsed : [parsed];
        console.log(`✅ Toplam ${printersData.length} yazıcı bulundu`);
      } else {
        console.warn('⚠️ PowerShell çıktısı boş!');
        printersData = [];
      }
    } catch (psError) {
      console.error('❌ PowerShell hatası:', psError.message);
      console.error('   Hata detayı:', psError.stack);
      // Alternatif yöntem dene
      try {
        console.log('   Alternatif yöntem deneniyor...');
        const altCmd = `Get-Printer | ForEach-Object { [PSCustomObject]@{ Name = $_.Name; PortName = (Get-PrinterPort -PrinterName $_.Name).Name; DisplayName = $_.DisplayName; Description = $_.Comment; Status = $_.PrinterStatus; Default = $false } } | ConvertTo-Json`;
        const altResult = execSync(`powershell -Command "${altCmd}"`, { encoding: 'utf-8', timeout: 10000 });
        if (altResult && altResult.trim()) {
          const parsed = JSON.parse(altResult);
          printersData = Array.isArray(parsed) ? parsed : [parsed];
          console.log(`✅ Alternatif yöntem ile ${printersData.length} yazıcı bulundu`);
        }
      } catch (altError) {
        console.error('❌ Alternatif yöntem de başarısız:', altError.message);
        console.error('   Alternatif hata detayı:', altError.stack);
      }
    }
    
    if (printersData.length === 0) {
      console.warn('⚠️ Hiç yazıcı bulunamadı! Sistem yazıcılarını kontrol edin.');
      return {
        success: true,
        printers: {
          usb: [],
          network: [],
          all: []
        }
      };
    }
    
    console.log('\n📝 Bulunan yazıcılar:');
    printersData.forEach((p, index) => {
      console.log(`  ${index + 1}. İsim: "${p.Name || 'yok'}"`);
      console.log(`     Display Name: "${p.DisplayName || 'yok'}"`);
      console.log(`     Description: "${p.Description || 'yok'}"`);
      console.log(`     Port: "${p.PortName || 'yok'}"`);
      console.log(`     Status: ${p.Status || 0}`);
      console.log(`     Default: ${p.Default || false}`);
    });
    
    // Yazıcıları USB ve Ethernet olarak kategorize et
    const usbPrinters = [];
    const networkPrinters = [];
    
    // IP adresi pattern kontrolü için regex
    const ipAddressPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
    
    console.log('\n🔍 Yazıcılar kategorize ediliyor...\n');
    
    printersData.forEach((printer, index) => {
      const printerName = printer.Name || '';
      const displayName = printer.DisplayName || printerName;
      const description = printer.Description || '';
      const portName = printer.PortName || '';
      const status = printer.Status || 0;
      const isDefault = printer.Default || false;
      
      console.log(`--- Yazıcı ${index + 1}: "${printerName}" ---`);
      
      const printerInfo = {
        name: printerName,
        displayName: displayName,
        description: description,
        status: status,
        isDefault: isDefault
      };
      
      const portNameLower = portName.toLowerCase();
      
      console.log(`  İsim: "${printerName}"`);
      console.log(`  Display Name: "${displayName}"`);
      console.log(`  Port: "${portName || 'BULUNAMADI'}"`);
      console.log(`  Açıklama: "${description || 'yok'}"`);
      console.log(`  Status: ${status}`);
      console.log(`  Default: ${isDefault}`);
      
      // Network yazıcı kontrolü - daha kapsamlı
      let isNetwork = false;
      const networkReasons = [];
      
      // 1. Port adında IP adresi var mı kontrol et (örn: "IP_192.168.1.152")
      const portHasIP = ipAddressPattern.test(portName);
      if (portHasIP) {
        const ipMatches = portName.match(ipAddressPattern);
        console.log(`  ✓ Port adında IP adresi bulundu: ${ipMatches ? ipMatches.join(', ') : ''}`);
        isNetwork = true;
        networkReasons.push(`Port adında IP: ${ipMatches ? ipMatches[0] : ''}`);
      }
      
      // 2. Port adı TCP/IP içeriyor mu kontrol et
      const portCheck = portNameLower.includes('tcp') || 
                       portNameLower.includes('ip_') || 
                       portNameLower.includes('ip:') || 
                       portNameLower.startsWith('192.') || 
                       portNameLower.startsWith('10.') || 
                       portNameLower.startsWith('172.');
      
      if (portCheck && !portHasIP) {
        console.log(`  ✓ Port adı TCP/IP içeriyor veya IP ile başlıyor`);
        isNetwork = true;
        networkReasons.push('Port TCP/IP içeriyor');
      }
      
      // 3. Yazıcı adında veya açıklamasında network kelimeleri var mı kontrol et
      const printerNameLower = printerName.toLowerCase();
      const descriptionLower = description.toLowerCase();
      
      const hasNetworkKeywords = printerNameLower.includes('network') || 
                                printerNameLower.includes('ethernet') ||
                                printerNameLower.includes('tcp') ||
                                descriptionLower.includes('network') ||
                                descriptionLower.includes('ethernet');
      
      if (hasNetworkKeywords) {
        console.log(`  ✓ İsim/açıklamada network kelimesi bulundu`);
        isNetwork = true;
        networkReasons.push('İsim/açıklamada network kelimesi');
      }
      
      // 4. Yazıcı adında veya açıklamasında IP adresi pattern'i var mı kontrol et
      const nameHasIP = ipAddressPattern.test(printerName);
      const descHasIP = ipAddressPattern.test(description);
      
      if (nameHasIP) {
        const ipMatches = printerName.match(ipAddressPattern);
        console.log(`  ✓ Yazıcı adında IP adresi bulundu: ${ipMatches ? ipMatches.join(', ') : ''}`);
        isNetwork = true;
        networkReasons.push(`İsimde IP: ${ipMatches ? ipMatches[0] : ''}`);
      }
      
      if (descHasIP) {
        const ipMatches = description.match(ipAddressPattern);
        console.log(`  ✓ Açıklamada IP adresi bulundu: ${ipMatches ? ipMatches.join(', ') : ''}`);
        isNetwork = true;
        networkReasons.push(`Açıklamada IP: ${ipMatches ? ipMatches[0] : ''}`);
      }
      
      // Özel IP kontrolü: 192.168.1.152
      const targetIP = '192.168.1.152';
      if (portName.includes(targetIP) || printerName.includes(targetIP) || description.includes(targetIP)) {
        console.log(`  🎯 HEDEF IP (${targetIP}) BULUNDU!`);
        isNetwork = true;
        networkReasons.push(`Hedef IP: ${targetIP}`);
      }
      
      console.log(`  📊 Network yazıcı mı? ${isNetwork ? 'EVET' : 'HAYIR'}`);
      if (isNetwork && networkReasons.length > 0) {
        console.log(`  📋 Nedenleri: ${networkReasons.join(', ')}`);
      }
      
      if (isNetwork) {
        networkPrinters.push(printerInfo);
        console.log(`  ✅ Network yazıcılar listesine eklendi\n`);
      } else {
        usbPrinters.push(printerInfo);
        console.log(`  ✅ USB yazıcılar listesine eklendi\n`);
      }
    });
    
    console.log('\n=== KATEGORİZASYON SONUÇLARI ===');
    console.log(`📦 USB Yazıcılar: ${usbPrinters.length}`);
    usbPrinters.forEach(p => console.log(`   - ${p.name}`));
    console.log(`🌐 Network Yazıcılar: ${networkPrinters.length}`);
    networkPrinters.forEach(p => console.log(`   - ${p.name}`));
    console.log('================================\n');
    
    return {
      success: true,
      printers: {
        usb: usbPrinters,
        network: networkPrinters,
        all: printersData.map(p => ({
          name: p.Name || '',
          displayName: p.DisplayName || p.Name || '',
          description: p.Description || '',
          status: p.Status || 0,
          isDefault: p.Default || false
        }))
      }
    };
  } catch (error) {
    console.error('❌❌❌ YAZICI LİSTELEME HATASI ❌❌❌');
    console.error('Hata mesajı:', error.message);
    console.error('Hata detayı:', error.stack);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('assign-category-to-printer', (event, assignmentData) => {
  const { printerName, printerType, category_id } = assignmentData;
  
  if (!printerName || !printerType || !category_id) {
    return { success: false, error: 'Yazıcı adı, tipi ve kategori ID gerekli' };
  }
  
  // Mevcut atamayı bul (aynı yazıcı + aynı kategori kombinasyonu)
  const existingIndex = db.printerAssignments.findIndex(
    a => a.printerName === printerName && 
         a.printerType === printerType && 
         Number(a.category_id) === Number(category_id)
  );
  
  const assignment = {
    printerName,
    printerType,
    category_id: Number(category_id)
  };
  
  if (existingIndex >= 0) {
    // Zaten varsa güncelle
    db.printerAssignments[existingIndex] = assignment;
  } else {
    // Yoksa yeni ekle
    db.printerAssignments.push(assignment);
  }
  
  saveDatabase();
  return { success: true, assignment };
});

ipcMain.handle('get-printer-assignments', () => {
  return db.printerAssignments;
});

ipcMain.handle('remove-printer-assignment', (event, printerName, printerType, categoryId) => {
  // categoryId belirtilmişse, sadece o kategori atamasını kaldır
  // categoryId belirtilmemişse, o yazıcıya ait tüm atamaları kaldır
  let index;
  
  if (categoryId !== undefined && categoryId !== null) {
    // Belirli bir kategori atamasını kaldır
    index = db.printerAssignments.findIndex(
      a => a.printerName === printerName && 
           a.printerType === printerType && 
           Number(a.category_id) === Number(categoryId)
    );
  } else {
    // Tüm kategori atamalarını kaldır (eski davranış - geriye dönük uyumluluk için)
    index = db.printerAssignments.findIndex(
      a => a.printerName === printerName && a.printerType === printerType
    );
  }
  
  if (index >= 0) {
    db.printerAssignments.splice(index, 1);
    saveDatabase();
    return { success: true };
  }
  
  return { success: false, error: 'Atama bulunamadı' };
});

// Kasa yazıcısı ayarları
ipcMain.handle('set-cashier-printer', (event, printerData) => {
  if (!printerData) {
    db.settings.cashierPrinter = null;
  } else {
    db.settings.cashierPrinter = {
      printerName: printerData.printerName,
      printerType: printerData.printerType
    };
  }
  saveDatabase();
  console.log('💰 Kasa yazıcısı ayarlandı:', db.settings.cashierPrinter);
  return { success: true, cashierPrinter: db.settings.cashierPrinter };
});

ipcMain.handle('get-cashier-printer', () => {
  return db.settings.cashierPrinter || null;
});

// Adisyon yazdırma handler - Kategori bazlı yazdırma yapar
ipcMain.handle('print-adisyon', async (event, adisyonData) => {
  console.log('\n=== ADİSYON YAZDIRMA İŞLEMİ BAŞLADI ===');
  console.log('📄 AdisyonData:', JSON.stringify(adisyonData, null, 2));
  
  try {
    if (!mainWindow) {
      console.error('❌ Ana pencere bulunamadı');
      return { success: false, error: 'Ana pencere bulunamadı' };
    }

    const items = adisyonData.items || [];
    console.log(`   Toplam ${items.length} ürün bulundu`);
    
    // Eğer cashierOnly flag'i true ise, sadece kasa yazıcısından fiyatlı fiş yazdır
    if (adisyonData.cashierOnly === true) {
      console.log('   💰 Sadece kasa yazıcısından fiyatlı fiş yazdırılıyor...');
      
      const cashierPrinter = db.settings.cashierPrinter;
      if (!cashierPrinter || !cashierPrinter.printerName) {
        console.error('   ❌ Kasa yazıcısı ayarlanmamış');
        return { success: false, error: 'Kasa yazıcısı ayarlanmamış' };
      }
      
      // Receipt formatında fiyatlı fiş oluştur
      const receiptData = {
        sale_id: null,
        totalAmount: items.reduce((sum, item) => {
          if (item.isGift) return sum;
          return sum + (item.price * item.quantity);
        }, 0),
        paymentMethod: 'Adisyon',
        sale_date: adisyonData.sale_date || new Date().toLocaleDateString('tr-TR'),
        sale_time: adisyonData.sale_time || getFormattedTime(new Date()),
        items: items,
        orderNote: adisyonData.orderNote || null,
        tableName: adisyonData.tableName || null,
        tableType: adisyonData.tableType || null,
        cashierOnly: true
      };
      
      // Kasa yazıcısından fiyatlı fiş yazdır
      await printToPrinter(
        cashierPrinter.printerName,
        cashierPrinter.printerType,
        receiptData,
        false,
        null
      );
      
      console.log(`\n=== KASA YAZICISINDAN FİYATLI FİŞ YAZDIRMA TAMAMLANDI ===`);
      return { success: true, error: null };
    }
    
    // Normal kategori bazlı adisyon yazdırma
    await printAdisyonByCategory(items, adisyonData);
    
    console.log(`\n=== ADİSYON YAZDIRMA İŞLEMİ TAMAMLANDI ===`);
    
    return { success: true, error: null };
  } catch (error) {
    console.error('\n❌❌❌ ADİSYON YAZDIRMA HATASI ❌❌❌');
    console.error('Hata mesajı:', error.message);
    console.error('Hata detayı:', error.stack);
    return { success: false, error: error.message };
  }
});

// Adisyon yazdırma fonksiyonu
async function printAdisyonToPrinter(printerName, printerType, items, adisyonData) {
  let printWindow = null;
  
  try {
    console.log(`   [printAdisyonToPrinter] Adisyon yazdırılıyor: "${printerName || 'Varsayılan'}"`);
    
    // Adisyon HTML içeriğini oluştur
    const adisyonHTML = generateAdisyonHTML(items, adisyonData);

    // Gizli bir pencere oluştur ve adisyon içeriğini yükle
    printWindow = new BrowserWindow({
      show: false,
      width: 286, // 75mm ≈ 286px (72 DPI'da) - 1.3 kat büyütülmüş
      height: 3000,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    let printResolve, printReject;
    const printPromise = new Promise((resolve, reject) => {
      printResolve = resolve;
      printReject = reject;
    });

    // Yazıcı adını başlangıçta belirle (dışarıda kullanılabilmesi için)
    let targetPrinterName = printerName;

    // Hem did-finish-load hem de dom-ready event'lerini dinle
    let printStarted = false;
    const startPrint = () => {
      if (printStarted) return;
      printStarted = true;
      
      console.log('İçerik yüklendi, yazdırma başlatılıyor...');
      
      // İçeriğin tamamen render edilmesi için daha uzun bir bekleme
      setTimeout(async () => {
        console.log('Yazdırma komutu gönderiliyor...');
        
        // İçeriğin tamamen render edildiğinden emin olmak için scroll yüksekliğini kontrol et ve pencere boyutunu ayarla
        try {
          const scrollHeight = await printWindow.webContents.executeJavaScript(`
            (function() {
              document.body.style.minHeight = 'auto';
              document.body.style.height = 'auto';
              document.documentElement.style.height = 'auto';
              const height = Math.max(
                document.body.scrollHeight, 
                document.body.offsetHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
              );
              return height;
            })();
          `);
          
          console.log('Sayfa yüksekliği:', scrollHeight, 'px');
          
          // Pencere yüksekliğini içeriğe göre ayarla (en az 3000px, içerik daha uzunsa onu kullan)
          const windowHeight = Math.max(3000, scrollHeight + 200);
          printWindow.setSize(286, windowHeight);
          console.log('Pencere yüksekliği ayarlandı:', windowHeight, 'px');
          
          // Ekstra bir kısa bekleme - pencere boyutu değişikliğinin uygulanması için
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.log('Yükseklik kontrolü hatası:', error);
        }
        
        // Yazıcı adını belirle (güncelle)
        targetPrinterName = printerName;
        
        if (targetPrinterName) {
          console.log(`   🎯 Yazıcı adı belirtildi: "${targetPrinterName}"`);
          console.log(`   🔍 Yazıcının sistemde mevcut olup olmadığı kontrol ediliyor...`);
          
          // Sistem yazıcılarını al
          try {
            const powershellCmd = `Get-WmiObject Win32_Printer | Select-Object Name | ConvertTo-Json`;
            const result = execSync(`powershell -Command "${powershellCmd}"`, { 
              encoding: 'utf-8',
              timeout: 5000 
            });
            
            const printersData = JSON.parse(result);
            const printersArray = Array.isArray(printersData) ? printersData : [printersData];
            const availablePrinters = printersArray.map(p => p.Name || '').filter(n => n);
            
            console.log(`   📋 Sistemde ${availablePrinters.length} yazıcı bulundu`);
            
            // Yazıcı adını kontrol et (tam eşleşme veya kısmi eşleşme)
            const exactMatch = availablePrinters.find(p => p === targetPrinterName);
            const partialMatch = availablePrinters.find(p => p.includes(targetPrinterName) || targetPrinterName.includes(p));
            
            if (exactMatch) {
              targetPrinterName = exactMatch;
              console.log(`   ✅ Yazıcı bulundu (tam eşleşme): "${targetPrinterName}"`);
            } else if (partialMatch) {
              targetPrinterName = partialMatch;
              console.log(`   ✅ Yazıcı bulundu (kısmi eşleşme): "${targetPrinterName}"`);
            } else {
              console.warn(`   ⚠️ Yazıcı "${targetPrinterName}" sistemde bulunamadı!`);
              console.log(`   📋 Mevcut yazıcılar:`, availablePrinters);
              console.log(`   → Varsayılan yazıcı kullanılacak`);
              targetPrinterName = null; // Varsayılan yazıcıya yazdır
            }
          } catch (error) {
            console.error(`   ❌ Yazıcı kontrolü hatası:`, error.message);
            console.log(`   → Belirtilen yazıcı adı kullanılacak: "${targetPrinterName}"`);
          }
        } else {
          console.log(`   ℹ️ Yazıcı adı belirtilmedi, varsayılan yazıcı kullanılacak`);
        }
        
        // Yazdırma seçenekleri
        const printOptions = {
          silent: true, // Dialog gösterme
          printBackground: true,
          margins: {
            marginType: 'none' // Kenar boşluğu yok
          },
          landscape: false, // Dikey yönlendirme
          scaleFactor: 100,
          pagesPerSheet: 1,
          collate: false,
          color: false, // Siyah-beyaz (termal yazıcılar için)
          copies: 1,
          duplex: 'none'
        };
        
        // Yazıcı adı belirtilmişse ekle
        if (targetPrinterName) {
          printOptions.deviceName = targetPrinterName;
          console.log(`   📤 Yazdırma seçenekleri:`);
          console.log(`      - Yazıcı: "${targetPrinterName}"`);
          console.log(`      - Tip: ${printerType}`);
        } else {
          console.log(`   📤 Varsayılan yazıcıya yazdırılacak`);
        }

        console.log(`   🖨️ Yazdırma komutu gönderiliyor...`);
        printWindow.webContents.print(printOptions, (success, errorType) => {
          console.log(`\n   📥 Yazdırma callback alındı`);
          console.log(`      - Başarılı: ${success}`);
          console.log(`      - Yazıcı: "${targetPrinterName || 'Varsayılan'}"`);
          console.log(`      - Tip: ${printerType}`);
          
          if (!success) {
            console.error(`      ❌ Adisyon yazdırma başarısız!`);
            console.error(`      Hata tipi: ${errorType}`);
            printReject(new Error(errorType || 'Adisyon yazdırma başarısız'));
          } else {
            console.log(`      ✅ Adisyon yazdırma başarılı!`);
            console.log(`      🖨️ "${targetPrinterName || 'Varsayılan yazıcı'}" yazıcısına yazdırıldı`);
            printResolve(true);
          }
          
          // Yazdırma işlemi tamamlandıktan sonra pencereyi kapat
          setTimeout(() => {
            if (printWindow && !printWindow.isDestroyed()) {
              printWindow.close();
              printWindow = null;
            }
          }, 1000);
        });
      }, 2000); // 2 saniye bekle - içeriğin tamamen render edilmesi için
    };

    printWindow.webContents.once('did-finish-load', () => {
      console.log('did-finish-load event tetiklendi');
      startPrint();
    });

    printWindow.webContents.once('dom-ready', () => {
      console.log('dom-ready event tetiklendi');
      startPrint();
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(adisyonHTML)}`);
    console.log('HTML URL yüklendi');

    // Fallback: Eğer 3 saniye içinde hiçbir event tetiklenmezse yine de yazdır
    setTimeout(() => {
      console.log('Fallback timeout: Yazdırma zorla başlatılıyor...');
      startPrint();
    }, 3000);

    // Yazdırma işleminin tamamlanmasını bekle (max 10 saniye)
    await Promise.race([
      printPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Adisyon yazdırma timeout')), 10000))
    ]);

    console.log(`   [printAdisyonToPrinter] Adisyon yazdırma işlemi tamamlandı`);
    return { success: true, printerName: targetPrinterName || 'Varsayılan' };
  } catch (error) {
    console.error(`   [printAdisyonToPrinter] Hata:`, error.message);
    console.error(`   Hata detayı:`, error.stack);
    
    // Hata durumunda pencereyi temizle
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.close();
    }
    
    return { success: false, error: error.message, printerName: printerName || 'Varsayılan' };
  }
}

// Kategori bazlı adisyon yazdırma fonksiyonu
async function printAdisyonByCategory(items, adisyonData) {
  console.log('\n=== KATEGORİ BAZLI ADİSYON YAZDIRMA BAŞLIYOR ===');
  console.log(`   Toplam ${items.length} ürün bulundu`);
  
  try {
    const tenantInfo = tenantManager.getCurrentTenantInfo();
    const isGeceDonercisiTenant = tenantInfo?.tenantId === GECE_TENANT_ID;
    const printerAssignments = Array.isArray(db.printerAssignments) ? db.printerAssignments : [];

    // 1. ÖNCE: Ürünleri personel ve zaman bazında grupla
    // Her personel grubu için ayrı adisyon oluşturulacak
    const staffGroupsMap = new Map(); // staffKey -> { staffName, staffTime, staffDate, items: [] }
    
    for (const item of items) {
      // Item'dan personel bilgisini al (staff_name, added_time, added_date)
      const staffName = item.staff_name || null;
      const itemTime = item.added_time || adisyonData.sale_time || getFormattedTime(new Date());
      const itemDate = item.added_date || adisyonData.sale_date || new Date().toLocaleDateString('tr-TR');
      
      // Personel key'i oluştur (personel adı + tarih + saat kombinasyonu)
      // Aynı personel, aynı tarih ve saatte eklenen ürünler aynı grupta olacak
      const staffKey = `${staffName || 'Kasa'}::${itemDate}::${itemTime}`;
      
      if (!staffGroupsMap.has(staffKey)) {
        staffGroupsMap.set(staffKey, {
          staffName: staffName,
          staffTime: itemTime,
          staffDate: itemDate,
          items: []
        });
      }
      
      staffGroupsMap.get(staffKey).items.push(item);
    }
    
    console.log(`\n👥 Personel grupları oluşturuldu: ${staffGroupsMap.size} grup`);
    staffGroupsMap.forEach((group, key) => {
      console.log(`   - "${group.staffName || 'Kasa'}": ${group.items.length} ürün (${group.staffDate} ${group.staffTime})`);
    });
    
    // 2. Her personel grubu için ayrı adisyon yazdır
    const staffGroups = Array.from(staffGroupsMap.values());
    
    for (let staffGroupIndex = 0; staffGroupIndex < staffGroups.length; staffGroupIndex++) {
      const staffGroup = staffGroups[staffGroupIndex];
      
      console.log(`\n📋 Personel Grubu ${staffGroupIndex + 1}/${staffGroups.length}: "${staffGroup.staffName || 'Kasa'}" (${staffGroup.staffDate} ${staffGroup.staffTime})`);
      
      // Bu personel grubunun ürünlerini kategorilerine göre grupla
      const categoryItemsMap = new Map(); // categoryId -> items[]
      const categoryInfoMap = new Map(); // categoryId -> { name, id }
      
      for (const item of staffGroup.items) {
        // Ürünün kategori ID'sini bul
        const product = db.products.find(p => p.id === item.id);
        const fallbackCategoryIdRaw = item?.category_id ?? item?.categoryId ?? item?.categoryID ?? null;
        const fallbackCategoryId =
          typeof fallbackCategoryIdRaw === 'string'
            ? (parseInt(fallbackCategoryIdRaw, 10) || null)
            : (typeof fallbackCategoryIdRaw === 'number' ? fallbackCategoryIdRaw : null);

        const effectiveCategoryId = (product && product.category_id) ? product.category_id : fallbackCategoryId;

        if (effectiveCategoryId) {
          const categoryId = effectiveCategoryId;
          const category = db.categories.find(c => c.id === categoryId);
          
          if (!categoryItemsMap.has(categoryId)) {
            categoryItemsMap.set(categoryId, []);
            categoryInfoMap.set(categoryId, {
              id: categoryId,
              name: category?.name || `Kategori ${categoryId}`
            });
          }
          categoryItemsMap.get(categoryId).push(item);
        } else {
          // Kategori bulunamazsa, 'no-category' key kullan
          if (!categoryItemsMap.has('no-category')) {
            categoryItemsMap.set('no-category', []);
            categoryInfoMap.set('no-category', {
              id: 'no-category',
              name: 'Diğer'
            });
          }
          categoryItemsMap.get('no-category').push(item);
        }
      }
      
      console.log(`   📋 Kategori grupları: ${categoryItemsMap.size} kategori`);
      
      // 3. Kategorileri yazıcılara göre grupla (aynı yazıcıya atanmış kategorileri birleştir)
      const printerGroupsMap = new Map(); // printerKey -> { printerName, printerType, isBeverageOnly, categories: [{ categoryId, categoryName, items }] }
      
      categoryItemsMap.forEach((categoryItems, categoryId) => {
        const categoryIdNum = typeof categoryId === 'string' && categoryId !== 'no-category' ? parseInt(categoryId) : categoryId;
        const categoryInfo = categoryInfoMap.get(categoryId);
        
        // Bu kategori için atanmış yazıcıyı bul
        const assignment = printerAssignments.find(a => {
          const assignmentCategoryId = typeof a.category_id === 'string' ? parseInt(a.category_id) : a.category_id;
          return assignmentCategoryId === categoryIdNum;
        });
        
        let printerName, printerType;
        
        if (assignment) {
          printerName = assignment.printerName;
          printerType = assignment.printerType;
          console.log(`   ✓ Kategori "${categoryInfo.name}" (ID: ${categoryId}) için yazıcı bulundu: "${printerName}"`);
        } else {
          // Kategori ataması yoksa atla (kasa yazıcısına adisyon yazdırma)
          console.warn(`   ⚠️ Kategori "${categoryInfo.name}" (ID: ${categoryId}) için yazıcı ataması yok, atlanıyor`);
          return; // Kasa yazıcısına adisyon yazdırma
        }
        
        // Yazıcı key'i oluştur (aynı yazıcıyı gruplamak için)
        const isBeverageCategory =
          isGeceDonercisiTenant &&
          normalizeTrText(categoryInfo?.name || '') === 'icecekler';

        // Gece Dönercisi kuralı:
        // "İçecekler" kategorisi hangi yazıcıya atanmış olursa olsun döner fişinden ayrı, ayrı kağıt basılsın.
        // (Aynı yazıcı olsa bile ayrı print job)
        const printerKey = isBeverageCategory
          ? `${printerName}::${printerType}::ICECEKLER_ONLY`
          : `${printerName}::${printerType}`;
        
        if (!printerGroupsMap.has(printerKey)) {
          printerGroupsMap.set(printerKey, {
            printerName,
            printerType,
            isBeverageOnly: !!isBeverageCategory,
            categories: []
          });
        }
        
        // Bu kategoriyi yazıcı grubuna ekle
        printerGroupsMap.get(printerKey).categories.push({
          categoryId,
          categoryName: categoryInfo.name,
          items: categoryItems
        });
      });
      
      console.log(`   🖨️ Yazıcı grupları: ${printerGroupsMap.size} yazıcı`);
      
      // 4. Her yazıcı için tek bir adisyon yazdır (kategoriler başlıklarla ayrılmış)
      const printJobs = Array.from(printerGroupsMap.values()).sort((a, b) => {
        // Gece Dönercisi: içecek fişi her zaman en sona
        if (!isGeceDonercisiTenant) return 0;
        return (a.isBeverageOnly ? 1 : 0) - (b.isBeverageOnly ? 1 : 0);
      });
      
      for (let i = 0; i < printJobs.length; i++) {
        const job = printJobs[i];
        
        // Tüm kategorilerin ürünlerini birleştir (kategori bilgisiyle)
        const allItemsWithCategory = [];
        job.categories.forEach(cat => {
          cat.items.forEach(item => {
            allItemsWithCategory.push({
              ...item,
              _categoryId: cat.categoryId,
              _categoryName: cat.categoryName
            });
          });
        });
        
        // Bu personel grubu için özel adisyon data'sı oluştur
        const printerAdisyonData = {
          ...adisyonData,
          items: allItemsWithCategory,
          categories: job.categories.map(cat => ({
            categoryId: cat.categoryId,
            categoryName: cat.categoryName,
            items: cat.items
          })),
          // Personel grubunun bilgilerini kullan
          sale_date: staffGroup.staffDate,
          sale_time: staffGroup.staffTime,
          staff_name: staffGroup.staffName
        };
        
        console.log(`\n   🖨️ ADİSYON YAZDIRMA ${i + 1}/${printJobs.length}`);
        console.log(`      Yazıcı: "${job.printerName}"`);
        console.log(`      Personel: "${staffGroup.staffName || 'Kasa'}"`);
        console.log(`      Tarih/Saat: ${staffGroup.staffDate} ${staffGroup.staffTime}`);
        console.log(`      Kategori sayısı: ${job.categories.length}`);
        console.log(`      Toplam ürün sayısı: ${allItemsWithCategory.length}`);
        
        await printAdisyonToPrinter(
          job.printerName,
          job.printerType,
          allItemsWithCategory,
          printerAdisyonData
        ).catch(err => {
          console.error(`      ❌ Adisyon yazdırma hatası:`, err);
        });
        
        // Yazıcılar arası kısa bekleme
        if (i < printJobs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Personel grupları arası kısa bekleme
      if (staffGroupIndex < staffGroups.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    console.log(`\n=== KATEGORİ BAZLI ADİSYON YAZDIRMA TAMAMLANDI ===`);
  } catch (error) {
    console.error('\n❌ KATEGORİ BAZLI ADİSYON YAZDIRMA HATASI:', error);
    // Hata durumunda kasa yazıcısına yazdırma yapma (sadece kategori bazlı yazıcılara yazdır)
  }
}

// Modern ve profesyonel adisyon HTML formatı
function generateAdisyonHTML(items, adisyonData) {
  // Yaka's Grill kontrolü
  const tenantInfo = tenantManager.getCurrentTenantInfo();
  const isYakasGrill = tenantInfo?.tenantId === 'TENANT-1766340222641';
  const isGeceDonercisi = tenantInfo?.tenantId === 'TENANT-1769602125250';
  
  // Garson ismini adisyonData'dan al (eğer yoksa items'dan al)
  const staffName = adisyonData.staff_name || (items.length > 0 && items[0].staff_name ? items[0].staff_name : null);
  
  // Fiş numarası - orderId varsa onu kullan, yoksa masa numarasından üret
  const receiptNo = adisyonData.orderId || (adisyonData.tableName ? adisyonData.tableName.replace(/\D/g, '') || null : null);
  
  // Masa bilgisi - sadece masa adı
  const tableInfo = adisyonData.tableName || null;
  
  // Tarih ve saat
  const orderDate = adisyonData.sale_date || new Date().toLocaleDateString('tr-TR');
  const orderTime = adisyonData.sale_time || getFormattedTime(new Date());
  const orderDateTime = `${orderDate} ${orderTime}`;

  // Sipariş notu (customer.html gibi order-level notlar)
  const orderNoteRaw =
    (adisyonData && (adisyonData.orderNote || adisyonData.order_note)) ||
    null;
  const escapeHtml = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const orderNoteHtml = orderNoteRaw
    ? escapeHtml(orderNoteRaw).replace(/\n/g, '<br>')
    : null;
  
  // Ürünleri formatla - "1,5 X ADANA PORSİYON" formatında
  let itemsHTML = '';
  
  // Eğer kategori bilgisi varsa, kategorilere göre grupla
  const hasCategories = adisyonData.categories && adisyonData.categories.length > 0;
  
  if (hasCategories) {
    // Kategorilere göre gruplanmış format (kategori başlığı olmadan)
    adisyonData.categories.forEach((category, catIndex) => {
      // Kategori ürünleri (kategori başlığı kaldırıldı)
      category.items.forEach(item => {
        const isGift = item.isGift || false;
        const portion = item.portion || null;
        const productName = item.name || '';
        const quantity = item.quantity || 1;
        
        // Ürün adını formatla - porsiyon varsa "ADANA PORSİYON" formatında
        let displayName = productName;
        if (portion) {
          // Eğer ürün adında "PORSİYON" yoksa ekle
          if (!displayName.toUpperCase().includes('PORSİYON')) {
            displayName = `${displayName} PORSİYON`;
          }
        }
        
        // Yaka's Grill için özel işlem: Porsiyon varsa ve quantity > 1 ise, her birini ayrı satır olarak yazdır
        const shouldExpandItems = isYakasGrill && portion !== null && portion !== undefined && quantity > 1;
        
        // Soğanlı/soğansız bilgisi varsa ürünün sağına ekle
        const onionOption = item.onionOption || null;
        const onionText = onionOption ? ` ${onionOption.toUpperCase()}` : '';

        // Gece Dönercisi: Döner seçimleri (ürünle aynı puntoda/kalınlıkta)
        const donerOptionsText = isGeceDonercisi && item.donerOptionsText ? String(item.donerOptionsText) : null;
        const donerHTML = donerOptionsText
          ? `<div style="margin-top: 2px; font-size: 14px; font-weight: 900; color: #000; font-family: Arial, sans-serif;">${donerOptionsText.toUpperCase()}</div>`
          : '';
        
        // Ürün notu varsa göster
        const noteHTML = item.extraNote ? `
          <div style="margin-top: 5px; padding: 5px 10px; background: #fef3c7; border-left: 2px solid #f59e0b; border-radius: 5px;">
            <div style="font-size: 12px; font-weight: 700; color: #92400e; font-family: Arial, sans-serif;">📝 ${item.extraNote}</div>
          </div>
        ` : '';
        
        // Item HTML'i oluşturma fonksiyonu
        const createItemHTML = (itemTextValue) => {
          if (isGift) {
            return `
              <div style="margin-bottom: 8px; padding: 5px 0; border-bottom: 1px solid #ccc;">
                <div style="font-size: 14px; font-weight: 900; color: #000; text-decoration: line-through; font-family: Arial, sans-serif; display: flex; justify-content: space-between; align-items: center;">
                  <span>${itemTextValue}</span>
                  ${onionText ? `<span style="font-size: 13px; font-weight: 700; color: #000;">${onionText}</span>` : ''}
                </div>
                ${donerHTML}
                ${noteHTML}
              </div>
            `;
          } else {
            return `
              <div style="margin-bottom: 8px; padding: 5px 0; border-bottom: 1px solid #000;">
                <div style="font-size: 14px; font-weight: 900; color: #000; font-family: Arial, sans-serif; display: flex; justify-content: space-between; align-items: center;">
                  <span>${itemTextValue}</span>
                  ${onionText ? `<span style="font-size: 13px; font-weight: 700; color: #000;">${onionText}</span>` : ''}
                </div>
                ${donerHTML}
                ${noteHTML}
              </div>
            `;
          }
        };
        
        if (shouldExpandItems) {
          // Yaka's Grill için: Her birini ayrı satır olarak yazdır
          const displayQuantity = portion.toString().replace('.', ',');
          const itemText = `${displayQuantity} X ${displayName.toUpperCase()}`;
          
          // Quantity kadar ayrı satır oluştur
          for (let i = 0; i < quantity; i++) {
            itemsHTML += createItemHTML(itemText);
          }
        } else {
          // Normal durum: Tek satır olarak göster
          const displayQuantity = portion !== null && portion !== undefined ? portion : quantity;
          const itemText = `${displayQuantity.toString().replace('.', ',')} X ${displayName.toUpperCase()}`;
          itemsHTML += createItemHTML(itemText);
        }
      });
    });
  } else {
    // Kategori bilgisi yoksa basit format
    items.forEach(item => {
      const isGift = item.isGift || false;
      const portion = item.portion || null;
      const productName = item.name || '';
      const quantity = item.quantity || 1;
      
      // Ürün adını formatla - porsiyon varsa "ADANA PORSİYON" formatında
      let displayName = productName;
      if (portion) {
        // Eğer ürün adında "PORSİYON" yoksa ekle
        if (!displayName.toUpperCase().includes('PORSİYON')) {
          displayName = `${displayName} PORSİYON`;
        }
      }
      
      // Yaka's Grill için özel işlem: Porsiyon varsa ve quantity > 1 ise, her birini ayrı satır olarak yazdır
      const shouldExpandItems = isYakasGrill && portion !== null && portion !== undefined && quantity > 1;
      
      // Soğanlı/soğansız bilgisi varsa ürünün sağına ekle
      const onionOption = item.onionOption || null;
      const onionText = onionOption ? ` ${onionOption.toUpperCase()}` : '';

      // Gece Dönercisi: Döner seçimleri (ürünle aynı puntoda/kalınlıkta)
      const donerOptionsText = isGeceDonercisi && item.donerOptionsText ? String(item.donerOptionsText) : null;
      const donerHTML = donerOptionsText
        ? `<div style="margin-top: 2px; font-size: 14px; font-weight: 900; color: #000; font-family: Arial, sans-serif;">${donerOptionsText.toUpperCase()}</div>`
        : '';
      
      // Ürün notu varsa göster
      const noteHTML = item.extraNote ? `
        <div style="margin-top: 5px; padding: 5px 10px; background: #fef3c7; border-left: 2px solid #f59e0b; border-radius: 5px;">
          <div style="font-size: 12px; font-weight: 700; color: #92400e; font-family: Arial, sans-serif;">📝 ${item.extraNote}</div>
        </div>
      ` : '';
      
      // Item HTML'i oluşturma fonksiyonu
      const createItemHTML = (itemTextValue) => {
        if (isGift) {
          return `
            <div style="margin-bottom: 8px; padding: 5px 0; border-bottom: 1px solid #ccc;">
              <div style="font-size: 14px; font-weight: 900; color: #000; text-decoration: line-through; font-family: Arial, sans-serif; display: flex; justify-content: space-between; align-items: center;">
                <span>${itemTextValue}</span>
                ${onionText ? `<span style="font-size: 13px; font-weight: 700; color: #000;">${onionText}</span>` : ''}
              </div>
              ${donerHTML}
              ${noteHTML}
            </div>
          `;
        } else {
          return `
            <div style="margin-bottom: 8px; padding: 5px 0; border-bottom: 1px solid #000;">
              <div style="font-size: 14px; font-weight: 900; color: #000; font-family: Arial, sans-serif; display: flex; justify-content: space-between; align-items: center;">
                <span>${itemTextValue}</span>
                ${onionText ? `<span style="font-size: 13px; font-weight: 700; color: #000;">${onionText}</span>` : ''}
              </div>
              ${donerHTML}
              ${noteHTML}
            </div>
          `;
        }
      };
      
      if (shouldExpandItems) {
        // Yaka's Grill için: Her birini ayrı satır olarak yazdır
        const displayQuantity = portion.toString().replace('.', ',');
        const itemText = `${displayQuantity} X ${displayName.toUpperCase()}`;
        
        // Quantity kadar ayrı satır oluştur
        for (let i = 0; i < quantity; i++) {
          itemsHTML += createItemHTML(itemText);
        }
      } else {
        // Normal durum: Tek satır olarak göster
        const displayQuantity = portion !== null && portion !== undefined ? portion : quantity;
        const itemText = `${displayQuantity.toString().replace('.', ',')} X ${displayName.toUpperCase()}`;
        itemsHTML += createItemHTML(itemText);
      }
    });
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @media print {
          @page {
            size: 75mm auto;
            margin: 0;
            min-height: 100%;
          }
          body {
            margin: 0;
            padding: 10px 10px 10px 42px;
            height: auto;
            min-height: 100%;
            color: #000 !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          * {
            color: #000 !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: Arial, sans-serif;
          width: 75mm;
          max-width: 75mm;
          padding: 10px 10px 10px 42px;
          margin: 0;
          font-size: 14px;
          color: #000;
          background: white;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
          padding-bottom: 5px;
          border-bottom: 1px solid #000;
        }
        .receipt-no {
          font-size: 13px;
          font-weight: 700;
          color: #000;
        }
        .receipt-title {
          font-size: 14px;
          font-weight: 700;
          color: #000;
          text-align: right;
        }
        .table-info {
          text-align: center;
          margin: 10px 0;
          padding: 5px 0;
          border-bottom: 1px solid #000;
          font-size: 14px;
          font-weight: 700;
          color: #000;
        }
        .items {
          margin: 10px 0;
        }
        .item {
          margin-bottom: 8px;
          padding: 5px 0;
          border-bottom: 1px solid #000;
        }
        .item-text {
          font-size: 14px;
          font-weight: 700;
          color: #000;
        }
        .footer {
          margin-top: 15px;
          padding-top: 10px;
          border-top: 1px solid #000;
        }
        .footer-line {
          font-size: 13px;
          font-weight: 700;
          color: #000;
          margin-bottom: 5px;
        }
      </style>
    </head>
    <body>
      <!-- Başlık: FİŞ NO sol, SİPARİŞ FİŞİ sağ -->
      <div class="header">
        <div class="receipt-no">${receiptNo ? `FİŞ NO : ${receiptNo}` : 'FİŞ NO : -'}</div>
        <div class="receipt-title">SİPARİŞ FİŞİ</div>
      </div>
      
      <!-- Masa Bilgisi: PAKET / P 2 -->
      ${tableInfo ? `
      <div class="table-info">${tableInfo}</div>
      ` : ''}

      <!-- Sipariş Notu -->
      ${orderNoteHtml ? `
      <div style="margin: 8px 0 6px; padding: 8px 10px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 8px;">
        <div style="font-size: 12px; font-weight: 900; color: #92400e; margin-bottom: 3px;">📝 NOT</div>
        <div style="font-size: 12px; font-weight: 800; color: #78350f;">${orderNoteHtml}</div>
      </div>
      ` : ''}
      
      <!-- Ürünler -->
      <div class="items">
        ${itemsHTML}
      </div>
      
      <!-- Alt Bilgiler -->
      <div class="footer">
        ${staffName ? `
        <div class="footer-line">SİPARİŞİ VEREN : ${staffName.toUpperCase()}</div>
        ` : ''}
        <div class="footer-line">SİPARİŞ TARİHİ: ${orderDateTime}</div>
      </div>
    </body>
    </html>
  `;
}

// Mobil HTML oluştur
// İptal fişi HTML formatı
function generateCancelReceiptHTML(cancelData) {
  const tenantInfoCancel = tenantManager.getCurrentTenantInfo();
  const isLacromisaCancel = tenantInfoCancel?.tenantId === LACRIMOSA_TENANT_ID;
  const tableTypeText = cancelData.tableTypeDisplay != null
    ? cancelData.tableTypeDisplay
    : (isLacromisaCancel
      ? (cancelData.tableType === 'inside' ? 'Salon Masa' : 'Bahçe Masa')
      : (cancelData.tableType === 'inside' ? 'İç Masa' : 'Dış Masa'));
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;900&display=swap" rel="stylesheet">
      <style>
        @media print {
          @page {
            size: 58mm auto;
            margin: 0;
            min-height: 100%;
          }
          body {
            margin: 0;
            padding: 8px 8px 12px 8px;
            height: auto;
            min-height: 100%;
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          * {
            color: #000 !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        body {
          font-family: 'Montserrat', sans-serif;
          background: white;
          color: #000;
          margin: 0;
          padding: 8px;
          font-size: 10px;
          line-height: 1.4;
        }
      </style>
    </head>
    <body>
      <div style="margin-bottom: 12px; padding: 8px; background: white; border: 2px solid #000; border-radius: 4px;">
        <div style="margin-bottom: 6px;">
          <p style="margin: 0; font-size: 9px; color: #000; font-weight: 700; text-transform: uppercase;">Masa</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; font-weight: 900; color: #000;">${tableTypeText} ${cancelData.tableName}</p>
        </div>
      </div>
      
      <div style="margin-bottom: 12px; padding: 10px; background: white; border: 2px solid #000; border-radius: 4px;">
        <div style="margin-bottom: 6px;">
          <p style="margin: 0; font-size: 9px; color: #000; font-weight: 700; text-transform: uppercase;">Ürün</p>
          ${cancelData.items && cancelData.items.length > 1 
            ? cancelData.items.map(item => `
              <div style="margin-top: 6px; padding-bottom: 6px; border-bottom: 1px solid #ccc;">
                <p style="margin: 0; font-size: 11px; font-weight: 900; color: #000; text-decoration: line-through; text-decoration-thickness: 2px;">${item.productName}</p>
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                  <span style="font-size: 9px; color: #000; font-weight: 700;">${item.quantity} adet</span>
                  <span style="font-size: 9px; color: #000; font-weight: 700;">₺${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            `).join('')
            : `
              <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 900; color: #000; text-decoration: line-through; text-decoration-thickness: 3px;">${cancelData.productName}</p>
            `
          }
          <span style="display: inline-block; font-size: 8px; color: #000; font-weight: 700; padding: 2px 6px; border: 1px solid #000; border-radius: 3px; margin-top: 4px;">iptal</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 2px solid #000;">
          <div>
            <p style="margin: 0; font-size: 8px; color: #000; font-weight: 700;">Toplam Adet</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; font-weight: 900; color: #000;">${cancelData.quantity} adet</p>
          </div>
          ${!cancelData.items || cancelData.items.length === 1 ? `
          <div style="text-align: right;">
            <p style="margin: 0; font-size: 8px; color: #000; font-weight: 700;">Birim Fiyat</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; font-weight: 900; color: #000;">₺${cancelData.price.toFixed(2)}</p>
          </div>
          ` : ''}
        </div>
        <div style="margin-top: 10px; padding-top: 10px; border-top: 3px solid #000;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <p style="margin: 0; font-size: 9px; color: #000; font-weight: 700; text-transform: uppercase;">Toplam</p>
            <p style="margin: 0; font-size: 16px; font-weight: 900; color: #000;">₺${cancelData.items && cancelData.items.length > 1 
              ? cancelData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)
              : (cancelData.price * cancelData.quantity).toFixed(2)
            }</p>
          </div>
        </div>
      </div>
      
      <div style="margin-top: 12px; padding-top: 8px; border-top: 2px solid #000; text-align: center;">
        <p style="margin: 0; font-size: 8px; color: #000; font-weight: 700;">
          ${cancelData.cancelDate} ${cancelData.cancelTime}
        </p>
        <p style="margin: 4px 0 0 0; font-size: 7px; color: #000; font-weight: 600;">
          Kategori: ${cancelData.categoryName}
        </p>
      </div>
    </body>
    </html>
  `;
}

// İptal fişi yazdırma fonksiyonu
async function printCancelReceipt(printerName, printerType, cancelData) {
  let printWindow = null;
  
  try {
    console.log(`   [printCancelReceipt] İptal fişi yazdırılıyor: "${printerName || 'Varsayılan'}"`);
    
    // İptal fişi HTML içeriğini oluştur
    const cancelHTML = generateCancelReceiptHTML(cancelData);

    // Gizli bir pencere oluştur ve içeriği yükle
    printWindow = new BrowserWindow({
      show: false,
      width: 220, // 58mm ≈ 220px (72 DPI'da)
      height: 3000,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    let printResolve, printReject;
    const printPromise = new Promise((resolve, reject) => {
      printResolve = resolve;
      printReject = reject;
    });

    let targetPrinterName = printerName;
    let printStarted = false;
    
    const startPrint = () => {
      if (printStarted) return;
      printStarted = true;
      
      setTimeout(async () => {
        // Yazıcı kontrolü
        if (targetPrinterName) {
          try {
            const powershellCmd = `Get-WmiObject Win32_Printer | Select-Object Name | ConvertTo-Json`;
            const result = execSync(`powershell -Command "${powershellCmd}"`, { 
              encoding: 'utf-8',
              timeout: 5000 
            });
            
            const printersData = JSON.parse(result);
            const printersArray = Array.isArray(printersData) ? printersData : [printersData];
            const availablePrinters = printersArray.map(p => p.Name || '').filter(n => n);
            
            const exactMatch = availablePrinters.find(p => p === targetPrinterName);
            const partialMatch = availablePrinters.find(p => p.includes(targetPrinterName) || targetPrinterName.includes(p));
            
            if (exactMatch) {
              targetPrinterName = exactMatch;
            } else if (partialMatch) {
              targetPrinterName = partialMatch;
            } else {
              targetPrinterName = null;
            }
          } catch (error) {
            console.error(`   ❌ Yazıcı kontrolü hatası:`, error.message);
          }
        }
        
        const printOptions = {
          silent: true,
          printBackground: true,
          margins: { marginType: 'none' },
          landscape: false,
          scaleFactor: 100,
          pagesPerSheet: 1,
          collate: false,
          color: false,
          copies: 1,
          duplex: 'none'
        };
        
        if (targetPrinterName) {
          printOptions.deviceName = targetPrinterName;
        }

        printWindow.webContents.print(printOptions, (success, errorType) => {
          if (!success) {
            printReject(new Error(errorType || 'İptal fişi yazdırma başarısız'));
          } else {
            console.log(`      ✅ İptal fişi yazdırma başarılı!`);
            printResolve(true);
          }
          
          setTimeout(() => {
            if (printWindow && !printWindow.isDestroyed()) {
              printWindow.close();
              printWindow = null;
            }
          }, 1000);
        });
      }, 2000);
    };

    printWindow.webContents.once('did-finish-load', () => {
      startPrint();
    });

    printWindow.webContents.once('dom-ready', () => {
      startPrint();
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(cancelHTML)}`);

    setTimeout(() => {
      startPrint();
    }, 3000);

    await Promise.race([
      printPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('İptal fişi yazdırma timeout')), 10000))
    ]);

    return { success: true, printerName: targetPrinterName || 'Varsayılan' };
  } catch (error) {
    console.error(`   [printCancelReceipt] Hata:`, error.message);
    
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.close();
    }
    
    throw error;
  }
}

function generateMobileHTML(serverURL) {
  // Tenant'ın tema rengini ve masa sayılarını al (masaüstü uygulamadaki mantıkla aynı)
  const tenantInfo = tenantManager.getCurrentTenantInfo();
  const tenantId = tenantInfo?.tenantId || null;
  const isSultanSomati = tenantId === 'TENANT-1766611377865';
  const isYakasGrill = tenantId === 'TENANT-1766340222641';
  const isGeceDonercisi = tenantId === 'TENANT-1769602125250';
  const isLacromisa = tenantId === 'TENANT-1769956051654';
  const themeColor = tenantInfo?.themeColor || '#f97316';
  
  // Gece Dönercisi: LOCA sadece Şeker şubesinde; mobil personel senkron
  const geceCurrentBranch = isGeceDonercisi ? (geceBranchSelection?.branch || db.settings?.geceBranch || null) : null;
  const geceDonercisiCategories = isGeceDonercisi ? [
    { id: 'salon', name: 'Salon', count: 30, icon: '🪑' },
    { id: 'bahce', name: 'Bahçe', count: 30, icon: '🌿' },
    { id: 'paket', name: 'Paket', count: 30, icon: '📦' },
    { id: 'trendyolgo', name: 'TrendyolGO', count: 30, icon: '🛒' },
    { id: 'yemeksepeti', name: 'Yemeksepeti', count: 30, icon: '🍽️' },
    { id: 'migros-yemek', name: 'Migros Yemek', count: 30, icon: '🛍️' },
    ...(geceCurrentBranch === 'SEKER' ? [{ id: 'loca', name: 'Loca', count: 1, icon: '📍' }] : [])
  ] : [];
  
  // Sultan Somatı için salon yapısı
  const sultanSomatiSalons = [
    { id: 'disari', name: 'Dışarı', count: 4, icon: '☀️' },
    { id: 'kis-bahcesi', name: 'Kış Bahçesi', count: 14, icon: '🌿' },
    { id: 'osmanli-odasi', name: 'Osmanlı Odası', count: 8, icon: '🏛️' },
    { id: 'selcuklu-odasi', name: 'Selçuklu Odası', count: 10, icon: '🕌' },
    { id: 'mevlevi-odasi', name: 'Mevlevi Odası', count: 1, icon: '🕯️' },
    { id: 'ask-odasi', name: 'Aşk Odası', count: 1, icon: '💕' }
  ];
  
  // 0 değeri geçerli olduğu için null/undefined kontrolü yapıyoruz
  const insideTablesCount = isLacromisa
    ? 15
    : (tenantInfo?.insideTables !== undefined && tenantInfo?.insideTables !== null
      ? tenantInfo.insideTables
      : 20);
  const outsideTablesCount = isLacromisa
    ? 15
    : (tenantInfo?.outsideTables !== undefined && tenantInfo?.outsideTables !== null
      ? tenantInfo.outsideTables
      : 20);
  const packageTablesCount = isLacromisa
    ? 0
    : (tenantInfo?.packageTables !== undefined && tenantInfo?.packageTables !== null
      ? tenantInfo.packageTables
      : 5);

  // Lacromisa: masa kategorileri Salon/Bahçe (içeri/dışarı değil)
  const insideLabelBig = isLacromisa ? 'SALON' : 'İÇERİ';
  const outsideLabelBig = isLacromisa ? 'BAHÇE' : 'DIŞARI';
  const insideLabelShort = isLacromisa ? 'Salon' : 'İç';
  const outsideLabelShort = isLacromisa ? 'Bahçe' : 'Dış';
  
  // Tema renklerini hesapla (basit versiyon)
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  
  const adjustBrightness = (hex, percent) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const r = Math.max(0, Math.min(255, rgb.r + (rgb.r * percent / 100)));
    const g = Math.max(0, Math.min(255, rgb.g + (rgb.g * percent / 100)));
    const b = Math.max(0, Math.min(255, rgb.b + (rgb.b * percent / 100)));
    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
  };
  
  const primary = themeColor;
  const primaryLight = adjustBrightness(themeColor, 15);
  const primaryDark = adjustBrightness(themeColor, -20);
  const rgb = hexToRgb(primary);
  
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="${themeColor}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="${tenantManager.getBusinessName()} Mobil">
  <link rel="manifest" href="${serverURL}/mobile-manifest.json">
  <link rel="icon" type="${isLacromisa ? 'image/jpeg' : 'image/png'}" href="${serverURL}/${isGeceDonercisi ? 'tenant.png' : (isLacromisa ? 'lacrimosa.jpg' : 'mobilpersonel.png')}">
  <link rel="apple-touch-icon" href="${serverURL}/${isGeceDonercisi ? 'tenant.png' : (isLacromisa ? 'lacrimosa.jpg' : 'mobilpersonel.png')}">
  <title>${tenantManager.getBusinessName()} - Mobil Sipariş</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%); 
      min-height: 100vh; 
      padding: 0; 
      margin: 0;
    }
    .container { 
      max-width: 100%; 
      margin: 0; 
      background: white; 
      border-radius: 0; 
      padding: 0; 
      box-shadow: none; 
      min-height: 100vh;
    }
    .table-type-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
      background: #f5f5f5;
      padding: 5px;
      border-radius: 12px;
    }
    .table-type-tab {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 10px;
      background: transparent;
      font-size: 16px;
      font-weight: bold;
      color: #666;
      cursor: pointer;
      transition: all 0.3s;
    }
    .table-type-tab[data-type="inside"] {
      background: #dbeafe;
      color: #1e40af;
    }
    .table-type-tab[data-type="inside"].active {
      background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }
    .table-type-tab[data-type="outside"] {
      background: #fff7ed;
      color: #c2410c;
    }
    .table-type-tab[data-type="outside"].active {
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 100%);
      color: white;
      box-shadow: 0 4px 12px ${primary}66;
    }
    .table-grid {
      display: grid;
      grid-template-columns: ${isSultanSomati ? 'repeat(2, 1fr)' : isGeceDonercisi ? 'repeat(5, 1fr)' : (isYakasGrill ? 'repeat(6, 1fr)' : 'repeat(4, 1fr)')};
      gap: ${isSultanSomati ? '12px' : isGeceDonercisi ? '12px' : (isYakasGrill ? '6px' : '8px')};
      margin-bottom: 20px;
      ${isSultanSomati ? 'padding-top: 10px;' : ''}
      ${(isYakasGrill || isGeceDonercisi) ? 'padding: 8px; max-height: calc(100vh - 120px); overflow-y: auto;' : ''}
    }
    .table-btn {
      ${isSultanSomati ? 'min-height: 120px;' : isGeceDonercisi ? 'aspect-ratio: 1; min-height: 88px;' : (isYakasGrill ? 'aspect-ratio: 1; min-height: 60px;' : 'aspect-ratio: 1;')}
      border: ${isSultanSomati ? '1px' : (isYakasGrill || isGeceDonercisi ? '1px' : '2px')} solid #e0e0e0;
      border-radius: ${isGeceDonercisi ? '14px' : (isYakasGrill ? '8px' : '12px')};
      background: white;
      font-size: ${isSultanSomati ? '18px' : isGeceDonercisi ? '14px' : (isYakasGrill ? '11px' : '14px')};
      font-weight: bold;
      color: #333;
      cursor: pointer;
      transition: all 0.3s;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      padding: ${isSultanSomati ? '20px' : isGeceDonercisi ? '14px 10px' : (isYakasGrill ? '8px 4px' : '5px')};
    }
    .table-btn.outside-empty {
      background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
      border-color: #facc15;
      color: #92400e;
    }
    .table-btn:active {
      transform: scale(0.95);
    }
    .table-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
    }
    .transfer-table-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
    }
    .package-table-btn:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }
    .package-table-btn:hover .table-number {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }
    .table-btn.selected {
      border-color: ${primary};
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      color: white;
      box-shadow: 0 4px 12px ${primary}66;
    }
    .table-btn.has-order {
      border-color: #047857;
      background: linear-gradient(135deg, #065f46 0%, #022c22 100%);
      color: #ecfdf5;
    }
    .table-btn.has-order.selected {
      border-color: #22c55e;
      background: linear-gradient(135deg, #047857 0%, #022c22 100%);
      color: #ecfdf5;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.5);
    }
    .table-btn.has-order::before {
      content: '●';
      position: absolute;
      top: 5px;
      right: 5px;
      color: #22c55e;
      font-size: 16px;
    }
    .table-btn.has-order.selected::before {
      color: white;
    }
    .table-number {
      font-size: 16px;
      font-weight: bold;
    }
    .table-label {
      font-size: 10px;
      opacity: 0.8;
      margin-top: 2px;
    }
    .table-btn.outside-empty .table-number,
    .table-btn.outside-empty .table-label {
      color: #92400e;
    }
    .category-tabs {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 8px;
      width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: #a855f7 #f1f1f1;
    }
    .category-tabs::-webkit-scrollbar {
      height: 6px;
    }
    .category-tabs::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }
    .category-tabs::-webkit-scrollbar-thumb {
      background: #a855f7;
      border-radius: 10px;
    }
    .category-tabs::-webkit-scrollbar-thumb:hover {
      background: #9333ea;
    }
    .category-tabs-row {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
      width: max-content;
      min-width: 100%;
      align-items: stretch;
    }
    .category-tab {
      padding: 16px 20px;
      border: 2px solid #e5e7eb;
      border-radius: 14px;
      background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%);
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      color: #4b5563;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
      text-align: center;
      flex-shrink: 0;
      min-width: fit-content;
      min-height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    .category-tab::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
      transition: left 0.5s;
    }
    .category-tab:hover::before {
      left: 100%;
    }
    .category-tab:hover {
      border-color: #d1d5db;
      background: linear-gradient(135deg, #ffffff 0%, #f3f4f6 100%);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
      transform: translateY(-2px);
      color: #374151;
    }
    .category-tab:active {
      transform: scale(0.97) translateY(0);
    }
    .category-tab.active {
      border-color: #fed7aa;
      background: linear-gradient(135deg, #fce7f3 0%, #fdf2f8 100%);
      color: ${primary};
      box-shadow: 0 4px 16px ${primary}40, 0 2px 8px ${primary}25, inset 0 1px 0 rgba(255, 255, 255, 0.8);
      transform: translateY(-2px);
      font-weight: 700;
      position: relative;
    }
    .category-tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, ${primaryLight} 0%, ${primary} 50%, ${primaryLight} 100%);
      border-radius: 0 0 14px 14px;
      box-shadow: 0 2px 8px ${primary}66;
    }

    /* Lacromisa: 2 satır kategori alanı daha kurumsal */
    .tenant-lacromisa .category-tabs {
      gap: 8px;
      padding-bottom: 6px;
      scrollbar-color: #0f172a #e5e7eb;
    }
    .tenant-lacromisa .category-tabs-row {
      gap: 8px;
    }
    .tenant-lacromisa .category-tab {
      padding: 12px 14px;
      border: 1px solid rgba(15, 23, 42, 0.14);
      border-radius: 12px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      color: #0f172a;
      font-weight: 900;
      font-size: 13px;
      letter-spacing: -0.1px;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
      min-height: 44px;
    }
    .tenant-lacromisa .category-tab:hover {
      border-color: rgba(15, 23, 42, 0.22);
      background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
      transform: translateY(-1px);
      color: #0b1220;
    }
    .tenant-lacromisa .category-tab.active {
      border-color: rgba(15, 23, 42, 0.0);
      background: linear-gradient(135deg, #0f172a 0%, #1f2937 100%);
      color: #ffffff;
      box-shadow: 0 14px 34px rgba(15, 23, 42, 0.28);
      transform: translateY(-1px);
    }
    .tenant-lacromisa .category-tab.active::after {
      background: linear-gradient(90deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0.0) 100%);
      box-shadow: none;
    }
    .products-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 0;
      padding-right: 5px;
    }
    /* Scrollable container for products */
    #orderSection > div:last-child {
      scrollbar-width: thin;
      scrollbar-color: #a855f7 #f1f1f1;
    }
    #orderSection > div:last-child::-webkit-scrollbar {
      width: 6px;
    }
    #orderSection > div:last-child::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }
    #orderSection > div:last-child::-webkit-scrollbar-thumb {
      background: #a855f7;
      border-radius: 10px;
    }
    #orderSection > div:last-child::-webkit-scrollbar-thumb:hover {
      background: #9333ea;
    }
    .product-card {
      padding: 16px;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 14px;
      background: #1f2937;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 8px ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)` : 'rgba(249, 115, 22, 0.4)'}, 0 1px 3px ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)` : 'rgba(234, 88, 12, 0.3)'};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 120px;
      position: relative;
      overflow: hidden;
    }
    .product-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)` : 'rgba(249, 115, 22, 0.85)'} 0%, ${rgb ? `rgba(${Math.min(255, rgb.r + 20)}, ${Math.min(255, rgb.g + 20)}, ${Math.min(255, rgb.b + 20)}, 0.8)` : 'rgba(251, 146, 60, 0.8)'} 50%, ${rgb ? `rgba(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)}, 0.85)` : 'rgba(234, 88, 12, 0.85)'} 100%);
      z-index: 1;
    }
    .product-card:hover {
      border-color: rgba(255, 255, 255, 0.4);
      box-shadow: 0 4px 16px ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)` : 'rgba(249, 115, 22, 0.5)'}, 0 2px 8px ${rgb ? `rgba(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)}, 0.4)` : 'rgba(234, 88, 12, 0.4)'};
      transform: translateY(-2px);
    }
    .product-card:active {
      transform: translateY(0) scale(0.98);
    }
    .product-name {
      font-weight: 700;
      margin-bottom: 8px;
      font-size: 15px;
      color: white;
      line-height: 1.4;
      position: relative;
      z-index: 2;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }
    .product-price {
      color: white;
      font-weight: 800;
      font-size: 18px;
      margin-top: auto;
      position: relative;
      z-index: 2;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }
    .cart {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: white;
      display: none;
      border-top: 3px solid #a855f7;
      box-shadow: 0 -8px 30px rgba(0,0,0,0.15);
      border-radius: 20px 20px 0 0;
      transform: translateY(calc(100% - 70px));
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1000;
      max-height: 80vh;
    }
    .cart.open {
      transform: translateY(0);
    }
    .cart-header {
      padding: 16px 20px;
      border-bottom: 2px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      border-radius: 20px 20px 0 0;
    }
    .cart-header-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cart-header-title span:first-child {
      font-size: 18px;
      font-weight: 700;
      color: #1f2937;
    }
    .cart-header-title span:last-child {
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      background: white;
      padding: 4px 10px;
      border-radius: 12px;
    }
    .cart-header-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 12px ${primary}4D;
    }
    .cart-header-icon:active {
      transform: scale(0.95);
      box-shadow: 0 2px 6px ${primary}66;
    }
    .cart-content {
      padding: 20px;
      max-height: calc(80vh - 80px);
      overflow-y: auto;
      display: none;
    }
    .cart.open .cart-content {
      display: block;
    }
    .cart-content::-webkit-scrollbar {
      width: 6px;
    }
    .cart-content::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }
    .cart-content::-webkit-scrollbar-thumb {
      background: #a855f7;
      border-radius: 10px;
    }
    .cart-items {
      max-height: 250px;
      overflow-y: auto;
      margin-bottom: 20px;
      padding-right: 5px;
    }
    .cart-items::-webkit-scrollbar {
      width: 6px;
    }
    .cart-items::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }
    .cart-items::-webkit-scrollbar-thumb {
      background: #a855f7;
      border-radius: 10px;
    }
    .cart-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px;
      margin-bottom: 10px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      transition: all 0.3s;
    }
    .cart-item:hover {
      background: #f3f4f6;
      border-color: #d1d5db;
    }
    .cart-item-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .qty-btn {
      width: 36px;
      height: 36px;
      border: 2px solid ${primary};
      border-radius: 10px;
      background: white;
      color: ${primary};
      font-weight: 700;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s;
    }
    .qty-btn:hover {
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      color: white;
      transform: scale(1.05);
    }
    .qty-btn:active {
      transform: scale(0.95);
    }
    .send-btn {
      width: 100%;
      padding: 18px;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      color: white;
      border: none;
      border-radius: 14px;
      font-size: 17px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 16px ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)` : 'rgba(249, 115, 22, 0.4)'};
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      letter-spacing: 0.3px;
    }
    .send-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(168, 85, 247, 0.5);
    }
    .send-btn:active {
      transform: translateY(0) scale(0.98);
    }
    .loading {
      text-align: center;
      padding: 20px;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .pin-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      padding: 50px 30px;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
      margin: 20px auto;
      max-width: 400px;
      position: relative;
      border: 1px solid #f0f0f0;
    }
    .pin-section::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: #1f2937;
    }
    .pin-section h2 {
      margin-bottom: 6px;
      color: #1f2937;
      font-size: 26px;
      font-weight: 600;
      letter-spacing: -0.3px;
      text-align: center;
    }
    .pin-section .subtitle {
      color: #6b7280;
      font-size: 13px;
      margin-bottom: 36px;
      font-weight: 400;
      text-align: center;
      line-height: 1.5;
    }
    .pin-input-wrapper {
      position: relative;
      width: 100%;
      max-width: 340px;
      margin-bottom: 24px;
    }
    .pin-input {
      width: 100%;
      padding: 16px 20px;
      font-size: 16px;
      border: 1.5px solid #d1d5db;
      border-radius: 8px;
      text-align: center;
      transition: all 0.2s ease;
      background: #fafafa;
      font-weight: 500;
      letter-spacing: 1.5px;
      color: #1f2937;
    }
    .pin-input:focus {
      outline: none;
      border-color: #1f2937;
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(31, 41, 55, 0.08);
    }
    .pin-input::placeholder {
      color: #9ca3af;
      letter-spacing: 0;
      font-weight: 400;
    }
    .pin-btn {
      width: 100%;
      max-width: 340px;
      padding: 14px 40px;
      background: #1f2937;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(31, 41, 55, 0.2);
      transition: all 0.2s ease;
      letter-spacing: 0.3px;
    }
    .pin-btn:hover {
      background: #111827;
      box-shadow: 0 4px 12px rgba(31, 41, 55, 0.3);
    }
    .pin-btn:active {
      transform: scale(0.98);
      box-shadow: 0 1px 4px rgba(31, 41, 55, 0.2);
    }
    .pin-error {
      color: #dc2626;
      margin-top: 16px;
      font-size: 13px;
      display: none;
      padding: 12px 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      max-width: 340px;
      width: 100%;
      text-align: center;
      font-weight: 500;
    }
    .pin-error.show {
      display: block;
    }
    .login-icon {
      width: 64px;
      height: 64px;
      background: #1f2937;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 28px;
      box-shadow: 0 2px 8px rgba(31, 41, 55, 0.15);
      font-size: 28px;
    }
    .login-image {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      object-fit: cover;
      margin-bottom: 24px;
      border: 4px solid #ffffff;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      background: #f9fafb;
      display: block;
    }
    .staff-info {
      text-align: center;
      margin-top: 0;
      margin-bottom: 15px;
      padding: 10px;
      background: linear-gradient(135deg, #faf5ff 0%, #fdf2f8 100%);
      border-radius: 10px;
      border: 1px solid #e9d5ff;
    }
    .staff-info p {
      font-weight: bold;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-size: 14px;
    }
    .selected-table-info {
      text-align: center;
      margin-bottom: 15px;
      padding: 12px;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      border-radius: 12px;
      color: white;
      font-weight: bold;
      font-size: 16px;
      box-shadow: 0 4px 12px ${primary}4D;
    }
    .back-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 12px 20px;
      background: white;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      color: ${primary};
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .back-btn:hover {
      background: #f9fafb;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      border-color: ${primary};
      transform: translateY(-2px);
      box-shadow: 0 4px 12px ${primary}33;
    }
    .back-btn:active {
      transform: translateY(0) scale(0.98);
    }
    .back-btn svg {
      width: 20px;
      height: 20px;
      transition: transform 0.3s;
    }
    .back-btn:hover svg {
      transform: translateX(-2px);
    }
    .logout-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      color: #ef4444;
      border: 2px solid rgba(239, 68, 68, 0.2);
      border-radius: 16px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(239, 68, 68, 0.15);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: logoutButtonSlideIn 0.4s ease-out;
    }
    .logout-btn:hover {
      background: rgba(255, 255, 255, 1);
      border-color: rgba(239, 68, 68, 0.4);
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(239, 68, 68, 0.25);
    }
    .logout-btn:active {
      transform: translateY(0) scale(0.98);
    }
    .logout-btn svg {
      width: 18px;
      height: 18px;
      transition: transform 0.3s;
    }
    .logout-btn:hover svg {
      transform: rotate(-15deg);
    }
    @keyframes logoutButtonSlideIn {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    .logout-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: modalFadeIn 0.3s ease-out;
    }
    .logout-modal-content {
      background: white;
      border-radius: 20px;
      padding: 30px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: modalSlideUp 0.3s ease-out;
    }
    .logout-modal-icon {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 28px;
    }
    .logout-modal-title {
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .logout-modal-message {
      text-align: center;
      font-size: 16px;
      color: #6b7280;
      margin-bottom: 30px;
      line-height: 1.5;
    }
    .logout-modal-staff-name {
      font-weight: 600;
      color: #a855f7;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .logout-modal-buttons {
      display: flex;
      gap: 12px;
    }
    .logout-modal-btn {
      flex: 1;
      padding: 14px 24px;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .logout-modal-btn-cancel {
      background: #f3f4f6;
      color: #374151;
    }
    .logout-modal-btn-cancel:hover {
      background: #e5e7eb;
      transform: translateY(-2px);
    }
    .logout-modal-btn-confirm {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }
    .logout-modal-btn-confirm:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
    }
    .logout-modal-btn:active {
      transform: translateY(0) scale(0.98);
    }
    @keyframes modalFadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes modalSlideUp {
      from {
        transform: translateY(30px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    .search-box {
      width: 100%;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .search-box:focus {
      outline: none;
      border-color: #a855f7 !important;
      background: white !important;
      box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.1) !important;
      transform: translateY(-1px);
    }
    .search-box::placeholder {
      color: #9ca3af;
    }
    .toast {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      background: white;
      border-radius: 16px;
      padding: 20px 25px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      z-index: 10000;
      min-width: 300px;
      max-width: 90%;
      display: flex;
      align-items: center;
      gap: 15px;
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    .toast.success {
      border-left: 4px solid #10b981;
    }
    .toast.error {
      border-left: 4px solid #ef4444;
    }
    .toast-icon {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      flex-shrink: 0;
    }
    .toast.success .toast-icon {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
    }
    .toast.error .toast-icon {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }
    .toast-content {
      flex: 1;
    }
    .toast-title {
      font-size: 16px;
      font-weight: bold;
      color: #1f2937;
      margin-bottom: 4px;
    }
    .toast-message {
      font-size: 14px;
      color: #6b7280;
    }
    .toast-close {
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .toast-close:hover {
      background: #f3f4f6;
      color: #374151;
    }
    @keyframes checkmark {
      0% {
        transform: scale(0);
      }
      50% {
        transform: scale(1.2);
      }
      100% {
        transform: scale(1);
      }
    }
    .toast.success .toast-icon svg {
      animation: checkmark 0.5s ease-out;
    }
    /* Splash Screen Styles */
    .splash-screen {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, #ffffff 0%, #fef2f2 30%, #fce7f3 70%, #fdf2f8 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: splashFadeIn 0.6s ease-out;
    }
    .splash-content {
      text-align: center;
      padding: 60px 40px;
      animation: splashSlideUp 0.7s ease-out;
      max-width: 400px;
    }
    .splash-icon {
      width: 100px;
      height: 100px;
      margin: 0 auto 32px;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryLight}CC 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
      box-shadow: 0 8px 24px rgba(236, 72, 153, 0.25);
      animation: splashIconScale 0.8s ease-out;
      position: relative;
    }
    .splash-icon::before {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${primary}, ${primaryLight});
      opacity: 0.2;
      filter: blur(12px);
      z-index: -1;
    }
    .splash-title {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 16px;
      letter-spacing: -0.3px;
      color: #831843;
      animation: splashTextFadeIn 0.9s ease-out;
      line-height: 1.3;
    }
    .splash-name {
      font-size: 20px;
      font-weight: 500;
      margin-bottom: 48px;
      color: #9f1239;
      opacity: 0.85;
      animation: splashTextFadeIn 1.1s ease-out;
      letter-spacing: 0.2px;
    }
    .splash-loader {
      width: 240px;
      height: 3px;
      background: rgba(236, 72, 153, 0.15);
      border-radius: 8px;
      margin: 0 auto;
      overflow: hidden;
      position: relative;
    }
    .splash-loader-bar {
      height: 100%;
      background: linear-gradient(90deg, ${primary} 0%, ${primaryLight} 50%, ${primary} 100%);
      background-size: 200% 100%;
      border-radius: 8px;
      width: 0%;
      animation: splashLoaderProgress 2s ease-out forwards, splashLoaderShimmer 2s ease-in-out infinite;
      box-shadow: 0 2px 8px rgba(236, 72, 153, 0.4);
    }
    @keyframes splashFadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes splashSlideUp {
      from {
        transform: translateY(30px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    @keyframes splashIconScale {
      0% {
        transform: scale(0);
        opacity: 0;
      }
      50% {
        transform: scale(1.1);
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }
    @keyframes splashTextFadeIn {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes splashLoaderShimmer {
      0% {
        background-position: -200% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }
    @keyframes splashLoaderProgress {
      from {
        width: 0%;
      }
      to {
        width: 100%;
      }
    }
    @keyframes pulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.7;
        transform: scale(1.1);
      }
    }
    /* Mevcut Siparişler Bölümü */
    .existing-orders {
      margin-bottom: 20px;
      padding: 0 0 15px 0;
    }
    .existing-orders-title {
      font-size: 16px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 12px;
      padding: 0 5px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .existing-orders-title::before {
      content: '📋';
      font-size: 18px;
    }
    .order-card {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      transition: all 0.3s;
    }
    .order-card:hover {
      border-color: #a855f7;
      box-shadow: 0 4px 12px rgba(168, 85, 247, 0.15);
    }
    .order-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f3f4f6;
    }
    .order-staff-info {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #6b7280;
      font-weight: 600;
    }
    .order-staff-info::before {
      content: '👤';
      font-size: 16px;
    }
    .order-time {
      font-size: 12px;
      color: #9ca3af;
      font-weight: 500;
    }
    .order-items {
      margin-top: 12px;
    }
    .order-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .order-item:last-child {
      border-bottom: none;
    }
    .order-item-name {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
      flex: 1;
    }
    .order-item-name.gift {
      color: #10b981;
    }
    .order-item-name.gift::after {
      content: ' (İKRAM)';
      font-size: 11px;
      color: #10b981;
      font-weight: 500;
    }
    .order-item-details {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      color: #6b7280;
    }
    .order-item-qty {
      background: #f3f4f6;
      padding: 4px 10px;
      border-radius: 8px;
      font-weight: 700;
      color: #1f2937;
    }
    .order-item-price {
      font-weight: 700;
      color: #a855f7;
      min-width: 70px;
      text-align: right;
    }
    .order-total {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 2px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .order-total-label {
      font-size: 15px;
      font-weight: 700;
      color: #1f2937;
    }
    .order-total-amount {
      font-size: 18px;
      font-weight: 800;
      background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .no-orders {
      text-align: center;
      padding: 30px 20px;
      color: #9ca3af;
      font-size: 14px;
      background: #f9fafb;
      border-radius: 12px;
      border: 2px dashed #e5e7eb;
    }
  </style>
</head>
<body class="${isLacromisa ? 'tenant-lacromisa' : ''}">
  <div class="container">
    <!-- PIN Giriş Ekranı - Kurumsal ve Profesyonel -->
    <div id="pinSection" class="pin-section">
      <img src="${serverURL}/${isGeceDonercisi ? 'tenant.png' : (isLacromisa ? 'lacrimosa.jpg' : 'assets/login.png')}" alt="Login" class="login-image" onerror="this.style.display='none';">
      <h2>Personel Girişi</h2>
      <p class="subtitle">Lütfen şifrenizi giriniz</p>
      <div class="pin-input-wrapper">
        <input type="password" id="pinInput" class="pin-input" placeholder="Şifrenizi giriniz" maxlength="20" autocomplete="off" onkeypress="if(event.key === 'Enter') verifyStaffPin()">
      </div>
      <button onclick="verifyStaffPin()" class="pin-btn">Giriş Yap</button>
      <p id="pinError" class="pin-error"></p>
    </div>
    
    <!-- Splash Screen - Giriş Sonrası Hoş Geldiniz -->
    <div id="splashScreen" class="splash-screen" style="display: none;">
      <div class="splash-content">
        <div class="splash-icon">
          <svg width="48" height="48" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h1 class="splash-title">İyi Çalışmalar Dileriz</h1>
        <p class="splash-name" id="splashStaffName"></p>
        <div class="splash-loader">
          <div class="splash-loader-bar"></div>
        </div>
      </div>
    </div>
    
    <!-- Ana Sipariş Ekranı -->
    <div id="mainSection" style="display: none; padding-top: 60px;">
      <!-- Çıkış Yap Butonu - Sol Üst (masalar ekranında görünecek) -->
      <button class="logout-btn" id="mainLogoutBtn" onclick="showLogoutModal()" title="Çıkış Yap" style="display: none;">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
        </svg>
        <span>Çıkış Yap</span>
      </button>
      
      <!-- Masa Tipi Seçim Ekranı (İç/Dış) - Sadece Normal Mod için; Lacrimosa ve Gece Dönercisi'nde gösterilmez -->
      ${!isSultanSomati && !isYakasGrill && !isGeceDonercisi && !isLacromisa ? `
      <div id="tableTypeSelection" style="display: block; position: fixed; inset: 0; background: white; z-index: 1000; overflow-y: auto; display: flex; flex-direction: column; padding: 20px;">
        <!-- Çıkış Yap Butonu - Sadece bu ekranda görünsün -->
        <div style="position: fixed; top: 20px; right: 20px; z-index: 1001;">
          <button onclick="showLogoutModal()" style="display: flex; align-items: center; gap: 8px; padding: 10px 20px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); transition: all 0.3s; cursor: pointer;" onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 16px rgba(239, 68, 68, 0.4)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.3)'">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            <span>Çıkış Yap</span>
          </button>
        </div>
        
        <!-- Normal Mod - İçeri/Dışarı Seçim Ekranı -->
        <div style="display: flex; flex-direction: column; gap: 32px; width: 100%; max-width: 500px; margin: 80px auto 40px; flex: 1; justify-content: center; padding: 20px;">
          <!-- İçeri Butonu -->
          <button onclick="selectTableTypeScreen('inside')" style="width: 100%; min-height: 280px; background: #fdf2f8; border: 3px solid #fed7aa; border-radius: 20px; color: #111827; font-size: 24px; font-weight: 700; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; position: relative; box-shadow: 0 4px 16px rgba(244, 114, 182, 0.25);" onmouseover="this.style.borderColor='${primaryLight}'; this.style.boxShadow='0 12px 32px ${primary}40'; this.style.transform='translateY(-6px)'" onmouseout="this.style.borderColor='#fed7aa'; this.style.boxShadow='0 4px 16px rgba(244, 114, 182, 0.25)'; this.style.transform='translateY(0)'">
            <svg width="80" height="80" fill="none" stroke="${primaryLight}" viewBox="0 0 24 24" stroke-width="1.5" style="transition: all 0.2s;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/>
            </svg>
            <div style="font-size: 32px; font-weight: 800; color: #111827; letter-spacing: 1px;">${insideLabelBig}</div>
          </button>
          
          <!-- Dışarı/Bahçe Butonu -->
          <button onclick="selectTableTypeScreen('outside')" style="width: 100%; min-height: 280px; background: ${primaryLight}15; border: 3px solid ${primaryLight}80; border-radius: 20px; color: #111827; font-size: 24px; font-weight: 700; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; position: relative; box-shadow: 0 4px 16px ${primary}40;" onmouseover="this.style.borderColor='${primary}'; this.style.boxShadow='0 12px 32px ${primary}60'; this.style.transform='translateY(-6px)'" onmouseout="this.style.borderColor='${primaryLight}80'; this.style.boxShadow='0 4px 16px ${primary}40'; this.style.transform='translateY(0)'">
            <svg width="80" height="80" fill="none" stroke="${primary}" viewBox="0 0 24 24" stroke-width="1.5" style="transition: all 0.2s;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.944 11.944 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/>
            </svg>
            <div style="font-size: 32px; font-weight: 800; color: #111827; letter-spacing: 1px;">${outsideLabelBig}</div>
          </button>
        </div>
      </div>
      ` : ''}
      
      <div id="tableSelection" style="display: ${isSultanSomati || isYakasGrill || isGeceDonercisi || isLacromisa ? 'block' : 'none'};">
        ${isSultanSomati || isYakasGrill || isGeceDonercisi ? `
        <!-- Sultan Somatı / Yaka's Grill / Gece Dönercisi - Üst Header (Koyu Gri) -->
        <div style="position: fixed; top: 0; left: 0; right: 0; height: 50px; background: #2d2d2d; z-index: 1000; display: flex; align-items: center; justify-content: space-between; padding: 0 15px;">
          <!-- Sol: Headphone İkonu -->
          <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
            <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
          </div>
          
          <!-- Sağ: Refresh ve Menu İkonları -->
          <div style="display: flex; align-items: center; gap: 12px;">
            <button onclick="loadData()" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; border-radius: 50%; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
              <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
            <button onclick="showLogoutModal()" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; border-radius: 50%; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
              <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
              </svg>
            </button>
          </div>
        </div>
        
        ${isSultanSomati ? `
        <!-- Salon Sekmeleri - Sultan Somatı -->
        <div id="salonTabsContainer" style="position: fixed; top: 50px; left: 0; right: 0; background: white; z-index: 999; padding: 12px 15px; overflow-x: auto; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="display: flex; gap: 8px; min-width: max-content;">
            ${sultanSomatiSalons.map((salon, index) => `
            <button 
              id="salonTab_${salon.id}" 
              onclick="selectSalon('${salon.id}')" 
              class="salon-tab"
              style="
                padding: 10px 16px; 
                border: none; 
                border-radius: 20px; 
                background: ${index === 0 ? '#e5e5e5' : 'white'}; 
                color: #333; 
                font-size: 14px; 
                font-weight: 600; 
                cursor: pointer; 
                transition: all 0.2s; 
                white-space: nowrap;
                box-shadow: ${index === 0 ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'};
              "
              onmouseover="if(!this.classList.contains('active')) { this.style.background='#f5f5f5'; }"
              onmouseout="if(!this.classList.contains('active')) { this.style.background='white'; }"
            >
              ${salon.name} (<span id="salonCount_${salon.id}">0</span>)
            </button>
            `).join('')}
          </div>
        </div>
        ` : ''}
        ${isGeceDonercisi ? `
        <!-- Gece Dönercisi - Profesyonel üst bar (koyu, minimal) -->
        <div id="geceHeaderBar" style="position: fixed; top: 0; left: 0; right: 0; height: 56px; background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%); z-index: 1000; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.25);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center;">
              <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.9)" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg>
            </div>
            <span style="font-size: 17px; font-weight: 700; color: rgba(255,255,255,0.95); letter-spacing: 0.3px;">Masalar</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button onclick="showTransferModal()" title="Masa Aktar" style="width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,0.08); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.14)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
              <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.9)" viewBox="0 0 24 24" stroke-width="2.4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
              </svg>
            </button>
            <button onclick="loadData()" style="width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,0.08); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.14)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
              <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.9)" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
            <button onclick="showLogoutModal()" style="width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,0.08); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.14)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
              <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.9)" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
            </button>
          </div>
        </div>
        <!-- Gece Dönercisi - 6 kategori sekmeleri: Salon, Bahçe, Paket, TrendyolGO, Yemeksepeti, Migros Yemek (elit / modern) -->
        <div id="geceCategoryTabsContainer" style="position: fixed; top: 56px; left: 0; right: 0; background: #f8fafc; z-index: 999; padding: 12px 14px; overflow-x: auto; white-space: nowrap; box-shadow: 0 2px 12px rgba(0,0,0,0.06); -webkit-overflow-scrolling: touch;">
          <div style="display: flex; gap: 10px; min-width: max-content; padding-bottom: 2px;">
            ${geceDonercisiCategories.map((cat, index) => `
            <button 
              id="salonTab_${cat.id}" 
              onclick="selectSalon('${cat.id}')" 
              class="salon-tab gece-tab"
              style="
                padding: 12px 18px; 
                border: none; 
                border-radius: 14px; 
                background: ${index === 0 ? 'linear-gradient(135deg, #334155 0%, #475569 100%)' : '#fff'}; 
                color: ${index === 0 ? '#fff' : '#475569'}; 
                font-size: 13px; 
                font-weight: 700; 
                cursor: pointer; 
                transition: all 0.25s ease; 
                white-space: nowrap;
                box-shadow: ${index === 0 ? '0 4px 14px rgba(51,65,85,0.35)' : '0 1px 3px rgba(0,0,0,0.08)'};
                border: 1px solid ${index === 0 ? 'transparent' : '#e2e8f0'};
              "
              onmouseover="if(!this.classList.contains('active')) { this.style.background=this.classList.contains('active')?'linear-gradient(135deg, #334155 0%, #475569 100%)':'#f1f5f9'; this.style.color='#334155'; this.style.borderColor='#cbd5e1'; }"
              onmouseout="if(!this.classList.contains('active')) { this.style.background='#fff'; this.style.color='#475569'; this.style.borderColor='#e2e8f0'; }"
            >
              <span style="margin-right: 6px; font-size: 15px;">${cat.icon}</span>${cat.name} <span id="salonCount_${cat.id}" style="opacity: 0.85; font-weight: 600;">0</span>
            </button>
            `).join('')}
          </div>
        </div>
        ` : ''}
        ` : `
        <!-- Normal Mod / Lacrimosa - Sadece Masa Aktar (Geri Dön kaldırıldı) -->
        <div style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 12px;">
          <button onclick="showTransferModal()" class="transfer-table-btn" style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: linear-gradient(135deg, #4f46e5 0%, #2563eb 100%); color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); transition: all 0.3s; cursor: pointer;" onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 16px rgba(79, 70, 229, 0.4)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(79, 70, 229, 0.3)'">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
            </svg>
            Masa Aktar
          </button>
        </div>
        
        <!-- İç/Dış veya Salon/Bahçe Tab'leri (Normal Mod / Lacromisa) -->
        <div class="table-type-tabs" style="display: flex;">
          <button class="table-type-tab active" data-type="inside" onclick="selectTableType('inside')">🏠 ${insideLabelShort}</button>
          <button class="table-type-tab" data-type="outside" onclick="selectTableType('outside')">🌳 ${outsideLabelShort}</button>
        </div>
        `}
        
        <!-- Masa Grid -->
        <div class="table-grid" id="tablesGrid" style="margin-top: ${isSultanSomati ? '80px' : isGeceDonercisi ? '130px' : isYakasGrill ? '50px' : '0'}; margin-bottom: ${(isSultanSomati || isYakasGrill || isGeceDonercisi) ? '80px' : '20px'};"></div>
        
        ${isSultanSomati || isYakasGrill || isGeceDonercisi ? `
        <!-- Alt Navigasyon Bar (Koyu Gri) -->
        <div id="bottomNavBar" style="position: fixed; bottom: 0; left: 0; right: 0; height: 60px; background: #2d2d2d; z-index: 1000; display: flex; align-items: center; justify-content: space-around; padding: 0 10px; box-shadow: 0 -2px 10px rgba(0,0,0,0.2);">
          <button onclick="showTablesView()" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: transparent; border: none; color: #fbbf24; cursor: pointer; padding: 8px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>
            </svg>
            <span style="font-size: 11px; font-weight: 600; color: white;">Masalar</span>
          </button>
          <button onclick="showOrdersView()" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: transparent; border: none; color: white; cursor: pointer; padding: 8px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"/>
            </svg>
            <span style="font-size: 11px; font-weight: 600; color: white;">Siparişler</span>
          </button>
          <button onclick="showSalesView()" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: transparent; border: none; color: white; cursor: pointer; padding: 8px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h11.25c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/>
            </svg>
            <span style="font-size: 11px; font-weight: 600; color: white;">Satışlar</span>
          </button>
          <button onclick="showSettingsView()" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: transparent; border: none; color: white; cursor: pointer; padding: 8px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
            </svg>
            <span style="font-size: 11px; font-weight: 600; color: white;">Ayarlar</span>
          </button>
        </div>
        ` : ''}
      </div>
      
      <!-- Siparişler Görünümü (Sultan Somatı için) -->
      ${isSultanSomati ? `
      <div id="ordersView" style="display: none;">
        <!-- Üst Header (Koyu Gri - Kurumsal) -->
        <div style="position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #2d2d2d; z-index: 1000; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
          <!-- Sol: Geri Dön Butonu -->
          <button onclick="showTablesView()" style="display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: transparent; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.borderColor='rgba(255,255,255,0.3)';" onmouseout="this.style.background='transparent'; this.style.borderColor='rgba(255,255,255,0.2)';">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
            </svg>
            <span>Masalar</span>
          </button>
          
          <!-- Ortada: Başlık -->
          <div style="flex: 1; text-align: center;">
            <span style="color: white; font-size: 18px; font-weight: 600;">Tüm Siparişler</span>
          </div>
          
          <!-- Sağ: Boş alan (dengeli görünüm için) -->
          <div style="width: 100px;"></div>
        </div>
        
        <!-- İçerik Alanı -->
        <div style="margin-top: 60px; padding: 12px 15px; padding-bottom: 80px;">
          <div style="margin-bottom: 5px;">
            <p style="font-size: 14px; color: #666; margin: 0;">Tüm masaların mevcut siparişleri</p>
          </div>
          <div id="allOrdersList" style="display: flex; flex-direction: column; gap: 16px;"></div>
        </div>
      </div>
      ` : ''}
      
      <!-- Satışlar Görünümü (Sultan Somatı için) -->
      ${isSultanSomati ? `
      <div id="salesView" style="display: none;">
        <!-- Üst Header (Koyu Gri - Kurumsal) -->
        <div style="position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #2d2d2d; z-index: 1000; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
          <!-- Sol: Geri Dön Butonu -->
          <button onclick="showTablesView()" style="display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: transparent; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.borderColor='rgba(255,255,255,0.3)';" onmouseout="this.style.background='transparent'; this.style.borderColor='rgba(255,255,255,0.2)';">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
            </svg>
            <span>Masalar</span>
          </button>
          
          <!-- Ortada: Başlık -->
          <div style="flex: 1; text-align: center;">
            <span style="color: white; font-size: 18px; font-weight: 600;">Son 3 Saat Satışlar</span>
          </div>
          
          <!-- Sağ: Boş alan (dengeli görünüm için) -->
          <div style="width: 100px;"></div>
        </div>
        
        <!-- İçerik Alanı -->
        <div style="margin-top: 60px; padding: 12px 15px; padding-bottom: 80px;">
          <div style="margin-bottom: 5px;">
            <p style="font-size: 14px; color: #666; margin: 0;">Son 3 saatteki satış işlemleri</p>
          </div>
          <div id="recentSalesList" style="display: flex; flex-direction: column; gap: 16px;"></div>
        </div>
      </div>
      ` : ''}
      
      <div id="orderSection" style="display: none;">
        ${isSultanSomati ? `
        <!-- Sultan Somatı - Görseldeki Tasarım -->
        <!-- Üst Header (Koyu Gri) -->
        <div style="position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #2d2d2d; z-index: 1000; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
          <!-- Sol: Geri Ok -->
          <button onclick="goBackToTables()" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; border-radius: 50%; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
            <svg width="24" height="24" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
            </svg>
          </button>
          
          <!-- Ortada: Masa Adı -->
          <div style="flex: 1; text-align: center;">
            <span id="selectedTableInfoHeader" style="color: white; font-size: 18px; font-weight: 600;">Masa 2</span>
          </div>
          
          <!-- Sağ: İkonlar -->
          <div style="display: flex; align-items: center; gap: 12px;">
            <button onclick="showNoteModal()" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; border-radius: 50%; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
              <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
              </svg>
            </button>
            <button onclick="toggleCart()" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; border-radius: 50%; transition: background 0.2s; position: relative;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
              <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a2.25 2.25 0 00-2.25 2.25m15 0a2.25 2.25 0 00-2.25-2.25m-15 0a2.25 2.25 0 012.25-2.25m15 0a2.25 2.25 0 012.25 2.25m-1.386-4.836c.504.054 1.011.21 1.5.386m-4.75 0a24.301 24.301 0 00-4.5 0m4.75 0a24.301 24.301 0 01-4.5 0M8.25 3.75H4.875c-.621 0-1.125.504-1.125 1.125v12.75c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H8.25zM12 10.5a.75.75 0 01-.75-.75V7.5a.75.75 0 011.5 0v2.25a.75.75 0 01-.75.75zm4.5 0a.75.75 0 00-.75-.75V7.5a.75.75 0 001.5 0v2.25a.75.75 0 00-.75.75z"/>
              </svg>
              <span id="cartBadgeHeader" style="position: absolute; top: 4px; right: 4px; background: #ef4444; color: white; font-size: 10px; font-weight: 700; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; display: none;">0</span>
            </button>
            <button onclick="showLogoutModal()" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; border-radius: 50%; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
              <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Arama Çubuğu (Barkod İkonu ile) -->
        <div style="position: fixed; top: 60px; left: 0; right: 0; background: white; z-index: 999; padding: 12px 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="position: relative;">
            <input type="text" id="searchInput" placeholder="Ürün Adı veya Barkod ile Arama Yap" oninput="filterProducts()" style="width: 100%; padding: 12px 16px 12px 50px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 15px; background: #f5f5f5; outline: none;" onfocus="this.style.borderColor='#2d2d2d'; this.style.background='white';" onblur="this.style.borderColor='#e0e0e0'; this.style.background='#f5f5f5';">
            <div style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 8px;">
              <svg width="18" height="18" fill="none" stroke="#666" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <svg width="18" height="18" fill="none" stroke="#666" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5"/>
              </svg>
            </div>
          </div>
        </div>
        
        <!-- Kategoriler (Yatay Scroll) -->
        <div id="categoryTabsContainer" style="position: fixed; top: 128px; left: 0; right: 0; background: white; z-index: 998; padding: 12px 15px; overflow-x: auto; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.05); min-height: 50px;">
          <div id="categoryTabs" style="display: flex; gap: 10px; min-width: max-content;">
            <!-- Kategoriler buraya dinamik olarak eklenecek -->
          </div>
        </div>
        
        <!-- Ürünler Grid (2 Sütun) -->
        <div style="margin-top: 150px; padding: 15px; padding-bottom: 80px;">
          <div id="existingOrders" style="display: none; margin-bottom: 20px;">
            <div style="font-size: 16px; font-weight: 700; color: #333; margin-bottom: 12px;">Mevcut Siparişler</div>
            <div id="existingOrdersList"></div>
          </div>
          <div class="products-grid" id="productsGrid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;"></div>
        </div>
        
        <!-- Alt Kaydet Butonu -->
        <div style="position: fixed; bottom: 0; left: 0; right: 0; background: white; z-index: 1000; padding: 12px 15px; box-shadow: 0 -2px 10px rgba(0,0,0,0.1);">
          <button id="sendOrderBtnMain" type="button" onclick="sendOrder()" style="width: 100%; padding: 16px; background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.3s; box-shadow: 0 4px 12px ${primary}4D;" onmouseover="if(!this.disabled) { this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px ${primary}66'; }" onmouseout="if(!this.disabled) { this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px ${primary}4D'; }">
            <svg id="sendOrderBtnMainIcon" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
            <span id="sendOrderBtnMainText">Kaydet</span>
            <svg id="sendOrderBtnMainSpinner" style="display: none; width: 18px; height: 18px; animation: spin 1s linear infinite;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>
        ` : `
        <!-- Normal Mod - Eski Tasarım -->
        <!-- En Üst: Geri Dön Butonu -->
        <div style="position: sticky; top: 0; z-index: 100; background: white; padding: 8px 15px 15px 15px; margin: -15px -15px 0 -15px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-radius: 0 0 20px 20px;">
          <button class="back-btn" onclick="goBackToTables()" style="position: relative; top: 0; left: 0; margin-bottom: 0; width: 100%; max-width: none; animation: none;">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
            </svg>
            <span style="background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; color: ${primary};">Masalara Dön</span>
          </button>
        </div>
        
        <!-- Kategoriler ve Arama -->
        <div style="position: sticky; top: 70px; z-index: 99; background: white; padding: 15px 0; margin: 0 -15px 15px -15px; padding-left: 15px; padding-right: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-radius: 0 0 20px 20px;">
          <!-- Kategoriler -->
          <div style="margin-bottom: 12px;">
            <div class="category-tabs" id="categoryTabs">
              <div class="category-tabs-row" id="categoryTabsRow1"></div>
              <div class="category-tabs-row" id="categoryTabsRow2"></div>
            </div>
          </div>
          
          <!-- Arama Çubuğu -->
          <div style="position: relative; margin-bottom: 0;">
            <input type="text" id="searchInput" class="search-box" placeholder="🔍 Ürün ara..." oninput="filterProducts()" style="padding: 14px 16px 14px 48px; border: 2px solid #e5e7eb; border-radius: 14px; font-size: 15px; background: #f9fafb; transition: all 0.3s;">
            <div style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none;">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
          </div>
        </div>
        
        <!-- Masa Bilgisi - Minimal -->
        <div style="text-align: center; margin-bottom: 16px; padding: 8px 12px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border-radius: 10px; border: 1px solid #e5e7eb;">
          <span style="font-size: 13px; font-weight: 600; color: #6b7280;" id="selectedTableInfo"></span>
        </div>
        
        <!-- Mevcut Siparişler -->
        <div class="existing-orders" id="existingOrders" style="display: none;">
          <div class="existing-orders-title">Mevcut Siparişler</div>
          <div id="existingOrdersList"></div>
        </div>
        
        <!-- Ürünler -->
        <div style="overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; max-height: calc(100vh - 320px); padding-bottom: 100px; padding-right: 5px;">
          <div class="products-grid" id="productsGrid"></div>
        </div>
        `}
      </div>
    </div>
  </div>
  
  <div class="cart" id="cart">
    <div class="cart-header" onclick="toggleCart()">
      <div class="cart-header-title">
        <span>Siparişi Gönder</span>
        <span id="cartItemCount">0 ürün</span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 20px; font-weight: 800; background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"><span id="cartTotal">0.00</span> ₺</span>
        <div class="cart-header-icon" id="cartToggleIcon">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/>
          </svg>
        </div>
      </div>
    </div>
    <div class="cart-content">
      <div class="cart-items" id="cartItems"></div>
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button onclick="showNoteModal()" style="flex: 0 0 auto; padding: 12px 16px; background: #f3f4f6; color: #374151; border: 2px solid #d1d5db; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='#e5e7eb';" onmouseout="this.style.background='#f3f4f6';">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
          </svg>
          <span id="noteButtonText">Not Ekle</span>
        </button>
        <button id="sendOrderBtnCart" type="button" class="send-btn" onclick="sendOrder()" style="flex: 1; margin-top: 0;">
          <span style="display: inline-flex; align-items: center; gap: 8px;">
            <svg id="sendOrderBtnCartIcon" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
            </svg>
            <span id="sendOrderBtnCartText">Siparişi Gönder</span>
            <svg id="sendOrderBtnCartSpinner" style="display: none; width: 18px; height: 18px; animation: spin 1s linear infinite;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </span>
        </button>
      </div>
    </div>
  </div>
  
  <!-- Toast Notification -->
  <div id="toast" class="toast">
    <div class="toast-icon" id="toastIcon"></div>
    <div class="toast-content">
      <div class="toast-title" id="toastTitle"></div>
      <div class="toast-message" id="toastMessage"></div>
    </div>
    <button class="toast-close" onclick="hideToast()">×</button>
  </div>
  
  <!-- Çıkış Yap Onay Modal -->
  <div id="logoutModal" class="logout-modal" style="display: none;" onclick="if(event.target === this) hideLogoutModal()">
    <div class="logout-modal-content">
      <div class="logout-modal-icon">🚪</div>
      <h3 class="logout-modal-title">Çıkış Yapmak İstediğinize Emin Misiniz?</h3>
      <p class="logout-modal-message">
        <span class="logout-modal-staff-name" id="logoutStaffName"></span> olarak çıkış yapmak istediğinize emin misiniz?
      </p>
      <div class="logout-modal-buttons">
        <button class="logout-modal-btn logout-modal-btn-cancel" onclick="hideLogoutModal()">İptal</button>
        <button class="logout-modal-btn logout-modal-btn-confirm" onclick="confirmLogout()">Evet, Çıkış Yap</button>
      </div>
    </div>
  </div>
  
  <!-- Not Ekle Modal -->
  <div id="noteModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2000; align-items: center; justify-content: center; padding: 20px;" onclick="if(event.target === this) hideNoteModal()">
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 400px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
      <div style="background: linear-gradient(135deg, #f97316 0%, #fb923c 50%, #ea580c 100%); color: white; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800;">Ürün Notu</h2>
          <button onclick="hideNoteModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold;">×</button>
        </div>
      </div>
      <div style="padding: 20px;">
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 700; color: #374151;">Ürün Seçin</label>
          <select id="noteProductSelect" onchange="onNoteProductChange()" style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 15px; font-family: inherit; outline: none; background: white;" onfocus="this.style.borderColor='#f97316';" onblur="this.style.borderColor='#e5e7eb';">
            <option value="">Tüm sipariş için (genel not)</option>
          </select>
        </div>
        <div>
          <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 700; color: #374151;">Not (Örn: Sütü az olacak, Ekstra peynir, vs.)</label>
          <textarea id="noteInput" placeholder="Sipariş notunuzu buraya yazın..." style="width: 100%; min-height: 120px; padding: 12px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 15px; font-family: inherit; resize: vertical; outline: none;" onfocus="this.style.borderColor='#f97316';" onblur="this.style.borderColor='#e5e7eb';" maxlength="200"></textarea>
          <p id="noteCharCount" style="text-align: right; font-size: 12px; color: #9ca3af; margin-top: 4px; margin-bottom: 0;">0/200</p>
        </div>
      </div>
      <div style="border-top: 1px solid #e5e7eb; padding: 16px; display: flex; justify-content: flex-end; gap: 12px;">
        <button onclick="hideNoteModal()" style="padding: 12px 24px; background: #f3f4f6; color: #374151; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.background='#e5e7eb';" onmouseout="this.style.background='#f3f4f6';">İptal</button>
        <button onclick="saveNote()" style="padding: 12px 24px; background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primaryDark} 100%); color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 12px ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)` : 'rgba(249, 115, 22, 0.3)'};" onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)` : 'rgba(249, 115, 22, 0.4)'}';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)` : 'rgba(249, 115, 22, 0.3)'}';">Kaydet</button>
      </div>
    </div>
  </div>
  
  <!-- Ürün İptal Modal -->
  <div id="cancelItemModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);" onclick="if(event.target === this) hideCancelItemModal()">
    <div style="background: white; border-radius: 24px; width: 100%; max-width: 420px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 70px rgba(0,0,0,0.4); animation: slideUp 0.3s ease;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 900;">Ürün İptal</h2>
          <button onclick="hideCancelItemModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; transition: all 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.3)';" onmouseout="this.style.background='rgba(255,255,255,0.2)';">×</button>
        </div>
      </div>
      <div style="padding: 24px;">
        <div style="margin-bottom: 20px;">
          <p style="margin: 0 0 12px 0; font-size: 15px; color: #6b7280; font-weight: 600;">Ürün:</p>
          <p style="margin: 0; font-size: 18px; font-weight: 800; color: #1f2937;" id="cancelItemName"></p>
        </div>
        <div style="margin-bottom: 20px;">
          <p style="margin: 0 0 12px 0; font-size: 15px; color: #6b7280; font-weight: 600;">Mevcut Miktar:</p>
          <p style="margin: 0; font-size: 18px; font-weight: 800; color: #1f2937;" id="cancelItemMaxQuantity"></p>
        </div>
        <div style="margin-bottom: 24px;">
          <label style="display: block; margin-bottom: 8px; font-size: 15px; color: #374151; font-weight: 700;">İptal Edilecek Miktar:</label>
          ${isGeceDonercisi ? `
            <div style="display: flex; gap: 10px; align-items: center;">
              <button onclick="changeCancelQuantity(-1)" style="width: 48px; height: 48px; border-radius: 14px; border: 2px solid #e5e7eb; background: #f9fafb; color: #111827; font-size: 22px; font-weight: 900; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f3f4f6';" onmouseout="this.style.background='#f9fafb';">−</button>
              <input type="number" id="cancelItemQuantity" min="1" value="1" style="flex: 1; padding: 14px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 18px; font-weight: 800; text-align: center; outline: none; transition: all 0.2s;" onfocus="this.style.borderColor='#ef4444';" onblur="this.style.borderColor='#e5e7eb';" oninput="validateCancelQuantity()">
              <button onclick="changeCancelQuantity(1)" style="width: 48px; height: 48px; border-radius: 14px; border: 2px solid #e5e7eb; background: #f9fafb; color: #111827; font-size: 22px; font-weight: 900; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f3f4f6';" onmouseout="this.style.background='#f9fafb';">+</button>
            </div>
          ` : `
            <input type="number" id="cancelItemQuantity" min="1" value="1" style="width: 100%; padding: 14px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 18px; font-weight: 700; text-align: center; outline: none; transition: all 0.3s;" onfocus="this.style.borderColor='#ef4444';" onblur="this.style.borderColor='#e5e7eb';" oninput="validateCancelQuantity()">
          `}
        </div>
        <div style="background: #fef2f2; border: 2px solid #fecaca; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 13px; color: #991b1b; font-weight: 600; line-height: 1.6;">
            ⚠️ İptal edildiğinde bu ürünün kategorisine atanan yazıcıdan iptal fişi yazdırılacaktır.
          </p>
        </div>
      </div>
      <div style="border-top: 1px solid #e5e7eb; padding: 20px; display: flex; justify-content: flex-end; gap: 12px; background: #f9fafb;">
        <button onclick="hideCancelItemModal()" style="padding: 14px 28px; background: #f3f4f6; color: #374151; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.background='#e5e7eb';" onmouseout="this.style.background='#f3f4f6';">İptal</button>
        <button id="confirmCancelBtn" onclick="confirmCancelItem()" style="padding: 14px 28px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 140px;" onmouseover="if(!this.disabled) { this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px rgba(239, 68, 68, 0.4)'; }" onmouseout="if(!this.disabled) { this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.3)'; }">
          <span id="confirmCancelBtnText">İptal Et</span>
          <svg id="confirmCancelBtnSpinner" style="display: none; width: 18px; height: 18px; animation: spin 1s linear infinite;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
  
  <!-- Türk Kahvesi Seçenek Modal -->
  <!-- Soğan Seçici Modal (Yaka's Grill için) -->
  <div id="onionModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);" onclick="if(event.target === this) hideOnionModal()">
    <div style="background: white; border-radius: 24px; width: 100%; max-width: 420px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 70px rgba(0,0,0,0.4); animation: slideUp 0.3s ease;">
      <div style="background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 100%); color: white; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 900;">Soğan Seçimi</h2>
          <button onclick="hideOnionModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; transition: all 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.3)';" onmouseout="this.style.background='rgba(255,255,255,0.2)';">×</button>
        </div>
      </div>
      <div style="padding: 24px;">
        <p style="margin: 0 0 20px 0; font-size: 15px; color: #6b7280; font-weight: 600; text-align: center;" id="onionProductName"></p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button onclick="selectOnionOption('Soğanlı')" class="onion-option" style="padding: 18px 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 17px; font-weight: 700; color: #1f2937; cursor: pointer; transition: all 0.3s; text-align: center; display: flex; align-items: center; justify-content: center; gap: 12px;" onmouseover="this.style.background='linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; this.style.borderColor='${primary}'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px ${primary}40';" onmouseout="this.style.background='linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'; this.style.borderColor='#e5e7eb'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <span style="font-size: 24px;">🧅</span>
            <span>Soğanlı</span>
          </button>
          <button onclick="selectOnionOption('Soğansız')" class="onion-option" style="padding: 18px 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 17px; font-weight: 700; color: #1f2937; cursor: pointer; transition: all 0.3s; text-align: center; display: flex; align-items: center; justify-content: center; gap: 12px;" onmouseover="this.style.background='linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; this.style.borderColor='${primary}'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px ${primary}40';" onmouseout="this.style.background='linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'; this.style.borderColor='#e5e7eb'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <span style="font-size: 24px;">🚫</span>
            <span>Soğansız</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Porsiyon Seçici Modal (Yaka's Grill için) -->
  <!-- Döner Seçenek Modal (Gece Dönercisi için) -->
  <div id="donerOptionsModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);" onclick="if(event.target === this) hideDonerOptionsModal()">
    <div style="background: white; border-radius: 24px; width: 100%; max-width: 420px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 70px rgba(0,0,0,0.4); animation: slideUp 0.3s ease;">
      <div style="background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 100%); color: white; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 900;">Döner Seçimi</h2>
          <button onclick="hideDonerOptionsModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; transition: all 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.3)';" onmouseout="this.style.background='rgba(255,255,255,0.2)';">×</button>
        </div>
      </div>
      <div style="padding: 24px;">
        <p style="margin: 0 0 18px 0; font-size: 15px; color: #6b7280; font-weight: 600; text-align: center;" id="donerProductName"></p>
        
        <div style="margin-bottom: 18px;">
          <div style="font-size: 13px; font-weight: 800; color: #374151; margin-bottom: 10px;">İçerik</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            <button id="donerSogansizBtn" onclick="toggleDonerOption('sogansiz')" style="padding: 14px 16px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 15px; font-weight: 800; color: #111827; cursor: pointer; transition: all 0.2s;">Soğansız</button>
            <button id="donerDomatessizBtn" onclick="toggleDonerOption('domatessiz')" style="padding: 14px 16px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 15px; font-weight: 800; color: #111827; cursor: pointer; transition: all 0.2s;">Domatessiz</button>
            <button id="donerSadeBtn" onclick="toggleDonerOption('sade')" style="padding: 14px 16px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 15px; font-weight: 800; color: #111827; cursor: pointer; transition: all 0.2s;">Sade</button>
            <button id="donerAzSoganliBtn" onclick="toggleDonerOption('azsoganli')" style="padding: 14px 16px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 15px; font-weight: 800; color: #111827; cursor: pointer; transition: all 0.2s;">Az Soğanlı</button>
          </div>
        </div>
        
        <div style="display: flex; gap: 12px;">
          <button onclick="hideDonerOptionsModal()" style="flex: 1; padding: 14px 16px; background: #f3f4f6; color: #374151; border: none; border-radius: 14px; font-weight: 800; cursor: pointer;">İptal</button>
          <button onclick="confirmDonerOptions()" style="flex: 1; padding: 14px 16px; background: linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%); color: white; border: none; border-radius: 14px; font-weight: 900; cursor: pointer; box-shadow: 0 6px 16px ${primary}40;">Ekle</button>
        </div>
      </div>
    </div>
  </div>

  <div id="portionModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);" onclick="if(event.target === this) hidePortionModal()">
    <div style="background: white; border-radius: 24px; width: 100%; max-width: 420px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 70px rgba(0,0,0,0.4); animation: slideUp 0.3s ease;">
      <div style="background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 100%); color: white; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 900;">Porsiyon Seçimi</h2>
          <button onclick="hidePortionModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; transition: all 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.3)';" onmouseout="this.style.background='rgba(255,255,255,0.2)';">×</button>
        </div>
      </div>
      <div style="padding: 24px;">
        <p style="margin: 0 0 20px 0; font-size: 15px; color: #6b7280; font-weight: 600; text-align: center;" id="portionProductName"></p>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <button onclick="selectPortion(0.5)" class="portion-option" style="padding: 18px 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 17px; font-weight: 700; color: #1f2937; cursor: pointer; transition: all 0.3s; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.background='linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; this.style.borderColor='${primary}'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px ${primary}40';" onmouseout="this.style.background='linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'; this.style.borderColor='#e5e7eb'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <span style="font-size: 24px; font-weight: 900;">0.5</span>
            <span style="font-size: 13px; color: #6b7280;">Porsiyon</span>
            <span style="font-size: 14px; color: ${primary}; font-weight: 800;" id="portionPrice0.5"></span>
          </button>
          <button onclick="selectPortion(1)" class="portion-option" style="padding: 18px 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 17px; font-weight: 700; color: #1f2937; cursor: pointer; transition: all 0.3s; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.background='linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; this.style.borderColor='${primary}'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px ${primary}40';" onmouseout="this.style.background='linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'; this.style.borderColor='#e5e7eb'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <span style="font-size: 24px; font-weight: 900;">1</span>
            <span style="font-size: 13px; color: #6b7280;">Porsiyon</span>
            <span style="font-size: 14px; color: ${primary}; font-weight: 800;" id="portionPrice1"></span>
          </button>
          <button onclick="selectPortion(1.5)" class="portion-option" style="padding: 18px 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 17px; font-weight: 700; color: #1f2937; cursor: pointer; transition: all 0.3s; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.background='linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; this.style.borderColor='${primary}'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px ${primary}40';" onmouseout="this.style.background='linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'; this.style.borderColor='#e5e7eb'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <span style="font-size: 24px; font-weight: 900;">1.5</span>
            <span style="font-size: 13px; color: #6b7280;">Porsiyon</span>
            <span style="font-size: 14px; color: ${primary}; font-weight: 800;" id="portionPrice1.5"></span>
          </button>
          <button onclick="selectPortion(2)" class="portion-option" style="padding: 18px 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 17px; font-weight: 700; color: #1f2937; cursor: pointer; transition: all 0.3s; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.background='linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; this.style.borderColor='${primary}'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px ${primary}40';" onmouseout="this.style.background='linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'; this.style.borderColor='#e5e7eb'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <span style="font-size: 24px; font-weight: 900;">2</span>
            <span style="font-size: 13px; color: #6b7280;">Porsiyon</span>
            <span style="font-size: 14px; color: ${primary}; font-weight: 800;" id="portionPrice2"></span>
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <div id="turkishCoffeeModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);" onclick="if(event.target === this) hideTurkishCoffeeModal()">
    <div style="background: white; border-radius: 24px; width: 100%; max-width: 420px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 70px rgba(0,0,0,0.4); animation: slideUp 0.3s ease;">
      <div style="background: linear-gradient(135deg, #92400e 0%, #78350f 100%); color: white; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 900;">Türk Kahvesi Seçimi</h2>
          <button onclick="hideTurkishCoffeeModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; transition: all 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.3)';" onmouseout="this.style.background='rgba(255,255,255,0.2)';">×</button>
        </div>
      </div>
      <div style="padding: 24px;">
        <p style="margin: 0 0 20px 0; font-size: 15px; color: #6b7280; font-weight: 600; text-align: center;">Lütfen Türk Kahvesi tercihinizi seçin:</p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button onclick="selectTurkishCoffeeOption('Sade')" class="turkish-coffee-option" style="padding: 18px 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 17px; font-weight: 700; color: #1f2937; cursor: pointer; transition: all 0.3s; text-align: center; display: flex; align-items: center; justify-content: center; gap: 12px;" onmouseover="this.style.background='linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; this.style.borderColor='#92400e'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(146, 64, 14, 0.15)';" onmouseout="this.style.background='linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'; this.style.borderColor='#e5e7eb'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <span style="font-size: 24px;">☕</span>
            <span>Sade</span>
          </button>
          <button onclick="selectTurkishCoffeeOption('Orta')" class="turkish-coffee-option" style="padding: 18px 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 17px; font-weight: 700; color: #1f2937; cursor: pointer; transition: all 0.3s; text-align: center; display: flex; align-items: center; justify-content: center; gap: 12px;" onmouseover="this.style.background='linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; this.style.borderColor='#92400e'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(146, 64, 14, 0.15)';" onmouseout="this.style.background='linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'; this.style.borderColor='#e5e7eb'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <span style="font-size: 24px;">☕</span>
            <span>Orta</span>
          </button>
          <button onclick="selectTurkishCoffeeOption('Şekerli')" class="turkish-coffee-option" style="padding: 18px 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; border-radius: 16px; font-size: 17px; font-weight: 700; color: #1f2937; cursor: pointer; transition: all 0.3s; text-align: center; display: flex; align-items: center; justify-content: center; gap: 12px;" onmouseover="this.style.background='linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; this.style.borderColor='#92400e'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(146, 64, 14, 0.15)';" onmouseout="this.style.background='linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'; this.style.borderColor='#e5e7eb'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            <span style="font-size: 24px;">☕</span>
            <span>Şekerli</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- İptal Açıklaması Modal (Fiş yazdırıldıktan sonra) -->
  <div id="cancelReasonModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 3000; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);" onclick="if(event.target === this) return;">
    <div style="background: white; border-radius: 24px; width: 100%; max-width: 480px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 70px rgba(0,0,0,0.4); animation: slideUp 0.3s ease;">
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 900;">İptal Açıklaması</h2>
          <div style="width: 36px; height: 36px;"></div>
        </div>
      </div>
      <div style="padding: 24px;">
        <div style="margin-bottom: 20px;">
          <p style="margin: 0 0 12px 0; font-size: 15px; color: #6b7280; font-weight: 600;">İptal fişi yazdırıldı. Lütfen iptal nedenini açıklayın:</p>
        </div>
        <div style="margin-bottom: 24px;">
          <label style="display: block; margin-bottom: 8px; font-size: 15px; color: #374151; font-weight: 700;">İptal Açıklaması <span style="color: #ef4444;">*</span>:</label>
          <textarea id="cancelReasonInput" placeholder="Örn: Müşteri istemedi, Yanlış sipariş, Ürün bozuk..." style="width: 100%; min-height: 120px; padding: 14px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 15px; font-family: inherit; resize: vertical; outline: none;" onfocus="this.style.borderColor='#f59e0b';" onblur="this.style.borderColor='#e5e7eb';"></textarea>
        </div>
        <div style="background: #fef3c7; border: 2px solid #fde68a; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 13px; color: #92400e; font-weight: 600; line-height: 1.6;">
            ⚠️ İptal açıklaması zorunludur. Açıklama yazmadan işlem tamamlanamaz.
          </p>
        </div>
      </div>
      <div style="border-top: 1px solid #e5e7eb; padding: 20px; display: flex; justify-content: flex-end; gap: 12px; background: #f9fafb;">
        <button id="confirmCancelReasonBtn" onclick="submitCancelReason()" style="padding: 14px 28px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 140px;" onmouseover="if(!this.disabled) { this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px rgba(245, 158, 11, 0.4)'; }" onmouseout="if(!this.disabled) { this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(245, 158, 11, 0.3)'; }">
          <span id="confirmCancelReasonBtnText">Tamamla</span>
          <svg id="confirmCancelReasonBtnSpinner" style="display: none; width: 18px; height: 18px; animation: spin 1s linear infinite;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
  
  <style>
    @keyframes slideUp {
      from { transform: translateY(30px) scale(0.95); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes slideUpScale {
      from { transform: translateY(40px) scale(0.9); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
        <button onclick="saveNote()" style="padding: 12px 24px; background: linear-gradient(135deg, #f97316 0%, #fb923c 50%, #ea580c 100%); color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.opacity='0.9';" onmouseout="this.style.opacity='1';">Kaydet</button>
      </div>
    </div>
  </div>
  
  <!-- Masa Aktar Modal -->
  <div id="transferModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2000; align-items: center; justify-content: center; padding: 20px;" onclick="if(event.target === this) hideTransferModal()">
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 500px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #2563eb 100%); color: white; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800;" id="transferModalTitle">Aktarılacak Masayı Seçin (Dolu)</h2>
          <button onclick="hideTransferModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold;">×</button>
        </div>
        <p id="transferModalSubtitle" style="margin: 8px 0 0 0; font-size: 13px; opacity: 0.9;"></p>
      </div>
      <div style="flex: 1; overflow-y: auto; padding: 20px;">
        <p id="transferModalDescription" style="color: #6b7280; margin-bottom: 16px; font-weight: 600; font-size: 14px;"></p>
        <div id="transferTablesGrid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;"></div>
      </div>
      <div style="border-top: 1px solid #e5e7eb; padding: 16px; display: flex; justify-content: space-between; gap: 12px;">
        <button onclick="handleTransferBack()" id="transferBackBtn" style="padding: 12px 24px; background: #f3f4f6; color: #374151; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.background='#e5e7eb';" onmouseout="this.style.background='#f3f4f6';" style="display: none;">Geri</button>
        <button onclick="handleTransferConfirm()" id="transferConfirmBtn" style="padding: 12px 24px; background: linear-gradient(135deg, #4f46e5 0%, #2563eb 100%); color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s; flex: 1; display: none;" onmouseover="this.style.opacity='0.9';" onmouseout="this.style.opacity='1';">Aktar</button>
        <button onclick="hideTransferModal()" id="transferCancelBtn" style="padding: 12px 24px; background: #f3f4f6; color: #374151; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.background='#e5e7eb';" onmouseout="this.style.background='#f3f4f6';">İptal</button>
      </div>
    </div>
  </div>
  
  <!-- Yayın Mesajı Popup -->
  <div id="broadcastMessageModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 20000; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(8px); animation: fadeIn 0.3s ease;" onclick="if(event.target === this) return;">
    <div style="background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border-radius: 32px; width: 100%; max-width: 420px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 30px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset; animation: slideUpScale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); position: relative;">
      <!-- Dekoratif arka plan efekti -->
      <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%); border-radius: 50%; pointer-events: none;"></div>
      <div style="position: absolute; bottom: -30px; left: -30px; width: 150px; height: 150px; background: radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%); border-radius: 50%; pointer-events: none;"></div>
      
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%); color: white; padding: 28px 24px; position: relative; overflow: hidden;">
        <div style="position: absolute; top: -20px; right: -20px; width: 120px; height: 120px; background: rgba(255,255,255,0.1); border-radius: 50%; filter: blur(20px);"></div>
        <div style="display: flex; align-items: center; gap: 16px; position: relative; z-index: 1;">
          <div style="width: 56px; height: 56px; background: rgba(255,255,255,0.25); backdrop-filter: blur(10px); border-radius: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 16px rgba(0,0,0,0.15);">
            <span style="font-size: 28px;">📢</span>
          </div>
          <div style="flex: 1;">
            <h2 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; text-shadow: 0 2px 8px rgba(0,0,0,0.2);">Yeni Mesaj</h2>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.95; font-weight: 500;">Yönetimden bildirim</p>
          </div>
        </div>
      </div>
      
      <!-- Content -->
      <div style="padding: 28px 24px; position: relative; z-index: 1;">
        <div style="margin-bottom: 20px;">
          <p id="broadcastMessageText" style="margin: 0; font-size: 16px; font-weight: 500; color: #1f2937; line-height: 1.7; white-space: pre-wrap; letter-spacing: 0.2px;"></p>
        </div>
        <div style="background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin-bottom: 24px; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #64748b;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p id="broadcastMessageDate" style="margin: 0; font-size: 13px; color: #64748b; font-weight: 600; text-align: center;"></p>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="border-top: 1px solid #e2e8f0; padding: 20px 24px; display: flex; justify-content: center; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); position: relative; z-index: 1;">
        <button onclick="closeBroadcastMessage()" style="padding: 16px 48px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 16px; font-weight: 700; font-size: 16px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4), 0 0 0 0 rgba(102, 126, 234, 0.5); letter-spacing: 0.3px; position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-2px) scale(1.02)'; this.style.boxShadow='0 12px 28px rgba(102, 126, 234, 0.5), 0 0 0 4px rgba(102, 126, 234, 0.2)';" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 20px rgba(102, 126, 234, 0.4), 0 0 0 0 rgba(102, 126, 234, 0.5)';">
          <span style="position: relative; z-index: 1;">Anladım</span>
          <div style="position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 100%); opacity: 0; transition: opacity 0.3s;" onmouseover="this.style.opacity='1';" onmouseout="this.style.opacity='0';"></div>
        </button>
      </div>
    </div>
  </div>
  
  <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
  <script>
    const API_URL = '${serverURL}/api';
    const SOCKET_URL = '${serverURL}';
    // Tema rengi değerleri (global)
    const themePrimary = '${primary}';
    const themePrimaryLight = '${primaryLight}';
    const themePrimaryDark = '${primaryDark}';
    const themeRgb = ${rgb ? `{ r: ${rgb.r}, g: ${rgb.g}, b: ${rgb.b} }` : '{ r: 249, g: 115, b: 22 }'};
    const insideTablesCount = ${insideTablesCount};
    const outsideTablesCount = ${outsideTablesCount};
    const packageTablesCount = ${packageTablesCount};
    const isSultanSomatiMode = ${isSultanSomati ? 'true' : 'false'};
    const isYakasGrillMode = ${isYakasGrill ? 'true' : 'false'};
    const isGeceDonercisiMode = ${isGeceDonercisi ? 'true' : 'false'};
    const isLacromisaMode = ${isLacromisa ? 'true' : 'false'};
    const sultanSomatiSalons = ${isSultanSomati ? JSON.stringify(sultanSomatiSalons) : '[]'};
    const geceDonercisiCategories = ${isGeceDonercisi ? JSON.stringify(geceDonercisiCategories) : '[]'};
    let selectedTable = null;
    let categories = [];
    let products = [];
    let cart = [];
    let selectedCategoryId = null;
    let currentStaff = null;
    let socket = null;
    let tables = [];
    let currentTableType = ${isSultanSomati ? `'disari'` : isYakasGrill ? `'masa'` : isGeceDonercisi ? `'salon'` : `'inside'`};
    let orderNote = '';
    
    // PIN oturum yönetimi (1 saat)
    const SESSION_DURATION = 60 * 60 * 1000;
    
    function saveStaffSession(staff) {
      const sessionData = { staff: staff, timestamp: Date.now() };
      localStorage.setItem('staffSession', JSON.stringify(sessionData));
    }
    
    function getStaffSession() {
      const sessionData = localStorage.getItem('staffSession');
      if (!sessionData) return null;
      try {
        const parsed = JSON.parse(sessionData);
        if (Date.now() - parsed.timestamp > SESSION_DURATION) {
          localStorage.removeItem('staffSession');
          return null;
        }
        return parsed.staff;
      } catch (error) {
        localStorage.removeItem('staffSession');
        return null;
      }
    }
    
    // Sayfa yüklendiğinde oturum kontrolü
    window.addEventListener('load', async () => {
      // Cart'ı başlat
      initializeCart();
      
      // Resim cache'ini başlat
      try {
        await initImageCache();
        console.log('✅ Resim cache başlatıldı');
      } catch (error) {
        console.error('❌ Resim cache başlatma hatası:', error);
      }
      
      const savedStaff = getStaffSession();
      if (savedStaff) {
        currentStaff = savedStaff;
        const pinSection = document.getElementById('pinSection');
        if (pinSection) pinSection.style.display = 'none';
        const mainSection = document.getElementById('mainSection');
        if (mainSection) mainSection.style.display = 'block';
        // staffName ve staffInfo elementleri kaldırıldı, null kontrolü yap
        const staffNameEl = document.getElementById('staffName');
        if (staffNameEl) {
          staffNameEl.textContent = currentStaff.name + ' ' + currentStaff.surname;
        }
        const staffInfoEl = document.getElementById('staffInfo');
        if (staffInfoEl) {
          staffInfoEl.style.display = 'none';
        }
        // Sultan Somatı ve Yaka's Grill için direkt masa ekranını göster, normal mod için seçim ekranını göster
        if (isSultanSomatiMode) {
          const tableSelection = document.getElementById('tableSelection');
          if (tableSelection) tableSelection.style.display = 'block';
          const cart = document.getElementById('cart');
          if (cart) cart.style.display = 'none'; // Ana sayfada cart gizli
          // İlk salonu otomatik seç
          if (sultanSomatiSalons.length > 0) {
            currentTableType = sultanSomatiSalons[0].id;
            const firstTab = document.getElementById('salonTab_' + sultanSomatiSalons[0].id);
            if (firstTab) {
              firstTab.classList.add('active');
              firstTab.style.background = '#e5e5e5';
              firstTab.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            }
          }
        } else if (isYakasGrillMode) {
          const tableSelection = document.getElementById('tableSelection');
          if (tableSelection) tableSelection.style.display = 'block';
          const cart = document.getElementById('cart');
          if (cart) cart.style.display = 'block';
        } else if (isGeceDonercisiMode) {
          const tableSelection = document.getElementById('tableSelection');
          if (tableSelection) tableSelection.style.display = 'block';
          const cart = document.getElementById('cart');
          if (cart) cart.style.display = 'block';
          if (geceDonercisiCategories.length > 0) {
            currentTableType = geceDonercisiCategories[0].id;
            const firstTab = document.getElementById('salonTab_' + geceDonercisiCategories[0].id);
            if (firstTab) {
              firstTab.classList.add('active');
              firstTab.style.background = 'linear-gradient(135deg, #334155 0%, #475569 100%)';
              firstTab.style.color = '#fff';
              firstTab.style.borderColor = 'transparent';
              firstTab.style.boxShadow = '0 4px 14px rgba(51,65,85,0.35)';
            }
          }
        } else if (isLacromisaMode) {
          const tableSelection = document.getElementById('tableSelection');
          if (tableSelection) tableSelection.style.display = 'block';
          const cart = document.getElementById('cart');
          if (cart) cart.style.display = 'block';
          currentTableType = 'inside';
          document.querySelectorAll('.table-type-tab').forEach(t => { t.classList.remove('active'); });
          const insideTab = document.querySelector('.table-type-tab[data-type="inside"]');
          if (insideTab) { insideTab.classList.add('active'); }
        } else {
          const tableTypeSelection = document.getElementById('tableTypeSelection');
          if (tableTypeSelection) tableTypeSelection.style.display = 'flex';
          const cart = document.getElementById('cart');
          if (cart) cart.style.display = 'none';
        }
        loadData();
        initWebSocket();
      }
    });
    
    // PIN doğrulama
    window.verifyStaffPin = async function verifyStaffPin() {
      const pinInput = document.getElementById('pinInput');
      const pin = pinInput.value;
      const errorDiv = document.getElementById('pinError');
      
      if (!pin) {
        errorDiv.textContent = 'Lütfen şifrenizi girin';
        errorDiv.classList.add('show');
        return;
      }
      
      try {
        const response = await fetch(API_URL + '/staff/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pin })
        });
        
        const result = await response.json();
        
        if (result.success) {
          currentStaff = result.staff;
          saveStaffSession(currentStaff);
          errorDiv.classList.remove('show');
          
          // Splash screen göster
          const pinSection = document.getElementById('pinSection');
          if (pinSection) pinSection.style.display = 'none';
          const splashScreen = document.getElementById('splashScreen');
          if (splashScreen) splashScreen.style.display = 'flex';
          const splashStaffName = document.getElementById('splashStaffName');
          if (splashStaffName) splashStaffName.textContent = currentStaff.name + ' ' + currentStaff.surname;
          
          // 2 saniye sonra ana ekrana geç
          setTimeout(() => {
            const splashScreenEl = document.getElementById('splashScreen');
            if (splashScreenEl) splashScreenEl.style.display = 'none';
            const mainSection = document.getElementById('mainSection');
            if (mainSection) mainSection.style.display = 'block';
            // staffName ve staffInfo elementleri kaldırıldı, null kontrolü yap
            const staffNameEl = document.getElementById('staffName');
            if (staffNameEl) {
              staffNameEl.textContent = currentStaff.name + ' ' + currentStaff.surname;
            }
            const staffInfoEl = document.getElementById('staffInfo');
            if (staffInfoEl) {
              staffInfoEl.style.display = 'none';
            }
            // Sultan Somatı ve Yaka's Grill için direkt masa ekranını göster, normal mod için seçim ekranını göster
            if (isSultanSomatiMode) {
              const tableSelection = document.getElementById('tableSelection');
              if (tableSelection) tableSelection.style.display = 'block';
              const cart = document.getElementById('cart');
              if (cart) cart.style.display = 'block';
              // İlk salonu otomatik seç
              if (sultanSomatiSalons.length > 0) {
                currentTableType = sultanSomatiSalons[0].id;
                const firstTab = document.getElementById('salonTab_' + sultanSomatiSalons[0].id);
                if (firstTab) {
                  firstTab.classList.add('active');
                  firstTab.style.background = '#e5e5e5';
                  firstTab.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }
              }
            } else if (isYakasGrillMode) {
              const tableSelection = document.getElementById('tableSelection');
              if (tableSelection) tableSelection.style.display = 'block';
              const cart = document.getElementById('cart');
              if (cart) cart.style.display = 'block';
            } else if (isGeceDonercisiMode) {
              const tableSelection = document.getElementById('tableSelection');
              if (tableSelection) tableSelection.style.display = 'block';
              const cart = document.getElementById('cart');
              if (cart) cart.style.display = 'block';
              if (geceDonercisiCategories.length > 0) {
                currentTableType = geceDonercisiCategories[0].id;
                const firstTab = document.getElementById('salonTab_' + geceDonercisiCategories[0].id);
                if (firstTab) {
                  firstTab.classList.add('active');
                  firstTab.style.background = 'linear-gradient(135deg, #334155 0%, #475569 100%)';
                  firstTab.style.color = '#fff';
                  firstTab.style.borderColor = 'transparent';
                  firstTab.style.boxShadow = '0 4px 14px rgba(51,65,85,0.35)';
                }
              }
            } else if (isLacromisaMode) {
              const tableSelection = document.getElementById('tableSelection');
              if (tableSelection) tableSelection.style.display = 'block';
              const cart = document.getElementById('cart');
              if (cart) cart.style.display = 'block';
              currentTableType = 'inside';
              document.querySelectorAll('.table-type-tab').forEach(t => { t.classList.remove('active'); });
              const insideTab = document.querySelector('.table-type-tab[data-type="inside"]');
              if (insideTab) { insideTab.classList.add('active'); }
            } else {
              const tableTypeSelection = document.getElementById('tableTypeSelection');
              if (tableTypeSelection) tableTypeSelection.style.display = 'flex';
              const cart = document.getElementById('cart');
              if (cart) cart.style.display = 'none';
            }
            loadData();
            initWebSocket();
          }, 2000);
        } else {
          errorDiv.textContent = result.error || 'Şifre hatalı';
          errorDiv.classList.add('show');
          pinInput.value = '';
        }
      } catch (error) {
        console.error('PIN doğrulama hatası:', error);
        errorDiv.textContent = 'Bağlantı hatası';
        errorDiv.classList.add('show');
      }
    }
    
    document.getElementById('pinInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') verifyStaffPin();
    });
    
    // WebSocket bağlantısı
    function initWebSocket() {
      if (socket) socket.disconnect();
      try {
        socket = io(SOCKET_URL);
        socket.on('connect', () => console.log('WebSocket bağlandı'));
        socket.on('table-update', async (data) => {
          console.log('📡 Masa güncellemesi alındı:', data);
          // Önce anında UI'ı güncelle (optimistic update)
          if (tables && tables.length > 0) {
            const tableIndex = tables.findIndex(t => t.id === data.tableId);
            if (tableIndex !== -1) {
              tables[tableIndex].hasOrder = data.hasOrder;
              renderTables(); // Anında render et
              if (isSultanSomatiMode || isGeceDonercisiMode) {
                updateSalonCounts();
              }
            }
          }
          
          // Arka planda API'den güncel veriyi yükle
          fetch(API_URL + '/tables')
            .then(tablesRes => {
              if (tablesRes.ok) {
                return tablesRes.json();
              }
              return null;
            })
            .then(updatedTables => {
              if (updatedTables) {
                tables = updatedTables;
                renderTables();
                // Sultan Somatı için salon sayılarını güncelle
                if (isSultanSomatiMode) {
                  updateSalonCounts();
                }
              }
            })
            .catch(error => {
              console.error('Masa güncelleme hatası:', error);
            });
          
          // Eğer seçili masa varsa siparişleri arka planda yenile
          if (selectedTable && selectedTable.id === data.tableId) {
            loadExistingOrders(selectedTable.id).catch(err => console.error('Sipariş yenileme hatası:', err));
          }
        });
        socket.on('new-order', async (data) => {
          console.log('📦 Yeni sipariş alındı:', data);
          // Eğer seçili masa varsa siparişleri yenile
          if (selectedTable && selectedTable.id === data.tableId) {
            await loadExistingOrders(selectedTable.id);
          }
        });
        socket.on('staff-deleted', (data) => {
          console.log('⚠️ Personel silindi:', data);
          // Otomatik çıkış yap
          localStorage.removeItem('staffSession');
          // Ana ekranı gizle, giriş ekranını göster
          document.getElementById('mainSection').style.display = 'none';
          document.getElementById('pinSection').style.display = 'block';
          // Hata mesajını göster
          const errorDiv = document.getElementById('pinError');
          errorDiv.textContent = data.message || 'Hesabınız silindi. Lütfen yönetici ile iletişime geçin.';
          errorDiv.classList.add('show');
          // Input'u temizle
          document.getElementById('pinInput').value = '';
          // Toast göster
          showToast('error', 'Hesap Silindi', data.message || 'Hesabınız silindi. Lütfen yönetici ile iletişime geçin.');
        });
        socket.on('broadcast-message', (data) => {
          console.log('📢 Yayın mesajı alındı:', data);
          showBroadcastMessage(data.message, data.date, data.time);
        });
        socket.on('product-stock-update', async (data) => {
          console.log('📦 Stok güncellemesi alındı:', data);
          // Ürün listesini güncelle
          const productIndex = products.findIndex(p => p.id === data.productId);
          if (productIndex !== -1) {
            products[productIndex] = {
              ...products[productIndex],
              stock: data.stock,
              trackStock: data.trackStock
            };
            // Eğer sipariş ekranındaysak ürünleri yeniden render et
            if (document.getElementById('orderSection') && document.getElementById('orderSection').style.display !== 'none') {
              renderProducts();
            }
          } else {
            // Ürün bulunamadıysa API'den yeniden yükle
            try {
              const prodsRes = await fetch(API_URL + '/products');
              if (prodsRes.ok) {
                products = await prodsRes.json();
                // Eğer sipariş ekranındaysak ürünleri yeniden render et
                if (document.getElementById('orderSection') && document.getElementById('orderSection').style.display !== 'none') {
                  renderProducts();
                }
              }
            } catch (error) {
              console.error('Ürün güncelleme hatası:', error);
            }
          }
        });
        socket.on('disconnect', () => console.log('WebSocket bağlantısı kesildi'));
      } catch (error) {
        console.error('WebSocket bağlantı hatası:', error);
      }
    }
    
    // Masa tipi seçim ekranından seçim (Normal Mod için)
    function selectTableTypeScreen(type) {
      if (isSultanSomatiMode || isYakasGrillMode) return; // Sultan Somatı ve Yaka's Grill için bu fonksiyon kullanılmaz
      currentTableType = type;
      const tableTypeSelection = document.getElementById('tableTypeSelection');
      if (tableTypeSelection) tableTypeSelection.style.display = 'none';
      const tableSelection = document.getElementById('tableSelection');
      if (tableSelection) tableSelection.style.display = 'block';
      // staffInfo elementi kaldırıldı, null kontrolü yap
      const staffInfoEl = document.getElementById('staffInfo');
      if (staffInfoEl) {
        staffInfoEl.style.display = 'block';
      }
      const mainLogoutBtn = document.getElementById('mainLogoutBtn');
      if (mainLogoutBtn) {
        mainLogoutBtn.style.display = 'flex';
      }
      // Sipariş gönder modalını göster
      const cart = document.getElementById('cart');
      if (cart) cart.style.display = 'block';
      renderTables();
    }
    
    // Geri dönüş butonu (Normal Mod için - Lacrimosa'da bu ekran yok, buton da kaldırıldı)
    function goBackToTypeSelection() {
      if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode || isLacromisaMode) return; // Özel tenant modları için geri dönüş yok
      const tableSelection = document.getElementById('tableSelection');
      if (tableSelection) tableSelection.style.display = 'none';
      const tableTypeSelection = document.getElementById('tableTypeSelection');
      if (tableTypeSelection) tableTypeSelection.style.display = 'flex';
      // staffInfo elementi kaldırıldı, null kontrolü yap
      const staffInfoEl = document.getElementById('staffInfo');
      if (staffInfoEl) {
        staffInfoEl.style.display = 'none';
      }
      const mainLogoutBtn = document.getElementById('mainLogoutBtn');
      if (mainLogoutBtn) {
        mainLogoutBtn.style.display = 'none';
      }
      // Sipariş gönder modalını gizle
      const cart = document.getElementById('cart');
      if (cart) cart.style.display = 'none';
      selectedTable = null;
      renderTables();
    }
    
    // Sultan Somatı / Gece Dönercisi için salon veya kategori seçimi
    function selectSalon(salonId) {
      if (!isSultanSomatiMode && !isGeceDonercisiMode) return;
      currentTableType = salonId;
      document.querySelectorAll('.salon-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.background = 'white';
        tab.style.boxShadow = 'none';
        if (isGeceDonercisiMode) {
          tab.style.color = '#475569';
          tab.style.borderColor = '#e2e8f0';
        }
      });
      const selectedTab = document.getElementById('salonTab_' + salonId);
      if (selectedTab) {
        selectedTab.classList.add('active');
        selectedTab.style.background = isGeceDonercisiMode ? 'linear-gradient(135deg, #334155 0%, #475569 100%)' : '#e5e5e5';
        selectedTab.style.color = isGeceDonercisiMode ? '#fff' : '';
        selectedTab.style.borderColor = isGeceDonercisiMode ? 'transparent' : '';
        selectedTab.style.boxShadow = isGeceDonercisiMode ? '0 4px 14px rgba(51,65,85,0.35)' : '0 2px 4px rgba(0,0,0,0.1)';
      }
      renderTables();
      updateSalonCounts();
    }
    
    // Salon / kategori sekmelerindeki sipariş sayılarını güncelle
    function updateSalonCounts() {
      if (isSultanSomatiMode) {
        sultanSomatiSalons.forEach(salon => {
          const salonTables = tables.filter(t => t.id && t.id.startsWith('salon-' + salon.id + '-'));
          const occupiedCount = salonTables.filter(t => t.hasOrder).length;
          const countEl = document.getElementById('salonCount_' + salon.id);
          if (countEl) countEl.textContent = occupiedCount;
        });
      }
      if (isGeceDonercisiMode && geceDonercisiCategories.length > 0) {
        geceDonercisiCategories.forEach(cat => {
          const catTables = tables.filter(t => t.type === cat.id);
          const occupiedCount = catTables.filter(t => t.hasOrder).length;
          const countEl = document.getElementById('salonCount_' + cat.id);
          if (countEl) countEl.textContent = occupiedCount;
        });
      }
    }
    
    // Masa tipi seçimi (masalar ekranında - Normal Mod için)
    function selectTableType(type) {
      if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode) return; // Özel tenant modları için salon/kategori sekmeleri kullanılır
      currentTableType = type;
      document.querySelectorAll('.table-type-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-type') === type) {
          tab.classList.add('active');
        }
      });
      renderTables();
    }
    
    async function loadData() {
      try {
        const [catsRes, prodsRes, tablesRes] = await Promise.all([
          fetch(API_URL + '/categories'),
          fetch(API_URL + '/products'),
          fetch(API_URL + '/tables')
        ]);
        categories = await catsRes.json();
        products = await prodsRes.json();
        tables = await tablesRes.json();
        renderTables();
        renderCategories();
        if (isSultanSomatiMode || isGeceDonercisiMode) {
          updateSalonCounts();
        }
      } catch (error) {
        console.error('Veri yükleme hatası:', error);
        document.getElementById('tablesGrid').innerHTML = '<div class="loading">❌ Bağlantı hatası</div>';
      }
    }
    
    function renderTables() {
      const grid = document.getElementById('tablesGrid');
      if (!grid) return;
      
      // Sultan Somatı: salon ID; Yaka's Grill: masa-; Gece Dönercisi: kategori type; normal: currentTableType
      const filteredTables = isSultanSomatiMode 
        ? tables.filter(t => t.id && t.id.startsWith('salon-') && t.id.includes('-' + currentTableType + '-'))
        : isYakasGrillMode
        ? tables.filter(t => t.id && t.id.startsWith('masa-'))
        : isGeceDonercisiMode
        ? tables.filter(t => t.type === currentTableType)
        : tables.filter(t => t.type === currentTableType);
      
      // Normal masalar (paket olmayanlar)
      const normalTables = filteredTables.filter(t => !t.id.startsWith('package-'));
      // Paket masaları
      const packageTables = filteredTables.filter(t => t.id.startsWith('package-'));
      
      let html = '';
      
      // Normal masalar - tek grid içinde
      if (normalTables.length > 0) {
        html += normalTables.map(table => {
          const tableIdStr = typeof table.id === 'string' ? '\\'' + table.id + '\\'' : table.id;
          const nameStr = table.name.replace(/'/g, "\\'");
          const typeStr = table.type.replace(/'/g, "\\'");
          const hasOrderClass = table.hasOrder ? ' has-order' : '';
          const selectedClass = selectedTable && selectedTable.id === table.id ? ' selected' : '';
          const outsideEmptyClass = (table.type === 'outside' && !table.hasOrder) ? ' outside-empty' : '';
          
          // Sultan Somatı için görseldeki gibi basit masa kartları (sadece numara)
          if (isSultanSomatiMode && table.id && table.id.startsWith('salon-')) {
            // Görseldeki gibi: Beyaz kart, ortada sadece harf ve numara (D 1, D 2 gibi)
            const salonId = table.id.split('-').slice(1, -1).join('-');
            const salon = sultanSomatiSalons.find(s => s.id === salonId);
            // Salon adının ilk harfini al (Dışarı -> D, Kış Bahçesi -> K)
            let tableLetter = 'M';
            if (salon) {
              if (salon.name === 'Dışarı') tableLetter = 'D';
              else if (salon.name === 'Kış Bahçesi') tableLetter = 'K';
              else if (salon.name === 'Osmanlı Odası') tableLetter = 'O';
              else if (salon.name === 'Selçuklu Odası') tableLetter = 'S';
              else if (salon.name === 'Mevlevi Odası') tableLetter = 'M';
              else if (salon.name === 'Aşk Odası') tableLetter = 'A';
              else tableLetter = salon.name.charAt(0).toUpperCase();
            }
            const tableNumber = table.number;
            const displayText = tableLetter + ' ' + tableNumber;
            
            // Görseldeki gibi: Beyaz arka plan, dolu ise kırmızı border, seçili ise mavi border
            const bgColor = table.hasOrder ? '#fee2e2' : 'white';
            const borderColor = selectedClass ? '#3b82f6' : (table.hasOrder ? '#dc2626' : '#e0e0e0');
            const borderWidth = selectedClass ? '2px' : '1px';
            const textColor = table.hasOrder ? '#991b1b' : '#333';
            
            return '<button class="table-btn' + hasOrderClass + selectedClass + '" onclick="selectTable(' + tableIdStr + ', \\'' + nameStr + '\\', \\'' + typeStr + '\\')" style="background: ' + bgColor + '; border: ' + borderWidth + ' solid ' + borderColor + '; border-radius: 12px; padding: 20px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 600; color: ' + textColor + '; min-height: 100px; transition: all 0.2s; cursor: pointer;" onmouseover="if(!this.classList.contains(\\'selected\\')) { this.style.transform=\\'scale(1.02)\\'; this.style.boxShadow=\\'0 4px 12px rgba(0,0,0,0.1)\\'; }" onmouseout="if(!this.classList.contains(\\'selected\\')) { this.style.transform=\\'scale(1)\\'; this.style.boxShadow=\\'none\\'; }">' +
              displayText +
            '</button>';
          }
          
          // Yaka's Grill için MASA-1, MASA-2 formatında masalar - Kompakt tasarım (30 masa tek ekrana sığsın)
          if (isYakasGrillMode && table.id && table.id.startsWith('masa-')) {
            const tableNumber = table.number;
            const displayText = 'MASA-' + tableNumber;
            
            // Kompakt tasarım: Beyaz arka plan, dolu ise kırmızı border, seçili ise mavi border
            const bgColor = table.hasOrder ? '#fee2e2' : 'white';
            const borderColor = selectedClass ? '#3b82f6' : (table.hasOrder ? '#dc2626' : '#e0e0e0');
            const borderWidth = selectedClass ? '2px' : '1px';
            const textColor = table.hasOrder ? '#991b1b' : '#333';
            
            return '<button class="table-btn' + hasOrderClass + selectedClass + '" onclick="selectTable(' + tableIdStr + ', \\'' + nameStr + '\\', \\'' + typeStr + '\\')" style="background: ' + bgColor + '; border: ' + borderWidth + ' solid ' + borderColor + '; border-radius: 8px; padding: 8px 4px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: ' + textColor + '; aspect-ratio: 1; min-height: 60px; transition: all 0.2s; cursor: pointer;" onmouseover="if(!this.classList.contains(\\'selected\\')) { this.style.transform=\\'scale(1.05)\\'; this.style.boxShadow=\\'0 2px 8px rgba(0,0,0,0.15)\\'; }" onmouseout="if(!this.classList.contains(\\'selected\\')) { this.style.transform=\\'scale(1)\\'; this.style.boxShadow=\\'none\\'; }">' +
              '<div style="text-align: center; line-height: 1.2;">' + displayText + '</div>' +
            '</button>';
          }
          
          // Gece Dönercisi: 5x6 dağılım, büyük masa kartları (30 masa). LOCA masası mobilde "Loca" görünsün (tenant özel)
          if (isGeceDonercisiMode && table.id && table.type) {
            const displayText = (table.type === 'loca' || table.id === 'loca-1') ? 'Loca' : (table.name || (table.type + ' ' + table.number));
            const bgColor = table.hasOrder ? 'linear-gradient(145deg, #fef2f2 0%, #fee2e2 100%)' : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)';
            const borderColor = selectedClass ? '#334155' : (table.hasOrder ? '#dc2626' : '#e2e8f0');
            const borderWidth = selectedClass ? '2px' : '1px';
            const textColor = table.hasOrder ? '#991b1b' : '#334155';
            const boxShadow = selectedClass ? '0 4px 14px rgba(51,65,85,0.2)' : (table.hasOrder ? '0 2px 8px rgba(220,38,38,0.15)' : '0 2px 6px rgba(0,0,0,0.06)');
            return '<button class="table-btn' + hasOrderClass + selectedClass + '" onclick="selectTable(' + tableIdStr + ', \\'' + nameStr + '\\', \\'' + typeStr + '\\')" style="background: ' + bgColor + '; border: ' + borderWidth + ' solid ' + borderColor + '; border-radius: 14px; padding: 14px 10px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: ' + textColor + '; aspect-ratio: 1; min-height: 88px; transition: all 0.25s ease; cursor: pointer; box-shadow: ' + boxShadow + '; letter-spacing: 0.2px;" onmouseover="if(!this.classList.contains(\\'selected\\')) { this.style.transform=\\'scale(1.03)\\'; this.style.boxShadow=\\'0 6px 18px rgba(0,0,0,0.12)\\'; }" onmouseout="if(!this.classList.contains(\\'selected\\')) { this.style.transform=\\'scale(1)\\'; this.style.boxShadow=\\'0 2px 6px rgba(0,0,0,0.06)\\'; }">' +
              '<div style="text-align: center; line-height: 1.3;">' + displayText + '</div>' +
            '</button>';
          }
          
          // Normal mod için eski tasarım
          // Masa numaralandırması: İç Masa 1, Dış Masa 1 gibi
          const tableTypeLabel = table.type === 'inside' ? (isLacromisaMode ? 'Salon' : 'İç Masa') : (isLacromisaMode ? 'Bahçe' : 'Dış Masa');
          const tableDisplayName = tableTypeLabel + ' ' + table.number;
          
          // Durum etiketi: Dolu veya Boş
          const statusLabel = table.hasOrder ? 'Dolu' : 'Boş';
          // Dolu masalar için daha koyu yeşil ton
          const statusColor = table.hasOrder ? '#166534' : '#6b7280';
          
          return '<button class="table-btn' + hasOrderClass + selectedClass + outsideEmptyClass + '" onclick="selectTable(' + tableIdStr + ', \\'' + nameStr + '\\', \\'' + typeStr + '\\')">' +
            '<div class="table-number">' + table.number + '</div>' +
            '<div class="table-label">' + tableDisplayName + '</div>' +
            '<div style="font-size: 10px; font-weight: 600; color: ' + statusColor + '; margin-top: 4px; padding: 2px 6px; background: ' + (table.hasOrder ? 'rgba(22, 101, 52, 0.15)' : 'rgba(107, 114, 128, 0.1)') + '; border-radius: 6px;">' + statusLabel + '</div>' +
          '</button>';
        }).join('');
      }
      
      // PAKET Başlığı - Premium ve Modern (Sadece normal mod için)
      if (packageTables.length > 0 && !isSultanSomatiMode && !isYakasGrillMode && !isGeceDonercisiMode) {
        html += '<div style="grid-column: 1 / -1; margin-top: 16px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center;">';
        html += '<div style="display: flex; align-items: center; gap: 8px; padding: 10px 20px; background: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 30%, ${primaryLight}CC 70%, ${primaryLight}DD 100%); border-radius: 16px; box-shadow: 0 4px 16px ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)` : 'rgba(249, 115, 22, 0.35)'}, 0 0 0 1px rgba(255, 255, 255, 0.2) inset; position: relative; overflow: hidden;">';
        html += '<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 100%); pointer-events: none;"></div>';
        html += '<svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2.5" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); position: relative; z-index: 1;"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>';
        html += '<h3 style="font-size: 17px; font-weight: 900; color: white; margin: 0; letter-spacing: 1.2px; text-shadow: 0 2px 6px rgba(0,0,0,0.3); position: relative; z-index: 1;">PAKET</h3>';
        html += '</div>';
        html += '</div>';
        
        // Paket masaları - Premium Tasarım
        html += packageTables.map(table => {
          const tableIdStr = typeof table.id === 'string' ? '\\'' + table.id + '\\'' : table.id;
          const nameStr = table.name.replace(/'/g, "\\'");
          const typeStr = table.type.replace(/'/g, "\\'");
          const hasOrderClass = table.hasOrder ? ' has-order' : '';
          const selectedClass = selectedTable && selectedTable.id === table.id ? ' selected' : '';
          
          // Dolu için yeşil, boş için turuncu premium renkler
          const bgGradient = table.hasOrder 
            ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)' 
            : 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)';
          const borderColor = table.hasOrder ? '#10b981' : '#f97316';
          const numberBg = table.hasOrder 
            ? 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)' 
            : 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fd7e14 100%)';
          const iconColor = table.hasOrder ? '#10b981' : '#f97316';
          
          return '<button class="table-btn package-table-btn' + hasOrderClass + selectedClass + '" onclick="selectTable(' + tableIdStr + ', \\'' + nameStr + '\\', \\'' + typeStr + '\\')" style="background: ' + bgGradient + '; border: 3px solid ' + borderColor + '; box-shadow: 0 4px 16px ' + (table.hasOrder ? 'rgba(16, 185, 129, 0.35)' : 'rgba(' + themeRgb.r + ', ' + themeRgb.g + ', ' + themeRgb.b + ', 0.35)') + ', 0 0 0 1px rgba(255, 255, 255, 0.4) inset; position: relative; overflow: hidden; transform: scale(1); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);">' +
            '<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: ' + (table.hasOrder ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, transparent 100%)' : 'linear-gradient(135deg, rgba(' + themeRgb.r + ', ' + themeRgb.g + ', ' + themeRgb.b + ', 0.15) 0%, transparent 100%)') + '; pointer-events: none; opacity: 0.8;"></div>' +
            '<div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); pointer-events: none; transform: rotate(45deg);"></div>' +
            '<div class="table-number" style="background: ' + numberBg + '; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: white; box-shadow: 0 4px 16px ' + (table.hasOrder ? 'rgba(16, 185, 129, 0.5)' : 'rgba(' + themeRgb.r + ', ' + themeRgb.g + ', ' + themeRgb.b + ', 0.5)') + ', 0 0 0 3px rgba(255, 255, 255, 0.4) inset; margin-bottom: 8px; position: relative; z-index: 2; transition: all 0.3s;">' + table.number + '</div>' +
            '<div style="position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 5px;">' +
            '<div class="table-label" style="font-size: 12px; font-weight: 900; color: ' + (table.hasOrder ? '#047857' : '#9a3412') + '; letter-spacing: 0.8px; text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);">' + table.name + '</div>' +
            (table.hasOrder ? '<div style="width: 8px; height: 8px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; box-shadow: 0 0 12px rgba(16, 185, 129, 0.8), 0 0 6px rgba(16, 185, 129, 0.6); animation: pulse 2s infinite;"></div>' : '<div style="width: 6px; height: 6px; background: linear-gradient(135deg, ' + themePrimary + ' 0%, ' + themePrimaryLight + ' 100%); border-radius: 50%; opacity: 0.6;"></div>') +
            '</div>' +
            (table.hasOrder ? '<div style="position: absolute; top: 6px; right: 6px; width: 12px; height: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; box-shadow: 0 0 12px rgba(16, 185, 129, 0.9), 0 0 6px rgba(16, 185, 129, 0.7); animation: pulse 2s infinite; z-index: 3;"></div>' : '') +
          '</button>';
        }).join('');
      }
      
      grid.innerHTML = html;
      
      if (isSultanSomatiMode || isGeceDonercisiMode) {
        updateSalonCounts();
      }
    }
    
    // Alt navigasyon bar fonksiyonları (Sultan Somatı ve Yaka's Grill için)
    function showTablesView() {
      if (!isSultanSomatiMode && !isYakasGrillMode) return;
      const tableSelection = document.getElementById('tableSelection');
      if (tableSelection) tableSelection.style.display = 'block';
      const orderSection = document.getElementById('orderSection');
      if (orderSection) orderSection.style.display = 'none';
      const ordersView = document.getElementById('ordersView');
      if (ordersView) ordersView.style.display = 'none';
      const salesView = document.getElementById('salesView');
      if (salesView) salesView.style.display = 'none';
      const bottomNavBar = document.getElementById('bottomNavBar');
      if (bottomNavBar) bottomNavBar.style.display = 'flex';
      const cartEl = document.getElementById('cart');
      if (cartEl) cartEl.style.display = 'none'; // Ana sayfada cart gizli
      selectedTable = null;
      renderTables();
      if (isSultanSomatiMode) {
        updateBottomNavActive('tables');
      }
    }
    
    async function showOrdersView() {
      if (!isSultanSomatiMode && !isYakasGrillMode) return;
      if (isSultanSomatiMode) {
        const tableSelection = document.getElementById('tableSelection');
        if (tableSelection) tableSelection.style.display = 'none';
        const orderSection = document.getElementById('orderSection');
        if (orderSection) orderSection.style.display = 'none';
        const ordersView = document.getElementById('ordersView');
        if (ordersView) ordersView.style.display = 'block';
        const salesView = document.getElementById('salesView');
        if (salesView) salesView.style.display = 'none';
        const bottomNavBar = document.getElementById('bottomNavBar');
        if (bottomNavBar) bottomNavBar.style.display = 'flex';
        const cartEl = document.getElementById('cart');
        if (cartEl) cartEl.style.display = 'none'; // Siparişler görünümünde cart gizli
        selectedTable = null;
        await loadAllOrders();
        updateBottomNavActive('orders');
      } else {
        // Yaka's Grill için masa görünümüne yönlendir
        showTablesView();
      }
    }
    
    async function showSalesView() {
      if (!isSultanSomatiMode && !isYakasGrillMode) return;
      if (isSultanSomatiMode) {
        const tableSelection = document.getElementById('tableSelection');
        if (tableSelection) tableSelection.style.display = 'none';
        const orderSection = document.getElementById('orderSection');
        if (orderSection) orderSection.style.display = 'none';
        const ordersView = document.getElementById('ordersView');
        if (ordersView) ordersView.style.display = 'none';
        const salesView = document.getElementById('salesView');
        if (salesView) salesView.style.display = 'block';
        const bottomNavBar = document.getElementById('bottomNavBar');
        if (bottomNavBar) bottomNavBar.style.display = 'flex';
        const cartEl = document.getElementById('cart');
        if (cartEl) cartEl.style.display = 'none'; // Satışlar görünümünde cart gizli
        selectedTable = null;
        await loadRecentSales();
        updateBottomNavActive('sales');
      } else {
        // Yaka's Grill için masa görünümüne yönlendir
        showTablesView();
      }
    }
    
    function updateBottomNavActive(activeView) {
      if (!isSultanSomatiMode) return;
      const navButtons = document.querySelectorAll('#bottomNavBar button');
      navButtons.forEach((btn, index) => {
        const views = ['tables', 'orders', 'sales', 'settings'];
        if (views[index] === activeView) {
          btn.style.color = '#fbbf24';
        } else {
          btn.style.color = 'white';
        }
      });
    }
    
    function showSettingsView() {
      if (!isSultanSomatiMode && !isYakasGrillMode) return;
      // Ayarlar görünümü - şimdilik çıkış yap modalını göster
      showLogoutModal();
    }
    
    async function selectTable(id, name, type) {
      selectedTable = { id, name, type };
      renderTables();
      const tableSelection = document.getElementById('tableSelection');
      if (tableSelection) tableSelection.style.display = 'none';
      const orderSection = document.getElementById('orderSection');
      if (orderSection) orderSection.style.display = 'block';
      const ordersView = document.getElementById('ordersView');
      if (ordersView) ordersView.style.display = 'none';
      const salesView = document.getElementById('salesView');
      if (salesView) salesView.style.display = 'none';
      // Alt navigasyon bar'ı gizle (masa içeriğine girildiğinde)
      const bottomNavBar = document.getElementById('bottomNavBar');
      if (bottomNavBar) bottomNavBar.style.display = 'none';
      // Çıkış Yap butonunu gizle
      const mainLogoutBtn = document.getElementById('mainLogoutBtn');
      if (mainLogoutBtn) {
        mainLogoutBtn.style.display = 'none';
      }
      // Cart her zaman görünür, sadece içeriği kapalı başlar
      const cartEl = document.getElementById('cart');
      if (cartEl) {
        cartEl.style.display = 'block';
        cartEl.classList.remove('open'); // Başlangıçta kapalı
      }
      // Seçili masa bilgisini göster
      if (isSultanSomatiMode || isYakasGrillMode) {
        const headerEl = document.getElementById('selectedTableInfoHeader');
        if (headerEl) {
          headerEl.textContent = name;
        }
      } else {
        const infoEl = document.getElementById('selectedTableInfo');
        if (infoEl) {
          infoEl.textContent = name + ' için sipariş oluşturuluyor';
        }
      }
      // Arama çubuğunu temizle
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      // Kategorileri render et
      renderCategories();
      // Mevcut siparişleri yükle
      await loadExistingOrders(id);
      if (categories.length > 0) selectCategory(categories[0].id);
    }
    
    async function loadExistingOrders(tableId) {
      try {
        const response = await fetch(API_URL + '/table-orders?tableId=' + encodeURIComponent(tableId));
        if (!response.ok) {
          throw new Error('Siparişler yüklenemedi');
        }
        const orders = await response.json();
        renderExistingOrders(orders);
      } catch (error) {
        console.error('Sipariş yükleme hatası:', error);
        const existingOrders = document.getElementById('existingOrders');
        if (existingOrders) existingOrders.style.display = 'none';
      }
    }
    
    function renderExistingOrders(orders) {
      const ordersContainer = document.getElementById('existingOrders');
      const ordersList = document.getElementById('existingOrdersList');
      
      if (!orders || orders.length === 0) {
        ordersContainer.style.display = 'none';
        return;
      }
      
      ordersContainer.style.display = 'block';
      
      ordersList.innerHTML = orders.map(order => {
        const orderDate = order.order_date || '';
        const orderTime = order.order_time || '';
        const staffName = order.staff_name || 'Bilinmiyor';
        const orderNote = order.order_note ? '<div style="margin-top: 12px; padding: 10px; background: #fef3c7; border-radius: 8px; border-left: 3px solid #f59e0b;"><div style="font-size: 12px; font-weight: 600; color: #92400e; margin-bottom: 4px;">Not:</div><div style="font-size: 13px; color: #78350f;">' + order.order_note.replace(/\\n/g, '<br>') + '</div></div>' : '';
        
        const itemsHtml = order.items.map(item => {
          const itemTotal = (item.price * item.quantity).toFixed(2);
          const giftClass = item.isGift ? ' gift' : '';
          const itemStaffName = item.staff_name || 'Bilinmiyor';
          var donerOptsRaw = (item.donerOptionsText && String(item.donerOptionsText).trim()) ? String(item.donerOptionsText).trim() : '';
          if (!donerOptsRaw && isGeceDonercisiMode && item.donerKey === 's|d|p|a') {
            donerOptsRaw = 'Soğanlı';
          }
          var donerOptsEsc = donerOptsRaw
            ? donerOptsRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            : '';
          var donerLineHtml = (isGeceDonercisiMode && donerOptsEsc)
            ? '<div style="font-size: 12px; font-weight: 800; color: #ea580c; margin-top: 4px; line-height: 1.35;">' + donerOptsEsc + '</div>'
            : '';
          return '<div class="order-item" style="position: relative;">' +
            '<div class="order-item-name' + giftClass + '">' + item.product_name + '</div>' +
            donerLineHtml +
            '<div class="order-item-details" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<span class="order-item-qty">×' + item.quantity + '</span>' +
                '<span class="order-item-price">' + itemTotal + ' ₺</span>' +
              '</div>' +
              (currentStaff && (currentStaff.is_manager || isGeceDonercisiMode)
                ? '<button id="cancelBtn_' + item.id + '" onclick="showCancelItemModal(' + item.id + ', ' + item.quantity + ', \\'' + item.product_name.replace(/'/g, "\\'") + '\\')" style="padding: 6px 12px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3); transition: all 0.3s; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 4px; min-width: 70px;" onmouseover="if(!this.disabled) { this.style.transform=\\'scale(1.05)\\'; this.style.boxShadow=\\'0 4px 12px rgba(239, 68, 68, 0.4)\\'; }" onmouseout="if(!this.disabled) { this.style.transform=\\'scale(1)\\'; this.style.boxShadow=\\'0 2px 8px rgba(239, 68, 68, 0.3)\\'; }" ontouchstart="if(!this.disabled) { this.style.transform=\\'scale(0.95)\\'; }" ontouchend="if(!this.disabled) { this.style.transform=\\'scale(1)\\'; }" class="cancel-item-btn"><span id="cancelBtnText_' + item.id + '">İptal</span><svg id="cancelBtnSpinner_' + item.id + '" style="display: none; width: 14px; height: 14px; animation: spin 1s linear infinite;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg></button>'
                : '<button onclick="showManagerRequiredMessage()" style="padding: 6px 12px; background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%); color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(107, 114, 128, 0.3); transition: all 0.3s; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 4px; min-width: 70px; opacity: 0.7;" onmouseover="this.style.opacity=\\'0.9\\';" onmouseout="this.style.opacity=\\'0.7\\';"><span>İptal</span></button>') +
            '</div>' +
          '</div>' +
          '<div style="font-size: 11px; color: #9ca3af; margin-top: 4px; margin-bottom: 8px; padding-left: 4px;">👤 ' + itemStaffName + ' • ' + (item.added_date || '') + ' ' + (item.added_time || '') + '</div>';
        }).join('');
        
        const totalAmount = order.items.reduce((sum, item) => {
          if (item.isGift) return sum;
          return sum + (item.price * item.quantity);
        }, 0).toFixed(2);
        
        return '<div class="order-card">' +
          '<div class="order-header">' +
            '<div class="order-staff-info">' + staffName + '</div>' +
            '<div class="order-time">' + orderDate + ' ' + orderTime + '</div>' +
          '</div>' +
          '<div class="order-items">' + itemsHtml + '</div>' +
          orderNote +
          '<div class="order-total">' +
            '<span class="order-total-label">Toplam:</span>' +
            '<span class="order-total-amount">' + totalAmount + ' ₺</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }
    
    function goBackToTables() {
      selectedTable = null;
      const orderSection = document.getElementById('orderSection');
      if (orderSection) orderSection.style.display = 'none';
      const ordersView = document.getElementById('ordersView');
      if (ordersView) ordersView.style.display = 'none';
      const salesView = document.getElementById('salesView');
      if (salesView) salesView.style.display = 'none';
      // Alt navigasyon bar'ı göster (masa görünümüne dönüldüğünde)
      const bottomNavBar = document.getElementById('bottomNavBar');
      if (bottomNavBar) bottomNavBar.style.display = 'flex';
      // Sultan Somatı, Yaka's Grill, Gece Dönercisi ve Lacrimosa için direkt masa ekranını göster; normal mod için iç/dış seçim ekranı
      if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode || isLacromisaMode) {
        const tableSelection = document.getElementById('tableSelection');
        if (tableSelection) tableSelection.style.display = 'block';
        if (isSultanSomatiMode) {
          updateBottomNavActive('tables');
        }
        if (isYakasGrillMode || isGeceDonercisiMode || isLacromisaMode) {
          renderTables();
        }
      } else {
        const tableSelection = document.getElementById('tableSelection');
        if (tableSelection) tableSelection.style.display = 'none';
        const tableTypeSelection = document.getElementById('tableTypeSelection');
        if (tableTypeSelection) tableTypeSelection.style.display = 'flex';
      }
      const cartEl = document.getElementById('cart');
      if (cartEl) {
        cartEl.style.display = 'none';
        cartEl.classList.remove('open');
      }
      const searchInputEl = document.getElementById('searchInput');
      if (searchInputEl) {
        searchInputEl.value = '';
      }
      // staffInfo elementi kaldırıldı, null kontrolü yap
      const staffInfoEl = document.getElementById('staffInfo');
      if (staffInfoEl) {
        staffInfoEl.style.display = 'none';
      }
      const mainLogoutBtn = document.getElementById('mainLogoutBtn');
      if (mainLogoutBtn) {
        mainLogoutBtn.style.display = 'none';
      }
    }
    
    // Tüm masaların siparişlerini yükle
    async function loadAllOrders() {
      try {
        const response = await fetch(API_URL + '/all-table-orders');
        if (!response.ok) {
          throw new Error('Siparişler yüklenemedi');
        }
        const allOrders = await response.json();
        renderAllOrders(allOrders);
      } catch (error) {
        console.error('Sipariş yükleme hatası:', error);
        const ordersList = document.getElementById('allOrdersList');
        if (ordersList) {
          ordersList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Siparişler yüklenemedi</div>';
        }
      }
    }
    
    // Tüm siparişleri render et
    function renderAllOrders(allOrders) {
      const ordersList = document.getElementById('allOrdersList');
      if (!ordersList) return;
      
      if (!allOrders || allOrders.length === 0) {
        ordersList.innerHTML = '<div style="padding: 40px; text-align: center; color: #666; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">Henüz sipariş yok</div>';
        return;
      }
      
      // Masa bazında grupla
      const ordersByTable = {};
      allOrders.forEach(order => {
        const tableKey = order.table_name || 'Bilinmeyen Masa';
        if (!ordersByTable[tableKey]) {
          ordersByTable[tableKey] = [];
        }
        ordersByTable[tableKey].push(order);
      });
      
      ordersList.innerHTML = Object.keys(ordersByTable).map(tableName => {
        const tableOrders = ordersByTable[tableName];
        const tableOrdersHtml = tableOrders.map(order => {
          const orderDate = order.order_date || '';
          const orderTime = order.order_time || '';
          const staffName = order.staff_name || 'Bilinmiyor';
          const orderNote = order.order_note ? '<div style="margin-top: 12px; padding: 10px; background: #fef3c7; border-radius: 8px; border-left: 3px solid #f59e0b;"><div style="font-size: 12px; font-weight: 600; color: #92400e; margin-bottom: 4px;">Not:</div><div style="font-size: 13px; color: #78350f;">' + order.order_note.replace(/\\n/g, '<br>') + '</div></div>' : '';
          
          const itemsHtml = (order.items || []).map(item => {
            const itemTotal = (item.price * item.quantity).toFixed(2);
            const giftClass = item.isGift ? ' gift' : '';
            var donerOptsRaw2 = (item.donerOptionsText && String(item.donerOptionsText).trim()) ? String(item.donerOptionsText).trim() : '';
            if (!donerOptsRaw2 && isGeceDonercisiMode && item.donerKey === 's|d|p|a') {
              donerOptsRaw2 = 'Soğanlı';
            }
            var donerOptsEsc2 = donerOptsRaw2
              ? donerOptsRaw2.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
              : '';
            var donerLineHtml2 = (isGeceDonercisiMode && donerOptsEsc2)
              ? '<div style="font-size: 12px; font-weight: 800; color: #ea580c; margin-top: 4px; line-height: 1.35;">' + donerOptsEsc2 + '</div>'
              : '';
            return '<div class="order-item" style="position: relative; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 8px;">' +
              '<div class="order-item-name' + giftClass + '" style="font-size: 15px; font-weight: 600; color: #333; margin-bottom: 6px;">' + item.product_name + '</div>' +
              donerLineHtml2 +
              '<div class="order-item-details" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">' +
                '<div style="display: flex; align-items: center; gap: 8px;">' +
                  '<span class="order-item-qty" style="font-size: 13px; color: #666;">×' + item.quantity + '</span>' +
                  '<span class="order-item-price" style="font-size: 14px; font-weight: 700; color: #059669;">' + itemTotal + ' ₺</span>' +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('');
          
          const totalAmount = (order.items || []).reduce((sum, item) => {
            if (item.isGift) return sum;
            return sum + (item.price * item.quantity);
          }, 0).toFixed(2);
          
          return '<div class="order-card" style="background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 16px;">' +
            '<div class="order-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">' +
              '<div class="order-staff-info" style="font-size: 14px; font-weight: 600; color: #333;">👤 ' + staffName + '</div>' +
              '<div class="order-time" style="font-size: 12px; color: #666;">' + orderDate + ' ' + orderTime + '</div>' +
            '</div>' +
            '<div class="order-items" style="margin-bottom: 12px;">' + itemsHtml + '</div>' +
            orderNote +
            '<div class="order-total" style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 2px solid #e5e7eb; margin-top: 12px;">' +
              '<span class="order-total-label" style="font-size: 14px; font-weight: 600; color: #333;">Toplam:</span>' +
              '<span class="order-total-amount" style="font-size: 18px; font-weight: 700; color: #059669;">' + totalAmount + ' ₺</span>' +
            '</div>' +
          '</div>';
        }).join('');
        
        return '<div style="margin-bottom: 24px;">' +
          '<div style="font-size: 18px; font-weight: 700; color: #333; margin-bottom: 12px; padding: 12px; background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 8px;">' +
            '🪑 ' + tableName +
          '</div>' +
          '<div>' + tableOrdersHtml + '</div>' +
        '</div>';
      }).join('');
    }
    
    // Son 3 saatteki satışları yükle
    async function loadRecentSales() {
      try {
        const response = await fetch(API_URL + '/recent-sales?hours=3');
        if (!response.ok) {
          throw new Error('Satışlar yüklenemedi');
        }
        const sales = await response.json();
        renderRecentSales(sales);
      } catch (error) {
        console.error('Satış yükleme hatası:', error);
        const salesList = document.getElementById('recentSalesList');
        if (salesList) {
          salesList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Satışlar yüklenemedi</div>';
        }
      }
    }
    
    // Son satışları render et
    function renderRecentSales(sales) {
      const salesList = document.getElementById('recentSalesList');
      if (!salesList) return;
      
      if (!sales || sales.length === 0) {
        salesList.innerHTML = '<div style="padding: 40px; text-align: center; color: #666; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">Son 3 saatte satış yok</div>';
        return;
      }
      
      salesList.innerHTML = sales.map(sale => {
        const paymentMethodColor = sale.payment_method === 'Nakit' ? '#10b981' : '#3b82f6';
        const paymentMethodBg = sale.payment_method === 'Nakit' ? '#d1fae5' : '#dbeafe';
        const itemsText = sale.items || sale.itemsText || 'Ürün bulunamadı';
        const tableInfo = sale.table_name ? ' • 🪑 ' + sale.table_name : '';
        
        return '<div style="background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 16px;">' +
          '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">' +
            '<div style="flex: 1;">' +
              '<div style="font-size: 16px; font-weight: 700; color: #333; margin-bottom: 4px;">' + itemsText + '</div>' +
              '<div style="font-size: 12px; color: #666; margin-bottom: 8px;">' +
                (sale.staff_name ? '👤 ' + sale.staff_name : '') + tableInfo +
              '</div>' +
              '<div style="font-size: 11px; color: #9ca3af;">' + sale.sale_date + ' ' + sale.sale_time + '</div>' +
            '</div>' +
            '<div style="text-align: right;">' +
              '<div style="font-size: 20px; font-weight: 800; color: ' + paymentMethodColor + '; margin-bottom: 8px;">' + 
                parseFloat(sale.total_amount || 0).toFixed(2) + ' ₺' +
              '</div>' +
              '<div style="padding: 4px 12px; background: ' + paymentMethodBg + '; color: ' + paymentMethodColor + '; border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-block;">' +
                sale.payment_method || 'Nakit' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }
    
    // Masa Aktar Modal İşlemleri
    let transferStep = 1; // 1: source table, 2: target table
    let selectedSourceTableId = null;
    let selectedTargetTableId = null;
    
    function showTransferModal() {
      transferStep = 1;
      selectedSourceTableId = null;
      selectedTargetTableId = null;
      document.getElementById('transferModal').style.display = 'flex';
      renderTransferTables();
    }
    
    function hideTransferModal() {
      document.getElementById('transferModal').style.display = 'none';
      transferStep = 1;
      selectedSourceTableId = null;
      selectedTargetTableId = null;
    }
    
    function renderTransferTables() {
      const grid = document.getElementById('transferTablesGrid');
      // Tüm masaları göster (iç, dış ve paket masaları) - tip kısıtlaması yok
      const allTables = [...tables];
      
      if (transferStep === 1) {
        // Adım 1: Dolu masaları göster
        document.getElementById('transferModalTitle').textContent = 'Aktarılacak Masayı Seçin (Dolu)';
        document.getElementById('transferModalDescription').textContent = 'Lütfen içeriği aktarılacak dolu masayı seçin:';
        document.getElementById('transferBackBtn').style.display = 'none';
        document.getElementById('transferConfirmBtn').style.display = 'none';
        document.getElementById('transferCancelBtn').style.display = 'block';
        document.getElementById('transferModalSubtitle').textContent = '';
        
        const html = allTables.map(table => {
          const hasOrder = table.hasOrder;
          const isSelected = selectedSourceTableId === table.id;
          
          if (!hasOrder) {
            return '<div style="opacity: 0.3; cursor: not-allowed; padding: 12px; border: 2px solid #d1d5db; border-radius: 12px; background: #f3f4f6; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80px;">' +
              '<div style="width: 40px; height: 40px; border-radius: 50%; background: #9ca3af; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: white; margin-bottom: 8px;">' + table.number + '</div>' +
              '<span style="font-size: 11px; color: #6b7280; font-weight: 600;">' + table.name + '</span>' +
            '</div>';
          }
          
          return '<button onclick="selectSourceTable(\\'' + table.id + '\\')" style="padding: 12px; border: 2px solid ' + (isSelected ? '#059669' : '#065f46') + '; border-radius: 12px; background: ' + (isSelected ? 'linear-gradient(135deg, #065f46 0%, #022c22 100%)' : 'linear-gradient(135deg, #047857 0%, #065f46 100%)') + '; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80px; transition: all 0.3s; transform: ' + (isSelected ? 'scale(1.05)' : 'scale(1)') + ';" onmouseover="if(!this.disabled) { this.style.transform=\\'scale(1.05)\\'; this.style.boxShadow=\\'0 4px 12px rgba(5, 150, 105, 0.45)\\'; }" onmouseout="if(!this.disabled) { this.style.transform=\\'scale(1)\\'; this.style.boxShadow=\\'none\\'; }" ' + (isSelected ? 'disabled' : '') + '>' +
            '<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #047857 0%, #022c22 100%); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: white; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(5, 150, 105, 0.6);">' + table.number + '</div>' +
            '<span style="font-size: 11px; color: #ecfdf5; font-weight: 700;">' + table.name + '</span>' +
            '<span style="font-size: 9px; color: #bbf7d0; margin-top: 4px; font-weight: 600;">Dolu</span>' +
          '</button>';
        }).join('');
        
        grid.innerHTML = html;
      } else {
        // Adım 2: Boş masaları göster
        document.getElementById('transferModalTitle').textContent = 'Aktarılacak Masayı Seçin (Boş)';
        const sourceTable = allTables.find(t => t.id === selectedSourceTableId);
        document.getElementById('transferModalDescription').textContent = 'Lütfen içeriğin aktarılacağı boş masayı seçin:';
        document.getElementById('transferModalSubtitle').textContent = sourceTable ? 'Kaynak: ' + sourceTable.name : '';
        document.getElementById('transferBackBtn').style.display = 'block';
        document.getElementById('transferConfirmBtn').style.display = selectedTargetTableId ? 'block' : 'none';
        document.getElementById('transferCancelBtn').style.display = 'none';
        
        const html = allTables.map(table => {
          const hasOrder = table.hasOrder;
          const isSelected = selectedTargetTableId === table.id;
          const isSourceTable = selectedSourceTableId === table.id;
          const isOutside = table.type === 'outside';
          
          if (hasOrder || isSourceTable) {
            return '<div style="opacity: 0.3; cursor: not-allowed; padding: 12px; border: 2px solid #d1d5db; border-radius: 12px; background: #f3f4f6; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80px;">' +
              '<div style="width: 40px; height: 40px; border-radius: 50%; background: #9ca3af; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: white; margin-bottom: 8px;">' + table.number + '</div>' +
              '<span style="font-size: 11px; color: #6b7280; font-weight: 600;">' + table.name + '</span>' +
              (isSourceTable ? '<span style="font-size: 9px; color: #dc2626; margin-top: 4px; font-weight: 600;">Kaynak</span>' : '') +
            '</div>';
          }
          
          const bgColor = isOutside
            ? (isSelected ? '#fef3c7' : '#fffbeb')
            : (isSelected ? '#ede9fe' : '#faf5ff');
          const borderColor = isOutside
            ? (isSelected ? '#fbbf24' : '#facc15')
            : (isSelected ? '#a855f7' : '#c4b5fd');
          const circleBg = isOutside
            ? 'linear-gradient(135deg, #facc15 0%, #eab308 100%)'
            : '#f3f4f6';
          const nameColor = isOutside ? '#92400e' : '#111827';
          const statusColor = isOutside ? '#b45309' : '#4b5563';
          
          return '<button onclick="selectTargetTable(\\'' + table.id + '\\')" style="padding: 12px; border: 2px solid ' + borderColor + '; border-radius: 12px; background: ' + bgColor + '; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80px; transition: all 0.3s; transform: ' + (isSelected ? 'scale(1.05)' : 'scale(1)') + ';" onmouseover="if(!this.disabled) { this.style.transform=\\'scale(1.05)\\'; this.style.boxShadow=\\'0 4px 12px rgba(148, 163, 184, 0.3)\\'; }" onmouseout="if(!this.disabled) { this.style.transform=\\'scale(1)\\'; this.style.boxShadow=\\'none\\'; }" ' + (isSelected ? 'disabled' : '') + '>' +
            '<div style="width: 40px; height: 40px; border-radius: 50%; background: ' + circleBg + '; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: ' + (isOutside ? '#78350f' : '#4b5563') + '; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(148, 163, 184, 0.3);">' + table.number + '</div>' +
            '<span style="font-size: 11px; color: ' + nameColor + '; font-weight: 700;">' + table.name + '</span>' +
            '<span style="font-size: 9px; color: ' + statusColor + '; margin-top: 4px; font-weight: 600;">Boş</span>' +
          '</button>';
        }).join('');
        
        grid.innerHTML = html;
      }
    }
    
    function selectSourceTable(tableId) {
      const table = tables.find(t => t.id === tableId);
      if (!table || !table.hasOrder) {
        showToast('error', 'Hata', 'Bu masa boş! Lütfen dolu bir masa seçin.');
        return;
      }
      selectedSourceTableId = tableId;
      transferStep = 2;
      renderTransferTables();
    }
    
    function selectTargetTable(tableId) {
      const table = tables.find(t => t.id === tableId);
      if (table && table.hasOrder) {
        showToast('error', 'Hata', 'Bu masa dolu! Lütfen boş bir masa seçin.');
        return;
      }
      if (tableId === selectedSourceTableId) {
        showToast('error', 'Hata', 'Aynı masayı seçemezsiniz!');
        return;
      }
      selectedTargetTableId = tableId;
      document.getElementById('transferConfirmBtn').style.display = 'block';
      renderTransferTables();
    }
    
    function handleTransferBack() {
      transferStep = 1;
      selectedTargetTableId = null;
      renderTransferTables();
    }
    
    async function handleTransferConfirm() {
      if (!selectedSourceTableId || !selectedTargetTableId) {
        showToast('error', 'Hata', 'Lütfen hem kaynak hem de hedef masayı seçin.');
        return;
      }
      
      if (selectedSourceTableId === selectedTargetTableId) {
        showToast('error', 'Hata', 'Aynı masayı seçemezsiniz!');
        return;
      }
      
      try {
        const response = await fetch(API_URL + '/transfer-table-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceTableId: selectedSourceTableId,
            targetTableId: selectedTargetTableId
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          showToast('success', 'Başarılı', 'Masa başarıyla aktarıldı!');
          hideTransferModal();
          // Masaları yenile
          const tablesRes = await fetch(API_URL + '/tables');
          tables = await tablesRes.json();
          renderTables();
        } else {
          showToast('error', 'Hata', result.error || 'Masa aktarılamadı');
        }
      } catch (error) {
        console.error('Masa aktarım hatası:', error);
        showToast('error', 'Hata', 'Masa aktarılırken bir hata oluştu');
      }
    }
    
    function renderCategories() {
      // Sultan Somatı modunda categoryTabs kullanılır, normal modda categoryTabsRow1 ve categoryTabsRow2
      if (isSultanSomatiMode) {
        const categoryTabsEl = document.getElementById('categoryTabs');
        if (!categoryTabsEl) return;
      } else {
        const row1 = document.getElementById('categoryTabsRow1');
        const row2 = document.getElementById('categoryTabsRow2');
        if (!row1 || !row2) return;
        // Normal modda önce temizle
        row1.innerHTML = '';
        row2.innerHTML = '';

        // Lacromisa: 2 satır, sade ve kurumsal kategori görünümü (özel sıralama yok)
        if (isLacromisaMode) {
          const escapeHtml = (s) => String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

          const sorted = [...(categories || [])].sort((a, b) => {
            const an = (a?.name || '').toString();
            const bn = (b?.name || '').toString();
            try {
              return an.localeCompare(bn, 'tr', { sensitivity: 'base' });
            } catch {
              return an.localeCompare(bn);
            }
          });

          const firstRow = [];
          const secondRow = [];
          sorted.forEach((cat, idx) => {
            (idx % 2 === 0 ? firstRow : secondRow).push(cat);
          });

          const renderBtn = (cat) => {
            const isActive = selectedCategoryId === cat.id;
            return '<button class="category-tab' + (isActive ? ' active' : '') + '" onclick="selectCategory(' + cat.id + ')">' + escapeHtml(cat.name) + '</button>';
          };

          row1.innerHTML = firstRow.map(renderBtn).join('');
          row2.innerHTML = secondRow.map(renderBtn).join('');
          return;
        }
      }
      
      // Üst satır kategorileri (belirli sırayla)
      const topRowCategoryNames = [
        'Makaralar',
        'Fransız Pastalar',
        'Kruvasanlar',
        'Sütlü Tatlılar ve Pastalar',
        'Waffle'
      ];
      
      // Alt satır kategorileri (belirli sırayla)
      const bottomRowCategoryNames = [
        'Sıcak İçecekler',
        'Soğuk İçecekler',
        'Frozenlar',
        'Milk Shakeler',
        'Milkshakeler',
        'Ekstra Çikolata'
      ];
      
      // Kategorileri isimlerine göre bul ve sırala (case-insensitive)
      const topRowCategories = [];
      const bottomRowCategories = [];
      let otherCategories = [];
      
      // Milk Shakeler/Milkshakeler kategorisini önce bul (farklı yazımlar için)
      const milkShakeCategory = categories.find(cat => {
        const catNameLower = cat.name.toLowerCase().trim();
        return catNameLower === 'milk shakeler' || catNameLower === 'milkshakeler' || (catNameLower.includes('milk') && catNameLower.includes('shake'));
      });
      
      topRowCategoryNames.forEach(categoryName => {
        const category = categories.find(cat => {
          const catNameLower = cat.name.toLowerCase().trim();
          const categoryNameLower = categoryName.toLowerCase().trim();
          return catNameLower === categoryNameLower;
        });
        if (category) {
          topRowCategories.push(category);
        }
      });
      
      bottomRowCategoryNames.forEach(categoryName => {
        const category = categories.find(cat => {
          const catNameLower = cat.name.toLowerCase().trim();
          const categoryNameLower = categoryName.toLowerCase().trim();
          return catNameLower === categoryNameLower;
        });
        if (category) {
          bottomRowCategories.push(category);
        }
      });
      
      // Milk Shakeler'i alt satıra ekle (eğer orada yoksa)
      if (milkShakeCategory) {
        const alreadyInBottomRow = bottomRowCategories.find(cat => {
          const catNameLower = cat.name.toLowerCase().trim();
          return catNameLower === 'milk shakeler' || catNameLower === 'milkshakeler' || (catNameLower.includes('milk') && catNameLower.includes('shake'));
        });
        if (!alreadyInBottomRow) {
          bottomRowCategories.push(milkShakeCategory);
        }
      }
      
      // Belirtilen kategorilerde olmayan diğer kategorileri ekle (case-insensitive)
      // Milk Shakeler'i kesinlikle ekleme
      const allSpecifiedNamesLower = [...topRowCategoryNames, ...bottomRowCategoryNames].map(name => name.toLowerCase().trim());
      categories.forEach(cat => {
        const catNameLower = cat.name.toLowerCase().trim();
        // Milk Shakeler/Milkshakeler'i otherCategories'e ekleme
        const isMilkShake = catNameLower === 'milk shakeler' || catNameLower === 'milkshakeler' || (catNameLower.includes('milk') && catNameLower.includes('shake'));
        const isInTopRow = topRowCategories.some(tc => tc.id === cat.id);
        const isInBottomRow = bottomRowCategories.some(bc => bc.id === cat.id);
        
        if (!allSpecifiedNamesLower.includes(catNameLower) && !isMilkShake && !isInTopRow && !isInBottomRow) {
          otherCategories.push(cat);
        }
      });
      
      // Üst satıra diğer kategorileri de ekle (eğer yer varsa)
      // Milk Shakeler'i üst satırdan kesinlikle çıkar
      const firstRow = [...topRowCategories, ...otherCategories].filter(cat => {
        const catNameLower = cat.name.toLowerCase().trim();
        return catNameLower !== 'milk shakeler' && catNameLower !== 'milkshakeler' && !(catNameLower.includes('milk') && catNameLower.includes('shake'));
      });
      const secondRow = bottomRowCategories;
      
      // Soft pastel renk paleti (çeşitli renkler - flu tonlar)
      const softColors = [
        { bg: '#fef3c7', border: '#fde68a', text: '#92400e', hover: '#fef08a' }, // Soft Amber
        { bg: '#fce7f3', border: '#fed7aa', text: '#9f1239', hover: '#f9a8d4' }, // Soft Pink
        { bg: '#e0e7ff', border: '#c7d2fe', text: '#3730a3', hover: '#a5b4fc' }, // Soft Indigo
        { bg: '#d1fae5', border: '#a7f3d0', text: '#065f46', hover: '#6ee7b7' }, // Soft Emerald
        { bg: '#e0f2fe', border: '#bae6fd', text: '#0c4a6e', hover: '#7dd3fc' }, // Soft Sky
        { bg: '#f3e8ff', border: '#e9d5ff', text: '#6b21a8', hover: '#d8b4fe' }, // Soft Purple
        { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', hover: '#fca5a5' }, // Soft Rose
        { bg: '#ecfdf5', border: '#d1fae5', text: '#065f46', hover: '#a7f3d0' }, // Soft Green
        { bg: '#fef9c3', border: '#fef08a', text: '#854d0e', hover: '#fde047' }, // Soft Lime
        { bg: '#f0f9ff', border: '#dbeafe', text: '#1e40af', hover: '#bfdbfe' }, // Soft Blue
        { bg: '#fdf4ff', border: '#fae8ff', text: '#86198f', hover: '#f5d0fe' }, // Soft Fuchsia
        { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412', hover: '#fdba74' }, // Soft Orange
        { bg: '#f0fdfa', border: '#ccfbf1', text: '#134e4a', hover: '#99f6e4' }, // Soft Teal
        { bg: '#f5f3ff', border: '#e9d5ff', text: '#5b21b6', hover: '#ddd6fe' }, // Soft Violet
        { bg: '#fefce8', border: '#fef08a', text: '#713f12', hover: '#fde047' }, // Soft Yellow
        { bg: '#f0fdf4', border: '#dcfce7', text: '#166534', hover: '#bbf7d0' }, // Soft Mint
        { bg: '#fef7ff', border: '#f3e8ff', text: '#7c2d12', hover: '#e9d5ff' }, // Soft Lavender
        { bg: '#fff1f2', border: '#ffe4e6', text: '#881337', hover: '#fecdd3' }, // Soft Coral
      ];
      
      // Kategori için renk seç (kategori ID'sine göre tutarlı renk)
      const getCategoryColor = (categoryId) => {
        const index = categoryId % softColors.length;
        return softColors[index];
      };
      
      // Sultan Somatı için yatay scroll kategori butonları
      if (isSultanSomatiMode) {
        const allCategories = [...firstRow, ...secondRow];
        const categoryTabsEl = document.getElementById('categoryTabs');
        if (categoryTabsEl) {
          categoryTabsEl.innerHTML = allCategories.map((cat, index) => {
            const colors = getCategoryColor(cat.id);
            const isActive = selectedCategoryId === cat.id;
            return '<button onclick="selectCategory(' + cat.id + ')" style="padding: 10px 18px; border: none; border-radius: 20px; background: ' + (isActive ? colors.hover : colors.bg) + '; color: ' + colors.text + '; font-size: 14px; font-weight: ' + (isActive ? '700' : '600') + '; cursor: pointer; transition: all 0.2s; white-space: nowrap; box-shadow: ' + (isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none') + ';" onmouseover="if(!this.classList.contains(\\'active\\')) { this.style.background=\\'' + colors.hover + '\\'; this.style.transform=\\'scale(1.05)\\'; }" onmouseout="if(!this.classList.contains(\\'active\\')) { this.style.background=\\'' + colors.bg + '\\'; this.style.transform=\\'scale(1)\\'; }">' + cat.name + '</button>';
          }).join('');
        }
      } else {
        // Normal mod için eski 2 satırlık yapı
        const row1 = document.getElementById('categoryTabsRow1');
        const row2 = document.getElementById('categoryTabsRow2');
        if (row1 && row2) {
          row1.innerHTML = firstRow.map((cat, index) => {
            const colors = getCategoryColor(cat.id);
            const isActive = selectedCategoryId === cat.id;
            const activeBg = colors.hover;
            const activeBorder = colors.border;
            return '<button class="category-tab ' + (isActive ? 'active' : '') + '" onclick="selectCategory(' + cat.id + ')" style="background: ' + (isActive ? activeBg : colors.bg) + '; border-color: ' + (isActive ? activeBorder : colors.border) + '; color: ' + colors.text + '; box-shadow: 0 2px 8px rgba(0,0,0,0.08); font-weight: ' + (isActive ? '700' : '600') + ';" onmouseover="if(!this.classList.contains(\\'active\\')) { this.style.background=\\'' + colors.hover + '\\'; this.style.transform=\\'translateY(-2px)\\'; }" onmouseout="if(!this.classList.contains(\\'active\\')) { this.style.background=\\'' + colors.bg + '\\'; this.style.transform=\\'translateY(0)\\'; }">' + cat.name + '</button>';
          }).join('');
          
          row2.innerHTML = secondRow.map((cat, index) => {
            const colors = getCategoryColor(cat.id);
            const isActive = selectedCategoryId === cat.id;
            const activeBg = colors.hover;
            const activeBorder = colors.border;
            return '<button class="category-tab ' + (isActive ? 'active' : '') + '" onclick="selectCategory(' + cat.id + ')" style="background: ' + (isActive ? activeBg : colors.bg) + '; border-color: ' + (isActive ? activeBorder : colors.border) + '; color: ' + colors.text + '; box-shadow: 0 2px 8px rgba(0,0,0,0.08); font-weight: ' + (isActive ? '700' : '600') + ';" onmouseover="if(!this.classList.contains(\\'active\\')) { this.style.background=\\'' + colors.hover + '\\'; this.style.transform=\\'translateY(-2px)\\'; }" onmouseout="if(!this.classList.contains(\\'active\\')) { this.style.background=\\'' + colors.bg + '\\'; this.style.transform=\\'translateY(0)\\'; }">' + cat.name + '</button>';
          }).join('');
        }
      }
    }
    
    function selectCategory(categoryId) {
      selectedCategoryId = categoryId;
      renderCategories();
      renderProducts();
    }
    
    let searchQuery = '';
    
    function filterProducts() {
      searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
      renderProducts();
    }
    
    // Resim cache yönetimi (IndexedDB)
    let imageCache = {};
    
    // IndexedDB başlatma
    function initImageCache() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('makaraImageCache', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          // Tüm cache'lenmiş resimleri yükle
          const transaction = db.transaction(['images'], 'readonly');
          const store = transaction.objectStore('images');
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = async () => {
            for (const item of getAllRequest.result) {
              // Blob'u blob URL'ye çevir
              if (item.blob) {
                const blobUrl = URL.createObjectURL(item.blob);
                imageCache[item.url] = blobUrl;
              } else if (item.blobUrl) {
                // Eski format (blobUrl) - yeni blob URL oluştur
                imageCache[item.url] = item.blobUrl;
              }
            }
            resolve();
          };
          getAllRequest.onerror = () => reject(getAllRequest.error);
        };
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('images')) {
            const store = db.createObjectStore('images', { keyPath: 'url' });
          } else if (event.oldVersion < 2) {
            // Version 2'ye upgrade - blob ekle
            const store = event.target.transaction.objectStore('images');
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });
    }
    
    // Resmi cache'le ve blob URL oluştur
    async function cacheImage(imageUrl) {
      if (!imageUrl) {
        return null;
      }
      
      // Firebase Storage veya R2 URL'lerini destekle
      const isFirebaseStorage = imageUrl.includes('firebasestorage.googleapis.com');
      const isR2 = imageUrl.includes('r2.dev') || imageUrl.includes('r2.cloudflarestorage.com');
      
      if (!isFirebaseStorage && !isR2) {
        // Direkt URL ise (local path veya başka bir URL), direkt dön
        return imageUrl;
      }
      
      // Zaten cache'de varsa
      if (imageCache[imageUrl]) {
        return imageCache[imageUrl];
      }
      
      try {
        // Backend proxy üzerinden resmi çek (CORS sorununu çözmek için)
        const proxyUrl = API_URL + '/image-proxy?url=' + encodeURIComponent(imageUrl);
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Resim yüklenemedi');
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        // IndexedDB'ye kaydet
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('makaraImageCache', 2);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('images')) {
              const store = db.createObjectStore('images', { keyPath: 'url' });
              store.createIndex('timestamp', 'timestamp', { unique: false });
            } else if (event.oldVersion < 2) {
              // Version 2'ye upgrade
              const store = event.target.transaction.objectStore('images');
              if (!store.indexNames.contains('timestamp')) {
                store.createIndex('timestamp', 'timestamp', { unique: false });
              }
            }
          };
        });
        
        const transaction = db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        await new Promise((resolve, reject) => {
          const request = store.put({ url: imageUrl, blob: blob, timestamp: Date.now() });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        
        // Cache'e ekle
        imageCache[imageUrl] = blobUrl;
        return blobUrl;
      } catch (error) {
        console.error('Resim cache hatası:', error);
        return null;
      }
    }
    
    async function renderProducts() {
      let filtered;
      
      // Arama sorgusu varsa tüm kategorilerden ara, yoksa sadece seçili kategoriden göster
      if (searchQuery) {
        // Arama yapıldığında tüm kategorilerden ara
        filtered = products.filter(p => 
          p.name.toLowerCase().includes(searchQuery)
        );
      } else {
        // Arama yoksa sadece seçili kategoriden göster
        filtered = products.filter(p => p.category_id === selectedCategoryId);
      }
      
      const grid = document.getElementById('productsGrid');
      if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #999;">Ürün bulunamadı</div>';
        return;
      }
      
      // Önce ürünleri hemen göster (resimler olmadan)
      grid.innerHTML = filtered.map(prod => {
        const cardId = 'product-card-' + prod.id;
        // Cache'de varsa hemen göster, yoksa arka planda yüklenecek
        const cachedImageUrl = prod.image && imageCache[prod.image] ? imageCache[prod.image] : null;
        const backgroundStyle = cachedImageUrl ? 'background-image: url(' + cachedImageUrl + ');' : '';
        const trackStock = prod.trackStock === true;
        const stock = trackStock && prod.stock !== undefined ? (prod.stock || 0) : null;
        const isOutOfStock = trackStock && stock !== null && stock === 0;
        const isLowStock = trackStock && stock !== null && stock > 0 && stock <= 5;
        // Türk Kahvesi için özel modal açma
        const isTurkishCoffee = prod.name.toLowerCase().includes('türk kahvesi') || prod.name.toLowerCase().includes('turk kahvesi');
        const onClickHandler = isOutOfStock ? '' : (isTurkishCoffee ? 'onclick="showTurkishCoffeeModal(' + prod.id + ', \\'' + prod.name.replace(/'/g, "\\'") + '\\', ' + prod.price + ')"' : 'onclick="addToCart(' + prod.id + ', \\'' + prod.name.replace(/'/g, "\\'") + '\\', ' + prod.price + ')"');
        const cardStyle = isOutOfStock ? backgroundStyle + ' opacity: 0.6; cursor: not-allowed; pointer-events: none;' : backgroundStyle;
        
        // Kilit ikonu (sadece stok 0 olduğunda)
        const lockIcon = isOutOfStock ? '<div style="position: absolute; top: 8px; left: 8px; background: linear-gradient(135deg, rgba(252, 231, 243, 0.95) 0%, rgba(253, 242, 248, 0.9) 100%); color: #f97316; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 2px 8px rgba(236, 72, 153, 0.25), 0 0 0 1px rgba(236, 72, 153, 0.1) inset;"><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg></div>' : '';
        
        // Stok uyarı badge'i (0 ise "Kalmadı", 1-5 arası ise "X adet kaldı")
        let stockBadge = '';
        if (isOutOfStock) {
          stockBadge = '<div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(239, 68, 68, 0.95) 0%, rgba(239, 68, 68, 0.85) 100%); color: white; padding: 8px; text-align: center; font-size: 12px; font-weight: 700; z-index: 10; border-radius: 0 0 12px 12px; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);">🔒 Kalmadı</div>';
        } else if (isLowStock) {
          const stockText = stock === 1 ? '1 adet kaldı' : stock + ' adet kaldı';
          stockBadge = '<div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(245, 158, 11, 0.95) 0%, rgba(245, 158, 11, 0.85) 100%); color: white; padding: 8px; text-align: center; font-size: 12px; font-weight: 700; z-index: 10; border-radius: 0 0 12px 12px; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);">⚠️ ' + stockText + '</div>';
        }
        
        // Sultan Somatı için görseldeki gibi basit kartlar (beyaz, sadece ad ve fiyat)
        if (isSultanSomatiMode) {
          return '<div id="' + cardId + '" ' + onClickHandler + ' style="background: white; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px; min-height: 120px; position: relative; cursor: ' + (isOutOfStock ? 'not-allowed' : 'pointer') + '; transition: all 0.2s; overflow: hidden;' + (isOutOfStock ? ' opacity: 0.6;' : '') + '" onmouseover="' + (isOutOfStock ? '' : 'this.style.borderColor=\\'#2d2d2d\\'; this.style.boxShadow=\\'0 4px 12px rgba(0,0,0,0.1)\\';') + '" onmouseout="' + (isOutOfStock ? '' : 'this.style.borderColor=\\'#e0e0e0\\'; this.style.boxShadow=\\'none\\';') + '">' +
            lockIcon +
            '<div style="position: absolute; top: 16px; left: 16px; font-size: 14px; font-weight: 700; color: #333; text-transform: uppercase; line-height: 1.3;">' + prod.name + '</div>' +
            '<div style="position: absolute; bottom: 16px; right: 16px; font-size: 18px; font-weight: 800; color: #166534; background: rgba(34, 197, 94, 0.2); padding: 8px 14px; border-radius: 12px; backdrop-filter: blur(4px);">₺' + prod.price.toFixed(2) + '</div>' +
            stockBadge +
          '</div>';
        }
        
        // Ürün birimi etiketi (varsa)
        const unitRaw = (prod.unit || prod.unitLabel || prod.unit_name || '').toString().trim();
        const unitText = unitRaw ? unitRaw.toUpperCase() : '';
        const unitBadge = unitText
          ? (
            isLacromisaMode
              ? '<div style="position:absolute; top:8px; right:8px; background: rgba(15, 23, 42, 0.86); color:#ffffff; border: 1px solid rgba(255, 255, 255, 0.18); padding: 5px 9px; border-radius: 999px; font-size: 10px; font-weight: 900; letter-spacing: 0.7px; text-transform: uppercase; z-index: 10; backdrop-filter: blur(8px); box-shadow: 0 10px 24px rgba(15, 23, 42, 0.25);">' + unitText + '</div>'
              : '<div style="position:absolute; top:8px; right:8px; background: rgba(15, 23, 42, 0.08); color:#0f172a; border: 1px solid rgba(15, 23, 42, 0.16); padding: 4px 8px; border-radius: 999px; font-size: 10px; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; z-index: 10; backdrop-filter: blur(6px);">' + unitText + '</div>'
          )
          : '';

        // Normal mod için eski tasarım
        return '<div id="' + cardId + '" class="product-card" ' + onClickHandler + ' style="' + cardStyle + ' position: relative; overflow: hidden;">' +
          lockIcon +
          unitBadge +
          '<div class="product-name" style="' + (isOutOfStock ? 'opacity: 0.7;' : '') + '">' + prod.name + '</div>' +
          '<div class="product-price" style="' + (isOutOfStock ? 'opacity: 0.7;' : '') + '">' + prod.price.toFixed(2) + ' ₺</div>' +
          stockBadge +
        '</div>';
      }).join('');
      
      // Resimleri arka planda paralel olarak yükle ve kartları güncelle
      // İlk 6 ürünü öncelikli yükle (görünen alan)
      const productsToLoad = filtered.filter(prod => prod.image && !imageCache[prod.image]);
      const priorityProducts = productsToLoad.slice(0, 6);
      const otherProducts = productsToLoad.slice(6);
      
      // Öncelikli ürünleri önce yükle (3'erli gruplar halinde)
      const loadProductImage = async (prod) => {
        try {
          const blobUrl = await cacheImage(prod.image);
          if (blobUrl) {
            const card = document.getElementById('product-card-' + prod.id);
            if (card) {
              card.style.backgroundImage = 'url(' + blobUrl + ')';
            }
          }
        } catch (error) {
          console.error('Resim yükleme hatası:', error);
        }
      };
      
      // Öncelikli ürünleri 3'erli gruplar halinde paralel yükle
      for (let i = 0; i < priorityProducts.length; i += 3) {
        const batch = priorityProducts.slice(i, i + 3);
        Promise.all(batch.map(loadProductImage)).catch(() => {}); // Hataları sessizce yok say
      }
      
      // Diğer ürünleri arka planda yükle (5'erli gruplar halinde)
      for (let i = 0; i < otherProducts.length; i += 5) {
        const batch = otherProducts.slice(i, i + 5);
        setTimeout(() => {
          Promise.all(batch.map(loadProductImage)).catch(() => {}); // Hataları sessizce yok say
        }, 50 * (Math.floor(i / 5) + 1)); // Her grup için artan gecikme
      }
    }
    
    // Soğan Seçici Modal Fonksiyonları (Yaka's Grill için)
    let pendingOnionProduct = null;
    
    function showOnionModal(productId, name, price) {
      pendingOnionProduct = { id: productId, name: name, price: price };
      document.getElementById('onionProductName').textContent = name;
      document.getElementById('onionModal').style.display = 'flex';
    }
    
    function hideOnionModal() {
      document.getElementById('onionModal').style.display = 'none';
      pendingOnionProduct = null;
    }
    
    function selectOnionOption(option) {
      if (!pendingOnionProduct) {
        hideOnionModal();
        return;
      }
      
      // Stok kontrolü
      const product = products.find(p => p.id === pendingOnionProduct.id);
      if (product) {
        const trackStock = product.trackStock === true;
        const stock = trackStock && product.stock !== undefined ? (product.stock || 0) : null;
        const isOutOfStock = trackStock && stock !== null && stock === 0;
        
        if (isOutOfStock) {
          showToast('error', 'Stok Yok', pendingOnionProduct.name + ' için stok kalmadı');
          hideOnionModal();
          return;
        }
      }
      
      // Sepete ekle (soğan bilgisi ile)
      const existing = cart.find(item => item.id === pendingOnionProduct.id && item.onionOption === option);
      if (existing) {
        existing.quantity++;
      } else {
        cart.push({ 
          id: pendingOnionProduct.id, 
          name: pendingOnionProduct.name, 
          price: pendingOnionProduct.price,
          onionOption: option, // Soğan seçeneği
          quantity: 1 
        });
      }
      
      updateCart();
      hideOnionModal();
      
      // Arama input'unu temizle ve ürünleri yeniden render et
      const searchInputEl = document.getElementById('searchInput');
      if (searchInputEl) {
        searchInputEl.value = '';
        searchQuery = '';
        renderProducts();
      }
    }
    
    // Porsiyon Seçici Modal Fonksiyonları (Yaka's Grill için)
    let pendingPortionProduct = null;
    
    function showPortionModal(productId, name, price) {
      pendingPortionProduct = { id: productId, name: name, price: price };
      document.getElementById('portionProductName').textContent = name;
      
      // Fiyatları hesapla ve göster
      document.getElementById('portionPrice0.5').textContent = '₺' + (price * 0.5).toFixed(2);
      document.getElementById('portionPrice1').textContent = '₺' + (price * 1).toFixed(2);
      document.getElementById('portionPrice1.5').textContent = '₺' + (price * 1.5).toFixed(2);
      document.getElementById('portionPrice2').textContent = '₺' + (price * 2).toFixed(2);
      
      document.getElementById('portionModal').style.display = 'flex';
    }
    
    function hidePortionModal() {
      document.getElementById('portionModal').style.display = 'none';
      pendingPortionProduct = null;
    }
    
    function selectPortion(portion) {
      if (!pendingPortionProduct) {
        hidePortionModal();
        return;
      }
      
      // Stok kontrolü
      const product = products.find(p => p.id === pendingPortionProduct.id);
      if (product) {
        const trackStock = product.trackStock === true;
        const stock = trackStock && product.stock !== undefined ? (product.stock || 0) : null;
        const isOutOfStock = trackStock && stock !== null && stock === 0;
        
        if (isOutOfStock) {
          showToast('error', 'Stok Yok', pendingPortionProduct.name + ' için stok kalmadı');
          hidePortionModal();
          return;
        }
      }
      
      // Porsiyona göre fiyat hesapla
      const calculatedPrice = pendingPortionProduct.price * portion;
      
      // Sepete ekle (porsiyon bilgisi ile)
      const existing = cart.find(item => item.id === pendingPortionProduct.id && item.portion === portion);
      if (existing) {
        existing.quantity++;
      } else {
        cart.push({ 
          id: pendingPortionProduct.id, 
          name: pendingPortionProduct.name, 
          price: calculatedPrice, // Hesaplanmış fiyat
          originalPrice: pendingPortionProduct.price, // Orijinal fiyat (1 porsiyon)
          portion: portion, // Porsiyon bilgisi
          quantity: 1 
        });
      }
      
      updateCart();
      hidePortionModal();
      
      // Arama input'unu temizle ve ürünleri yeniden render et
      const searchInputEl = document.getElementById('searchInput');
      if (searchInputEl) {
        searchInputEl.value = '';
        searchQuery = '';
        renderProducts();
      }
    }
    
    // Türk Kahvesi Modal Fonksiyonları
    let pendingTurkishCoffeeProduct = null;
    
    function showTurkishCoffeeModal(productId, name, price) {
      pendingTurkishCoffeeProduct = { id: productId, name: name, price: price };
      document.getElementById('turkishCoffeeModal').style.display = 'flex';
    }
    
    function hideTurkishCoffeeModal() {
      document.getElementById('turkishCoffeeModal').style.display = 'none';
      pendingTurkishCoffeeProduct = null;
    }
    
    function selectTurkishCoffeeOption(option) {
      if (!pendingTurkishCoffeeProduct) {
        hideTurkishCoffeeModal();
        return;
      }
      
      // Stok kontrolü
      const product = products.find(p => p.id === pendingTurkishCoffeeProduct.id);
      if (product) {
        const trackStock = product.trackStock === true;
        const stock = trackStock && product.stock !== undefined ? (product.stock || 0) : null;
        const isOutOfStock = trackStock && stock !== null && stock === 0;
        
        if (isOutOfStock) {
          showToast('error', 'Stok Yok', pendingTurkishCoffeeProduct.name + ' için stok kalmadı');
          hideTurkishCoffeeModal();
          return;
        }
      }
      
      // Ürün ismini seçeneğe göre güncelle: "Sade Türk Kahvesi", "Orta Türk Kahvesi", "Şekerli Türk Kahvesi"
      const productName = option + ' Türk Kahvesi';
      
      const existing = cart.find(item => item.id === pendingTurkishCoffeeProduct.id && item.name === productName);
      if (existing) {
        existing.quantity++;
      } else {
        cart.push({ 
          id: pendingTurkishCoffeeProduct.id, 
          name: productName, 
          price: pendingTurkishCoffeeProduct.price, 
          quantity: 1 
        });
      }
      
      updateCart();
      hideTurkishCoffeeModal();
      
      // Arama input'unu temizle ve ürünleri yeniden render et
      const searchInputEl = document.getElementById('searchInput');
      if (searchInputEl) {
        searchInputEl.value = '';
        searchQuery = '';
        renderProducts();
      }
    }
    
    // Gece Dönercisi: Tavuk Döner / Et Döner için seçim modalı
    let pendingDonerProduct = null;
    let donerSogansiz = false;
    let donerDomatessiz = false;
    let donerSade = false;
    let donerAzSoganli = false;
    
    function showDonerOptionsModal(productId, name, price) {
      pendingDonerProduct = { id: productId, name: name, price: price };
      donerSogansiz = false;
      donerDomatessiz = false;
      donerSade = false;
      donerAzSoganli = false;
      const nameEl = document.getElementById('donerProductName');
      if (nameEl) nameEl.textContent = name;
      updateDonerButtons();
      document.getElementById('donerOptionsModal').style.display = 'flex';
    }
    
    function hideDonerOptionsModal() {
      document.getElementById('donerOptionsModal').style.display = 'none';
      pendingDonerProduct = null;
    }
    
    function toggleDonerOption(which) {
      if (which === 'sogansiz') donerSogansiz = !donerSogansiz;
      if (which === 'domatessiz') donerDomatessiz = !donerDomatessiz;
      if (which === 'sade') donerSade = !donerSade;
      if (which === 'azsoganli') donerAzSoganli = !donerAzSoganli;
      updateDonerButtons();
    }
    
    function updateDonerButtons() {
      const soganBtn = document.getElementById('donerSogansizBtn');
      const domatesBtn = document.getElementById('donerDomatessizBtn');
      const sadeBtn = document.getElementById('donerSadeBtn');
      const azSoganliBtn = document.getElementById('donerAzSoganliBtn');
      const applyToggleStyle = (btn, active) => {
        if (!btn) return;
        if (active) {
          btn.style.borderColor = themePrimary; btn.style.color = themePrimary; btn.style.background = 'white';
        } else {
          btn.style.borderColor = '#e5e7eb'; btn.style.color = '#111827'; btn.style.background = 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)';
        }
      };
      applyToggleStyle(soganBtn, donerSogansiz);
      applyToggleStyle(domatesBtn, donerDomatessiz);
      applyToggleStyle(sadeBtn, donerSade);
      applyToggleStyle(azSoganliBtn, donerAzSoganli);
    }
    
    function confirmDonerOptions() {
      if (!pendingDonerProduct) { hideDonerOptionsModal(); return; }
      
      // Stok kontrolü
      const product = products.find(p => p.id === pendingDonerProduct.id);
      if (product) {
        const trackStock = product.trackStock === true;
        const stock = trackStock && product.stock !== undefined ? (product.stock || 0) : null;
        const isOutOfStock = trackStock && stock !== null && stock === 0;
        if (isOutOfStock) {
          showToast('error', 'Stok Yok', pendingDonerProduct.name + ' için stok kalmadı');
          hideDonerOptionsModal();
          return;
        }
      }
      
      const parts = [
        donerSogansiz ? 'Soğansız' : null,
        donerDomatessiz ? 'Domatessiz' : null,
        donerSade ? 'Sade' : null,
        donerAzSoganli ? 'Az Soğanlı' : null
      ].filter(Boolean);
      const donerOptionsText = parts.join(' • ');
      const donerKey = (donerSogansiz ? 'S' : 's') + '|' + (donerDomatessiz ? 'D' : 'd') + '|' + (donerSade ? 'P' : 'p') + '|' + (donerAzSoganli ? 'A' : 'a');
      
      const existing = cart.find(item => item.id === pendingDonerProduct.id && item.donerKey === donerKey);
      if (existing) {
        existing.quantity++;
      } else {
        cart.push({ 
          id: pendingDonerProduct.id, 
          name: pendingDonerProduct.name, 
          price: pendingDonerProduct.price,
          quantity: 1,
          donerKey: donerKey,
          donerOptionsText: donerOptionsText
        });
      }
      
      updateCart();
      hideDonerOptionsModal();
      
      const searchInputEl = document.getElementById('searchInput');
      if (searchInputEl) {
        searchInputEl.value = '';
        searchQuery = '';
        renderProducts();
      }
    }

    function addToCart(productId, name, price) {
      // Yaka's Grill için özel kategoriler kontrolü
      if (isYakasGrillMode) {
        const product = products.find(p => p.id === productId);
        if (product) {
          const category = categories.find(c => c.id === product.category_id);
          if (category && category.name) {
            const categoryNameLower = category.name.toLowerCase();
            
            // Porsiyon kategorisi için porsiyon seçici modal
            if (categoryNameLower === 'porsiyon') {
              showPortionModal(productId, name, price);
              return;
            }
            
            // Balık kategorisinde "Balık Porsiyon" ürünü için porsiyon seçici modal
            const productNameLower = name.toLowerCase();
            if (categoryNameLower === 'balık' && productNameLower.includes('balık porsiyon')) {
              showPortionModal(productId, name, price);
              return;
            }
            
            // Dürümler, Ekmek Arası, Balık kategorileri için soğan seçici modal (Balık Porsiyon hariç)
            if (categoryNameLower === 'dürümler' || categoryNameLower === 'ekmek arası' || categoryNameLower === 'balık') {
              showOnionModal(productId, name, price);
              return;
            }
          }
        }
      }

      // Gece Dönercisi: Tavuk Döner / Et Döner kategorileri için seçim modalı
      if (isGeceDonercisiMode) {
        const product = products.find(p => p.id === productId);
        if (product) {
          const category = categories.find(c => c.id === product.category_id);
          const categoryNameLower = (category && category.name) ? category.name.toLowerCase() : '';
          if (categoryNameLower.includes('tavuk döner') || categoryNameLower.includes('et döner')) {
            showDonerOptionsModal(productId, name, price);
            return;
          }
        }
      }
      
      // Stok kontrolü
      const product = products.find(p => p.id === productId);
      if (product) {
        const trackStock = product.trackStock === true;
        const stock = trackStock && product.stock !== undefined ? (product.stock || 0) : null;
        const isOutOfStock = trackStock && stock !== null && stock === 0;
        
        if (isOutOfStock) {
          showToast('error', 'Stok Yok', name + ' için stok kalmadı');
          return;
        }
      }
      
      const existing = cart.find(item => item.id === productId && !item.portion && !item.onionOption && !item.donerKey);
      if (existing) existing.quantity++;
      else cart.push({ id: productId, name, price, quantity: 1 });
      updateCart();
      
      // Arama input'unu temizle ve ürünleri yeniden render et
      const searchInputEl = document.getElementById('searchInput');
      if (searchInputEl) {
        searchInputEl.value = '';
        searchQuery = '';
        renderProducts();
      }
      
      // Sepeti otomatik açma - kullanıcı manuel olarak açacak
    }
    
    function updateCart() {
      const itemsDiv = document.getElementById('cartItems');
      const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
      
      if (cart.length === 0) {
        itemsDiv.innerHTML = '<div style="text-align: center; padding: 40px 20px; color: #9ca3af; font-size: 14px;">Sepetiniz boş</div>';
      } else {
        itemsDiv.innerHTML = cart.map((item, index) => {
          // Yaka's Grill için porsiyon bilgisi varsa göster
          const portionInfo = (isYakasGrillMode && item.portion) ? '<div style="color: ' + themePrimary + '; font-size: 12px; font-weight: 700; margin-top: 2px;">' + item.portion + ' Porsiyon</div>' : '';
          // Yaka's Grill için soğan bilgisi varsa göster
          const onionInfo = (isYakasGrillMode && item.onionOption) ? '<div style="color: ' + themePrimary + '; font-size: 12px; font-weight: 700; margin-top: 2px;">' + item.onionOption + '</div>' : '';
          const donerInfo = (isGeceDonercisiMode && item.donerOptionsText) ? '<div style="color: ' + themePrimary + '; font-size: 12px; font-weight: 700; margin-top: 2px;">' + item.donerOptionsText + '</div>' : '';
          // Ürün notu varsa göster
          const noteInfo = item.extraNote ? '<div style="margin-top: 4px; padding: 4px 8px; background: #fef3c7; border-left: 2px solid #f59e0b; border-radius: 4px;"><div style="font-size: 11px; font-weight: 700; color: #92400e;">📝 ' + item.extraNote + '</div></div>' : '';
          const itemKey = item.portion ? item.id + '_' + item.portion : (item.onionOption ? item.id + '_' + item.onionOption : (item.donerKey ? item.id + '_' + item.donerKey : item.id));
          return '<div class="cart-item" data-item-key="' + itemKey + '">' +
            '<div style="flex: 1;">' +
              '<div style="font-weight: 700; font-size: 15px; color: #1f2937; margin-bottom: 4px;">' + item.name + '</div>' +
              portionInfo +
              onionInfo +
              donerInfo +
              noteInfo +
              '<div style="color: #6b7280; font-size: 13px; font-weight: 600;">' + item.price.toFixed(2) + ' ₺ × ' + item.quantity + ' = ' + (item.price * item.quantity).toFixed(2) + ' ₺</div>' +
            '</div>' +
            '<div class="cart-item-controls">' +
              '<button class="qty-btn" onclick="changeQuantity(' + index + ', -1)" title="Azalt">-</button>' +
              '<span style="min-width: 36px; text-align: center; font-weight: 700; color: #1f2937; font-size: 15px;">' + item.quantity + '</span>' +
              '<button class="qty-btn" onclick="changeQuantity(' + index + ', 1)" title="Artır">+</button>' +
              '<button class="qty-btn" onclick="removeFromCart(' + index + ')" style="background: #ef4444; color: white; border-color: #ef4444; font-size: 18px;" title="Sil">×</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }
      
      document.getElementById('cartTotal').textContent = total.toFixed(2);
      const cartItemCountEl = document.getElementById('cartItemCount');
      if (cartItemCountEl) {
        cartItemCountEl.textContent = totalItems + ' ürün';
      }
      
      // Sultan Somatı için header'daki cart badge'i güncelle
      if (isSultanSomatiMode) {
        const cartBadgeEl = document.getElementById('cartBadgeHeader');
        if (cartBadgeEl) {
          if (totalItems > 0) {
            cartBadgeEl.textContent = totalItems > 99 ? '99+' : totalItems;
            cartBadgeEl.style.display = 'flex';
          } else {
            cartBadgeEl.style.display = 'none';
          }
        }
      }
    }
    
    function changeQuantity(itemIndex, delta) {
      if (itemIndex < 0 || itemIndex >= cart.length) return;
      const item = cart[itemIndex];
      item.quantity += delta;
      if (item.quantity <= 0) {
        removeFromCart(itemIndex);
      } else {
        updateCart();
      }
    }
    
    function removeFromCart(itemIndex) {
      if (itemIndex < 0 || itemIndex >= cart.length) return;
      cart.splice(itemIndex, 1);
      updateCart();
    }
    
    function toggleCart() {
      const cartEl = document.getElementById('cart');
      const iconEl = document.getElementById('cartToggleIcon');
      
      if (!cartEl) return;
      
      const wasOpen = cartEl.classList.contains('open');
      cartEl.classList.toggle('open');
      const isNowOpen = cartEl.classList.contains('open');
      
      // İkonu güncelle: açıkken yukarı ok (kapatmak için), kapalıyken aşağı ok (açmak için)
      if (iconEl) {
        if (isNowOpen) {
          // Açık - yukarı ok göster (kapatmak için)
          iconEl.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/></svg>';
        } else {
          // Kapalı - aşağı ok göster (açmak için)
          iconEl.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>';
        }
      }
    }
    
    // Cart başlangıç durumunu ayarla
    function initializeCart() {
      const cartEl = document.getElementById('cart');
      const iconEl = document.getElementById('cartToggleIcon');
      
      if (cartEl && iconEl) {
        // Başlangıçta kapalı - aşağı ok göster
        cartEl.classList.remove('open');
        iconEl.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>';
      }
    }
    
    // Toast Notification Functions
    function showToast(type, title, message) {
      const toast = document.getElementById('toast');
      const toastIcon = document.getElementById('toastIcon');
      const toastTitle = document.getElementById('toastTitle');
      const toastMessage = document.getElementById('toastMessage');
      
      toast.className = 'toast ' + type;
      toastTitle.textContent = title;
      toastMessage.textContent = message;
      
      if (type === 'success') {
        toastIcon.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>';
      } else if (type === 'error') {
        toastIcon.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>';
      }
      
      toast.classList.add('show');
      
      // Otomatik kapat (3 saniye)
      setTimeout(() => {
        hideToast();
      }, 3000);
    }
    
    function hideToast() {
      const toast = document.getElementById('toast');
      toast.classList.remove('show');
    }
    
    // Çıkış Yap Fonksiyonları
    function showLogoutModal() {
      if (currentStaff) {
        const staffName = currentStaff.name + ' ' + currentStaff.surname;
        document.getElementById('logoutStaffName').textContent = staffName;
        document.getElementById('logoutModal').style.display = 'flex';
      }
    }
    
    function hideLogoutModal() {
      document.getElementById('logoutModal').style.display = 'none';
    }
    
    function confirmLogout() {
      // Oturum bilgisini temizle
      localStorage.removeItem('staffSession');
      currentStaff = null;
      
      // WebSocket bağlantısını kapat
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      
      // Ana ekranı gizle, giriş ekranını göster
      document.getElementById('mainSection').style.display = 'none';
      document.getElementById('pinSection').style.display = 'block';
      document.getElementById('logoutModal').style.display = 'none';
      
      // Sepeti ve seçili masayı temizle
      cart = [];
      selectedTable = null;
      updateCart();
      
      // Input'u temizle
      document.getElementById('pinInput').value = '';
      document.getElementById('pinError').classList.remove('show');
      
      // Toast göster
      showToast('success', 'Çıkış Yapıldı', 'Başarıyla çıkış yaptınız. Tekrar giriş yapabilirsiniz.');
    }
    
    // Not Modal İşlemleri
    let selectedNoteProductId = null;
    
    function showNoteModal() {
      // Ürün seçimi dropdown'ını doldur
      const productSelect = document.getElementById('noteProductSelect');
      if (productSelect) {
        productSelect.innerHTML = '<option value="">Tüm sipariş için (genel not)</option>';
        cart.forEach((item, index) => {
          const option = document.createElement('option');
          option.value = index;
          const productLabel = item.name + 
            (item.portion ? ' (' + item.portion + ' porsiyon)' : '') + 
            (item.onionOption ? ' (' + item.onionOption + ')' : '') + 
            ' - ' + item.quantity + ' adet';
          option.textContent = productLabel;
          productSelect.appendChild(option);
        });
      }
      
      // Varsayılan olarak genel not göster
      selectedNoteProductId = null;
      document.getElementById('noteInput').value = orderNote;
      updateNoteCharCount();
      document.getElementById('noteModal').style.display = 'flex';
    }
    
    function onNoteProductChange() {
      const productSelect = document.getElementById('noteProductSelect');
      const noteInput = document.getElementById('noteInput');
      
      if (!productSelect || !noteInput) return;
      
      const selectedIndex = productSelect.value;
      
      if (selectedIndex === '') {
        // Genel not seçildi
        selectedNoteProductId = null;
        noteInput.value = orderNote;
      } else {
        // Ürün bazlı not seçildi
        const itemIndex = parseInt(selectedIndex);
        if (itemIndex >= 0 && itemIndex < cart.length) {
          selectedNoteProductId = itemIndex;
          const item = cart[itemIndex];
          noteInput.value = item.extraNote || '';
        }
      }
      updateNoteCharCount();
    }
    
    function updateNoteCharCount() {
      const noteInput = document.getElementById('noteInput');
      const charCount = document.getElementById('noteCharCount');
      if (noteInput && charCount) {
        charCount.textContent = noteInput.value.length + '/200';
      }
    }
    
    // Not input değiştiğinde karakter sayısını güncelle
    if (document.getElementById('noteInput')) {
      document.getElementById('noteInput').addEventListener('input', function() {
        updateNoteCharCount();
      });
    }
    
    // Ürün İptal Modal İşlemleri
    let cancelItemId = null;
    let cancelItemMaxQuantity = 1;
    
    function showManagerRequiredMessage() {
      showToast('error', 'Yetki Yok', 'İptal ettirmek için lütfen müdürle görüşünüz.');
    }
    
    function showCancelItemModal(itemId, maxQuantity, productName) {
      // Müdür kontrolü
      if (!currentStaff || (!currentStaff.is_manager && !isGeceDonercisiMode)) {
        showManagerRequiredMessage();
        return;
      }
      
      cancelItemId = itemId;
      cancelItemMaxQuantity = maxQuantity;
      document.getElementById('cancelItemName').textContent = productName;
      document.getElementById('cancelItemMaxQuantity').textContent = maxQuantity + ' adet';
      document.getElementById('cancelItemQuantity').value = 1;
      document.getElementById('cancelItemQuantity').max = maxQuantity;
      
      // Butonu sıfırla (modal her açıldığında)
      const confirmBtn = document.getElementById('confirmCancelBtn');
      const confirmBtnText = document.getElementById('confirmCancelBtnText');
      const confirmBtnSpinner = document.getElementById('confirmCancelBtnSpinner');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.style.pointerEvents = 'auto';
        if (confirmBtnText) confirmBtnText.textContent = 'İptal Et';
        if (confirmBtnSpinner) confirmBtnSpinner.style.display = 'none';
      }
      
      document.getElementById('cancelItemModal').style.display = 'flex';
    }
    
    function hideCancelItemModal() {
      document.getElementById('cancelItemModal').style.display = 'none';
      cancelItemId = null;
      cancelItemMaxQuantity = 1;
    }
    
    function validateCancelQuantity() {
      const input = document.getElementById('cancelItemQuantity');
      let value = parseInt(input.value);
      if (isNaN(value) || value < 1) {
        value = 1;
      } else if (value > cancelItemMaxQuantity) {
        value = cancelItemMaxQuantity;
      }
      input.value = value;
    }

    function changeCancelQuantity(delta) {
      const input = document.getElementById('cancelItemQuantity');
      if (!input) return;
      const current = parseInt(input.value) || 1;
      input.value = current + delta;
      validateCancelQuantity();
    }
    
    // İptal işlemi için geçici değişkenler
    let pendingCancelItemId = null;
    let pendingCancelQuantity = null;
    
    function confirmCancelItem() {
      if (!cancelItemId) return;
      
      const cancelQuantity = parseInt(document.getElementById('cancelItemQuantity').value);
      if (isNaN(cancelQuantity) || cancelQuantity < 1 || cancelQuantity > cancelItemMaxQuantity) {
        showToast('error', 'Hata', 'Geçersiz iptal miktarı');
        return;
      }
      
      // Müdür kontrolü
      if (!currentStaff || (!currentStaff.is_manager && !isGeceDonercisiMode)) {
        showManagerRequiredMessage();
        return;
      }
      
      // İptal edilecek ürün bilgilerini sakla
      pendingCancelItemId = cancelItemId;
      pendingCancelQuantity = cancelQuantity;
      
      // Modal'ı kapat
      hideCancelItemModal();
      
      // İptal işlemini başlat (fiş yazdırılacak)
      startCancelProcess();
    }
    
    async function startCancelProcess() {
      if (!pendingCancelItemId || !pendingCancelQuantity) return;
      
      // Mevcut siparişler listesindeki iptal butonunu bul ve loading durumuna geçir
      const cancelBtn = document.getElementById('cancelBtn_' + pendingCancelItemId);
      const cancelBtnText = document.getElementById('cancelBtnText_' + pendingCancelItemId);
      const cancelBtnSpinner = document.getElementById('cancelBtnSpinner_' + pendingCancelItemId);
      
      if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.style.opacity = '0.7';
        cancelBtn.style.cursor = 'not-allowed';
        cancelBtn.style.pointerEvents = 'none';
        if (cancelBtnText) cancelBtnText.textContent = 'İşleniyor...';
        if (cancelBtnSpinner) cancelBtnSpinner.style.display = 'block';
      }
      
      // İptal işlemini başlat (fiş yazdırılacak, açıklama bekleniyor)
      try {
        const response = await fetch(API_URL + '/cancel-table-order-item', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            itemId: pendingCancelItemId,
            cancelQuantity: pendingCancelQuantity,
            staffId: currentStaff ? currentStaff.id : null,
            cancelReason: '' // Geçici olarak boş, açıklama modal'ından sonra gönderilecek
          })
        });
        
        const result = await response.json();
        
        if (result.requiresReason === true || (result.error && result.error.includes('İptal açıklaması'))) {
          // Açıklama modal'ını aç (fiş henüz yazdırılmadı)
          if (cancelBtnText) cancelBtnText.textContent = 'İptal';
          if (cancelBtnSpinner) cancelBtnSpinner.style.display = 'none';
          showCancelReasonModal();
        } else if (result.success) {
          // Başarılı (açıklama ile birlikte gönderildi)
          showToast('success', 'Başarılı', 'Ürün başarıyla iptal edildi');
          hideCancelReasonModal();
          if (selectedTable) {
            await loadExistingOrders(selectedTable.id);
          }
          pendingCancelItemId = null;
          pendingCancelQuantity = null;
        } else {
          showToast('error', 'Hata', result.error || 'Ürün iptal edilemedi');
          // Hata durumunda butonu tekrar aktif hale getir
          resetCancelButton(cancelBtn, cancelBtnText, cancelBtnSpinner);
          pendingCancelItemId = null;
          pendingCancelQuantity = null;
        }
      } catch (error) {
        console.error('İptal hatası:', error);
        showToast('error', 'Hata', 'Ürün iptal edilirken bir hata oluştu');
        resetCancelButton(cancelBtn, cancelBtnText, cancelBtnSpinner);
        pendingCancelItemId = null;
        pendingCancelQuantity = null;
      }
    }
    
    function resetCancelButton(cancelBtn, cancelBtnText, cancelBtnSpinner) {
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.style.opacity = '1';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.pointerEvents = 'auto';
        if (cancelBtnText) cancelBtnText.textContent = 'İptal';
        if (cancelBtnSpinner) cancelBtnSpinner.style.display = 'none';
      }
    }
    
    function showCancelReasonModal() {
      document.getElementById('cancelReasonModal').style.display = 'flex';
      document.getElementById('cancelReasonInput').value = '';
      // Focus'u geciktirerek donma sorununu çöz
      setTimeout(() => {
        const input = document.getElementById('cancelReasonInput');
        if (input) {
          input.focus();
        }
      }, 100);
    }
    
    function hideCancelReasonModal() {
      document.getElementById('cancelReasonModal').style.display = 'none';
    }
    
    async function submitCancelReason() {
      const cancelReason = document.getElementById('cancelReasonInput').value.trim();
      
      if (!cancelReason || cancelReason === '') {
        showToast('error', 'Hata', 'Lütfen iptal açıklaması yazın');
        return;
      }
      
      if (!pendingCancelItemId || !pendingCancelQuantity) {
        showToast('error', 'Hata', 'İptal işlemi bulunamadı');
        hideCancelReasonModal();
        return;
      }
      
      // Modalı hemen kapat ve UI'ı anında güncelle
      hideCancelReasonModal();
      
      // Ürünü anında UI'dan kaldır (optimistic update)
      const cancelBtn = document.getElementById('cancelBtn_' + pendingCancelItemId);
      if (cancelBtn) {
        const orderItem = cancelBtn.closest('.order-item');
        if (orderItem) {
          orderItem.style.opacity = '0.5';
          orderItem.style.transition = 'opacity 0.3s';
          setTimeout(() => {
            orderItem.style.display = 'none';
          }, 300);
        }
      }
      
      // Arka planda kaydet (await kullanmadan)
      fetch(API_URL + '/cancel-table-order-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          itemId: pendingCancelItemId,
          cancelQuantity: pendingCancelQuantity,
          staffId: currentStaff ? currentStaff.id : null,
          cancelReason: cancelReason
        })
      })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          // Siparişleri arka planda yenile
          if (selectedTable) {
            loadExistingOrders(selectedTable.id).catch(err => console.error('Sipariş yenileme hatası:', err));
          }
        } else {
          // Hata durumunda UI'ı geri yükle
          if (cancelBtn) {
            const orderItem = cancelBtn.closest('.order-item');
            if (orderItem) {
              orderItem.style.display = '';
              orderItem.style.opacity = '1';
            }
          }
          showToast('error', 'Hata', result.error || 'Ürün iptal edilemedi');
        }
      })
      .catch(error => {
        console.error('İptal işlemi hatası:', error);
        // Hata durumunda UI'ı geri yükle
        if (cancelBtn) {
          const orderItem = cancelBtn.closest('.order-item');
          if (orderItem) {
            orderItem.style.display = '';
            orderItem.style.opacity = '1';
          }
        }
        showToast('error', 'Hata', 'İptal işlemi sırasında bir hata oluştu');
      });
      
      // Pending değişkenlerini temizle
      pendingCancelItemId = null;
      pendingCancelQuantity = null;
    }
    
    // Yayın Mesajı Fonksiyonları
    function showBroadcastMessage(message, date, time) {
      const modal = document.getElementById('broadcastMessageModal');
      const messageText = document.getElementById('broadcastMessageText');
      const messageDate = document.getElementById('broadcastMessageDate');
      
      if (modal && messageText && messageDate) {
        messageText.textContent = message;
        messageDate.textContent = date + ' ' + time;
        modal.style.display = 'flex';
      }
    }
    
    function closeBroadcastMessage() {
      const modal = document.getElementById('broadcastMessageModal');
      if (modal) {
        modal.style.display = 'none';
      }
    }
    
    function hideNoteModal() {
      document.getElementById('noteModal').style.display = 'none';
      selectedNoteProductId = null;
    }
    
    function saveNote() {
      const noteInput = document.getElementById('noteInput');
      if (!noteInput) return;
      
      const noteText = noteInput.value.trim();
      
      if (selectedNoteProductId !== null) {
        // Ürün bazlı not ekle
        const itemIndex = selectedNoteProductId;
        if (itemIndex >= 0 && itemIndex < cart.length) {
          cart[itemIndex].extraNote = noteText || null;
          updateCart();
          showToast('success', 'Not Eklendi', 'Ürün notu başarıyla eklendi');
        }
      } else {
        // Genel sipariş notu
        orderNote = noteText;
        updateNoteButton();
        showToast('success', 'Not Eklendi', 'Sipariş notu başarıyla eklendi');
      }
      
      hideNoteModal();
    }
    
    function updateNoteButton() {
      const noteButtonText = document.getElementById('noteButtonText');
      if (orderNote) {
        noteButtonText.textContent = 'Not Düzenle';
      } else {
        noteButtonText.textContent = 'Not Ekle';
      }
    }
    
    let isSendingOrder = false;
    let sendOrderLockedUntil = 0;

    function setSendOrderLoadingUI(isLoading) {
      const btnMain = document.getElementById('sendOrderBtnMain');
      const btnCart = document.getElementById('sendOrderBtnCart');
      const buttons = [btnMain, btnCart].filter(Boolean);

      buttons.forEach(btn => {
        btn.disabled = !!isLoading;
        btn.style.opacity = isLoading ? '0.75' : '1';
        btn.style.cursor = isLoading ? 'not-allowed' : 'pointer';
      });

      const mainIcon = document.getElementById('sendOrderBtnMainIcon');
      const mainSpinner = document.getElementById('sendOrderBtnMainSpinner');
      const cartIcon = document.getElementById('sendOrderBtnCartIcon');
      const cartSpinner = document.getElementById('sendOrderBtnCartSpinner');

      if (mainIcon) mainIcon.style.display = isLoading ? 'none' : 'inline-block';
      if (mainSpinner) mainSpinner.style.display = isLoading ? 'inline-block' : 'none';
      if (cartIcon) cartIcon.style.display = isLoading ? 'none' : 'inline-block';
      if (cartSpinner) cartSpinner.style.display = isLoading ? 'inline-block' : 'none';
    }

    async function sendOrder() {
      if (!selectedTable || cart.length === 0) { 
        showToast('error', 'Eksik Bilgi', 'Lütfen masa seçin ve ürün ekleyin');
        return; 
      }
      if (!currentStaff) { 
        showToast('error', 'Giriş Gerekli', 'Lütfen giriş yapın');
        return; 
      }

      const now = Date.now();
      if (isSendingOrder || now < sendOrderLockedUntil) {
        return;
      }

      isSendingOrder = true;
      sendOrderLockedUntil = now + 2000;
      setSendOrderLoadingUI(true);
      
      const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      try {
        const response = await fetch(API_URL + '/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            items: cart, 
            totalAmount, 
            tableId: selectedTable.id, 
            tableName: selectedTable.name, 
            tableType: selectedTable.type,
            staffId: currentStaff.id,
            orderNote: orderNote || null
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          const message = result.isNewOrder 
            ? selectedTable.name + ' için yeni sipariş başarıyla oluşturuldu!' 
            : selectedTable.name + ' için mevcut siparişe eklendi!';
          
          showToast('success', 'Sipariş Başarılı', message);
          
          // Sepeti temizle ama masada kal
          const currentTableId = selectedTable.id;
          cart = []; 
          orderNote = '';
          updateCart();
          updateNoteButton();
          document.getElementById('searchInput').value = '';
          searchQuery = '';
          
          // Siparişleri yenile
          await loadExistingOrders(currentTableId);
          // Ürünleri yenile (stok bilgisi güncellensin)
          await loadData();
          // Ürünleri render et (stok 0 olanlar "Kalmadı" göstersin)
          renderProducts();
        } else {
          showToast('error', 'Hata', result.error || 'Sipariş gönderilemedi');
        }
      } catch (error) { 
        console.error('Sipariş gönderme hatası:', error); 
        showToast('error', 'Bağlantı Hatası', 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.');
      } finally {
        const remainingMs = Math.max(0, sendOrderLockedUntil - Date.now());
        setTimeout(() => {
          isSendingOrder = false;
          setSendOrderLoadingUI(false);
        }, remainingMs);
      }
    }
  </script>
</body>
</html>`;
}

// HTTP Server ve API Setup
function startAPIServer() {
  const appExpress = express();
  appExpress.use(cors());
  appExpress.use(express.json());
  
  // Assets klasörünü serve et
  const assetsPath = path.join(__dirname, '../assets');
  appExpress.use('/assets', express.static(assetsPath));

  const server = http.createServer(appExpress);
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  const localIP = getLocalIP();
  const serverURL = `http://${localIP}:${serverPort}`;

  // API Endpoints
  appExpress.get('/api/categories', async (req, res) => {
    try {
      // Firebase'den direkt çek
      if (firestore && firebaseCollection && firebaseGetDocs) {
        const categoriesRef = firebaseCollection(firestore, 'categories');
        const snapshot = await firebaseGetDocs(categoriesRef);
        
        const categories = [];
        snapshot.forEach((doc) => {
          const firebaseCategory = doc.data();
          categories.push({
            id: typeof firebaseCategory.id === 'string' ? parseInt(firebaseCategory.id) : firebaseCategory.id,
            name: firebaseCategory.name || '',
            order_index: firebaseCategory.order_index || 0
          });
        });
        
        // order_index'e göre sırala
        categories.sort((a, b) => {
          if (a.order_index !== b.order_index) {
            return a.order_index - b.order_index;
          }
          return a.id - b.id;
        });
        
        res.json(categories);
      } else {
        // Firebase yoksa local database'den çek
        res.json(db.categories.sort((a, b) => a.order_index - b.order_index));
      }
    } catch (error) {
      console.error('❌ Kategoriler çekilirken hata:', error);
      // Hata durumunda local database'den çek
      res.json(db.categories.sort((a, b) => a.order_index - b.order_index));
    }
  });

  appExpress.get('/api/products', async (req, res) => {
    try {
      const categoryId = req.query.category_id;
      
      let products = [];
      
      // Firebase'den direkt çek
      if (firestore && firebaseCollection && firebaseGetDocs) {
        const productsRef = firebaseCollection(firestore, 'products');
        const snapshot = await firebaseGetDocs(productsRef);
        
        snapshot.forEach((doc) => {
          const firebaseProduct = doc.data();
          const product = {
            id: typeof firebaseProduct.id === 'string' ? parseInt(firebaseProduct.id) : firebaseProduct.id,
            name: firebaseProduct.name || '',
            category_id: typeof firebaseProduct.category_id === 'string' ? parseInt(firebaseProduct.category_id) : firebaseProduct.category_id,
            price: parseFloat(firebaseProduct.price) || 0,
            image: firebaseProduct.image || null,
            unit: firebaseProduct.unit || firebaseProduct.unitLabel || firebaseProduct.unit_name || null
          };
          
          // Kategori filtresi varsa uygula
          if (!categoryId || product.category_id === Number(categoryId)) {
            products.push(product);
          }
        });
      } else {
        // Firebase yoksa local database'den çek
        if (categoryId) {
          products = db.products.filter(p => p.category_id === Number(categoryId));
        } else {
          products = db.products;
        }
      }
      
      // Her ürün için stok + unit bilgisini ekle (local database'den veya Firebase'den)
      const productsWithStock = await Promise.all(products.map(async (product) => {
        // Local database'de ürünü bul
        const localProduct = db.products.find(p => p.id === product.id);
        
        // Stok bilgisini al
        let stock = null;
        let trackStock = false;
        
        if (localProduct) {
          trackStock = localProduct.trackStock === true;
          // unit (müşteri menüsü + mobil personel için)
          if (!product.unit && (localProduct.unit || localProduct.unitLabel || localProduct.unit_name)) {
            product.unit = localProduct.unit || localProduct.unitLabel || localProduct.unit_name;
          }
          if (trackStock) {
            stock = localProduct.stock !== undefined ? (localProduct.stock || 0) : null;
            // Eğer local'de stok yoksa Firebase'den çek
            if (stock === null) {
              stock = await getProductStockFromFirebase(product.id);
              if (stock === null) {
                stock = 0;
              }
            }
          }
        } else {
          // Local'de yoksa Firebase'den stok bilgisini çek
          const firebaseStock = await getProductStockFromFirebase(product.id);
          if (firebaseStock !== null) {
            trackStock = true;
            stock = firebaseStock;
          }
        }
        
        return {
          ...product,
          trackStock: trackStock,
          stock: trackStock ? (stock !== null ? stock : 0) : undefined
        };
      }));
      
      res.json(productsWithStock);
    } catch (error) {
      console.error('❌ Ürünler çekilirken hata:', error);
      // Hata durumunda local database'den çek
      let products = [];
      if (categoryId) {
        products = db.products.filter(p => p.category_id === Number(categoryId));
      } else {
        products = db.products;
      }
      
      // Stok bilgisini ekle
      const productsWithStock = products.map(product => ({
        ...product,
        trackStock: product.trackStock === true,
        stock: product.trackStock ? (product.stock !== undefined ? product.stock : 0) : undefined
      }));
      
      res.json(productsWithStock);
    }
  });

  // Backend resim cache (memory cache - Firebase Storage kullanımını azaltmak için)
  const imageCache = new Map();
  const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 gün (önceden 24 saat)
  const CACHE_MAX_SIZE = 1000; // Maksimum 1000 resim cache'de tut (önceden 100)
  
  // Resim proxy endpoint - CORS sorununu çözmek için + Backend cache
  // Image proxy endpoint - Firebase Storage ve R2 görselleri için CORS sorununu çözer
  appExpress.get('/api/image-proxy', async (req, res) => {
    try {
      const imageUrl = req.query.url;
      if (!imageUrl) {
        return res.status(400).json({ error: 'URL parametresi gerekli' });
      }
      
      // Firebase Storage veya R2 URL kontrolü
      const isFirebaseStorage = imageUrl.includes('firebasestorage.googleapis.com');
      const isR2ImageUrl = imageUrl.includes('r2.dev') || imageUrl.includes('r2.cloudflarestorage.com');
      
      if (!isFirebaseStorage && !isR2ImageUrl) {
        return res.status(400).json({ error: 'Geçersiz resim URL\'si (sadece Firebase Storage veya R2 destekleniyor)' });
      }
      
      // Cache'de var mı kontrol et
      const cached = imageCache.get(imageUrl);
      if (cached && (Date.now() - cached.timestamp) < CACHE_MAX_AGE) {
        // Cache'den döndür - Storage'a istek yok!
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.send(cached.buffer);
        return;
      }
      
      // Cache'de yoksa Storage'dan çek (Firebase Storage veya R2)
      let response;
      
      if (isR2ImageUrl) {
        // R2 için iki yöntem deneyelim:
        // 1. Önce R2 S3 API'sini kullanarak direkt çek (en güvenilir)
        // 2. Başarısız olursa public URL üzerinden çek
        
        try {
          // R2 URL'den dosya yolunu çıkar
          let filePath = '';
          if (imageUrl.includes('/images/')) {
            const urlParts = imageUrl.split('/images/');
            if (urlParts.length > 1) {
              filePath = `images/${urlParts[1]}`;
            }
          } else {
            // R2.dev subdomain formatından path çıkar
            const urlModule = require('url');
            const urlObj = new urlModule.URL(imageUrl);
            filePath = urlObj.pathname.substring(1); // Başındaki / karakterini kaldır
          }
          
          if (filePath) {
            // R2 S3 API'sini kullanarak direkt çek
            const getObjectCommand = new GetObjectCommand({
              Bucket: R2_CONFIG.bucketName,
              Key: filePath
            });
            
            const s3Response = await r2Client.send(getObjectCommand);
            
            // Stream'i buffer'a çevir
            const chunks = [];
            for await (const chunk of s3Response.Body) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            
            response = {
              buffer: buffer,
              contentType: s3Response.ContentType || 'image/jpeg'
            };
            
            console.log(`✅ R2 görsel S3 API üzerinden çekildi: ${filePath}`);
          } else {
            throw new Error('R2 dosya yolu çıkarılamadı');
          }
        } catch (s3Error) {
          console.warn('⚠️ R2 S3 API hatası, public URL denenecek:', s3Error.message);
          
          // S3 API başarısız olduysa, public URL üzerinden çek
          const https = require('https');
          const urlModule = require('url');
          const parsedUrl = new urlModule.URL(imageUrl);
          
          // R2.dev subdomain HTTPS kullanır
          const requestOptions = {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*'
            },
            rejectUnauthorized: true
          };
          
          response = await new Promise((resolve, reject) => {
            const req = https.get(imageUrl, requestOptions, (httpResponse) => {
              if (httpResponse.statusCode !== 200) {
                reject(new Error(`HTTP ${httpResponse.statusCode}`));
                return;
              }
              const chunks = [];
              httpResponse.on('data', (chunk) => chunks.push(chunk));
              httpResponse.on('end', () => resolve({
                buffer: Buffer.concat(chunks),
                contentType: httpResponse.headers['content-type'] || 'image/jpeg'
              }));
              httpResponse.on('error', reject);
            });
            req.on('error', (error) => {
              console.error('❌ R2 public URL hatası:', error);
              reject(error);
            });
            req.setTimeout(10000, () => {
              req.destroy();
              reject(new Error('Request timeout'));
            });
          });
        }
      } else {
        // Firebase Storage için mevcut yöntem
        const https = require('https');
        const http = require('http');
        const url = require('url');
        const parsedUrl = new url.URL(imageUrl);
        const httpModule = parsedUrl.protocol === 'https:' ? https : http;
        
        response = await new Promise((resolve, reject) => {
          const req = httpModule.get(imageUrl, (httpResponse) => {
            if (httpResponse.statusCode !== 200) {
              reject(new Error(`HTTP ${httpResponse.statusCode}`));
              return;
            }
            const chunks = [];
            httpResponse.on('data', (chunk) => chunks.push(chunk));
            httpResponse.on('end', () => resolve({
              buffer: Buffer.concat(chunks),
              contentType: httpResponse.headers['content-type'] || 'image/jpeg'
            }));
            httpResponse.on('error', reject);
          });
          req.on('error', (error) => {
            console.error('❌ Resim proxy hatası:', error);
            reject(error);
          });
          req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
        });
      }
      
      // Cache'e ekle (eski cache'leri temizle)
      if (imageCache.size >= CACHE_MAX_SIZE) {
        // En eski cache'i sil
        const oldestKey = Array.from(imageCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        imageCache.delete(oldestKey);
      }
      
      imageCache.set(imageUrl, {
        buffer: response.buffer,
        contentType: response.contentType,
        timestamp: Date.now()
      });
      
      // Resmi döndür
      res.setHeader('Content-Type', response.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.send(response.buffer);
    } catch (error) {
      console.error('❌ Resim proxy hatası:', error);
      res.status(500).json({ error: 'Resim yüklenemedi' });
    }
  });

  appExpress.get('/api/staff', (req, res) => {
    res.json((db.staff || []).map(s => ({
      id: s.id,
      name: s.name,
      surname: s.surname,
      is_manager: s.is_manager || false
    })));
  });

  appExpress.post('/api/staff/login', (req, res) => {
    const { password } = req.body;
    const staff = (db.staff || []).find(s => s.password === password.toString());
    if (staff) {
      res.json({
        success: true,
        staff: {
          id: staff.id,
          name: staff.name,
          surname: staff.surname,
          is_manager: staff.is_manager || false
        }
      });
    } else {
      res.status(401).json({ success: false, error: 'Şifre hatalı' });
    }
  });

  appExpress.get('/api/tables', (req, res) => {
    // Tenant'tan masa sayılarını al (masaüstü uygulamadaki mantıkla aynı)
    const tenantInfo = tenantManager.getCurrentTenantInfo();
    const tenantId = tenantInfo?.tenantId || null;
    const isSultanSomati = tenantId === 'TENANT-1766611377865';
    const isYakasGrill = tenantId === 'TENANT-1766340222641';
    const isGeceDonercisi = tenantId === 'TENANT-1769602125250';
    const isLacromisa = tenantId === 'TENANT-1769956051654';
    
    // Sultan Somatı için salon yapısı
    const sultanSomatiSalons = [
      { id: 'disari', name: 'Dışarı', count: 4, icon: '☀️' },
      { id: 'kis-bahcesi', name: 'Kış Bahçesi', count: 14, icon: '🌿' },
      { id: 'osmanli-odasi', name: 'Osmanlı Odası', count: 8, icon: '🏛️' },
      { id: 'selcuklu-odasi', name: 'Selçuklu Odası', count: 10, icon: '🕌' },
      { id: 'mevlevi-odasi', name: 'Mevlevi Odası', count: 1, icon: '🕯️' },
      { id: 'ask-odasi', name: 'Aşk Odası', count: 1, icon: '💕' }
    ];
    
    // Gece Dönercisi: LOCA masası sadece Şeker şubesinde
    const geceBranch = isGeceDonercisi ? (geceBranchSelection?.branch || db.settings?.geceBranch || null) : null;
    const geceDonercisiCategories = [
      { id: 'salon', name: 'Salon', count: 30, icon: '🪑' },
      { id: 'bahce', name: 'Bahçe', count: 30, icon: '🌿' },
      { id: 'paket', name: 'Paket', count: 30, icon: '📦' },
      { id: 'trendyolgo', name: 'TrendyolGO', count: 30, icon: '🛒' },
      { id: 'yemeksepeti', name: 'Yemeksepeti', count: 30, icon: '🍽️' },
      { id: 'migros-yemek', name: 'Migros Yemek', count: 30, icon: '🛍️' },
      ...(geceBranch === 'SEKER' ? [{ id: 'loca', name: 'Loca', count: 1, icon: '📍' }] : [])
    ];
    
    const tables = [];
    
    if (isGeceDonercisi) {
      geceDonercisiCategories.forEach(cat => {
        for (let i = 1; i <= cat.count; i++) {
          const tableId = `${cat.id}-${i}`;
          const hasPendingOrder = (db.tableOrders || []).some(
            o => o.table_id === tableId && o.status === 'pending'
          );
          tables.push({
            id: tableId,
            number: i,
            type: cat.id,
            categoryId: cat.id,
            categoryName: cat.name,
            name: `${cat.name} ${i}`,
            icon: cat.icon,
            hasOrder: hasPendingOrder
          });
        }
      });
    } else if (isSultanSomati) {
      // Sultan Somatı için salon bazlı masalar
      sultanSomatiSalons.forEach(salon => {
        for (let i = 1; i <= salon.count; i++) {
          const tableId = `salon-${salon.id}-${i}`;
          const hasPendingOrder = (db.tableOrders || []).some(
            o => o.table_id === tableId && o.status === 'pending'
          );
          tables.push({
            id: tableId,
            number: i,
            type: salon.id,
            salonId: salon.id,
            salonName: salon.name,
            name: salon.count === 1 ? salon.name : `${salon.name} ${i}`,
            icon: salon.icon,
            hasOrder: hasPendingOrder
          });
        }
      });
    } else if (isYakasGrill) {
      // Yaka's Grill için direkt masalar (MASA-1, MASA-2, ...) - Salon
      for (let i = 1; i <= 30; i++) {
        const tableId = `masa-${i}`;
        const hasPendingOrder = (db.tableOrders || []).some(
          o => o.table_id === tableId && o.status === 'pending'
        );
        tables.push({
          id: tableId,
          number: i,
          type: 'masa',
          name: `MASA-${i}`,
          hasOrder: hasPendingOrder
        });
      }
      // Yaka's Grill için paket masaları
      for (let i = 1; i <= 25; i++) {
        const tableId = `package-masa-${i}`;
        const hasPendingOrder = (db.tableOrders || []).some(
          o => o.table_id === tableId && o.status === 'pending'
        );
        tables.push({
          id: tableId,
          number: i,
          type: 'package',
          name: `Paket ${i}`,
          hasOrder: hasPendingOrder
        });
      }
    } else if (isLacromisa) {
      // Lacromisa: 15 salon / 15 bahçe, paket yok (websocket/mobil ile aynı ID şeması)
      const insideTablesCount = 15;
      const outsideTablesCount = 15;

      for (let i = 1; i <= insideTablesCount; i++) {
        const tableId = `inside-${i}`;
        const hasPendingOrder = (db.tableOrders || []).some(
          o => o.table_id === tableId && o.status === 'pending'
        );
        tables.push({
          id: tableId,
          number: i,
          type: 'inside',
          name: `Salon ${i}`,
          hasOrder: hasPendingOrder
        });
      }
      for (let i = 1; i <= outsideTablesCount; i++) {
        const tableId = `outside-${i}`;
        const hasPendingOrder = (db.tableOrders || []).some(
          o => o.table_id === tableId && o.status === 'pending'
        );
        tables.push({
          id: tableId,
          number: i,
          type: 'outside',
          name: `Bahçe ${i}`,
          hasOrder: hasPendingOrder
        });
      }
    } else {
      // Normal mod için içeri/dışarı masalar
      // 0 değeri geçerli olduğu için null/undefined kontrolü yapıyoruz
      const insideTablesCount = tenantInfo?.insideTables !== undefined && tenantInfo?.insideTables !== null 
        ? tenantInfo.insideTables 
        : 20;
      const outsideTablesCount = tenantInfo?.outsideTables !== undefined && tenantInfo?.outsideTables !== null 
        ? tenantInfo.outsideTables 
        : 20;
      const packageTablesCount = tenantInfo?.packageTables !== undefined && tenantInfo?.packageTables !== null 
        ? tenantInfo.packageTables 
        : 5;
      
      for (let i = 1; i <= insideTablesCount; i++) {
        const tableId = `inside-${i}`;
        const hasPendingOrder = (db.tableOrders || []).some(
          o => o.table_id === tableId && o.status === 'pending'
        );
        tables.push({
          id: tableId,
          number: i,
          type: 'inside',
          name: `İçeri ${i}`,
          hasOrder: hasPendingOrder
        });
      }
      for (let i = 1; i <= outsideTablesCount; i++) {
        const tableId = `outside-${i}`;
        const hasPendingOrder = (db.tableOrders || []).some(
          o => o.table_id === tableId && o.status === 'pending'
        );
        tables.push({
          id: tableId,
          number: i,
          type: 'outside',
          name: `Dışarı ${i}`,
          hasOrder: hasPendingOrder
        });
      }
      // Paket masaları - İçeri
      for (let i = 1; i <= packageTablesCount; i++) {
        const tableId = `package-inside-${i}`;
        const hasPendingOrder = (db.tableOrders || []).some(
          o => o.table_id === tableId && o.status === 'pending'
        );
        tables.push({
          id: tableId,
          number: i,
          type: 'inside',
          name: `Paket ${i}`,
          hasOrder: hasPendingOrder
        });
      }
      // Paket masaları - Dışarı
      for (let i = 1; i <= packageTablesCount; i++) {
        const tableId = `package-outside-${i}`;
        const hasPendingOrder = (db.tableOrders || []).some(
          o => o.table_id === tableId && o.status === 'pending'
        );
        tables.push({
          id: tableId,
          number: i,
          type: 'outside',
          name: `Paket ${i}`,
          hasOrder: hasPendingOrder
        });
      }
    }
    
    res.json(tables);
  });

  // Masa aktar
  appExpress.post('/api/transfer-table-order', async (req, res) => {
    try {
      const { sourceTableId, targetTableId } = req.body;
      const tenantInfoApi = tenantManager.getCurrentTenantInfo();
      const isLacromisaApi = tenantInfoApi?.tenantId === LACRIMOSA_TENANT_ID;
      
      if (!sourceTableId || !targetTableId) {
        return res.status(400).json({ success: false, error: 'Kaynak ve hedef masa ID\'leri gerekli' });
      }
      
      // Kaynak masanın siparişini bul
      const sourceOrder = db.tableOrders.find(
        o => o.table_id === sourceTableId && o.status === 'pending'
      );

      if (!sourceOrder) {
        return res.status(404).json({ success: false, error: 'Kaynak masada aktif sipariş bulunamadı' });
      }

      // Hedef masada aktif sipariş var mı kontrol et
      const targetOrder = db.tableOrders.find(
        o => o.table_id === targetTableId && o.status === 'pending'
      );

      if (targetOrder) {
        return res.status(400).json({ success: false, error: 'Hedef masada zaten aktif bir sipariş var' });
      }

      // Kaynak masanın sipariş itemlarını al
      const sourceItems = db.tableOrderItems.filter(oi => oi.order_id === sourceOrder.id);

      if (sourceItems.length === 0) {
        return res.status(400).json({ success: false, error: 'Aktarılacak ürün bulunamadı' });
      }

      // Hedef masa bilgilerini al (masa adı ve tipi) — Lacromisa: Salon/Bahçe
      let targetTableName = '';
      let targetTableType = sourceOrder.table_type; // Varsayılan olarak kaynak masanın tipi

      // Masa ID'sinden masa bilgilerini çıkar
      if (targetTableId.startsWith('inside-')) {
        const num = targetTableId.replace('inside-', '');
        targetTableName = isLacromisaApi ? `Salon ${num}` : `İçeri ${num}`;
        targetTableType = 'inside';
      } else if (targetTableId.startsWith('outside-')) {
        const num = targetTableId.replace('outside-', '');
        targetTableName = isLacromisaApi ? `Bahçe ${num}` : `Dışarı ${num}`;
        targetTableType = 'outside';
      } else if (targetTableId.startsWith('package-')) {
        const parts = targetTableId.split('-');
        targetTableName = `Paket ${parts[parts.length - 1]}`;
        targetTableType = parts[1] || sourceOrder.table_type; // package-{type}-{number}
      }

      // Kaynak siparişin tüm bilgilerini koru (order_date, order_time, order_note, total_amount)
      // Sadece table_id, table_name ve table_type'ı güncelle
      sourceOrder.table_id = targetTableId;
      sourceOrder.table_name = targetTableName;
      sourceOrder.table_type = targetTableType;

      // Tüm itemların order_id'si zaten doğru (aynı order'a ait oldukları için değişmeyecek)
      // Ancak emin olmak için kontrol edelim
      sourceItems.forEach(item => {
        if (item.order_id !== sourceOrder.id) {
          item.order_id = sourceOrder.id;
        }
      });

      saveDatabase();

      // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder
      if (io) {
        io.emit('table-update', {
          tableId: sourceTableId,
          hasOrder: false
        });
        io.emit('table-update', {
          tableId: targetTableId,
          hasOrder: true
        });
      }

      res.json({ 
        success: true, 
        orderId: sourceOrder.id,
        sourceTableId: sourceTableId,
        targetTableId: targetTableId
      });
    } catch (error) {
      console.error('Masa aktarım hatası:', error);
      res.status(500).json({ success: false, error: 'Masa aktarılırken bir hata oluştu' });
    }
  });

  // Ürün iptal etme (mobil arayüz için)
  appExpress.post('/api/cancel-table-order-item', async (req, res) => {
    try {
      const { itemId, cancelQuantity, staffId } = req.body;
      
      if (!itemId) {
        return res.status(400).json({ success: false, error: 'Ürün ID\'si gerekli' });
      }

      const tenantId = tenantManager.getCurrentTenantInfo()?.tenantId || null;
      const isGeceDonercisi = tenantId === 'TENANT-1769602125250';

      // Müdür kontrolü (Gece Dönercisi'nde herkes iptal edebilir)
      if (staffId) {
        const staff = (db.staff || []).find(s => s.id === staffId);
        if (!isGeceDonercisi && (!staff || !staff.is_manager)) {
          return res.status(403).json({ 
            success: false, 
            error: 'İptal yetkisi yok. İptal ettirmek için lütfen müdürle görüşünüz.' 
          });
        }
      } else {
        return res.status(400).json({ success: false, error: 'Personel bilgisi gerekli' });
      }

      const item = db.tableOrderItems.find(oi => oi.id === itemId);
      if (!item) {
        return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
      }

      const order = db.tableOrders.find(o => o.id === item.order_id);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Sipariş bulunamadı' });
      }

      if (order.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Bu sipariş zaten tamamlanmış veya iptal edilmiş' });
      }

      // İptal edilecek miktarı belirle
      const quantityToCancel = cancelQuantity || item.quantity;
      if (quantityToCancel <= 0 || quantityToCancel > item.quantity) {
        return res.status(400).json({ success: false, error: 'Geçersiz iptal miktarı' });
      }

      // Ürün bilgilerini al (kategori ve yazıcı için)
      const product = db.products.find(p => p.id === item.product_id);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Ürün bilgisi bulunamadı' });
      }

      // Kategori bilgisini al
      const category = db.categories.find(c => c.id === product.category_id);
      const categoryName = category ? category.name : 'Diğer';

      // Bu kategoriye atanmış yazıcıyı bul
      const assignment = db.printerAssignments.find(a => {
        const assignmentCategoryId = typeof a.category_id === 'string' ? parseInt(a.category_id) : a.category_id;
        return assignmentCategoryId === product.category_id;
      });

      if (!assignment) {
        return res.status(400).json({ success: false, error: 'Bu ürünün kategorisine yazıcı atanmamış' });
      }

      // Gece Dönercisi: iptal açıklaması zorunlu değil
      let { cancelReason } = req.body;
      const tenantIdApi = tenantManager.getCurrentTenantInfo()?.tenantId || null;
      const isGeceDonercisiApi = tenantIdApi === 'TENANT-1769602125250';
      const hasCancelReason = cancelReason && cancelReason.trim() !== '';
      if (!isGeceDonercisiApi && !hasCancelReason) {
        return res.status(200).json({ 
          success: false, 
          requiresReason: true,
          message: 'Lütfen iptal açıklaması girin.' 
        });
      }
      cancelReason = hasCancelReason ? cancelReason.trim() : '';
      
      // İptal fişi yazdır (sadece açıklama varsa) - arka planda
      const now = new Date();
      const cancelDate = now.toLocaleDateString('tr-TR');
      const cancelTime = getFormattedTime(now);

      const cancelReceiptData = {
        tableName: order.table_name,
        tableType: order.table_type,
        productName: item.product_name,
        quantity: quantityToCancel,
        price: item.price,
        cancelDate: cancelDate,
        cancelTime: cancelTime,
        categoryName: categoryName
      };

      // Yazıcıya gönderme işlemini arka planda yap (await kullanmadan)
      printCancelReceipt(assignment.printerName, assignment.printerType, cancelReceiptData).catch(error => {
        console.error('İptal fişi yazdırma hatası:', error);
        // Yazdırma hatası olsa bile iptal işlemi zaten tamamlandı
      });

      // İptal edilecek tutarı hesapla (ikram değilse)
      const cancelAmount = item.isGift ? 0 : (item.price * quantityToCancel);

      // Stok iadesi (ikram edilen ürünler hariç)
      // Gece Dönercisi: şube stoklarına iade, diğerleri: normal stok (trackStock açıksa)
      if (!item.isGift) {
        if (isGeceDonercisiApi) {
          const activeBranch =
            req.body?.branch ||
            geceBranchSelection.branch ||
            db.settings?.geceBranch ||
            null;
          const activeDeviceId =
            req.body?.deviceId ||
            geceBranchSelection.deviceId ||
            db.settings?.geceDeviceId ||
            null;
          await increaseGeceBranchStockItems({
            branch: activeBranch,
            deviceId: activeDeviceId,
            items: [{ id: item.product_id, quantity: quantityToCancel, name: item.product_name, isGift: false }],
            source: 'mobile-cancel-table-order-item',
          });
        } else {
          const product = db.products.find(p => p.id === item.product_id);
          if (product && product.trackStock) {
            await increaseProductStock(item.product_id, quantityToCancel);
          }
        }
      }

      // Masa siparişinin toplam tutarını güncelle
      order.total_amount = Math.max(0, order.total_amount - cancelAmount);

      // İptal açıklamasını kaydet
      if (quantityToCancel >= item.quantity) {
        // Tüm ürün iptal ediliyorsa, item'ı silmeden önce açıklamayı kaydet
        item.cancel_reason = cancelReason.trim();
        item.cancel_date = new Date().toISOString();
        // İptal edilmiş item'ı ayrı bir tabloya kaydetmek yerine, silmeden önce loglayabiliriz
        const itemIndex = db.tableOrderItems.findIndex(oi => oi.id === itemId);
        if (itemIndex !== -1) {
          db.tableOrderItems.splice(itemIndex, 1);
        }
      } else {
        // Sadece bir kısmı iptal ediliyorsa, quantity'yi azalt ve açıklamayı kaydet
        item.quantity -= quantityToCancel;
        item.cancel_reason = cancelReason.trim();
        item.cancel_date = new Date().toISOString();
      }

      saveDatabase();

      // Firebase'e iptal kaydı ekle - arka planda
      if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
        const now = new Date();
        const cancelDate = now.toLocaleDateString('tr-TR');
        const cancelTime = getFormattedTime(now);
        
        // Siparişi oluşturan garson bilgisini bul
        const orderStaffName = order.staff_name || item.staff_name || null;
        
        // İptal eden personel bilgisi
        const cancelStaff = staffId ? (db.staff || []).find(s => s.id === staffId) : null;
        const cancelStaffName = cancelStaff ? `${cancelStaff.name} ${cancelStaff.surname}` : null;
        const cancelStaffIsManager = cancelStaff ? (cancelStaff.is_manager || false) : false;
        
        const cancelRef = firebaseCollection(firestore, 'cancels');
        // Firebase kaydetme işlemini arka planda yap (await kullanmadan)
        firebaseAddDoc(cancelRef, {
          item_id: itemId,
          order_id: order.id,
          table_id: order.table_id,
          table_name: order.table_name,
          table_type: order.table_type,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: quantityToCancel,
          price: item.price,
          cancel_reason: cancelReason,
          cancel_date: cancelDate,
          cancel_time: cancelTime,
          staff_id: staffId || null,
          staff_name: cancelStaffName,
          staff_is_manager: cancelStaffIsManager,
          order_staff_name: orderStaffName, // Siparişi oluşturan garson
          source: 'mobile', // 'desktop' veya 'mobile'
          created_at: firebaseServerTimestamp()
        }).then(() => {
          console.log('✅ İptal kaydı Firebase\'e başarıyla kaydedildi');
        }).catch(error => {
          console.error('❌ Firebase\'e iptal kaydı kaydedilemedi:', error);
        });
      }

      // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder
      if (io) {
        io.emit('table-update', {
          tableId: order.table_id,
          hasOrder: order.total_amount > 0
        });
      }

      res.json({ 
        success: true, 
        remainingAmount: order.total_amount
      });
    } catch (error) {
      console.error('Ürün iptal hatası:', error);
      res.status(500).json({ success: false, error: 'Ürün iptal edilirken bir hata oluştu' });
    }
  });

  // Masa siparişlerini getir
  appExpress.get('/api/table-orders', (req, res) => {
    const { tableId } = req.query;
    if (!tableId) {
      return res.status(400).json({ error: 'tableId gerekli' });
    }
    
    const orders = (db.tableOrders || []).filter(
      o => o.table_id === tableId && o.status === 'pending'
    );
    
    // Her sipariş için itemları ekle
    const ordersWithItems = orders.map(order => {
      const items = (db.tableOrderItems || []).filter(
        item => item.order_id === order.id
      );
      return {
        ...order,
        items: items
      };
    });
    
    res.json(ordersWithItems);
  });

  // Tüm masaların mevcut siparişlerini getir
  appExpress.get('/api/all-table-orders', (req, res) => {
    const tenantInfo = tenantManager.getCurrentTenantInfo();
    const tenantId = tenantInfo?.tenantId || null;
    const isSultanSomati = tenantId === 'TENANT-1766611377865';
    const isLacromisaAllOrders = tenantId === 'TENANT-1769956051654';
    
    const orders = (db.tableOrders || []).filter(
      o => o.status === 'pending'
    );
    
    // Sultan Somatı için salon yapısı
    const sultanSomatiSalons = [
      { id: 'disari', name: 'Dışarı', count: 4, icon: '☀️' },
      { id: 'kis-bahcesi', name: 'Kış Bahçesi', count: 14, icon: '🌿' },
      { id: 'osmanli-odasi', name: 'Osmanlı Odası', count: 8, icon: '🏛️' },
      { id: 'selcuklu-odasi', name: 'Selçuklu Odası', count: 10, icon: '🕌' },
      { id: 'mevlevi-odasi', name: 'Mevlevi Odası', count: 1, icon: '🕯️' },
      { id: 'ask-odasi', name: 'Aşk Odası', count: 1, icon: '💕' }
    ];
    
    // Her sipariş için itemları ve masa bilgisini ekle
    const ordersWithItems = orders.map(order => {
      const items = (db.tableOrderItems || []).filter(
        item => item.order_id === order.id
      );
      
      // Masa bilgisini bul - önce sipariş objesindeki table_name'i kullan
      let tableName = order.table_name;
      
      // Eğer sipariş objesinde table_name yoksa, masa ID'sinden oluştur
      if (!tableName && order.table_id) {
        if (isSultanSomati && order.table_id.startsWith('salon-')) {
          // Sultan Somatı için salon ID'sinden masa adını oluştur
          const parts = order.table_id.split('-');
          if (parts.length >= 3) {
            const salonId = parts[1];
            const tableNumber = parseInt(parts[2]);
            const salon = sultanSomatiSalons.find(s => s.id === salonId);
            if (salon) {
              tableName = salon.count === 1 ? salon.name : `${salon.name} ${tableNumber}`;
            } else {
              tableName = `Masa ${tableNumber}`;
            }
          } else {
            tableName = `Masa ${order.table_id}`;
          }
        } else {
          // Normal mod / Lacromisa için masa ID'sinden masa adını oluştur
          if (order.table_id.startsWith('inside-')) {
            const number = order.table_id.replace('inside-', '');
            tableName = isLacromisaAllOrders ? `Salon ${number}` : `İçeri ${number}`;
          } else if (order.table_id.startsWith('outside-')) {
            const number = order.table_id.replace('outside-', '');
            tableName = isLacromisaAllOrders ? `Bahçe ${number}` : `Dışarı ${number}`;
          } else if (order.table_id.startsWith('package-')) {
            const number = order.table_id.replace(/^package-(inside|outside)-/, '');
            tableName = `Paket ${number}`;
          } else {
            // db.tables içinde ara
            const table = (db.tables || []).find(t => t.id === order.table_id);
            if (table) {
              tableName = table.name || `Masa ${table.number || order.table_id}`;
            } else {
              tableName = `Masa ${order.table_id}`;
            }
          }
        }
      }
      
      // Hala table_name yoksa varsayılan değer
      if (!tableName) {
        tableName = order.table_id ? `Masa ${order.table_id}` : 'Bilinmeyen Masa';
      }
      
      return {
        ...order,
        items: items,
        table_name: tableName
      };
    });
    
    res.json(ordersWithItems);
  });

  // Son N saatteki satışları getir
  appExpress.get('/api/recent-sales', (req, res) => {
    const hours = parseInt(req.query.hours) || 3;
    const now = new Date();
    const hoursAgo = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    
    // Satışları ve itemları birleştir
    const salesWithItems = (db.sales || []).map(sale => {
      const saleItems = (db.saleItems || []).filter(si => si.sale_id === sale.id);
      
      // Items string'i (eski format için uyumluluk)
      const items = saleItems
        .map(si => {
          const giftText = si.isGift ? ' (İKRAM)' : '';
          return `${si.product_name} x${si.quantity}${giftText}`;
        })
        .join(', ');
      
      // Items array (gerçek veriler için)
      const itemsArray = saleItems.map(si => ({
        product_id: si.product_id,
        product_name: si.product_name,
        quantity: si.quantity,
        price: si.price,
        isGift: si.isGift || false
      }));
      
      return {
        ...sale,
        items: items || 'Ürün bulunamadı',
        itemsText: items || 'Ürün bulunamadı',
        items_array: itemsArray
      };
    });
    
    // Son N saat içindeki satışları filtrele
    const recentSales = salesWithItems.filter(sale => {
      try {
        // Tarih ve saat bilgisini parse et
        if (!sale.sale_date) return false;
        const [day, month, year] = sale.sale_date.split('.');
        const [hours, minutes, seconds] = (sale.sale_time || '00:00:00').split(':');
        const saleDate = new Date(year, month - 1, day, hours || 0, minutes || 0, seconds || 0);
        
        return saleDate >= hoursAgo;
      } catch (error) {
        return false;
      }
    });
    
    // En yeni satışlar önce
    recentSales.sort((a, b) => {
      try {
        const [dayA, monthA, yearA] = (a.sale_date || '').split('.');
        const [dayB, monthB, yearB] = (b.sale_date || '').split('.');
        const [hoursA, minutesA] = (a.sale_time || '00:00:00').split(':');
        const [hoursB, minutesB] = (b.sale_time || '00:00:00').split(':');
        
        const dateA = new Date(yearA, monthA - 1, dayA, hoursA || 0, minutesA || 0);
        const dateB = new Date(yearB, monthB - 1, dayB, hoursB || 0, minutesB || 0);
        
        return dateB - dateA;
      } catch (error) {
        return 0;
      }
    });
    
    res.json(recentSales);
  });

  // Mobil personel arayüzü için static dosyalar
  appExpress.get('/mobile-manifest.json', (req, res) => {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const baseURL = `${protocol}://${host}`;
    const tenantInfo = tenantManager.getCurrentTenantInfo();
    const isGeceDonercisi = tenantInfo?.tenantId === 'TENANT-1769602125250';
    const isLacromisa = tenantInfo?.tenantId === 'TENANT-1769956051654';
    const iconPath = isGeceDonercisi ? 'tenant.png' : (isLacromisa ? 'lacrimosa.jpg' : 'mobilpersonel.png');
    const iconMime = isLacromisa ? 'image/jpeg' : 'image/png';
    
    const manifest = {
      "name": `${tenantManager.getBusinessName()} Mobil Sipariş`,
      "short_name": `${tenantManager.getBusinessName()} Mobil`,
      "description": `${tenantManager.getBusinessName()} Satış Sistemi - Mobil Personel Arayüzü`,
      "start_url": `${baseURL}/mobile`,
      "display": "standalone",
      "background_color": "#f97316",
      "theme_color": "#f97316",
      "orientation": "portrait",
      "icons": [
        { "src": `${baseURL}/${iconPath}`, "sizes": "512x512", "type": iconMime, "purpose": "any maskable" },
        { "src": `${baseURL}/${iconPath}`, "sizes": "192x192", "type": iconMime, "purpose": "any maskable" }
      ]
    };
    
    res.setHeader('Content-Type', 'application/manifest+json');
    res.json(manifest);
  });
  
  // Mobil personel icon'u - public klasöründen serve et
  appExpress.get('/mobilpersonel.png', (req, res) => {
    const iconPath = path.join(__dirname, '..', 'public', 'mobilpersonel.png');
    if (fs.existsSync(iconPath)) {
      res.setHeader('Content-Type', 'image/png');
      res.sendFile(iconPath);
    } else {
      res.status(404).send('Icon not found');
    }
  });

  // Gece Dönercisi tenant logosu - public/tenant.png
  appExpress.get('/tenant.png', (req, res) => {
    const iconPath = path.join(__dirname, '..', 'public', 'tenant.png');
    if (fs.existsSync(iconPath)) {
      res.setHeader('Content-Type', 'image/png');
      res.sendFile(iconPath);
    } else {
      res.status(404).send('Icon not found');
    }
  });

  // Lacromisa logosu - public/lacrimosa.jpg
  appExpress.get('/lacrimosa.jpg', (req, res) => {
    const iconPath = path.join(__dirname, '..', 'public', 'lacrimosa.jpg');
    if (fs.existsSync(iconPath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.sendFile(iconPath);
    } else {
      res.status(404).send('Logo not found');
    }
  });

  // Müşteri menüsü (Lacrimosa Coffee) - public/menu.html
  appExpress.get('/menu', (req, res) => {
    const menuPath = path.join(__dirname, '..', 'public', 'menu.html');
    if (fs.existsSync(menuPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(menuPath);
    } else {
      res.status(404).send('Menu not found');
    }
  });

  // Müşteri menüsü (İNTERNET / Firebase üzerinden) - public/customer.html
  appExpress.get('/customer', (req, res) => {
    const customerPath = path.join(__dirname, '..', 'public', 'customer.html');
    if (fs.existsSync(customerPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(customerPath);
    } else {
      res.status(404).send('Customer menu not found');
    }
  });

  // Masa bazlı müşteri URL'leri (örn: /iceri1, /disari2)
  // Firebase Hosting'de de aynı şekilde customer.html'e rewrite ediliyor.
  appExpress.get(/^\/(iceri|disari)\d+\/?$/i, (req, res) => {
    const customerPath = path.join(__dirname, '..', 'public', 'customer.html');
    if (fs.existsSync(customerPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(customerPath);
    } else {
      res.status(404).send('Customer menu not found');
    }
  });

  appExpress.get('/mobile', (req, res) => {
    res.send(generateMobileHTML(serverURL));
  });

  // Mesaj gönderme API endpoint'i
  appExpress.post('/api/broadcast-message', async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message || message.trim() === '') {
        return res.status(400).json({ success: false, error: 'Mesaj içeriği gerekli' });
      }

      const now = new Date();
      const messageDate = now.toLocaleDateString('tr-TR');
      const messageTime = getFormattedTime(now);

      // Firebase'e mesaj kaydet
      if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
        try {
          const broadcastsRef = firebaseCollection(firestore, 'broadcasts');
          await firebaseAddDoc(broadcastsRef, {
            message: message.trim(),
            date: messageDate,
            time: messageTime,
            created_at: firebaseServerTimestamp()
          });
          console.log('✅ Mesaj Firebase\'e başarıyla kaydedildi');
        } catch (error) {
          console.error('❌ Firebase\'e mesaj kaydedilemedi:', error);
        }
      }

      // Socket.IO ile tüm clientlara gönder
      if (io) {
        io.emit('broadcast-message', {
          message: message.trim(),
          date: messageDate,
          time: messageTime
        });
        console.log('✅ Mesaj tüm clientlara gönderildi');
      }

      // Desktop uygulamaya da gönder
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('broadcast-message', {
          message: message.trim(),
          date: messageDate,
          time: messageTime
        });
      }

      res.json({ success: true, message: 'Mesaj başarıyla gönderildi' });
    } catch (error) {
      console.error('Mesaj gönderme hatası:', error);
      res.status(500).json({ success: false, error: 'Mesaj gönderilirken bir hata oluştu' });
    }
  });

  appExpress.post('/api/orders', async (req, res) => {
    try {
      const { items, totalAmount, tableId, tableName, tableType, orderNote, staffId, orderSource } = req.body;
      const tenantInfo = tenantManager.getCurrentTenantInfo();
      const isGeceDonercisiTenant = tenantInfo?.tenantId === GECE_TENANT_ID;
      // staff bilgisi (hem yeni sipariş hem mevcut siparişe ekleme için ortak)
      const staff = staffId && db.staff ? db.staff.find(s => s.id === staffId) : null;
      const staffName = staff ? `${staff.name} ${staff.surname}` : null;
      
      // Eğer orderSource gönderilmemişse, tableType'a göre otomatik belirle
      let finalOrderSource = orderSource;
      if (!finalOrderSource && tableType) {
        if (tableType === 'yemeksepeti') {
          finalOrderSource = 'Yemeksepeti';
        } else if (tableType === 'trendyolgo') {
          finalOrderSource = 'Trendyol';
        }
      }
      
      if (isGeceDonercisiTenant) {
        // Gece Dönercisi: mobil siparişlerde stok düşümü şube bazlı (cihazın seçili şubesi)
        const activeBranch =
          (req.body && req.body.branch) ||
          geceBranchSelection.branch ||
          db.settings?.geceBranch ||
          null;
        const activeDeviceId =
          (req.body && req.body.deviceId) ||
          geceBranchSelection.deviceId ||
          db.settings?.geceDeviceId ||
          null;

        if (!isValidGeceBranch(activeBranch)) {
          return res.status(400).json({
            success: false,
            error: 'Şube seçimi zorunludur. Masaüstü cihazda SANCAK/ŞEKER seçiniz.',
          });
        }

        await decreaseGeceBranchStockItems({
          branch: activeBranch,
          deviceId: activeDeviceId,
          items,
          source: 'mobile-orders',
        });
      } else {
        // Diğer tenant'lar: stok kontrolü ve düşürme (sadece stok takibi yapılan ürünler için)
        for (const item of items) {
          if (!item.isGift) {
            const product = db.products.find(p => p.id === item.id);
            // Sadece stok takibi yapılan ürünler için kontrol et
            if (product && product.trackStock) {
              const stockDecreased = await decreaseProductStock(item.id, item.quantity);
              if (!stockDecreased) {
                return res.status(400).json({ 
                  success: false, 
                  error: `${item.name} için yetersiz stok` 
                });
              }
            }
          }
        }
      }
      
      const existingOrder = (db.tableOrders || []).find(
        o => o.table_id === tableId && o.status === 'pending'
      );

      let orderId;
      let isNewOrder = false;

      if (existingOrder) {
        orderId = existingOrder.id;
        // Her sipariş için ayrı kayıt oluştur (aynı ürün olsa bile, farklı personel/saat bilgisiyle)
        // Böylece kategori bazlı yazdırmada her siparişin kendi bilgileri kullanılır
        items.forEach(newItem => {
          const itemId = (db.tableOrderItems || []).length > 0 
            ? Math.max(...db.tableOrderItems.map(oi => oi.id)) + 1 
            : 1;
          if (!db.tableOrderItems) db.tableOrderItems = [];
          const now = new Date();
          const addedDate = now.toLocaleDateString('tr-TR');
          const addedTime = getFormattedTime(now);
          const staff = staffId && db.staff ? db.staff.find(s => s.id === staffId) : null;
          const itemStaffName = staff ? `${staff.name} ${staff.surname}` : null;
          db.tableOrderItems.push({
            id: itemId,
            order_id: orderId,
            product_id: newItem.id,
            product_name: newItem.name,
            quantity: newItem.quantity,
            price: newItem.price,
            originalPrice: newItem.originalPrice || null, // Yaka's Grill için orijinal fiyat (1 porsiyon)
            portion: newItem.portion || null, // Yaka's Grill için porsiyon bilgisi
            onionOption: newItem.onionOption || null, // Yaka's Grill için soğan seçeneği
            extraNote: newItem.extraNote || null,
            donerOptionsText: newItem.donerOptionsText || null,
            donerKey: newItem.donerKey || null,
            isGift: newItem.isGift || false,
            staff_id: staffId || null,
            staff_name: itemStaffName,
            added_date: addedDate,
            added_time: addedTime
          });
        });
        const existingTotal = existingOrder.total_amount || 0;
        existingOrder.total_amount = existingTotal + totalAmount;
        if (orderNote) {
          existingOrder.order_note = existingOrder.order_note 
            ? `${existingOrder.order_note}\n${orderNote}` 
            : orderNote;
        }
        // Mevcut siparişe order_source'u güncelle (eğer yeni siparişte varsa)
        if (finalOrderSource && !existingOrder.order_source) {
          existingOrder.order_source = finalOrderSource;
        }
      } else {
        isNewOrder = true;
        const now = new Date();
        const orderDate = now.toLocaleDateString('tr-TR');
        const orderTime = getFormattedTime(now);
        orderId = (db.tableOrders || []).length > 0 
          ? Math.max(...db.tableOrders.map(o => o.id)) + 1 
          : 1;
        if (!db.tableOrders) db.tableOrders = [];
        db.tableOrders.push({
          id: orderId,
          table_id: tableId,
          table_name: tableName,
          table_type: tableType,
          total_amount: totalAmount,
          order_date: orderDate,
          order_time: orderTime,
          status: 'pending',
          order_note: orderNote || null,
          order_source: finalOrderSource || null, // 'Trendyol', 'Yemeksepeti', or null
          staff_id: staffId || null,
          staff_name: staffName
        });
        items.forEach(item => {
          const itemId = (db.tableOrderItems || []).length > 0 
            ? Math.max(...db.tableOrderItems.map(oi => oi.id)) + 1 
            : 1;
          if (!db.tableOrderItems) db.tableOrderItems = [];
          db.tableOrderItems.push({
            id: itemId,
            order_id: orderId,
            product_id: item.id,
            product_name: item.name,
            quantity: item.quantity,
            price: item.price,
            originalPrice: item.originalPrice || null, // Yaka's Grill için orijinal fiyat (1 porsiyon)
            portion: item.portion || null, // Yaka's Grill için porsiyon bilgisi
            onionOption: item.onionOption || null, // Yaka's Grill için soğan seçeneği
            extraNote: item.extraNote || null,
            donerOptionsText: item.donerOptionsText || null,
            donerKey: item.donerKey || null,
            isGift: item.isGift || false,
            staff_id: staffId || null,
            staff_name: staffName || null,
            added_date: orderDate,
            added_time: orderTime
          });
        });
      }

      saveDatabase();
      const finalTotalAmount = (db.tableOrders || []).find(o => o.id === orderId)?.total_amount || totalAmount;
      
      // Yeni Firebase'e sadece bu masayı kaydet (makaramasalar) - Mobil personel siparişleri için
      // Masaüstü uygulamasıyla aynı şekilde direkt çağır (setTimeout gerekmez çünkü saveDatabase senkron)
      syncSingleTableToFirebase(tableId).catch(err => {
        console.error('❌ Mobil sipariş Firebase kaydetme hatası:', err);
      });
      
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('new-order-created', { 
          orderId, 
          tableId,
          tableName, 
          tableType,
          totalAmount: finalTotalAmount,
          isNewOrder
        });
      }
      
      if (io) {
        io.emit('new-order', {
          orderId,
          tableId,
          tableName,
          tableType,
          totalAmount: finalTotalAmount,
          isNewOrder
        });
        io.emit('table-update', {
          tableId: tableId,
          hasOrder: true
        });
      }

      // Mobil personel arayüzünden gelen siparişler için otomatik adisyon yazdır (kategori bazlı)
      try {
        // Items'a staff_name, added_time ve added_date ekle (tableOrderItems'dan al)
        // Veritabanı zaten kaydedildi, şimdi items'ları bulabiliriz
        // Bu sipariş için az önce eklenen item'ları bul (en yüksek ID'li olanlar - en son eklenenler)
        // Her item için ayrı kayıt oluşturulduğu için, items array'indeki sıra ile tableOrderItems'daki sıra aynı olmalı
        // Ama güvenlik için en son eklenen kaydı bulalım
        const itemsWithStaff = items.map((item, index) => {
          // Mevcut orderId için bu ürünü ekleyen garsonu bul
          // En son eklenen item'ı al (ID'ye göre sırala - en yüksek ID = en son eklenen)
          const matchingItems = db.tableOrderItems.filter(oi => 
            oi.order_id === orderId && 
            oi.product_id === item.id && 
            oi.product_name === item.name &&
            oi.isGift === (item.isGift || false)
          );
          
          // En son eklenen item'ı al (ID'ye göre sırala - büyükten küçüğe)
          let orderItem = null;
          if (matchingItems.length > 0) {
            // ID'ye göre sırala ve en yüksek ID'li olanı al (en son eklenen)
            // Eğer birden fazla kayıt varsa, en son eklenenleri al ve index'e göre seç
            const sortedItems = matchingItems.sort((a, b) => b.id - a.id);
            // Eğer aynı ürün için birden fazla kayıt varsa, index'e göre seç
            // Örneğin: 2 adet çay sipariş edildiyse, 2 ayrı kayıt olacak
            // İlk item için en son eklenen 1. kayıt, ikinci item için en son eklenen 2. kayıt
            orderItem = sortedItems[index] || sortedItems[0];
          }
          
          // Eğer orderItem bulunduysa, onun bilgilerini kullan
          // Bulunamazsa, genel staffName ve şu anki zamanı kullan (fallback)
          const now = new Date();
          const fallbackDate = now.toLocaleDateString('tr-TR');
          const fallbackTime = getFormattedTime(now);
          
          return {
            ...item,
            staff_name: orderItem?.staff_name || staffName || null,
            added_date: orderItem?.added_date || fallbackDate,
            added_time: orderItem?.added_time || fallbackTime
          };
        });
        
        // Adisyon data'sı için, items'lardan personel ve zaman bilgisini al
        // İlk item'ın bilgilerini kullan (tüm items aynı personel ve zamanda eklenmiş olmalı)
        const firstItem = itemsWithStaff[0];
        const adisyonDate = firstItem?.added_date || new Date().toLocaleDateString('tr-TR');
        const adisyonTime = firstItem?.added_time || getFormattedTime(new Date());
        const adisyonStaffName = firstItem?.staff_name || staffName || null;
        
        // Order source bilgisini al (existingOrder'dan veya yeni oluşturulan order'dan)
        const finalOrder = existingOrder || (db.tableOrders || []).find(o => o.id === orderId);
        const finalOrderSource = finalOrder?.order_source || orderSource || null;
        
        const adisyonData = {
          items: itemsWithStaff,
          tableName: tableName,
          tableType: tableType,
          orderNote: orderNote || null,
          orderSource: finalOrderSource, // 'Trendyol', 'Yemeksepeti', or null
          orderId: orderId || null, // Fiş numarası için
          // Items'lardan alınan tarih/saat ve personel bilgisini kullan
          sale_date: adisyonDate,
          sale_time: adisyonTime,
          staff_name: adisyonStaffName
        };
        
        // Kategori bazlı adisyon yazdırma
        printAdisyonByCategory(itemsWithStaff, adisyonData).catch(err => {
          console.error('Mobil sipariş kategori bazlı adisyon yazdırma hatası:', err);
        });
      } catch (error) {
        console.error('Mobil sipariş adisyon yazdırma hatası:', error);
      }

      res.json({ 
        success: true, 
        orderId,
        isNewOrder,
        message: isNewOrder ? 'Yeni sipariş oluşturuldu' : 'Mevcut siparişe eklendi'
      });
    } catch (error) {
      console.error('Sipariş oluşturma hatası:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  server.listen(serverPort, () => {
    console.log(`\n🚀 API Server başlatıldı: ${serverURL}`);
    console.log(`📱 Mobil cihazlardan erişim için: ${serverURL}/mobile\n`);
  });

  apiServer = server;
  return { serverURL, localIP };
}

ipcMain.handle('quit-app', () => {
  saveDatabase();
  if (apiServer) {
    apiServer.close();
  }
  setTimeout(() => {
    app.quit();
  }, 500);
  return { success: true };
});

// Minimize window handler
ipcMain.handle('enter-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(true);
    mainWindow.setKiosk(true);
    mainWindow.setResizable(false);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
  return { success: true };
});

// Mobil API IPC Handlers
ipcMain.handle('get-server-url', () => {
  if (!apiServer) {
    return { success: false, error: 'Server başlatılmadı' };
  }
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }
  const serverURL = `http://${localIP}:${serverPort}`;
  return { success: true, url: serverURL, ip: localIP, port: serverPort };
});

ipcMain.handle('generate-qr-code', async () => {
  try {
    const interfaces = os.networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }
    const serverURL = `http://${localIP}:${serverPort}/mobile`;
    const qrCodeDataURL = await QRCode.toDataURL(serverURL, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return { success: true, qrCode: qrCodeDataURL, url: serverURL };
  } catch (error) {
    console.error('QR kod oluşturma hatası:', error);
    return { success: false, error: error.message };
  }
});

// Staff Management IPC Handlers
ipcMain.handle('create-staff', (event, staffData) => {
  const { name, surname, password } = staffData;
  if (!name || !surname || !password) {
    return { success: false, error: 'Tüm alanları doldurun' };
  }
  if (!db.staff) db.staff = [];
  const newId = db.staff.length > 0 
    ? Math.max(...db.staff.map(s => s.id)) + 1 
    : 1;
  const newStaff = {
    id: newId,
    name: name.trim(),
    surname: surname.trim(),
    password: password.toString(),
    is_manager: false // Varsayılan olarak müdür değil
  };
  db.staff.push(newStaff);
  saveDatabase();
  return { success: true, staff: newStaff };
});

ipcMain.handle('delete-staff', (event, staffId) => {
  if (!db.staff) db.staff = [];
  const index = db.staff.findIndex(s => s.id === staffId);
  if (index === -1) {
    return { success: false, error: 'Personel bulunamadı' };
  }
  const deletedStaff = db.staff[index];
  db.staff.splice(index, 1);
  saveDatabase();
  
  // Mobil personel arayüzüne personel silme event'i gönder
  if (io) {
    io.emit('staff-deleted', {
      staffId: staffId,
      message: 'Hesabınız silindi. Lütfen tekrar giriş yapın.'
    });
  }
  
  return { success: true };
});

ipcMain.handle('update-staff-password', (event, staffId, newPassword) => {
  try {
    console.log('🔐 Şifre güncelleme isteği:', { staffId, newPasswordLength: newPassword?.length });
    
    if (!staffId) {
      console.error('❌ Personel ID eksik');
      return { success: false, error: 'Personel ID gerekli' };
    }
    
    if (!newPassword || newPassword.toString().trim() === '') {
      console.error('❌ Yeni şifre eksik veya boş');
      return { success: false, error: 'Yeni şifre gerekli' };
    }

    if (!db.staff) {
      console.error('❌ db.staff dizisi mevcut değil, oluşturuluyor...');
      db.staff = [];
      saveDatabase();
    }

    // ID'yi sayıya çevir (string olarak gelmiş olabilir)
    const staffIdNum = typeof staffId === 'string' ? parseInt(staffId) : staffId;
    
    const staff = db.staff.find(s => {
      const sId = typeof s.id === 'string' ? parseInt(s.id) : s.id;
      return sId === staffIdNum;
    });
    
    if (!staff) {
      console.error('❌ Personel bulunamadı. Mevcut personeller:', db.staff.map(s => ({ id: s.id, name: s.name })));
      return { success: false, error: `Personel bulunamadı (ID: ${staffId})` };
    }

    console.log('✅ Personel bulundu:', { id: staff.id, name: staff.name, surname: staff.surname });

    // Şifreyi güncelle
    staff.password = newPassword.toString();
    saveDatabase();

    console.log('✅ Şifre güncellendi ve veritabanına kaydedildi');

    // Mobil personel arayüzüne gerçek zamanlı güncelleme gönder
    if (io) {
      io.emit('staff-password-updated', {
        staffId: staffIdNum,
        message: 'Şifreniz güncellendi'
      });
      console.log('📡 Mobil arayüze bildirim gönderildi');
    }

    return { success: true, staff: { id: staff.id, name: staff.name, surname: staff.surname } };
  } catch (error) {
    console.error('❌ Şifre güncelleme hatası:', error);
    return { success: false, error: error.message || 'Şifre güncellenirken bir hata oluştu' };
  }
});

ipcMain.handle('get-staff', () => {
  if (!db.staff) db.staff = [];
  return db.staff.map(s => ({
    id: s.id,
    name: s.name,
    surname: s.surname,
    is_manager: s.is_manager || false
  }));
});

// Müdür atama/kaldırma
ipcMain.handle('set-staff-manager', (event, staffId, isManager) => {
  if (!db.staff) db.staff = [];
  const staff = db.staff.find(s => s.id === staffId);
  if (!staff) {
    return { success: false, error: 'Personel bulunamadı' };
  }
  
  // Eğer müdür yapılıyorsa, diğer tüm personellerin müdürlüğünü kaldır
  if (isManager) {
    db.staff.forEach(s => {
      if (s.id !== staffId) {
        s.is_manager = false;
      }
    });
  }
  
  staff.is_manager = isManager;
  saveDatabase();
  return { success: true, staff: staff };
});

ipcMain.handle('verify-staff-pin', (event, password) => {
  if (!db.staff) db.staff = [];
  const staff = db.staff.find(s => s.password === password.toString());
  if (staff) {
    return { success: true, staff: { id: staff.id, name: staff.name, surname: staff.surname } };
  }
  return { success: false, error: 'Şifre hatalı' };
});

// Staff Account Management IPC Handlers
ipcMain.handle('get-staff-accounts', (event) => {
  if (!db.staff) db.staff = [];
  if (!db.staffAccounts) db.staffAccounts = [];
  
  // Her personel için hesap oluştur (yoksa)
  const accounts = db.staff.map(staff => {
    const existingAccount = db.staffAccounts.find(acc => acc.staffId === staff.id);
    if (existingAccount) {
      // Bakiyeyi transaction'lardan hesapla (her zaman transaction'lardan hesapla, güvenilir)
      const balance = (existingAccount.transactions || []).reduce((sum, t) => {
        const tAmount = parseFloat(t.amount) || 0;
        return sum + tAmount;
      }, 0);
      
      // Debug log
      console.log(`💰 ${staff.name} ${staff.surname} - Transaction sayısı: ${(existingAccount.transactions || []).length}, Bakiye: ${balance}`);
      
      // Account'taki balance'ı da güncelle (senkronizasyon için)
      existingAccount.balance = balance;
      
      return {
        staffId: staff.id,
        staffName: `${staff.name} ${staff.surname}`,
        balance: balance,
        transactions: existingAccount.transactions || []
      };
    } else {
      // Yeni hesap oluştur
      const newAccount = {
        staffId: staff.id,
        staffName: `${staff.name} ${staff.surname}`,
        balance: 0,
        transactions: []
      };
      db.staffAccounts.push(newAccount);
      saveDatabase();
      return newAccount;
    }
  });
  
  // Database'i kaydet (balance güncellemeleri için)
  saveDatabase();
  
  return accounts;
});

ipcMain.handle('add-staff-account-transaction', (event, transactionData) => {
  if (!db.staffAccounts) db.staffAccounts = [];
  
  const { staffId, amount, type, date } = transactionData;
  
  // Debug: Gelen veriyi logla
  console.log('💰 Transaction ekleniyor:', { staffId, amount, type, date });
  
  // Personel hesabını bul veya oluştur
  let account = db.staffAccounts.find(acc => acc.staffId === staffId);
  if (!account) {
    const staff = db.staff.find(s => s.id === staffId);
    if (!staff) {
      return { success: false, error: 'Personel bulunamadı' };
    }
    account = {
      staffId: staffId,
      staffName: `${staff.name} ${staff.surname}`,
      balance: 0,
      transactions: []
    };
    db.staffAccounts.push(account);
  }
  
  // Eski bakiyeyi logla
  const oldBalance = account.balance;
  console.log('💰 Eski bakiye:', oldBalance);
  console.log('💰 Mevcut transaction sayısı:', account.transactions.length);
  
  // Transaction ekle - amount'u sayısal olarak kaydet
  const transactionAmount = parseFloat(amount) || 0;
  const transaction = {
    id: account.transactions.length > 0 
      ? Math.max(...account.transactions.map(t => t.id || 0)) + 1 
      : 1,
    staffId: staffId,
    amount: transactionAmount, // Sayısal olarak kaydet (alacak: +, verecek: -)
    type: type,
    date: date || new Date().toISOString()
  };
  
  account.transactions.push(transaction);
  
  // Bakiyeyi transaction'lardan yeniden hesapla (her zaman transaction'lardan hesapla, güvenilir)
  account.balance = account.transactions.reduce((sum, t) => {
    const tAmount = typeof t.amount === 'number' ? t.amount : parseFloat(t.amount) || 0;
    console.log(`💰 Transaction ${t.id}: amount=${tAmount} (type: ${typeof tAmount}), type=${t.type}`);
    return sum + tAmount;
  }, 0);
  
  console.log('💰 Yeni bakiye:', account.balance);
  console.log('💰 Toplam transaction sayısı:', account.transactions.length);
  
  saveDatabase();
  
  return { 
    success: true, 
    account: {
      staffId: account.staffId,
      staffName: account.staffName,
      balance: account.balance,
      transactions: account.transactions
    }
  };
});

// Staff Account Sıfırlama
ipcMain.handle('reset-staff-account', (event, staffId) => {
  if (!db.staffAccounts) db.staffAccounts = [];
  
  const account = db.staffAccounts.find(acc => acc.staffId === staffId);
  if (!account) {
    return { success: false, error: 'Personel hesabı bulunamadı' };
  }
  
  // Tüm transaction'ları sil
  account.transactions = [];
  account.balance = 0;
  
  console.log(`💰 ${account.staffName} için hesap sıfırlandı`);
  
  saveDatabase();
  
  return { 
    success: true, 
    account: {
      staffId: account.staffId,
      staffName: account.staffName,
      balance: 0,
      transactions: []
    }
  };
});

// Mesaj gönderme IPC handler
ipcMain.handle('send-broadcast-message', async (event, message) => {
  if (!message || message.trim() === '') {
    return { success: false, error: 'Mesaj içeriği gerekli' };
  }

  const now = new Date();
  const messageDate = now.toLocaleDateString('tr-TR');
  const messageTime = getFormattedTime(now);

  // Firebase'e mesaj kaydet
  if (firestore && firebaseCollection && firebaseAddDoc && firebaseServerTimestamp) {
    try {
      const broadcastsRef = firebaseCollection(firestore, 'broadcasts');
      await firebaseAddDoc(broadcastsRef, {
        message: message.trim(),
        date: messageDate,
        time: messageTime,
        created_at: firebaseServerTimestamp()
      });
      console.log('✅ Mesaj Firebase\'e başarıyla kaydedildi');
    } catch (error) {
      console.error('❌ Firebase\'e mesaj kaydedilemedi:', error);
    }
  }

  // Socket.IO ile tüm clientlara gönder
  if (io) {
    io.emit('broadcast-message', {
      message: message.trim(),
      date: messageDate,
      time: messageTime
    });
    console.log('✅ Mesaj tüm clientlara gönderildi');
  }

  // Desktop uygulamaya da gönder
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('broadcast-message', {
      message: message.trim(),
      date: messageDate,
      time: messageTime
    });
  }

  return { success: true, message: 'Mesaj başarıyla gönderildi' };
});

// Broadcast mesajını okundu olarak işaretle
ipcMain.handle('mark-broadcast-read', async (event, messageId) => {
  if (!messageId) {
    return { success: false, error: 'Mesaj ID gerekli' };
  }

  const tenantInfo = tenantManager.getCurrentTenantInfo();
  const tenantId = tenantInfo?.tenantId;

  if (!tenantId) {
    return { success: false, error: 'Tenant ID bulunamadı' };
  }

  if (!firestore || !firebaseCollection || !firebaseAddDoc || !firebaseServerTimestamp || !firebaseGetDocs) {
    return { success: false, error: 'Firebase başlatılamadı' };
  }

  try {
    const readsRef = firebaseCollection(firestore, 'broadcast_reads');
    
    // Önce bu mesaj zaten okunmuş mu kontrol et
    const readsSnapshot = await firebaseGetDocs(readsRef);
    const alreadyRead = readsSnapshot.docs.some(doc => {
      const readData = doc.data();
      return readData.messageId === messageId && readData.tenantId === tenantId;
    });
    
    if (alreadyRead) {
      console.log(`✅ Mesaj zaten okunmuş: ${messageId} (Tenant: ${tenantId})`);
      return { success: true, alreadyRead: true };
    }
    
    await firebaseAddDoc(readsRef, {
      messageId: messageId,
      tenantId: tenantId,
      readAt: firebaseServerTimestamp()
    });
    
    console.log(`✅ Broadcast mesajı okundu olarak işaretlendi: ${messageId} (Tenant: ${tenantId})`);
    return { success: true };
  } catch (error) {
    console.error('❌ Broadcast okunma işaretleme hatası:', error);
    return { success: false, error: error.message };
  }
});

// Tek bir masayı yeni Firebase'e kaydet (makaramasalar) - sadece sipariş değişikliklerinde çağrılır
async function syncSingleTableToFirebase(tableId) {
  if (!tablesFirestore || !tablesFirebaseCollection || !tablesFirebaseDoc || !tablesFirebaseSetDoc) {
    console.warn('⚠️ Masalar Firebase başlatılamadı, masa kaydedilemedi');
    return;
  }

  try {
    const tableOrders = db.tableOrders || [];
    const tableOrderItems = db.tableOrderItems || [];

    console.log(`🔍 Masa Firebase'e kaydediliyor: ${tableId}`);
    console.log(`📊 Toplam sipariş sayısı: ${tableOrders.length}`);
    console.log(`📦 Toplam item sayısı: ${tableOrderItems.length}`);

    // Masa bilgilerini bul
    const order = tableOrders.find(o => o.table_id === tableId && o.status === 'pending');
    
    if (!order) {
      console.log(`⚠️ Masa için aktif sipariş bulunamadı: ${tableId} - Boş masa olarak kaydedilecek`);
    } else {
      console.log(`✅ Aktif sipariş bulundu: Order ID: ${order.id}, Tutar: ${order.total_amount}`);
    }
    
    // Masa numarasını çıkar
    let tableNumber = 0;
    let tableName = '';
    let tableType = 'inside';
    
    const isLacromisaActiveOrder = tenantManager.getCurrentTenantInfo()?.tenantId === LACRIMOSA_TENANT_ID;
    if (tableId.startsWith('inside-')) {
      tableNumber = parseInt(tableId.replace('inside-', '')) || 0;
      tableName = isLacromisaActiveOrder ? `Salon ${tableNumber}` : `İçeri ${tableNumber}`;
      tableType = 'inside';
    } else if (tableId.startsWith('outside-')) {
      tableNumber = parseInt(tableId.replace('outside-', '')) || 0;
      tableName = isLacromisaActiveOrder ? `Bahçe ${tableNumber}` : `Dışarı ${tableNumber}`;
      tableType = 'outside';
    } else if (tableId.startsWith('package-inside-')) {
      tableNumber = parseInt(tableId.replace('package-inside-', '')) || 0;
      tableName = `Paket ${tableNumber}`;
      tableType = 'inside';
    } else if (tableId.startsWith('package-outside-')) {
      tableNumber = parseInt(tableId.replace('package-outside-', '')) || 0;
      tableName = `Paket ${tableNumber}`;
      tableType = 'outside';
    }

    const isOccupied = !!order;
    let totalAmount = 0;
    let items = [];
    let orderId = null;
    let orderDate = null;
    let orderTime = null;
    let orderNote = null;

    if (order) {
      orderId = order.id;
      totalAmount = parseFloat(order.total_amount) || 0;
      orderDate = order.order_date || null;
      orderTime = order.order_time || null;
      orderNote = order.order_note || null;
      tableName = order.table_name || tableName;
      tableType = order.table_type || tableType;

      // Sipariş itemlarını al
      const orderItems = tableOrderItems.filter(oi => oi.order_id === order.id);
      items = orderItems.map(item => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        price: parseFloat(item.price) || 0,
        isGift: item.isGift || false,
        is_paid: item.is_paid || false,
        paid_quantity: item.paid_quantity || 0,
        staff_name: item.staff_name || null,
        added_date: item.added_date || null,
        added_time: item.added_time || null,
        portion: item.portion != null ? item.portion : null,
        onionOption: item.onionOption || null,
        extraNote: item.extraNote || null,
        donerOptionsText: item.donerOptionsText || null,
        donerKey: item.donerKey || null
      }));
    }

    const tenantInfo = tenantManager.getCurrentTenantInfo();
    const isGeceDonercisiTenant = tenantInfo?.tenantId === GECE_TENANT_ID;
    const geceBranch = isGeceDonercisiTenant ? (geceBranchSelection?.branch || db.settings?.geceBranch) : null;

    const tableData = {
      table_id: tableId,
      table_number: tableNumber,
      table_name: tableName,
      table_type: tableType,
      is_occupied: isOccupied,
      total_amount: totalAmount,
      order_id: orderId,
      order_date: orderDate,
      order_time: orderTime,
      order_note: orderNote,
      items: items,
      last_updated: new Date().toISOString()
    };
    if (isGeceDonercisiTenant && geceBranch) {
      tableData.branch = geceBranch;
    }

    // Gece Dönercisi: Şeker/Sancak seçili cihaz kendi şubesine yazar (doc id: SEKER_salon-4, SANCAK_salon-4)
    let firestoreDocId = tableId;
    if (isGeceDonercisiTenant && (geceBranch === 'SEKER' || geceBranch === 'SANCAK')) {
      firestoreDocId = `${geceBranch}_${tableId}`;
    }

    const tableRef = tablesFirebaseDoc(tablesFirestore, 'tables', firestoreDocId);
    await tablesFirebaseSetDoc(tableRef, tableData, { merge: true });

    console.log(`✅ Masa yeni Firebase'e kaydedildi: ${tableName} (${firestoreDocId})`);
    console.log(`📋 Kaydedilen veri: Dolu: ${isOccupied}, Tutar: ${totalAmount}, Item sayısı: ${items.length}`);
  } catch (error) {
    console.error(`❌ Masa yeni Firebase'e kaydedilemedi (${tableId}):`, error);
    console.error(`❌ Hata detayı:`, error.message);
    console.error(`❌ Stack trace:`, error.stack);
  }
}

