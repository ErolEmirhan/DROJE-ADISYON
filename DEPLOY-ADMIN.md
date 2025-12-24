# Admin Dashboard Firebase Hosting Deploy Rehberi

Bu rehber, MAKARA Admin Dashboard'unu Firebase Hosting'e deploy etmek için adımları içerir.

## Ön Gereksinimler

1. Firebase CLI kurulu olmalı (npm ile kurulacak)
2. Firebase projesine erişim yetkisi olmalı
3. Firebase projesi zaten yapılandırılmış olmalı

## Kurulum Adımları

### 1. Firebase CLI'yi Kurun

```bash
npm install
```

Bu komut `firebase-tools` paketini devDependencies'e ekler.

### 2. Firebase'e Giriş Yapın

```bash
npm run firebase:login
```

veya

```bash
firebase login
```

Tarayıcınız açılacak ve Firebase hesabınızla giriş yapmanız istenecek.

### 3. Firebase Projesini Seçin

```bash
firebase use makara-16344
```

veya yeni bir proje başlatmak için:

```bash
npm run firebase:init
```

## Deploy İşlemleri

### Production Deploy (Canlı Ortam)

```bash
npm run deploy:admin
```

Bu komut `public` klasöründeki admin dashboard'u Firebase Hosting'e deploy eder.

### Preview Deploy (Önizleme)

```bash
npm run deploy:admin:preview
```

Bu komut geçici bir preview URL'i oluşturur, değişiklikleri test edebilirsiniz.

## Firebase Hosting Yapılandırması

`firebase.json` dosyası zaten yapılandırılmış durumda:

- **Public Klasör**: `public` - Admin dashboard dosyaları burada
- **Rewrites**: Tüm istekler `index.html`'e yönlendirilir (SPA desteği)
- **Ignore**: `node_modules`, `.git` gibi klasörler deploy edilmez

## Deploy Sonrası

Deploy işlemi tamamlandıktan sonra:

1. Firebase Console'dan hosting URL'inizi kontrol edin
2. Genellikle URL şu formatta olur: `https://makara-16344.web.app` veya `https://makara-16344.firebaseapp.com`
3. Custom domain eklemek isterseniz Firebase Console > Hosting > Add custom domain

## Sorun Giderme

### Firebase CLI bulunamıyor hatası

```bash
npm install -g firebase-tools
```

### Deploy hatası: "No project active"

```bash
firebase use makara-16344
```

### Deploy hatası: "Permission denied"

Firebase Console'dan projeye erişim yetkiniz olduğundan emin olun.

## Notlar

- Admin dashboard `public/index.html` dosyasında bulunur
- Deploy sadece `public` klasöründeki dosyaları yükler
- Firebase yapılandırması `firebase.json` dosyasında bulunur
- Her deploy işlemi önceki versiyonu geçersiz kılar (versioning yok)

## Güvenlik

- Admin dashboard PIN korumalıdır (varsayılan: 1234)
- Firebase Security Rules'ları `firestore.rules` dosyasında tanımlıdır
- Production'da PIN'i değiştirmeyi unutmayın!




