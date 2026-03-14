// IndexedDB ile görsel cache yönetimi
let imageCache = {};
let dbInstance = null;
const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 gün
const CACHE_MAX_SIZE = 2000; // Maksimum 2000 resim

// IndexedDB başlatma
export async function initImageCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('makaraDesktopImageCache', 2); // Version 2'ye yükselt
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      dbInstance = request.result;
      
      // Eski cache'leri temizle (30 günden eski olanları sil)
      cleanOldCache().then(() => {
        // Tüm cache'lenmiş resimleri yükle
        const transaction = dbInstance.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = async () => {
          let loadedCount = 0;
          for (const item of getAllRequest.result) {
            if (item.blob) {
              const blobUrl = URL.createObjectURL(item.blob);
              imageCache[item.url] = blobUrl;
              loadedCount++;
            }
          }
          console.log(`✅ ${loadedCount} görsel cache'den yüklendi`);
          resolve();
        };
        
        getAllRequest.onerror = () => reject(getAllRequest.error);
      });
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('images')) {
        const store = db.createObjectStore('images', { keyPath: 'url' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Eski cache'leri temizle
async function cleanOldCache() {
  if (!dbInstance) return;
  
  try {
    const transaction = dbInstance.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    const index = store.index('timestamp');
    const getAllRequest = index.getAll();
    
    return new Promise((resolve) => {
      getAllRequest.onsuccess = () => {
        const now = Date.now();
        let deletedCount = 0;
        let totalCount = getAllRequest.result.length;
        
        // 30 günden eski olanları sil
        for (const item of getAllRequest.result) {
          if (item.timestamp && (now - item.timestamp) > CACHE_MAX_AGE) {
            store.delete(item.url);
            deletedCount++;
          }
        }
        
        // Eğer cache çok büyükse, en eski olanları sil
        if (totalCount - deletedCount > CACHE_MAX_SIZE) {
          const sorted = getAllRequest.result
            .filter(item => !item.timestamp || (now - item.timestamp) <= CACHE_MAX_AGE)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          
          const toDelete = sorted.slice(0, totalCount - deletedCount - CACHE_MAX_SIZE);
          for (const item of toDelete) {
            store.delete(item.url);
            deletedCount++;
          }
        }
        
        if (deletedCount > 0) {
          console.log(`🧹 ${deletedCount} eski görsel cache'den temizlendi`);
        }
        resolve();
      };
      
      getAllRequest.onerror = () => resolve(); // Hata olsa bile devam et
    });
  } catch (error) {
    console.error('Cache temizleme hatası:', error);
  }
}

// Resmi cache'le ve blob URL oluştur
export async function getCachedImage(imageUrl) {
  if (!imageUrl) return null;
  
  // Base64 (data URL) ise direkt dön - Firebase'den gelen inline görseller
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }
  
  // Zaten memory cache'de varsa direkt dön
  if (imageCache[imageUrl]) {
    return imageCache[imageUrl];
  }
  
  // IndexedDB'den kontrol et
  if (dbInstance) {
    try {
      const transaction = dbInstance.transaction(['images'], 'readonly');
      const store = transaction.objectStore('images');
      const request = store.get(imageUrl);
      
      return new Promise((resolve) => {
        request.onsuccess = () => {
          if (request.result && request.result.blob) {
            const blobUrl = URL.createObjectURL(request.result.blob);
            imageCache[imageUrl] = blobUrl;
            resolve(blobUrl);
          } else {
            // Cache'de yok, yükle ve kaydet
            loadAndCacheImage(imageUrl).then(resolve);
          }
        };
        
        request.onerror = () => {
          // Hata durumunda direkt yükle
          loadAndCacheImage(imageUrl).then(resolve);
        };
      });
    } catch (error) {
      console.error('Cache okuma hatası:', error);
      return loadAndCacheImage(imageUrl);
    }
  }
  
  // DB hazır değilse direkt yükle
  return loadAndCacheImage(imageUrl);
}

// Resmi yükle ve cache'le
async function loadAndCacheImage(imageUrl) {
  try {
    const isFirebaseStorage = imageUrl && imageUrl.includes('firebasestorage.googleapis.com');
    const isR2 = imageUrl && (imageUrl.includes('r2.dev') || imageUrl.includes('r2.cloudflarestorage.com'));
    
    let response;
    let fetchUrl = imageUrl;
    
    // R2 URL'leri için önce direkt fetch dene (CORS sorunu olmazsa proxy'ye gerek yok)
    if (isR2) {
      try {
        // Önce direkt R2'den dene
        response = await fetch(imageUrl, { 
          mode: 'cors',
          cache: 'force-cache',
          credentials: 'omit'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        // Başarılı oldu, direkt R2'den kullan
        console.log(`✅ R2 görsel direkt yüklendi: ${imageUrl.substring(0, 50)}...`);
      } catch (directError) {
        // CORS veya başka bir hata varsa proxy'ye yönlendir
        console.warn(`⚠️ R2 direkt yükleme hatası, proxy kullanılıyor:`, directError.message);
        fetchUrl = `http://localhost:3000/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
        response = await fetch(fetchUrl, { 
          mode: 'cors',
          cache: 'force-cache'
        });
        
        if (!response.ok) {
          throw new Error('Resim proxy üzerinden yüklenemedi');
        }
      }
    } else if (isFirebaseStorage) {
      // Firebase Storage için proxy kullan (CORS sorunları olabilir)
      fetchUrl = `http://localhost:3000/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
      response = await fetch(fetchUrl, { 
        mode: 'cors',
        cache: 'force-cache'
      });
      
      if (!response.ok) {
        throw new Error('Resim yüklenemedi');
      }
    } else {
      // Normal URL'ler için direkt fetch
      response = await fetch(imageUrl, { 
        mode: 'cors',
        cache: 'force-cache'
      });
      
      if (!response.ok) {
        throw new Error('Resim yüklenemedi');
      }
    }
    
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    // Memory cache'e ekle (orijinal URL ile)
    imageCache[imageUrl] = blobUrl;
    
    // IndexedDB'ye kaydet (local'e indir)
    if (dbInstance) {
      try {
        const transaction = dbInstance.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        
        // Önce cache boyutunu kontrol et
        const countRequest = store.count();
        await new Promise((resolve) => {
          countRequest.onsuccess = async () => {
            const count = countRequest.result;
            
            // Eğer cache çok büyükse, en eski olanları temizle
            if (count >= CACHE_MAX_SIZE) {
              try {
                const index = store.index('timestamp');
                const getAllRequest = index.getAll();
                getAllRequest.onsuccess = () => {
                  const sorted = getAllRequest.result.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                  const toDelete = sorted.slice(0, count - CACHE_MAX_SIZE + 1);
                  for (const item of toDelete) {
                    store.delete(item.url);
                  }
                };
              } catch (error) {
                console.warn('Cache temizleme hatası:', error);
              }
            }
            
            // Yeni görseli kaydet
            const putRequest = store.put({ 
              url: imageUrl, 
              blob: blob, 
              timestamp: Date.now() 
            });
            putRequest.onsuccess = () => {
              console.log(`💾 Görsel local'e kaydedildi: ${imageUrl.substring(0, 50)}...`);
              resolve();
            };
            putRequest.onerror = () => resolve(); // Hata olsa bile devam et
          };
          countRequest.onerror = () => resolve();
        });
      } catch (error) {
        console.error('Cache kaydetme hatası:', error);
      }
    }
    
    return blobUrl;
  } catch (error) {
    console.error('Resim yükleme hatası:', error);
    return null;
  }
}

// Cache'i temizle (opsiyonel)
export function clearImageCache() {
  imageCache = {};
  if (dbInstance) {
    const transaction = dbInstance.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    store.clear();
  }
}

