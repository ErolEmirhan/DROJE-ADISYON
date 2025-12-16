import React, { useState, useEffect } from 'react';

const TableTransferModal = ({ 
  currentOrder, 
  currentTableId, 
  currentTableType,
  onClose, 
  onTransfer 
}) => {
  const [step, setStep] = useState(1); // 1: source table, 2: target table
  const [tableOrders, setTableOrders] = useState([]);
  const [selectedSourceTable, setSelectedSourceTable] = useState(null);
  const [selectedTargetTable, setSelectedTargetTable] = useState(null);

  const insideTables = Array.from({ length: 20 }, (_, i) => ({
    id: `inside-${i + 1}`,
    number: i + 1,
    type: 'inside',
    name: `İçeri ${i + 1}`
  }));

  const outsideTables = Array.from({ length: 20 }, (_, i) => ({
    id: `outside-${i + 1}`,
    number: i + 1,
    type: 'outside',
    name: `Dışarı ${i + 1}`
  }));

  // Paket masaları (hem içeri hem dışarı için)
  const packageTablesInside = Array.from({ length: 5 }, (_, i) => ({
    id: `package-inside-${i + 1}`,
    number: i + 1,
    type: 'inside',
    name: `Paket ${i + 1}`
  }));

  const packageTablesOutside = Array.from({ length: 5 }, (_, i) => ({
    id: `package-outside-${i + 1}`,
    number: i + 1,
    type: 'outside',
    name: `Paket ${i + 1}`
  }));

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

  // Tüm masaları göster (iç, dış ve paket masaları)
  const allTables = [...insideTables, ...outsideTables, ...packageTablesInside, ...packageTablesOutside];

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
                          ? 'bg-green-100 border-green-500 scale-105'
                          : 'bg-green-50 border-green-300 hover:border-green-400 hover:scale-105'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                          <span className="text-white text-xs font-bold">{table.number}</span>
                        </div>
                        <span className="text-xs text-gray-800 mt-1 font-semibold">{table.name}</span>
                        <span className="text-[10px] text-green-600 mt-0.5">Dolu</span>
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
                          ? 'bg-blue-100 border-blue-500 scale-105'
                          : 'bg-white border-gray-300 hover:border-blue-400 hover:scale-105'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-white text-xs font-bold">{table.number}</span>
                        </div>
                        <span className="text-xs text-gray-800 mt-1 font-semibold">{table.name}</span>
                        <span className="text-[10px] text-gray-600 mt-0.5">Boş</span>
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

