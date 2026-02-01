import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';

// Gece Dönercisi - Masalar Firebase (kullanıcı talebi)
const firebaseConfig = {
  apiKey: 'AIzaSyB9RzR5HMVDTUfduW1ix-871k5gSM55VkU',
  authDomain: 'gecedonercisimasalar.firebaseapp.com',
  projectId: 'gecedonercisimasalar',
  storageBucket: 'gecedonercisimasalar.firebasestorage.app',
  messagingSenderId: '772077442379',
  appId: '1:772077442379:web:cd19d6c85810ceda93c4ce',
  measurementId: 'G-689BHMKQ7X',
};

const APP_NAME = 'gecedonercisimasalar';

function getGeceDonercisiMasalarApp() {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  return initializeApp(firebaseConfig, APP_NAME);
}

export function getGeceDonercisiMasalarDb() {
  return getFirestore(getGeceDonercisiMasalarApp());
}

export async function addZahiyatRecords(rows) {
  const db = getGeceDonercisiMasalarDb();
  const col = collection(db, 'zahiyat');
  const writes = (rows || []).map((row) =>
    addDoc(col, {
      ...row,
      createdAt: serverTimestamp(),
    })
  );
  await Promise.all(writes);
}

// Cihaz bazlı şube seçimi (Gece Dönercisi - stok takibi)
export async function upsertDeviceBranchSelection({
  tenantId,
  deviceId,
  branch, // 'SANCAK' | 'SEKER'
  app = 'DROJE-ADISYON',
  platform = 'desktop',
}) {
  if (!tenantId || !deviceId || !branch) return;
  const db = getGeceDonercisiMasalarDb();
  const ref = doc(db, 'deviceBranches', String(deviceId));
  await setDoc(
    ref,
    {
      tenantId,
      deviceId: String(deviceId),
      branch,
      app,
      platform,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchBranchStockMap(branch) {
  if (!branch) return {};
  const db = getGeceDonercisiMasalarDb();
  const qRef = query(collection(db, 'branchStocks'), where('branch', '==', branch));
  const snap = await getDocs(qRef);
  const map = {};
  snap.forEach((d) => {
    const data = d.data() || {};
    const pid = data.productId != null ? String(data.productId) : String(d.id).split('_').pop();
    map[String(pid)] = Number(data.stock || 0);
  });
  return map;
}

export async function adjustBranchStock({
  tenantId,
  branch,
  productId,
  delta,
  deviceId,
}) {
  if (!tenantId || !branch || productId == null || !delta) {
    throw new Error('Geçersiz stok güncelleme parametreleri');
  }
  const db = getGeceDonercisiMasalarDb();
  const pid = String(productId);
  const docId = `${branch}_${pid}`;
  const ref = doc(db, 'branchStocks', docId);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const before = snap.exists() ? Number((snap.data() || {}).stock || 0) : 0;
    let after = before + Number(delta);
    if (after < 0) after = 0;

    tx.set(
      ref,
      {
        tenantId,
        branch,
        productId: pid,
        stock: after,
        updatedAt: serverTimestamp(),
        updatedByDeviceId: deviceId ? String(deviceId) : null,
      },
      { merge: true }
    );

    return { before, after };
  });

  // Hareket kaydı (opsiyonel)
  try {
    await addDoc(collection(db, 'branchStockMoves'), {
      tenantId,
      branch,
      productId: pid,
      delta: Number(delta),
      before: result.before,
      after: result.after,
      deviceId: deviceId ? String(deviceId) : null,
      createdAt: serverTimestamp(),
    });
  } catch {
    // history zorunlu değil
  }

  return result;
}

export async function adjustBranchStocksBulk({
  tenantId,
  branch,
  items, // [{ productId, delta }]
  deviceId,
}) {
  if (!tenantId || !branch || !Array.isArray(items) || items.length === 0) {
    throw new Error('Geçersiz toplu stok güncelleme parametreleri');
  }

  // Aynı ürünü tek entry'e indir
  const merged = new Map(); // productId -> delta
  for (const it of items) {
    if (!it || it.productId == null) continue;
    const pid = String(it.productId);
    const d = Number(it.delta || 0);
    if (!d) continue;
    merged.set(pid, (merged.get(pid) || 0) + d);
  }
  const mergedItems = Array.from(merged.entries()).map(([productId, delta]) => ({ productId, delta }));
  if (mergedItems.length === 0) {
    return { results: {}, movesWritten: 0 };
  }

  const db = getGeceDonercisiMasalarDb();

  const results = await runTransaction(db, async (tx) => {
    const out = {}; // productId -> { before, after, delta }
    for (const it of mergedItems) {
      const pid = String(it.productId);
      const docId = `${branch}_${pid}`;
      const ref = doc(db, 'branchStocks', docId);
      const snap = await tx.get(ref);
      const before = snap.exists() ? Number((snap.data() || {}).stock || 0) : 0;
      let after = before + Number(it.delta);
      if (after < 0) after = 0;

      tx.set(
        ref,
        {
          tenantId,
          branch,
          productId: pid,
          stock: after,
          updatedAt: serverTimestamp(),
          updatedByDeviceId: deviceId ? String(deviceId) : null,
        },
        { merge: true }
      );

      out[pid] = { before, after, delta: Number(it.delta) };
    }
    return out;
  });

  // Hareket kayıtları (opsiyonel)
  let movesWritten = 0;
  try {
    const moves = Object.entries(results).map(([pid, r]) =>
      addDoc(collection(db, 'branchStockMoves'), {
        tenantId,
        branch,
        productId: String(pid),
        delta: Number(r.delta),
        before: Number(r.before),
        after: Number(r.after),
        deviceId: deviceId ? String(deviceId) : null,
        createdAt: serverTimestamp(),
        source: 'cari-maliyet',
      })
    );
    await Promise.all(moves);
    movesWritten = moves.length;
  } catch {
    // history zorunlu değil
  }

  return { results, movesWritten };
}

