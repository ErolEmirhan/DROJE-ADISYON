/**
 * Lacrimosa müşteri menüsü QR kodları
 * https://lacromisamasalar.web.app/salon1 ... salon15, bahce1 ... bahce15
 * Tüm dosyalar qr-codes-lacromisa/ klasörüne yazılır.
 */

const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://lacromisamasalar.web.app';
const OUT_DIR = path.join(__dirname, '..', 'qr-codes-lacromisa');
const SIZE = 400; // px

async function generate() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const items = [];
  for (let i = 1; i <= 15; i++) items.push({ slug: `salon${i}`, label: `Salon ${i}` });
  for (let i = 1; i <= 15; i++) items.push({ slug: `bahce${i}`, label: `Bahçe ${i}` });

  for (const { slug, label } of items) {
    const url = `${BASE_URL}/${slug}`;
    const filePath = path.join(OUT_DIR, `${slug}.png`);
    await QRCode.toFile(filePath, url, {
      width: SIZE,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    console.log(`✓ ${slug}.png → ${label}`);
  }

  // Özet HTML (isteğe bağlı: tüm QR'ları tek sayfada göster)
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Lacrimosa Masa QR Kodları</title>
  <style>
    body { font-family: system-ui; padding: 20px; background: #f1f5f9; }
    h1 { color: #0f172a; }
    .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px; max-width: 1200px; }
    .card { background: white; padding: 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; }
    .card img { width: 100%; max-width: 200px; height: auto; display: block; margin: 0 auto 8px; }
    .card span { font-weight: 700; color: #334155; }
    .card a { font-size: 11px; color: #64748b; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Lacrimosa Coffee – Masa QR Kodları</h1>
  <p>Her masa için ayrı link. QR kodları <strong>qr-codes-lacromisa</strong> klasöründe PNG olarak kaydedildi.</p>
  <div class="grid">
${items.map(({ slug, label }) => `    <div class="card">
      <img src="${slug}.png" alt="${label}">
      <span>${label}</span><br>
      <a href="${BASE_URL}/${slug}">${BASE_URL}/${slug}</a>
    </div>`).join('\n')}
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');
  console.log('\n✓ index.html (özet sayfa) oluşturuldu.');
  console.log(`\nToplam ${items.length} QR kodu: ${OUT_DIR}`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
