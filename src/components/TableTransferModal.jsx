import React, { useState, useEffect, useMemo } from 'react';
import { isSultanSomati, generateSultanSomatiTables, isYakasGrill, generateYakasGrillTables, isGeceDonercisi, generateGeceDonercisiTables, isLacromisa, LACROMISA_INSIDE_LABEL, LACROMISA_OUTSIDE_LABEL } from '../utils/sultanSomatTables';

const TableTransferModal = ({ 
  currentOrder, 
  currentTableId, 
  currentTableType,
  onClose, 
  onTransfer,
  tenantId,
  insideTablesCount = 20,
  outsideTablesCount = 20,
  packageTablesCount = 5
}) => {
  const [step, setStep] = useState(1); // 1: source table, 2: target table
  const [tableOrders, setTableOrders] = useState([]);
  const [selectedSourceTable, setSelectedSourceTable] = useState(null);
  const [selectedTargetTable, setSelectedTargetTable] = useState(null);

  const isSultanSomatiMode = isSultanSomati(tenantId);
  const isYakasGrillMode = isYakasGrill(tenantId);
  const isGeceDonercisiMode = isGeceDonercisi(tenantId);
  const isLacromisaMode = isLacromisa(tenantId);

  // Lacromisa: sabit 15 içeri / 15 dışarı, paket yok
  const effectiveInsideTablesCount = isLacromisaMode ? 15 : insideTablesCount;
  const effectiveOutsideTablesCount = isLacromisaMode ? 15 : outsideTablesCount;
  const effectivePackageTablesCount = isLacromisaMode ? 0 : packageTablesCount;

  // Sultan Somatı için salon bazlı masalar
  const sultanSomatiTables = useMemo(() => {
    if (!isSultanSomatiMode) return [];
    return generateSultanSomatiTables();
  }, [isSultanSomatiMode]);

  // Yaka's Grill için direkt masalar (Salon)
  const yakasGrillTables = useMemo(() => {
    if (!isYakasGrillMode) return [];
    return generateYakasGrillTables();
  }, [isYakasGrillMode]);

  // Yaka's Grill için paket masaları
  const yakasGrillPackageTables = useMemo(() => {
    if (!isYakasGrillMode) return [];
    return Array.from({ length: 25 }, (_, i) => ({
      id: `package-masa-${i + 1}`,
      number: i + 1,
      type: 'package',
      name: `Paket ${i + 1}`
    }));
  }, [isYakasGrillMode]);

  // Gece Dönercisi: 6 kategoride 30'ar masa (salon, bahçe, paket, trendyolgo, yemeksepeti, migros yemek)
  const geceDonercisiTables = useMemo(() => {
    if (!isGeceDonercisiMode) return [];
    return generateGeceDonercisiTables();
  }, [isGeceDonercisiMode]);

  // Normal mod / Lacromisa için masalar (Lacromisa: Salon/Bahçe isimleri)
  const insideTableLabel = isLacromisaMode ? LACROMISA_INSIDE_LABEL : 'İçeri';
  const outsideTableLabel = isLacromisaMode ? LACROMISA_OUTSIDE_LABEL : 'Dışarı';
  const insideTables = useMemo(() => {
    if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode) return [];
    return Array.from({ length: effectiveInsideTablesCount }, (_, i) => ({
      id: `inside-${i + 1}`,
      number: i + 1,
      type: 'inside',
      name: `${insideTableLabel} ${i + 1}`
    }));
  }, [effectiveInsideTablesCount, isSultanSomatiMode, isYakasGrillMode, isGeceDonercisiMode, insideTableLabel]);

  const outsideTables = useMemo(() => {
    if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode) return [];
    return Array.from({ length: effectiveOutsideTablesCount }, (_, i) => ({
      id: `outside-${i + 1}`,
      number: i + 1,
      type: 'outside',
      name: `${outsideTableLabel} ${i + 1}`
    }));
  }, [effectiveOutsideTablesCount, isSultanSomatiMode, isYakasGrillMode, isGeceDonercisiMode, outsideTableLabel]);

  // Paket masaları (hem içeri hem dışarı için) - Sultan Somatı ve Yaka's Grill'de yok
  const packageTablesInside = useMemo(() => {
    if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode) return [];
    if (!effectivePackageTablesCount) return [];
    return Array.from({ length: effectivePackageTablesCount }, (_, i) => ({
      id: `package-inside-${i + 1}`,
      number: i + 1,
      type: 'inside',
      name: `Paket ${i + 1}`
    }));
  }, [effectivePackageTablesCount, isSultanSomatiMode, isYakasGrillMode, isGeceDonercisiMode]);

  const packageTablesOutside = useMemo(() => {
    if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode) return [];
    if (!effectivePackageTablesCount) return [];
    return Array.from({ length: effectivePackageTablesCount }, (_, i) => ({
      id: `package-outside-${i + 1}`,
      number: i + 1,
      type: 'outside',
      name: `Paket ${i + 1}`
    }));
  }, [effectivePackageTablesCount, isSultanSomatiMode, isYakasGrillMode, isGeceDonercisiMode]);

  useEffect(() => {
    loadTableOrders();
  }, []);

  const loadTableOrders = async () => {
    if (window.electronAPI && window.electronAPI.getTableOrders) {
      try {
        const orders = await window.electronAPI.getTableOrders();
        setTableOrders(orders || []);
      } catch (error) {
        console.error('Masa siparişleri yüklenemedi:', error);
      }
    }
  };

  const getTableOrder = (tableId) => {
    return tableOrders.find(order => order.table_id === tableId && order.status === 'pending');
  };

  const hasOrder = (tableId) => {
    return !!getTableOrder(tableId);
  };

  const handleSourceTableSelect = (table) => {
    if (!hasOrder(table.id)) {
      alert('Bu masa boş! Lütfen dolu bir masa seçin.');
      return;
    }
    setSelectedSourceTable(table);
    setStep(2);
  };

  const handleTargetTableSelect = (table) => {
    if (hasOrder(table.id)) {
      alert('Bu masa dolu! Lütfen boş bir masa seçin.');
      return;
    }
    if (table.id === selectedSourceTable?.id) {
      alert('Aynı masayı seçemezsiniz!');
      return;
    }
    setSelectedTargetTable(table);
  };

  const handleConfirmTransfer = async () => {
    if (!selectedSourceTable || !selectedTargetTable) {
      alert('Lütfen hem kaynak hem de hedef masayı seçin.');
      return;
    }

    if (selectedSourceTable.id === selectedTargetTable.id) {
      alert('Aynı masayı seçemezsiniz!');
      return;
    }

    if (onTransfer) {
      await onTransfer(selectedSourceTable.id, selectedTargetTable.id);
    }
  };

  // Tüm masaları göster (Gece Dönercisi: 6 kategori × 30 masa = 180 masa)
  const allTables = isSultanSomatiMode 
    ? sultanSomatiTables 
    : isYakasGrillMode
    ? [...yakasGrillTables, ...yakasGrillPackageTables]
    : isGeceDonercisiMode
    ? geceDonercisiTables
    : [...insideTables, ...outsideTables, ...packageTablesInside, ...packageTablesOutside];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {step === 1 ? 'Aktarılacak Masayı Seçin (Dolu)' : 'Aktarılacak Masayı Seçin (Boş)'}
            </h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {step === 1 && selectedSourceTable && (
            <p className="mt-2 text-sm opacity-90">
              Seçilen: {selectedSourceTable.name}
            </p>
          )}
          {step === 2 && selectedTargetTable && (
            <p className="mt-2 text-sm opacity-90">
              Kaynak: {selectedSourceTable?.name} → Hedef: {selectedTargetTable.name}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 ? (
            <div>
              <p className="text-gray-600 mb-4 font-semibold">
                Lütfen içeriği aktarılacak dolu masayı seçin:
              </p>
              <div className="grid grid-cols-10 gap-2">
                {allTables.map((table) => {
                  const tableHasOrder = hasOrder(table.id);
                  const isSelected = selectedSourceTable?.id === table.id;
                  
                  if (!tableHasOrder) {
                    return (
                      <div
                        key={table.id}
                        className="opacity-30 cursor-not-allowed rounded-md p-2 border-2 border-gray-300 bg-gray-100"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">{table.number}</span>
                          </div>
                          <span className="text-xs text-gray-500 mt-1">{table.name}</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={table.id}
                      onClick={() => handleSourceTableSelect(table)}
                      className={`rounded-md p-2 border-2 transition-all ${
                        isSelected
                          ? 'bg-gradient-to-br from-red-600 to-red-900 border-red-800 scale-105 text-red-50'
                          : 'bg-gradient-to-br from-red-500 to-red-800 border-red-700 hover:border-red-800 hover:scale-105 text-red-50'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-900 flex items-center justify-center shadow-md">
                          <span className="text-white text-xs font-bold">{table.number}</span>
                        </div>
                        <span className="text-xs mt-1 font-semibold text-red-50">{table.name}</span>
                        <span className="text-[10px] text-red-200 mt-0.5">Dolu</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-600 mb-4 font-semibold">
                Lütfen içeriğin aktarılacağı boş masayı seçin:
              </p>
              <div className="grid grid-cols-10 gap-2">
                {allTables.map((table) => {
                  const tableHasOrder = hasOrder(table.id);
                  const isSelected = selectedTargetTable?.id === table.id;
                  const isSourceTable = selectedSourceTable?.id === table.id;
                  const isOutside = !isSultanSomatiMode && !isGeceDonercisiMode && table.type === 'outside';
                  const isSultanTable = isSultanSomatiMode && table.salonId;
                  const isGeceTable = isGeceDonercisiMode && (table.categoryId || table.type);

                  if (tableHasOrder || isSourceTable) {
                    return (
                      <div
                        key={table.id}
                        className="opacity-30 cursor-not-allowed rounded-md p-2 border-2 border-gray-300 bg-gray-100"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">{table.number}</span>
                          </div>
                          <span className="text-xs text-gray-500 mt-1">{table.name}</span>
                          {isSourceTable && (
                            <span className="text-[10px] text-red-600 mt-0.5">Kaynak</span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={table.id}
                      onClick={() => handleTargetTableSelect(table)}
                      className={`rounded-md p-2 border-2 transition-all ${
                        isSelected
                          ? isSultanTable
                            ? 'bg-purple-100 border-purple-400 scale-105'
                            : isGeceTable
                            ? 'bg-slate-100 border-slate-400 scale-105'
                            : isOutside
                            ? 'bg-amber-100 border-amber-400 scale-105'
                            : 'bg-pink-100 border-pink-400 scale-105'
                          : isSultanTable
                            ? 'bg-gradient-to-br from-purple-50 to-pink-100 border-purple-300 hover:border-purple-400 hover:scale-105'
                            : isGeceTable
                            ? 'bg-gradient-to-br from-slate-50 to-slate-100 border-slate-300 hover:border-slate-400 hover:scale-105'
                            : isOutside
                            ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-300 hover:border-amber-400 hover:scale-105'
                            : 'bg-gradient-to-br from-pink-50 to-pink-100 border-pink-200 hover:border-pink-300 hover:scale-105'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            isSultanTable
                              ? 'bg-gradient-to-br from-purple-200 to-pink-300 text-purple-900'
                              : isGeceTable
                              ? 'bg-gradient-to-br from-slate-200 to-slate-300 text-slate-900'
                              : isOutside
                              ? 'bg-gradient-to-br from-amber-200 to-amber-300 text-amber-900'
                              : 'bg-gradient-to-br from-pink-100 to-pink-200 text-pink-900'
                          }`}
                        >
                          {isSultanTable || isGeceTable ? (
                            <span className="text-sm">{table.icon}</span>
                          ) : (
                            <span className="text-xs font-bold">{table.number}</span>
                          )}
                        </div>
                        <span
                          className={`text-xs mt-1 font-semibold ${
                            isSultanTable ? 'text-purple-900' : isGeceTable ? 'text-slate-900' : isOutside ? 'text-amber-900' : 'text-pink-900'
                          }`}
                        >
                          {table.name}
                        </span>
                        <span
                          className={`text-[10px] mt-0.5 ${
                            isSultanTable ? 'text-purple-800' : isGeceTable ? 'text-slate-700' : isOutside ? 'text-amber-800' : 'text-pink-700'
                          }`}
                        >
                          Boş
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-between items-center">
          <button
            onClick={() => {
              if (step === 2) {
                setStep(1);
                setSelectedTargetTable(null);
              } else {
                onClose();
              }
            }}
            className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
          >
            {step === 2 ? 'Geri' : 'İptal'}
          </button>
          
          {step === 2 && (
            <button
              onClick={handleConfirmTransfer}
              disabled={!selectedTargetTable}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Aktar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TableTransferModal;

