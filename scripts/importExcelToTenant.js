/* eslint-disable no-console */
/**
 * Excel -> Tenant Firestore import (categories/products)
 *
 * Usage:
 *   node scripts/importExcelToTenant.js --tenant TENANT-... --file "public/Kategori ve Ürünler_....xlsx"
 *
 * Notes:
 * - Reads tenant configs from adminself-d2c2b via existing tenantManager.
 * - Writes to tenant's main Firebase (categories/products).
 * - Default behavior: skip existing products (same name + category).
 */
const path = require('path');
const fs = require('fs');

const xlsx = require('xlsx');
const tenantManager = require('../electron/tenantManager');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--tenant') out.tenantId = argv[i + 1];
    if (a === '--file') out.file = argv[i + 1];
    if (a === '--update-existing') out.updateExisting = true;
  }
  return out;
}

function normalizeTr(input) {
  try {
    return String(input || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return String(input || '').toLowerCase().trim();
  }
}

function pickFirst(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
  }
  return null;
}

function toNumberMaybe(v) {
  if (v == null) return null;
  const s = String(v).replace(',', '.').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function sheetToRows(ws) {
  // returns array<record> using first row as headers
  return xlsx.utils.sheet_to_json(ws, { defval: '', raw: false });
}

function detectSheets(workbook) {
  const sheets = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name];
    const rows = sheetToRows(ws);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const normHeaders = new Set(headers.map(normalizeTr));
    const normName = normalizeTr(name);
    const looksProduct =
      normHeaders.has('urun') ||
      normHeaders.has('urun adi') ||
      normHeaders.has('urun adı') ||
      normHeaders.has('product') ||
      normHeaders.has('product name') ||
      normHeaders.has('name') ||
      normName.includes('urun');
    const looksCategory =
      normHeaders.has('kategori') ||
      normHeaders.has('kategori adi') ||
      normHeaders.has('kategori adı') ||
      normHeaders.has('category') ||
      normHeaders.has('category name') ||
      normName.includes('kategori');
    return { name, rows, headers, normHeaders, looksProduct, looksCategory };
  });

  const productSheets = sheets.filter((s) => s.looksProduct);
  const categorySheets = sheets.filter((s) => s.looksCategory && !s.looksProduct);

  return { productSheets, categorySheets, all: sheets };
}

function extractCategoriesAndProducts(detected) {
  const categories = [];
  const products = [];

  // 1) Categories (if explicit category sheet)
  for (const sh of detected.categorySheets) {
    for (const r of sh.rows) {
      const name =
        pickFirst(r, ['Kategori', 'Kategori Adı', 'Kategori adı', 'category', 'Category', 'Category Name', 'KategoriAdi']) ||
        pickFirst(r, Object.keys(r).filter((k) => normalizeTr(k).includes('kategori') && normalizeTr(k).includes('ad')));
      const id = pickFirst(r, ['Kategori ID', 'Kategori Id', 'category_id', 'Category ID', 'id', 'ID']);
      const orderIdx = pickFirst(r, ['Sıra', 'Sira', 'order_index', 'Order', 'Order Index']);
      if (!name || !String(name).trim()) continue;
      categories.push({
        name: String(name).trim(),
        id: toNumberMaybe(id),
        order_index: toNumberMaybe(orderIdx),
      });
    }
  }

  // 2) Products
  for (const sh of detected.productSheets) {
    for (const r of sh.rows) {
      const productName =
        pickFirst(r, ['Ürün', 'Urun', 'Ürün Adı', 'Urun Adi', 'Ürün adı', 'product', 'Product', 'name', 'Name']) ||
        pickFirst(r, Object.keys(r).filter((k) => normalizeTr(k).includes('urun') && normalizeTr(k).includes('ad')));

      const categoryName =
        pickFirst(r, ['Kategori', 'Kategori Adı', 'Kategori adı', 'category', 'Category', 'Category Name']) ||
        pickFirst(r, Object.keys(r).filter((k) => normalizeTr(k).includes('kategori') && !normalizeTr(k).includes('id')));

      const categoryId = pickFirst(r, ['Kategori ID', 'Kategori Id', 'category_id', 'Category ID']);

      const price =
        pickFirst(r, ['Fiyat', 'fiyat', 'Price', 'price', 'Tutar', 'tutar', 'Ücret', 'Ucret']) ||
        pickFirst(r, Object.keys(r).filter((k) => normalizeTr(k).includes('fiyat') || normalizeTr(k).includes('price')));

      const image =
        pickFirst(r, ['Görsel', 'Gorsel', 'Resim', 'Image', 'image', 'Foto', 'photo']) ||
        pickFirst(r, Object.keys(r).filter((k) => normalizeTr(k).includes('gorsel') || normalizeTr(k).includes('resim') || normalizeTr(k).includes('image')));

      const unit =
        pickFirst(r, ['Ürün Birimi', 'Urun Birimi', 'Birim', 'Unit', 'unit']) ||
        pickFirst(
          r,
          Object.keys(r).filter((k) => {
            const nk = normalizeTr(k);
            return nk.includes('birim') || nk.includes('unit');
          })
        );

      if (!productName || !String(productName).trim()) continue;

      products.push({
        name: String(productName).trim(),
        categoryName: categoryName ? String(categoryName).trim() : '',
        category_id: toNumberMaybe(categoryId),
        price: toNumberMaybe(price) ?? 0,
        image: image ? String(image).trim() : '',
        unit: unit ? String(unit).trim() : '',
      });
    }
  }

  // If categories were not provided explicitly, derive from products
  if (categories.length === 0) {
    const seen = new Set();
    for (const p of products) {
      const cn = String(p.categoryName || '').trim();
      if (!cn) continue;
      const key = normalizeTr(cn);
      if (seen.has(key)) continue;
      seen.add(key);
      categories.push({ name: cn, id: null, order_index: null });
    }
  }

  return { categories, products };
}

async function main() {
  const args = parseArgs(process.argv);
  const tenantId = args.tenantId;
  const fileArg = args.file;
  const updateExisting = !!args.updateExisting;

  if (!tenantId || !fileArg) {
    console.error('Kullanım: node scripts/importExcelToTenant.js --tenant TENANT-... --file "<xlsx path>" [--update-existing]');
    process.exit(1);
  }

  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error('Dosya bulunamadı:', filePath);
    process.exit(1);
  }

  console.log('📄 Excel:', filePath);
  console.log('🏷️ Tenant:', tenantId);

  console.log('🔎 Tenant config okunuyor (adminself-d2c2b)...');
  const tenantInfo = await tenantManager.getTenantInfo(tenantId);
  if (!tenantInfo?.mainFirebaseConfig) {
    throw new Error('Tenant mainFirebaseConfig bulunamadı. (firebaseApi1/mainFirebaseConfig alanlarını kontrol edin)');
  }
  console.log('✅ Main Firebase projectId:', tenantInfo.mainFirebaseConfig.projectId);

  const workbook = xlsx.readFile(filePath);
  const detected = detectSheets(workbook);
  console.log('📑 Sheets:', workbook.SheetNames.join(', '));
  if (detected.productSheets.length === 0) {
    console.warn('⚠️ Ürün sheet\'i otomatik bulunamadı. Tüm sheet\'lerde ürün kolonları aranacak.');
  }

  const { categories, products } = extractCategoriesAndProducts(detected);
  console.log(`📦 Excel: ${categories.length} kategori, ${products.length} ürün satırı bulundu`);

  // Init Firestore (tenant main)
  const firebaseAppModule = require('firebase/app');
  const firestoreModule = require('firebase/firestore');

  try {
    const existingApp = firebaseAppModule.getApp('import-main');
    if (existingApp) await firebaseAppModule.deleteApp(existingApp);
  } catch {}

  const app = firebaseAppModule.initializeApp(tenantInfo.mainFirebaseConfig, 'import-main');
  const db = firestoreModule.getFirestore(app);

  const { collection, getDocs, doc, setDoc } = firestoreModule;

  console.log('⬇️ Mevcut kategoriler çekiliyor...');
  const existingCatSnap = await getDocs(collection(db, 'categories'));
  const existingCats = [];
  existingCatSnap.forEach((d) => existingCats.push({ docId: d.id, ...(d.data() || {}) }));

  const catByNormName = new Map();
  let maxCategoryId = 0;
  let maxOrderIndex = 0;
  for (const c of existingCats) {
    const idNum = Number(c.id ?? c.docId);
    if (Number.isFinite(idNum)) maxCategoryId = Math.max(maxCategoryId, idNum);
    const oi = Number(c.order_index || 0);
    if (Number.isFinite(oi)) maxOrderIndex = Math.max(maxOrderIndex, oi);
    const key = normalizeTr(c.name || '');
    if (key) catByNormName.set(key, c);
  }

  // Prepare category mapping
  const categoryNameToId = new Map();
  const catsToCreate = [];
  for (const c of categories) {
    const key = normalizeTr(c.name);
    if (!key) continue;
    const existing = catByNormName.get(key);
    if (existing) {
      const idNum = Number(existing.id ?? existing.docId);
      categoryNameToId.set(key, idNum);
      continue;
    }

    // Use provided id if safe; else new
    let idToUse = c.id != null ? Number(c.id) : null;
    if (!idToUse || !Number.isFinite(idToUse) || idToUse <= 0) idToUse = null;
    if (idToUse && idToUse <= maxCategoryId) idToUse = null;
    if (!idToUse) {
      maxCategoryId += 1;
      idToUse = maxCategoryId;
    } else {
      maxCategoryId = Math.max(maxCategoryId, idToUse);
    }

    let orderIndex = c.order_index != null ? Number(c.order_index) : null;
    if (!orderIndex || !Number.isFinite(orderIndex) || orderIndex < 0) {
      maxOrderIndex += 1;
      orderIndex = maxOrderIndex;
    } else {
      maxOrderIndex = Math.max(maxOrderIndex, orderIndex);
    }

    catsToCreate.push({ id: idToUse, name: c.name, order_index: orderIndex });
    categoryNameToId.set(key, idToUse);
  }

  console.log(`🧩 Yeni kategori eklenecek: ${catsToCreate.length}`);
  for (const c of catsToCreate) {
    await setDoc(doc(db, 'categories', String(c.id)), { ...c }, { merge: true });
  }

  console.log('⬇️ Mevcut ürünler çekiliyor...');
  const existingProdSnap = await getDocs(collection(db, 'products'));
  const existingProducts = [];
  existingProdSnap.forEach((d) => existingProducts.push({ docId: d.id, ...(d.data() || {}) }));

  const prodKeyToExisting = new Map(); // norm(name)::category_id -> product
  let maxProductId = 0;
  for (const p of existingProducts) {
    const idNum = Number(p.id ?? p.docId);
    if (Number.isFinite(idNum)) maxProductId = Math.max(maxProductId, idNum);
    const nameKey = normalizeTr(p.name || '');
    const catId = Number(p.category_id ?? 0);
    if (nameKey && Number.isFinite(catId)) {
      prodKeyToExisting.set(`${nameKey}::${catId}`, p);
    }
  }

  const productsToCreate = [];
  const productsToUpdate = [];
  const skipped = [];

  for (const p of products) {
    const nameKey = normalizeTr(p.name);
    if (!nameKey) continue;

    let categoryId = p.category_id != null ? Number(p.category_id) : null;
    if (!categoryId || !Number.isFinite(categoryId)) {
      const catKey = normalizeTr(p.categoryName);
      if (catKey) categoryId = categoryNameToId.get(catKey) || null;
    }
    if (!categoryId || !Number.isFinite(categoryId)) {
      skipped.push({ reason: 'Kategori bulunamadı', name: p.name, categoryName: p.categoryName });
      continue;
    }

    const key = `${nameKey}::${categoryId}`;
    const existing = prodKeyToExisting.get(key);
    if (existing) {
      if (updateExisting) {
        productsToUpdate.push({
          docId: String(existing.id ?? existing.docId),
          id: Number(existing.id ?? existing.docId),
          name: p.name,
          category_id: categoryId,
          price: Number(p.price || 0),
          image: p.image || existing.image || null,
          unit: p.unit || existing.unit || null,
        });
      } else {
        skipped.push({ reason: 'Zaten var', name: p.name, categoryId });
      }
      continue;
    }

    maxProductId += 1;
    productsToCreate.push({
      id: maxProductId,
      name: p.name,
      category_id: categoryId,
      price: Number(p.price || 0),
      image: p.image || null,
      unit: p.unit || null,
    });
  }

  console.log(`🆕 Yeni ürün: ${productsToCreate.length} | 🔁 Güncelle: ${productsToUpdate.length} | ⏭️ Atla: ${skipped.length}`);

  for (const p of productsToCreate) {
    await setDoc(doc(db, 'products', String(p.id)), p, { merge: true });
  }
  for (const p of productsToUpdate) {
    await setDoc(doc(db, 'products', String(p.id)), p, { merge: true });
  }

  console.log('✅ Import tamamlandı.');
  if (skipped.length) {
    console.log('ℹ️ Atlanan ilk 20 kayıt:', skipped.slice(0, 20));
  }

  // Cleanup app to avoid hanging process
  try {
    await firebaseAppModule.deleteApp(app);
  } catch {}
}

main().catch((e) => {
  console.error('❌ Import hata:', e?.message || e);
  process.exit(1);
});

