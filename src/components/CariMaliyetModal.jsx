import React, { useEffect, useMemo, useState } from 'react';
import { getThemeColors } from '../utils/themeUtils';
import CariMaliyetProductModal from './CariMaliyetProductModal';
import { addZahiyatRecords, adjustBranchStocksBulk } from '../utils/geceDonercisiMasalarFirestore';
import { getGeceSelectedBranch, getOrCreateGeceDeviceId } from '../utils/geceDonercisiBranchSelection';
import { isGeceDonercisi } from '../utils/sultanSomatTables';

const CariMaliyetModal = ({ tenantId, themeColor = '#f97316', products = [], onClose }) => {
  const theme = useMemo(() => getThemeColors(themeColor), [themeColor]);
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { message }

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!window.electronAPI?.getStaff) return;
      setStaffLoading(true);
      try {
        const list = await window.electronAPI.getStaff();
        if (!mounted) return;
        setStaff(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error('Personel yüklenemedi:', e);
        if (mounted) setStaff([]);
      } finally {
        if (mounted) setStaffLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const canAddProduct = !!selectedStaff;

  const handleSelectProduct = (product) => {
    if (!selectedStaff) return;
    const price = Number(product?.price || 0);
    setRows((prev) => [
      ...prev,
      {
        _localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tenantId,
        staffId: selectedStaff.id,
        staffName: selectedStaff.name || selectedStaff.full_name || selectedStaff.username || 'Personel',
        productId: product.id,
        productName: product.name,
        price,
        source: 'pos',
        type: 'cari-maliyet',
      },
    ]);
    setShowProductModal(false);
  };

  const removeRow = (localId) => setRows((prev) => prev.filter((r) => r._localId !== localId));

  const handleSave = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const isGeceMode = tenantId && isGeceDonercisi(tenantId);
      const branch = isGeceMode ? getGeceSelectedBranch() : '';
      const deviceId = isGeceMode ? getOrCreateGeceDeviceId() : '';

      if (isGeceMode && !branch) {
        throw new Error('Şube seçimi zorunludur. Ayarlar bölümünden SANCAK/ŞEKER seçiniz.');
      }

      const toWrite = rows.map(({ _localId, ...rest }) => ({
        ...rest,
        ...(isGeceMode ? { branch, deviceId } : {}),
      }));

      // CARİ MAALİYET: seçilen ürünler stoktan düşsün (Gece Dönercisi - şube stokları)
      // Önce stoktan düş, sonra zahiyat kaydet. Zahiyat kaydı başarısız olursa geri eklemeyi dene.
      if (isGeceMode) {
        const counts = new Map(); // productId -> qty
        rows.forEach((r) => {
          const pid = r?.productId != null ? String(r.productId) : '';
          if (!pid) return;
          counts.set(pid, (counts.get(pid) || 0) + 1);
        });

        const items = Array.from(counts.entries()).map(([productId, qty]) => ({
          productId,
          delta: -Math.max(1, Number(qty) || 1),
        }));

        await adjustBranchStocksBulk({
          tenantId,
          branch,
          items,
          deviceId,
        });

        try {
          await addZahiyatRecords(toWrite);
        } catch (e) {
          // rollback (best-effort)
          try {
            const rollbackItems = items.map((it) => ({ ...it, delta: -Number(it.delta || 0) }));
            await adjustBranchStocksBulk({
              tenantId,
              branch,
              items: rollbackItems,
              deviceId,
            });
          } catch (rollbackErr) {
            console.warn('Cari maliyet rollback başarısız:', rollbackErr);
          }
          throw e;
        }
      } else {
        await addZahiyatRecords(toWrite);
      }

      setRows([]);
      setToast({ message: 'Kayıtlar kaydedildi.' });
    } catch (e) {
      console.error('Zahiyat kaydetme hatası:', e);
      alert(e?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      {toast && (
        <div className="fixed top-5 right-5 z-[90]">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border border-emerald-200 bg-emerald-50">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-emerald-900">Başarılı</div>
              <div className="text-xs font-semibold text-emerald-800 truncate">{toast.message}</div>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="w-8 h-8 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-black flex items-center justify-center"
              title="Kapat"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div
        className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose?.()}
      >
        <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md" style={{ backgroundImage: theme.gradient.main }}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0 0V6m0 8v4m6-6h2M4 12H2m15.364-7.364l1.414-1.414M5.222 18.778l-1.414 1.414m14.142 0l-1.414-1.414M5.222 5.222 3.808 3.808" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-gray-900">Cari Maliyet</h3>
                <p className="text-xs text-gray-500">Zahiyat kayıtları (ürün • fiyat • personel)</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-black"
              title="Kapat"
            >
              ×
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold text-gray-800">Personel Seç</div>
                {selectedStaff && (
                  <div className="text-xs text-gray-500">
                    Seçili: <span className="font-bold text-gray-800">{selectedStaff.name || selectedStaff.full_name || selectedStaff.username}</span>
                  </div>
                )}
              </div>

              {staffLoading ? (
                <div className="text-sm text-gray-500 py-6">Personeller yükleniyor...</div>
              ) : staff.length === 0 ? (
                <div className="text-sm text-gray-500 py-6">Personel bulunamadı.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {staff.map((s) => {
                    const label = s.name || s.full_name || s.username || `Personel ${s.id}`;
                    const active = selectedStaff?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedStaff(s)}
                        className={`px-3 py-2 rounded-xl border text-sm font-bold transition-all ${
                          active ? 'bg-white shadow-md' : 'bg-gray-50 hover:bg-white'
                        }`}
                        style={active ? { borderColor: theme.primary500, color: theme.primary700 } : { borderColor: '#e5e7eb', color: '#111827' }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  if (!canAddProduct) {
                    alert('Önce personel seçin');
                    return;
                  }
                  setShowProductModal(true);
                }}
                className="px-4 py-3 rounded-xl font-extrabold text-sm shadow-md border border-gray-200 bg-white hover:bg-gray-50 transition-all"
                style={{ color: theme.primary700 }}
              >
                Ürün Seç
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || rows.length === 0}
                className="px-5 py-3 rounded-xl font-extrabold text-sm text-white shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundImage: theme.gradient.main }}
              >
                {saving ? 'Kaydediliyor...' : `Kaydet (${rows.length})`}
              </button>
            </div>

            <div className="border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="text-sm font-extrabold text-gray-800">Zahiyat</div>
                <div className="text-xs text-gray-500">{rows.length} kayıt</div>
              </div>

              {rows.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">Henüz ürün eklenmedi.</div>
              ) : (
                <div className="max-h-[40vh] overflow-y-auto">
                  {rows.map((r) => (
                    <div key={r._localId} className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">{r.productName}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Personel: <span className="font-semibold text-gray-700">{r.staffName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-extrabold text-gray-900 whitespace-nowrap">₺{Number(r.price || 0).toFixed(2)}</div>
                        <button
                          type="button"
                          onClick={() => removeRow(r._localId)}
                          className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center font-black"
                          title="Sil"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showProductModal && (
        <CariMaliyetProductModal
          products={products}
          themeColor={themeColor}
          onClose={() => setShowProductModal(false)}
          onSelectProduct={handleSelectProduct}
        />
      )}
    </>
  );
};

export default CariMaliyetModal;

