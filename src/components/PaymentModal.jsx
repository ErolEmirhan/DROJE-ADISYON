import React, { useMemo, useState } from 'react';
import { isGeceDonercisi } from '../utils/sultanSomatTables';
import { getThemeColors } from '../utils/themeUtils';

const PaymentModal = ({ totalAmount, onSelectPayment, onClose, tenantId = null }) => {
  const [confirmMethod, setConfirmMethod] = useState(null); // 'Nakit' | 'Kredi Kartı' | null
  const theme = useMemo(() => getThemeColors('#16a34a'), []); // sadece confirm butonu için (yeşil ton)
  const isGeceDonercisiMode = tenantId && isGeceDonercisi(tenantId);

  const handleChoose = (method) => {
    if (isGeceDonercisiMode && (method === 'Nakit' || method === 'Kredi Kartı')) {
      setConfirmMethod(method);
      return;
    }
    onSelectPayment(method);
  };

  const confirmAndProceed = () => {
    const m = confirmMethod;
    setConfirmMethod(null);
    if (m) onSelectPayment(m);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white backdrop-blur-xl border border-purple-200 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2 gradient-text">Ödeme Yöntemi Seçin</h2>
          <p className="text-gray-600">Toplam Tutar</p>
          <p className="text-4xl font-bold mt-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            ₺{totalAmount.toFixed(2)}
          </p>
        </div>


        <div className="space-y-4 mb-6">
          <button
            onClick={() => handleChoose('Nakit')}
            className="w-full p-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-2xl text-white font-bold text-xl transition-all duration-300 hover:shadow-2xl hover:scale-105 active:scale-95"
          >
            <div className="flex items-center justify-center space-x-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Nakit Ödeme</span>
            </div>
          </button>

          <button
            onClick={() => handleChoose('Kredi Kartı')}
            className="w-full p-6 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-2xl text-white font-bold text-xl transition-all duration-300 hover:shadow-2xl hover:scale-105 active:scale-95"
          >
            <div className="flex items-center justify-center space-x-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span>Kredi Kartı</span>
            </div>
          </button>

          <button
            onClick={() => onSelectPayment('split')}
            className="w-full p-6 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-2xl text-white font-bold text-xl transition-all duration-300 hover:shadow-2xl hover:scale-105 active:scale-95"
          >
            <div className="flex items-center justify-center space-x-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span>Ayrı Ödemeler Al</span>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600 hover:text-gray-800 font-medium transition-all duration-300"
        >
          İptal
        </button>
      </div>

      {confirmMethod && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={(e) => e.target === e.currentTarget && setConfirmMethod(null)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <div className="text-base font-extrabold text-gray-900">Emin misiniz?</div>
              <div className="text-xs text-gray-600 mt-1">
                Ödeme yöntemi: <span className="font-bold text-gray-900">{confirmMethod}</span>
              </div>
            </div>
            <div className="p-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmMethod(null)}
                className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={confirmAndProceed}
                className="flex-1 py-3 rounded-xl text-white font-extrabold shadow-md"
                style={{ backgroundImage: theme.gradient.main }}
              >
                Evet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentModal;

