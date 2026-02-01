import React, { useMemo, useState } from 'react';
import { getThemeColors } from '../utils/themeUtils';

const CariMaliyetProductModal = ({ products = [], themeColor = '#f97316', onClose, onSelectProduct }) => {
  const theme = useMemo(() => getThemeColors(themeColor), [themeColor]);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p?.name || '').toLowerCase().includes(q));
  }, [products, query]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md" style={{ backgroundImage: theme.gradient.main }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">Ürün Seç</h3>
              <p className="text-xs text-gray-500">Zahiyat kaydı için ürün seçin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-black"
            title="Kapat"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün ara..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': `${theme.primary500}55` }}
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">Ürün bulunamadı.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelectProduct?.(p)}
                    className="text-left p-3 rounded-xl border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-gray-900 truncate">{p.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">ID: {p.id}</div>
                      </div>
                      <div className="text-sm font-extrabold text-gray-900 whitespace-nowrap">
                        ₺{Number(p.price || 0).toFixed(2)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CariMaliyetProductModal;

