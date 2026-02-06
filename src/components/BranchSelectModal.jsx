import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GECE_BRANCHES } from '../utils/geceDonercisiBranchSelection';

export default function BranchSelectModal({
  open,
  selectedBranch,
  onSelectBranch,
  onConfirm,
  confirmText = 'Kaydet',
  title = 'Hangi şubedesiniz?',
  description = 'Bu bilgisayar (veya tablet) şu an Sancak şubesinde mi, Şeker şubesinde mi kullanılacak? Aşağıdan birini seçin.',
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[10000] flex items-center justify-center p-8 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-gray-200/80">
        {/* Başlık — salağa anlatır gibi, çok net */}
        <div className="px-12 pt-12 pb-6">
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
          <p className="text-gray-600 text-lg mt-3 leading-relaxed max-w-2xl">{description}</p>
          <p className="text-gray-500 text-base mt-4 font-semibold">
            1) Aşağıdan <strong>Sancak</strong> veya <strong>Şeker</strong>e tıklayın → 2) Yeşil olan seçilir, sonra <strong>Kaydet</strong>e basın.
          </p>
        </div>

        {/* Şube seçenekleri — büyük kartlar, seçili yeşil + tik */}
        <div className="px-12 pb-10">
          <div className="grid grid-cols-2 gap-6">
            {GECE_BRANCHES.map((b) => {
              const active = selectedBranch === b.value;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => onSelectBranch?.(b.value)}
                  className={`relative flex items-center justify-center gap-4 rounded-2xl border-2 transition-all duration-200 min-h-[120px] ${
                    active
                      ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-[1.02]'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {active && (
                    <span className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/25 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                  <span className={`text-2xl font-extrabold tracking-tight ${active ? 'text-white' : 'text-gray-900'}`}>
                    {b.label}
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-base font-semibold">
              {error}
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              disabled={!selectedBranch || saving}
              onClick={async () => {
                if (!selectedBranch || saving) return;
                setError('');
                setSaving(true);
                try {
                  await onConfirm?.(selectedBranch);
                } catch (e) {
                  setError(e?.message || 'Şube kaydedilemedi. Lütfen tekrar deneyin.');
                } finally {
                  setSaving(false);
                }
              }}
              className={`px-10 py-4 rounded-xl text-lg font-bold transition-all ${
                !selectedBranch || saving
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-800 shadow-lg'
              }`}
            >
              {saving ? 'Kaydediliyor…' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

