import React, { useMemo, useState } from 'react';
import { getThemeColors } from '../utils/themeUtils';

const DonerOptionsModal = ({ productName, themeColor = '#f97316', onClose, onConfirm }) => {
  const theme = useMemo(() => getThemeColors(themeColor), [themeColor]);
  const [sogansiz, setSogansiz] = useState(false);
  const [domatessiz, setDomatessiz] = useState(false);
  const [sade, setSade] = useState(false);
  const [azSoganli, setAzSoganli] = useState(false);

  const btnClass = (active) =>
    `py-3 rounded-2xl border font-extrabold transition-all ${active ? 'bg-white shadow-md' : 'bg-gray-50 hover:bg-white'}`;
  const btnStyle = (active) =>
    active ? { borderColor: theme.primary500, color: theme.primary700 } : { borderColor: '#e5e7eb', color: '#111827' };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-extrabold text-gray-900">Seçim</h3>
            <p className="text-xs text-gray-500 mt-1">{productName}</p>
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
            <div className="text-sm font-extrabold text-gray-800 mb-2">İçerik</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSogansiz((v) => !v)}
                className={btnClass(sogansiz)}
                style={btnStyle(sogansiz)}
              >
                Soğansız
              </button>
              <button
                type="button"
                onClick={() => setDomatessiz((v) => !v)}
                className={btnClass(domatessiz)}
                style={btnStyle(domatessiz)}
              >
                Domatessiz
              </button>
              <button
                type="button"
                onClick={() => setSade((v) => !v)}
                className={btnClass(sade)}
                style={btnStyle(sade)}
              >
                Sade
              </button>
              <button
                type="button"
                onClick={() => setAzSoganli((v) => !v)}
                className={btnClass(azSoganli)}
                style={btnStyle(azSoganli)}
              >
                Az Soğanlı
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={() => onConfirm?.({ sogansiz, domatessiz, sade, azSoganli })}
              className="flex-1 py-3 rounded-2xl text-white font-extrabold shadow-md"
              style={{ backgroundImage: theme.gradient.main }}
            >
              Ekle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DonerOptionsModal;

