import React, { useMemo, useState } from 'react';
import { getThemeColors } from '../utils/themeUtils';

const CariMaliyetProductModal = ({
  products = [],
  themeColor = '#f97316',
  onClose,
  onSelectProduct,
  multiSelect = false,
  onConfirmProducts,
}) => {
  const theme = useMemo(() => getThemeColors(themeColor), [themeColor]);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p?.name || '').toLowerCase().includes(q));
  }, [products, query]);

  const toggleSelect = (productId) => {
    setSelectedIds((prev) => {
      const key = String(productId);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!onConfirmProducts) return;
    const ordered = Array.from(selectedIds)
      .map((id) => products.find((p) => String(p?.id) === String(id)))
      .filter(Boolean);
    if (ordered.length === 0) return;
    onConfirmProducts(ordered);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md" style={{ backgroundImage: theme.gradient.main }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">Ürün Seç</h3>
              <p className="text-xs text-gray-500">
                {multiSelect
                  ? 'Birden fazla ürün seçin, Tamam ile listeye ekleyin. Ana ekranda miktar için + / − kullanın.'
                  : 'Zahiyat kaydı için ürün seçin'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-black"
            title="Kapat"
          >
            ×
          </button>
        </div>

        <div className="p-5 flex-1 min-h-0 flex flex-col">
          <div className="mb-4 shrink-0">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün ara..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': `${theme.primary500}55` }}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">Ürün bulunamadı.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filtered.map((p) => {
                  const idKey = String(p.id);
                  const isOn = multiSelect && selectedIds.has(idKey);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (multiSelect) {
                          toggleSelect(p.id);
                        } else {
                          onSelectProduct?.(p);
                        }
                      }}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        isOn
                          ? 'border-orange-500 bg-orange-50 shadow-md ring-2 ring-orange-200'
                          : 'border-gray-200 bg-white hover:shadow-md hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex items-start gap-2">
                          {multiSelect && (
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[10px] font-black ${
                                isOn ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-300 bg-white text-transparent'
                              }`}
                              aria-hidden
                            >
                              ✓
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-gray-900 truncate">{p.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">ID: {p.id}</div>
                          </div>
                        </div>
                        <div className="text-sm font-extrabold text-gray-900 whitespace-nowrap">₺{Number(p.price || 0).toFixed(2)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {multiSelect && (
            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center justify-end gap-2 shrink-0">
              <span className="text-xs font-semibold text-gray-500 mr-auto">
                {selectedIds.size > 0 ? `${selectedIds.size} ürün seçili` : 'Ürün seçin'}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-800 font-bold text-sm hover:bg-gray-100"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selectedIds.size === 0}
                className="px-5 py-2.5 rounded-xl font-extrabold text-sm text-white shadow-md disabled:opacity-45 disabled:cursor-not-allowed transition-all"
                style={{ backgroundImage: theme.gradient.main }}
              >
                Tamam{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CariMaliyetProductModal;
