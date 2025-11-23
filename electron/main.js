const { app, BrowserWindow, ipcMain, Menu, dialog, webContents } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow;
let dbPath;
let db = {
  categories: [],
  products: [],
  sales: [],
  saleItems: [],
  tableOrders: [],
  tableOrderItems: [],
  settings: {
    adminPin: '1234'
  }
};

function initDatabase() {
  dbPath = path.join(app.getPath('userData'), 'makara-db.json');
  
  // Veritabanını yükle veya yeni oluştur
  if (fs.existsSync(dbPath)) {
    try {
      const data = fs.readFileSync(dbPath, 'utf8');
      db = JSON.parse(data);
      
      // Eğer settings objesi yoksa ekle
      if (!db.settings) {
        db.settings = { adminPin: '1234' };
        saveDatabase();
      }
      
      // Eksik diğer alanları kontrol et
      if (!db.categories) db.categories = [];
      if (!db.products) db.products = [];
      if (!db.sales) db.sales = [];
      if (!db.saleItems) db.saleItems = [];
      if (!db.tableOrders) db.tableOrders = [];
      if (!db.tableOrderItems) db.tableOrderItems = [];
    } catch (error) {
      console.error('Veritabanı yüklenemedi, yeni oluşturuluyor:', error);
      initDefaultData();
    }
  } else {
    initDefaultData();
  }
}

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
  db.settings = {
    adminPin: '1234'
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

function createWindow() {
  // Menü çubuğunu kaldır
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: true // DevTools'u etkinleştir
    },
    frame: false,
    title: 'MAKARA POS',
    backgroundColor: '#f0f4ff',
    autoHideMenuBar: true, // Menü çubuğunu gizle
    fullscreen: true, // Tam ekran modu
    kiosk: true // Kiosk modu - görev çubuğu ve diğer Windows öğelerini gizler
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

// IPC Handlers
ipcMain.handle('get-categories', () => {
  return db.categories.sort((a, b) => a.order_index - b.order_index);
});

ipcMain.handle('get-products', (event, categoryId) => {
  if (categoryId) {
    return db.products.filter(p => p.category_id === categoryId);
  }
  return db.products;
});

ipcMain.handle('create-sale', (event, saleData) => {
  const { items, totalAmount, paymentMethod } = saleData;
  
  const now = new Date();
  const saleDate = now.toLocaleDateString('tr-TR');
  const saleTime = now.toLocaleTimeString('tr-TR');

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
    sale_time: saleTime
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
      price: item.price
    });
  });

  saveDatabase();
  return { success: true, saleId };
});

ipcMain.handle('get-sales', () => {
  // Satışları ve itemları birleştir
  const salesWithItems = db.sales.map(sale => {
    const items = db.saleItems
      .filter(si => si.sale_id === sale.id)
      .map(si => `${si.product_name} x${si.quantity}`)
      .join(', ');
    
    return {
      ...sale,
      items: items || 'Ürün bulunamadı'
    };
  });
  
  // En yeni satışlar önce
  return salesWithItems.sort((a, b) => b.id - a.id).slice(0, 100);
});

ipcMain.handle('get-sale-details', (event, saleId) => {
  const sale = db.sales.find(s => s.id === saleId);
  const items = db.saleItems.filter(si => si.sale_id === saleId);
  
  return { sale, items };
});

// Table Order IPC Handlers
ipcMain.handle('create-table-order', (event, orderData) => {
  const { items, totalAmount, tableId, tableName, tableType } = orderData;
  
  const now = new Date();
  const orderDate = now.toLocaleDateString('tr-TR');
  const orderTime = now.toLocaleTimeString('tr-TR');

  // Yeni sipariş ID'si
  const orderId = db.tableOrders.length > 0 
    ? Math.max(...db.tableOrders.map(o => o.id)) + 1 
    : 1;

  // Sipariş ekle
  db.tableOrders.push({
    id: orderId,
    table_id: tableId,
    table_name: tableName,
    table_type: tableType,
    total_amount: totalAmount,
    order_date: orderDate,
    order_time: orderTime,
    status: 'pending' // 'pending', 'completed', 'cancelled'
  });

  // Sipariş itemlarını ekle
  items.forEach(item => {
    const itemId = db.tableOrderItems.length > 0 
      ? Math.max(...db.tableOrderItems.map(oi => oi.id)) + 1 
      : 1;
      
    db.tableOrderItems.push({
      id: itemId,
      order_id: orderId,
      product_id: item.id,
      product_name: item.name,
      quantity: item.quantity,
      price: item.price
    });
  });

  saveDatabase();
  return { success: true, orderId };
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

ipcMain.handle('complete-table-order', (event, orderId) => {
  const order = db.tableOrders.find(o => o.id === orderId);
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı' };
  }

  if (order.status !== 'pending') {
    return { success: false, error: 'Bu sipariş zaten tamamlanmış veya iptal edilmiş' };
  }

  // Sipariş durumunu tamamlandı olarak işaretle
  order.status = 'completed';

  // Satış geçmişine ekle (nakit olarak)
  const now = new Date();
  const saleDate = now.toLocaleDateString('tr-TR');
  const saleTime = now.toLocaleTimeString('tr-TR');

  // Yeni satış ID'si
  const saleId = db.sales.length > 0 
    ? Math.max(...db.sales.map(s => s.id)) + 1 
    : 1;

  // Satış ekle
  db.sales.push({
    id: saleId,
    total_amount: order.total_amount,
    payment_method: 'Nakit',
    sale_date: saleDate,
    sale_time: saleTime,
    table_name: order.table_name,
    table_type: order.table_type
  });

  // Satış itemlarını ekle
  const orderItems = db.tableOrderItems.filter(oi => oi.order_id === orderId);
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
      price: item.price
    });
  });

  saveDatabase();
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
  }

  saveDatabase();
  return { success: true, remainingAmount: order.total_amount };
});

// Kısmi ödeme için satış kaydı oluştur
ipcMain.handle('create-partial-payment-sale', async (event, saleData) => {
  const now = new Date();
  const saleDate = now.toLocaleDateString('tr-TR');
  const saleTime = now.toLocaleTimeString('tr-TR');

  // Yeni satış ID'si
  const saleId = db.sales.length > 0 
    ? Math.max(...db.sales.map(s => s.id)) + 1 
    : 1;

  // Satış ekle
  db.sales.push({
    id: saleId,
    total_amount: saleData.totalAmount,
    payment_method: saleData.paymentMethod,
    sale_date: saleDate,
    sale_time: saleTime,
    table_name: saleData.tableName,
    table_type: saleData.tableType
  });

  // Satış itemlarını ekle (kısmi ödeme için tüm ürünleri göster, sadece ödeme yöntemi farklı)
  const orderItems = db.tableOrderItems.filter(oi => oi.order_id === saleData.orderId);
  
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
      price: item.price
    });
  });

  saveDatabase();
  return { success: true, saleId };
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
  return { success: true, product: newProduct };
});

ipcMain.handle('update-product', (event, productData) => {
  const { id, name, category_id, price, image } = productData;
  
  const productIndex = db.products.findIndex(p => p.id === id);
  if (productIndex === -1) {
    return { success: false, error: 'Ürün bulunamadı' };
  }
  
  db.products[productIndex] = {
    ...db.products[productIndex],
    name,
    category_id,
    price: parseFloat(price),
    image: image || null
  };
  
  saveDatabase();
  return { success: true, product: db.products[productIndex] };
});

ipcMain.handle('delete-product', (event, productId) => {
  const productIndex = db.products.findIndex(p => p.id === productId);
  if (productIndex === -1) {
    return { success: false, error: 'Ürün bulunamadı' };
  }
  
  // Check if product is used in any sale
  const isUsedInSale = db.saleItems.some(si => si.product_id === productId);
  if (isUsedInSale) {
    return { success: false, error: 'Bu ürün satış geçmişinde kullanıldığı için silinemez' };
  }
  
  db.products.splice(productIndex, 1);
  saveDatabase();
  return { success: true };
});

// File selection handler
ipcMain.handle('select-image-file', async (event) => {
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

    // Dosyayı public klasörüne kopyala
    const publicDir = path.join(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const fileName = path.basename(filePath);
    const destPath = path.join(publicDir, fileName);
    
    // Eğer aynı isimde dosya varsa, benzersiz isim oluştur
    let finalDestPath = destPath;
    let counter = 1;
    while (fs.existsSync(finalDestPath)) {
      const ext = path.extname(fileName);
      const nameWithoutExt = path.basename(fileName, ext);
      finalDestPath = path.join(publicDir, `${nameWithoutExt}_${counter}${ext}`);
      counter++;
    }

    fs.copyFileSync(filePath, finalDestPath);
    
    // Public klasöründeki dosya için relative path döndür
    const relativePath = `/${path.basename(finalDestPath)}`;
    
    return { success: true, path: relativePath };
  } catch (error) {
    console.error('Dosya seçme hatası:', error);
    return { success: false, error: error.message };
  }
});

// Auto Updater Configuration
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

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
    repo: 'Makara-APP'
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
  const msg = `Yeni güncelleme mevcut: ${info.version}`;
  writeLog(msg);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  const currentVersion = app.getVersion();
  const msg = `Güncelleme yok - Mevcut versiyon: ${currentVersion}, En son sürüm: ${info.version || currentVersion}`;
  writeLog(msg);
  console.log('✅ En güncel versiyonu kullanıyorsunuz:', currentVersion);
});

autoUpdater.on('error', (err) => {
  const msg = `Güncelleme hatası: ${err.message || err}`;
  writeLog(msg);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Güncelleme indirildi:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

// IPC Handlers for update
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return { available: false, message: 'Development modunda güncelleme kontrol edilemez' };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
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
  let printWindow = null;
  
  try {
    console.log('print-receipt handler çağrıldı');
    console.log('receiptData:', receiptData);
    
    if (!mainWindow) {
      console.error('Ana pencere bulunamadı');
      return { success: false, error: 'Ana pencere bulunamadı' };
    }

    // Varsayılan yazıcı otomatik olarak kullanılacak (deviceName belirtilmediğinde)
    console.log('Varsayılan yazıcıya yazdırma yapılacak');

    // Fiş içeriğini HTML olarak oluştur
    const receiptHTML = generateReceiptHTML(receiptData);
    console.log('Fiş HTML içeriği oluşturuldu');

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
        
        // Varsayılan yazıcıya yazdır (deviceName belirtilmediğinde otomatik varsayılan kullanılır)
        const printOptions = {
          silent: true, // Dialog gösterme, direkt varsayılan yazıcıya yazdır
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
          // deviceName belirtilmedi - varsayılan yazıcı otomatik kullanılacak
        };

        printWindow.webContents.print(printOptions, (success, errorType) => {
          console.log('Yazdırma callback çağrıldı - success:', success, 'errorType:', errorType);
          
          if (!success) {
            console.error('Yazdırma hatası:', errorType);
            console.error('Hata tipi:', errorType);
            printReject(new Error(errorType || 'Yazdırma başarısız'));
          } else {
            console.log('✓ Fiş başarıyla yazdırıldı');
            printResolve(true);
          }
          
          // Yazdırma işlemi tamamlandıktan sonra pencereyi kapat
          setTimeout(() => {
            console.log('Yazdırma penceresi kapatılıyor...');
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

    console.log('print-receipt handler başarıyla tamamlandı');
    return { success: true };
  } catch (error) {
    console.error('Fiş yazdırma hatası:', error);
    console.error('Hata detayı:', error.stack);
    
    // Hata durumunda pencereyi temizle
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.close();
    }
    
    return { success: false, error: error.message };
  }
});

// Fiş HTML içeriğini oluştur
function generateReceiptHTML(receiptData) {
  const itemsHTML = receiptData.items.map(item => {
    const itemTotal = item.price * item.quantity;
    return `
      <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #ccc;">
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-style: italic; margin-bottom: 4px; font-family: 'Montserrat', sans-serif;">
          <span>${item.name}</span>
          <span>₺${itemTotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #000; font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">
          <span>${item.quantity} adet × ₺${item.price.toFixed(2)}</span>
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
        <h3>MAKARA</h3>
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
          <span style="font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">${receiptData.sale_time || new Date().toLocaleTimeString('tr-TR')}</span>
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

      <div class="total">
        <div>
          <span>TOPLAM:</span>
          <span>₺${receiptData.totalAmount.toFixed(2)}</span>
        </div>
        <div style="font-size: 11px; color: #000; font-weight: 900; font-style: italic; font-family: 'Montserrat', sans-serif;">
          <span>Ödeme:</span>
          <span>${receiptData.paymentMethod || 'Nakit'}</span>
        </div>
      </div>

      <div class="footer">
        <p style="margin: 8px 0; font-weight: 900; font-style: italic; color: #000; font-size: 12px; font-family: 'Montserrat', sans-serif;">Teşekkür ederiz!</p>
        <p style="margin: 8px 0; font-weight: 900; font-style: italic; color: #000; font-size: 12px; font-family: 'Montserrat', sans-serif;">İyi günler dileriz</p>
      </div>
    </body>
    </html>
  `;
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();

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
ipcMain.handle('quit-app', () => {
  saveDatabase();
  setTimeout(() => {
    app.quit();
  }, 500);
  return { success: true };
});

