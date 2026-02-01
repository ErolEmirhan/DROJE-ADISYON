import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { GECE_BRANCHES } from '../utils/geceDonercisiBranchSelection';
import { getThemeColors } from '../utils/themeUtils';

export default function BranchSelectModal({
  themeColor = '#0f172a',
  open,
  selectedBranch,
  onSelectBranch,
  onConfirm,
  confirmText = 'Kaydet',
  title = 'Şube seçiniz (zorunlu)',
  description = 'Bu cihaz hangi şubede kullanılacak? Seçiminize göre stok işlemleri şube bazında takip edilecektir.',
}) {
  const theme = useMemo(() => getThemeColors(themeColor), [themeColor]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-6">
      <div className="bg-white rounded-[28px] w-full max-w-lg shadow-2xl border border-white/30 overflow-hidden">
        <div
          className="p-6 text-white"
          style={{ background: `linear-gradient(135deg, ${theme.primary500} 0%, ${theme.primary700} 100%)` }}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🏢</span>
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-black tracking-tight">{title}</h3>
              <p className="text-white/90 text-sm font-medium mt-1">{description}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            {GECE_BRANCHES.map((b) => {
              const active = selectedBranch === b.value;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => onSelectBranch?.(b.value)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
                  }`}
                >
                  <div className="text-sm font-semibold opacity-80">Şube</div>
                  <div className="text-2xl font-black tracking-tight mt-1">{b.label}</div>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mt-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
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
              className={`px-6 py-3 rounded-2xl font-bold text-white transition-all ${
                !selectedBranch || saving
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 shadow-lg'
              }`}
              style={!selectedBranch || saving ? undefined : { boxShadow: `0 10px 24px ${theme.primary500}30` }}
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

