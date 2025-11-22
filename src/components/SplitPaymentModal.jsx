import React, { useState } from 'react';

const SplitPaymentModal = ({ cart, totalAmount, onCompleteSplitPayment, onClose }) => {
  // Her ürünü miktarına göre ayrı ayrı göster (3 adet varsa 3 ayrı satır)
  const expandedItems = [];
  cart.forEach(item => {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({
        ...item,
        uniqueId: `${item.id}-${i}`, // Her birim için benzersiz ID
        quantity: 1 // Her satır 1 adet
      });
    }
  });

  const [itemPayments, setItemPayments] = useState(() => {
    // Her birim için varsayılan ödeme yöntemi (Nakit)
    const initial = {};
    expandedItems.forEach(item => {
      initial[item.uniqueId] = 'Nakit';
    });
    return initial;
  });

  const handlePaymentMethodChange = (uniqueId, method) => {
    setItemPayments(prev => ({
      ...prev,
      [uniqueId]: method
    }));
  };

  const handleComplete = () => {
    // Her birim için ödeme yöntemini içeren veri hazırla
    const splitPayments = expandedItems.map(item => ({
      ...item,
      paymentMethod: itemPayments[item.uniqueId]
    }));
    
    onCompleteSplitPayment(splitPayments);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white backdrop-blur-xl border border-purple-200 rounded-3xl p-8 max-w-3xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold gradient-text">Ayrı Ödemeler</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-6">
          <p className="text-gray-600 mb-2">Toplam Tutar</p>
          <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            ₺{totalAmount.toFixed(2)}
          </p>
        </div>

        <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto">
          {expandedItems.map((item, index) => {
            const itemTotal = item.price; // Her satır 1 adet
            const selectedMethod = itemPayments[item.uniqueId] || 'Nakit';
            
            return (
              <div
                key={item.uniqueId}
                className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-800 mb-1">{item.name}</h3>
                    <p className="text-sm text-gray-600">
                      1 adet × ₺{item.price.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-purple-600">
                      ₺{itemTotal.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handlePaymentMethodChange(item.uniqueId, 'Nakit')}
                    className={`p-4 rounded-xl font-semibold transition-all duration-300 ${
                      selectedMethod === 'Nakit'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg scale-105'
                        : 'bg-white text-gray-700 hover:bg-green-50 border-2 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>Nakit</span>
                    </div>
                  </button>

                  <button
                    onClick={() => handlePaymentMethodChange(item.uniqueId, 'Kredi Kartı')}
                    className={`p-4 rounded-xl font-semibold transition-all duration-300 ${
                      selectedMethod === 'Kredi Kartı'
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg scale-105'
                        : 'bg-white text-gray-700 hover:bg-blue-50 border-2 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <span>Kredi Kartı</span>
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex space-x-4">
          <button
            onClick={onClose}
            className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600 hover:text-gray-800 font-semibold text-lg transition-all duration-300"
          >
            İptal
          </button>
          <button
            onClick={handleComplete}
            className="flex-1 py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-xl text-white font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:scale-105 active:scale-95"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Ödemeleri Tamamla</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SplitPaymentModal;

