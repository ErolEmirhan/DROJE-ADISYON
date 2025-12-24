# DROJE POS - Modern Restaurant Management System

Modern, şık ve profesyonel bir POS (Point of Sale) uygulaması. Electron, React ve Vite teknolojileri ile geliştirilmiştir. Multi-tenant yapısı ile birden fazla restoran/müessese yönetimini destekler.

## ✨ Özellikler

- 🎨 **Dinamik Tema Sistemi**: Her tenant için özelleştirilebilir tema renkleri
- 🏢 **Multi-Tenant Yapı**: Firebase ile çoklu müessese yönetimi
- 📦 **Kategori Bazlı Ürün Yönetimi**: Esnek kategori ve ürün yapısı
- 🛒 **Akıllı Sepet Sistemi**: Ürün ekleme, miktar güncelleme ve silme
- 💳 **Çoklu Ödeme Yöntemleri**: Nakit, Kredi Kartı ve Bölünmüş Ödeme
- 🪑 **Dinamik Masa Yönetimi**: İç/Dış/Paket masaları için esnek yapılandırma
- 📱 **Mobil Personel Arayüzü**: QR kod ile erişilebilir mobil arayüz
- 👥 **Personel Yönetimi**: Alacak/Verecek takibi ve personel hesapları
- 📊 **Detaylı Raporlama**: Satış detayları, analizler ve raporlar
- ⚡ **Hızlı ve Performanslı**: Electron tabanlı masaüstü uygulaması
- 🔄 **Gerçek Zamanlı Güncellemeler**: Firebase ile anlık veri senkronizasyonu

## 🚀 Kurulum

### Gereksinimler

- Node.js (v16 veya üzeri)
- npm veya yarn
- Firebase hesabı (multi-tenant yapı için)

### Adımlar

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. Firebase yapılandırmasını ayarlayın:
   - Firebase Console'da projenizi oluşturun
   - Firestore Database'i etkinleştirin
   - Tenant yapılandırmalarınızı oluşturun

3. Uygulamayı geliştirme modunda çalıştırın:
```bash
npm run dev
```

4. Üretim için build alın:
```bash
npm run build
npm run build:win
```

## 📁 Proje Yapısı

```
droje-pos/
├── electron/
│   ├── main.js              # Electron ana süreç
│   ├── preload.js           # Electron preload script
│   └── tenantManager.js     # Tenant yönetimi
├── src/
│   ├── components/
│   │   ├── Navbar.jsx           # Üst navigasyon
│   │   ├── CategoryPanel.jsx   # Kategori seçimi
│   │   ├── ProductGrid.jsx     # Ürün listesi
│   │   ├── Cart.jsx            # Sepet bölümü
│   │   ├── TablePanel.jsx      # Masa yönetimi
│   │   ├── PaymentModal.jsx    # Ödeme modalı
│   │   ├── SalesHistory.jsx    # Satış geçmişi
│   │   ├── SettingsModal.jsx   # Ayarlar
│   │   └── LauncherClient.jsx # Launcher ekranı
│   ├── utils/
│   │   ├── tenantService.js    # Tenant servisleri
│   │   └── themeUtils.js       # Tema yardımcıları
│   ├── App.jsx          # Ana uygulama
│   ├── main.jsx         # React giriş noktası
│   └── index.css        # Global stiller
├── public/
│   └── index.html       # Admin dashboard (paketleme için)
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## 🎯 Kullanım

### Tenant Yapılandırması

1. Firebase Firestore'da `tenants` koleksiyonunda tenant dokümanı oluşturun
2. Gerekli alanları doldurun:
   - `tenantId`: Benzersiz tenant ID
   - `businessName`: İşletme adı
   - `themeColor`: Tema rengi (hex formatında)
   - `insideTables`: İç masa sayısı
   - `outsideTables`: Dış masa sayısı
   - `packageTables`: Paket masa sayısı
   - `firebaseConfig`: Ana Firebase yapılandırması
   - `tablesFirebaseConfig`: Masalar için Firebase yapılandırması

### Satış Yapma

1. Launcher ekranından tenant ID ile giriş yapın
2. Sol panelden kategori seçin
3. Ürünlere tıklayarak sepete ekleyin
4. Sağ panelde sepeti kontrol edin
5. "Ödeme Al" butonuna tıklayın
6. Ödeme yöntemini seçin (Nakit/Kredi Kartı/Bölünmüş)

### Masa Yönetimi

1. Navbar'dan "Masalar" sekmesine gidin
2. İç/Dış/Paket masaları arasında geçiş yapın
3. Masalara tıklayarak sipariş ekleyin
4. Masalar arası transfer yapabilirsiniz
5. Kısmi ödeme ve tam ödeme seçenekleri mevcuttur

### Mobil Personel Arayüzü

1. Navbar'dan "Mobil Personel" butonuna tıklayın
2. QR kodu tarayın veya URL'yi paylaşın
3. Mobil cihazdan masa seçimi ve sipariş ekleme yapılabilir
4. Gerçek zamanlı senkronizasyon ile masaüstü uygulamada anında görünür

## 🎨 Teknolojiler

- **Electron**: Masaüstü uygulama framework'ü
- **React**: UI kütüphanesi
- **Vite**: Hızlı build tool'u
- **Tailwind CSS**: Utility-first CSS framework'ü
- **Firebase**: Backend servisleri (Firestore, Realtime Database)
- **Express**: Local API server (mobil arayüz için)
- **Socket.io**: Gerçek zamanlı iletişim

## 📊 Veritabanı Yapısı

### Firebase Collections

- **tenants**: Tenant yapılandırmaları
- **products**: Ürün bilgileri (tenant bazlı)
- **categories**: Kategori bilgileri (tenant bazlı)
- **tables**: Masa durumları (tenant bazlı)
- **sales**: Satış işlemleri (tenant bazlı)
- **staff**: Personel bilgileri
- **staffAccounts**: Personel alacak/verecek hesapları

## 🔧 Geliştirme

Geliştirme modunda uygulamayı çalıştırdığınızda:

- Hot reload aktif olacak
- DevTools otomatik açılacak
- Vite dev server localhost:5173 üzerinde çalışacak
- Express API server localhost:3000 üzerinde çalışacak

## 📝 Notlar

- Veritabanı Firebase'de saklanır
- Her tenant için ayrı Firebase projesi kullanılabilir
- Tema renkleri dinamik olarak uygulanır
- Masa sayıları tenant yapılandırmasına göre dinamik oluşturulur

## 🎉 Özellik Geliştirme Planı

- [ ] Ürün görselleri yükleme (S3/Cloud Storage)
- [ ] Gelişmiş kullanıcı yönetimi
- [ ] Stok takibi
- [ ] Rapor çıktısı alma (PDF)
- [ ] Fiş yazdırma
- [ ] Excel export
- [ ] Kampanya ve indirim yönetimi
- [ ] Çoklu dil desteği

## 👨‍💻 Geliştirici

Modern Restaurant Management System

---

**Not**: Bu uygulama Firebase ile çalışır ve internet bağlantısı gerektirir.
