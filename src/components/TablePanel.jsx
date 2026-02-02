import React, { useState, useEffect, useMemo } from 'react';
import TableOrderModal from './TableOrderModal';
import TablePartialPaymentModal from './TablePartialPaymentModal';
import TableTransferModal from './TableTransferModal';
import { isSultanSomati, generateSultanSomatiTables, SULTAN_SOMATI_SALONS, isYakasGrill, generateYakasGrillTables, isGeceDonercisi, generateGeceDonercisiTables, GECE_DONERCISI_CATEGORIES, isLacromisa } from '../utils/sultanSomatTables';

const TablePanel = ({ onSelectTable, refreshTrigger, onShowReceipt, tenantId, insideTablesCount = 20, outsideTablesCount = 20, packageTablesCount = 5 }) => {
  const isSultanSomatiMode = isSultanSomati(tenantId);
  const isYakasGrillMode = isYakasGrill(tenantId);
  const isGeceDonercisiMode = isGeceDonercisi(tenantId);
  const isLacromisaMode = isLacromisa(tenantId);

  // Lacromisa: sabit 15 içeri / 15 dışarı, paket yok
  const effectiveInsideTablesCount = isLacromisaMode ? 15 : insideTablesCount;
  const effectiveOutsideTablesCount = isLacromisaMode ? 15 : outsideTablesCount;
  const effectivePackageTablesCount = isLacromisaMode ? 0 : packageTablesCount;
  const [selectedType, setSelectedType] = useState(
    isSultanSomatiMode ? 'disari' : isYakasGrillMode ? 'salon' : isGeceDonercisiMode ? 'salon' : 'inside'
  ); // Salon/kategori ID veya 'inside'/'outside'
  const [tableOrders, setTableOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showPartialPaymentModal, setShowPartialPaymentModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [errorToast, setErrorToast] = useState(null);

  // Debug: Masa sayılarını logla
  useEffect(() => {
    console.log('🪑 TablePanel - Masa Sayıları:', {
      insideTablesCount: effectiveInsideTablesCount,
      outsideTablesCount: effectiveOutsideTablesCount,
      packageTablesCount: effectivePackageTablesCount,
      insideTablesCountType: typeof effectiveInsideTablesCount,
      outsideTablesCountType: typeof effectiveOutsideTablesCount
    });
  }, [effectiveInsideTablesCount, effectiveOutsideTablesCount, effectivePackageTablesCount]);

  // Sultan Somatı için salon bazlı masalar
  const sultanSomatiTables = useMemo(() => {
    if (!isSultanSomatiMode) return [];
    return generateSultanSomatiTables();
  }, [isSultanSomatiMode]);

  // Seçili salona göre masaları filtrele (Sultan Somatı için)
  const currentSalonTables = useMemo(() => {
    if (!isSultanSomatiMode) return [];
    return sultanSomatiTables.filter(table => table.type === selectedType);
  }, [isSultanSomatiMode, sultanSomatiTables, selectedType]);

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

  // Yaka's Grill için Yemeksepeti masaları
  const yakasGrillYemeksepetiTables = useMemo(() => {
    if (!isYakasGrillMode) return [];
    return Array.from({ length: 20 }, (_, i) => ({
      id: `yemeksepeti-${i + 1}`,
      number: i + 1,
      type: 'yemeksepeti',
      name: `Yemeksepeti-${i + 1}`
    }));
  }, [isYakasGrillMode]);

  // Yaka's Grill için TrendyolGO masaları
  const yakasGrillTrendyolGOTables = useMemo(() => {
    if (!isYakasGrillMode) return [];
    return Array.from({ length: 20 }, (_, i) => ({
      id: `trendyolgo-${i + 1}`,
      number: i + 1,
      type: 'trendyolgo',
      name: `TrendyolGO-${i + 1}`
    }));
  }, [isYakasGrillMode]);

  // Gece Dönercisi: 6 kategoride 30'ar masa (salon, bahçe, paket, trendyolgo, yemeksepeti, migros yemek)
  const geceDonercisiTables = useMemo(() => {
    if (!isGeceDonercisiMode) return [];
    return generateGeceDonercisiTables();
  }, [isGeceDonercisiMode]);

  const currentGeceDonercisiTables = useMemo(() => {
    if (!isGeceDonercisiMode) return [];
    return geceDonercisiTables.filter(table => table.type === selectedType);
  }, [isGeceDonercisiMode, geceDonercisiTables, selectedType]);

  // Normal mod için masalar
  const insideTables = useMemo(() => {
    if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode) return [];
    console.log('🔄 insideTables oluşturuluyor, count:', effectiveInsideTablesCount);
    return Array.from({ length: effectiveInsideTablesCount }, (_, i) => ({
      id: `inside-${i + 1}`,
      number: i + 1,
      type: 'inside',
      name: `İçeri ${i + 1}`
    }));
  }, [effectiveInsideTablesCount, isSultanSomatiMode, isYakasGrillMode, isGeceDonercisiMode]);

  const outsideTables = useMemo(() => {
    if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode) return [];
    console.log('🔄 outsideTables oluşturuluyor, count:', effectiveOutsideTablesCount);
    return Array.from({ length: effectiveOutsideTablesCount }, (_, i) => ({
      id: `outside-${i + 1}`,
      number: i + 1,
      type: 'outside',
      name: `Dışarı ${i + 1}`
    }));
  }, [effectiveOutsideTablesCount, isSultanSomatiMode, isYakasGrillMode, isGeceDonercisiMode]);

  // Paket masaları (hem içeri hem dışarı için) - Sultan Somatı, Yaka's Grill ve Gece Dönercisi'nde yok
  const packageTables = useMemo(() => {
    if (isSultanSomatiMode || isYakasGrillMode || isGeceDonercisiMode) return [];
    if (!effectivePackageTablesCount) return [];
    return Array.from({ length: effectivePackageTablesCount }, (_, i) => ({
      id: `package-${selectedType}-${i + 1}`,
      number: i + 1,
      type: selectedType,
      name: `Paket ${i + 1}`
    }));
  }, [effectivePackageTablesCount, selectedType, isSultanSomatiMode, isYakasGrillMode, isGeceDonercisiMode]);

  // Masa siparişlerini yükle
  useEffect(() => {
    loadTableOrders();
    
    // Yeni sipariş geldiğinde dinle (mobil cihazdan veya Electron'dan gelen siparişler için)
    if (window.electronAPI && window.electronAPI.onNewOrderCreated) {
      const unsubscribe = window.electronAPI.onNewOrderCreated(async (data) => {
        console.log('📦 Yeni sipariş alındı:', data);
        // Siparişleri yenile (kısa bir gecikme ile veritabanının güncellenmesini bekle)
        setTimeout(async () => {
          await loadTableOrders();
          
          // Eğer modal açıksa ve aynı masaya sipariş eklendiyse, modal'daki sipariş detaylarını da yenile
          if (showModal && selectedOrder && data.tableId === selectedOrder.table_id) {
            try {
              // Güncel siparişleri API'den yükle
              const orders = await window.electronAPI.getTableOrders();
              const updatedOrder = orders.find(o => o.id === selectedOrder.id && o.status === 'pending');
              if (updatedOrder) {
                const updatedItems = await window.electronAPI.getTableOrderItems(updatedOrder.id);
                setSelectedOrder(updatedOrder);
                setOrderItems(updatedItems || []);
              }
            } catch (error) {
              console.error('Sipariş detayları yenilenirken hata:', error);
            }
          }
        }, 500);
      });
      
      return () => {
        if (unsubscribe && typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [showModal, selectedOrder]);

  // Masa tipi değiştiğinde siparişleri yenile
  useEffect(() => {
    loadTableOrders();
  }, [selectedType]);

  // Refresh trigger değiştiğinde siparişleri yenile
  useEffect(() => {
    if (refreshTrigger) {
      loadTableOrders();
    }
  }, [refreshTrigger]);

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

  // Belirli bir masa için sipariş var mı kontrol et
  const getTableOrder = (tableId) => {
    return tableOrders.find(order => order.table_id === tableId && order.status === 'pending');
  };

  // Masa sipariş detaylarını göster
  const handleViewOrder = async (table) => {
    const order = getTableOrder(table.id);
    if (order && window.electronAPI && window.electronAPI.getTableOrderItems) {
      try {
        const items = await window.electronAPI.getTableOrderItems(order.id);
        setSelectedOrder(order);
        setOrderItems(items || []);
        setShowModal(true);
      } catch (error) {
        console.error('Sipariş detayları yüklenemedi:', error);
      }
    }
  };

  // Masa butonuna tıklandığında
  const handleTableClick = (table) => {
    const order = getTableOrder(table.id);
    if (order) {
      // Sipariş varsa detayları göster
      handleViewOrder(table);
    } else {
      // Sipariş yoksa yeni sipariş oluştur
      onSelectTable(table);
    }
  };

  // Sipariş ekle - mevcut siparişe yeni ürünler eklemek için
  const handleAddItems = () => {
    if (!selectedOrder) return;
    
      // Tüm masaları birleştir
      const allTables = isSultanSomatiMode 
        ? sultanSomatiTables 
        : isYakasGrillMode
        ? [...yakasGrillTables, ...yakasGrillPackageTables, ...yakasGrillYemeksepetiTables, ...yakasGrillTrendyolGOTables]
        : isGeceDonercisiMode
        ? geceDonercisiTables
        : [...insideTables, ...outsideTables, ...packageTables];
      
      // Masayı bul
      const table = allTables.find(t => t.id === selectedOrder.table_id);
      if (table) {
        // Modal'ı kapat
        setShowModal(false);
        setSelectedOrder(null);
        setOrderItems([]);
        // Masayı seç ve sipariş ekleme moduna geç
        onSelectTable(table);
      } else {
        // Eğer masa bulunamazsa, selectedOrder'dan masa bilgisini oluştur
        const tableId = selectedOrder.table_id;
        let table = null;
        
        if (tableId.startsWith('salon-')) {
          // Sultan Somatı salon masası
          const parts = tableId.split('-');
          const salonId = parts.slice(1, -1).join('-');
          const number = parseInt(parts[parts.length - 1]);
          const salon = SULTAN_SOMATI_SALONS.find(s => s.id === salonId);
          table = {
            id: tableId,
            number: number,
            type: salonId,
            salonId: salonId,
            salonName: salon?.name || salonId,
            name: salon?.count === 1 ? salon.name : `${salon?.name || salonId} ${number}`,
            icon: salon?.icon
          };
        } else if (tableId.startsWith('masa-')) {
          // Yaka's Grill masası
          const number = parseInt(tableId.replace('masa-', ''));
          table = {
            id: tableId,
            number: number,
            type: 'masa',
            name: `MASA-${number}`
          };
        } else if (tableId.startsWith('package-masa-')) {
          // Yaka's Grill paket masası
          const number = parseInt(tableId.replace('package-masa-', ''));
          table = {
            id: tableId,
            number: number,
            type: 'package',
            name: `Paket ${number}`
          };
        } else if (tableId.startsWith('yemeksepeti-')) {
          // Yaka's Grill Yemeksepeti masası
          const number = parseInt(tableId.replace('yemeksepeti-', ''));
          table = {
            id: tableId,
            number: number,
            type: 'yemeksepeti',
            name: `Yemeksepeti-${number}`
          };
        } else if (tableId.startsWith('trendyolgo-')) {
          // Yaka's Grill veya Gece Dönercisi TrendyolGO masası
          const number = parseInt(tableId.replace('trendyolgo-', ''));
          table = {
            id: tableId,
            number: number,
            type: 'trendyolgo',
            name: isGeceDonercisiMode ? `TrendyolGO ${number}` : `TrendyolGO-${number}`
          };
        } else if (tableId.startsWith('salon-') && isGeceDonercisiMode) {
          const number = parseInt(tableId.replace('salon-', ''));
          table = { id: tableId, number, type: 'salon', categoryId: 'salon', categoryName: 'Salon', name: `Salon ${number}`, icon: '🪑' };
        } else if (tableId.startsWith('bahce-')) {
          const number = parseInt(tableId.replace('bahce-', ''));
          table = { id: tableId, number, type: 'bahce', categoryId: 'bahce', categoryName: 'Bahçe', name: `Bahçe ${number}`, icon: '🌿' };
        } else if (tableId.startsWith('paket-') && isGeceDonercisiMode) {
          const number = parseInt(tableId.replace('paket-', ''));
          table = { id: tableId, number, type: 'paket', categoryId: 'paket', categoryName: 'Paket', name: `Paket ${number}`, icon: '📦' };
        } else if (tableId.startsWith('yemeksepeti-') && isGeceDonercisiMode) {
          const number = parseInt(tableId.replace('yemeksepeti-', ''));
          table = { id: tableId, number, type: 'yemeksepeti', categoryId: 'yemeksepeti', categoryName: 'Yemeksepeti', name: `Yemeksepeti ${number}`, icon: '🍽️' };
        } else if (tableId.startsWith('migros-yemek-')) {
          const number = parseInt(tableId.replace('migros-yemek-', ''));
          table = { id: tableId, number, type: 'migros-yemek', categoryId: 'migros-yemek', categoryName: 'Migros Yemek', name: `Migros Yemek ${number}`, icon: '🛍️' };
        } else if (tableId.startsWith('inside-')) {
          const number = parseInt(tableId.replace('inside-', ''));
          table = {
            id: tableId,
            number: number,
            type: 'inside',
            name: `İçeri ${number}`
          };
        } else if (tableId.startsWith('outside-')) {
          const number = parseInt(tableId.replace('outside-', ''));
          table = {
            id: tableId,
            number: number,
            type: 'outside',
            name: `Dışarı ${number}`
          };
        } else if (tableId.startsWith('package-')) {
          const parts = tableId.split('-');
          const number = parseInt(parts[parts.length - 1]);
          const type = parts[1] || 'inside';
          table = {
            id: tableId,
            number: number,
            type: type,
            name: `Paket ${number}`
          };
        }
      
      if (table) {
        // Modal'ı kapat
        setShowModal(false);
        setSelectedOrder(null);
        setOrderItems([]);
        // Masayı seç ve sipariş ekleme moduna geç
        onSelectTable(table);
      }
    }
  };

  // Masayı sonlandır
  const handleCompleteTable = async () => {
    if (!selectedOrder || !window.electronAPI || !window.electronAPI.completeTableOrder) {
      console.error('completeTableOrder API mevcut değil');
      return;
    }

    // Yemeksepeti, TrendyolGO veya Migros Yemek masası mı kontrol et (online ödeme)
    const isOnlineTable = selectedOrder.table_id && (
      selectedOrder.table_id.startsWith('yemeksepeti-') || 
      selectedOrder.table_id.startsWith('trendyolgo-') ||
      selectedOrder.table_id.startsWith('migros-yemek-')
    );

    let paymentMethod = null;

    // Eğer online masa ise otomatik "Online" seç
    if (isOnlineTable) {
      paymentMethod = 'Online';
      
      // 2 saniyelik loading kartı göster
      const loadingModal = document.createElement('div');
      loadingModal.className = 'fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[2000]';
      loadingModal.innerHTML = `
        <div class="bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl transform animate-scale-in">
          <div class="text-center">
            <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg animate-pulse">
              <svg class="w-10 h-10 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">Online Ödeme Alınıyor...</h3>
            <p class="text-gray-600 mb-6">Lütfen bekleyin</p>
            <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div class="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full animate-progress" style="width: 0%; animation: progress 2s linear forwards;"></div>
            </div>
          </div>
        </div>
        <style>
          @keyframes progress {
            from { width: 0%; }
            to { width: 100%; }
          }
          @keyframes scale-in {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          .animate-scale-in {
            animation: scale-in 0.3s ease-out;
          }
        </style>
      `;
      document.body.appendChild(loadingModal);

      // 2 saniye bekle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Loading kartını kaldır ve başarı kartını göster
      document.body.removeChild(loadingModal);
      
      const successModal = document.createElement('div');
      successModal.className = 'fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[2000]';
      successModal.innerHTML = `
        <div class="bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl transform animate-scale-in">
          <div class="text-center">
            <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
              <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">Başarıyla Alındı</h3>
            <p class="text-gray-600">Online ödeme başarıyla tamamlandı</p>
          </div>
        </div>
        <style>
          @keyframes scale-in {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          .animate-scale-in {
            animation: scale-in 0.3s ease-out;
          }
        </style>
      `;
      document.body.appendChild(successModal);

      // 1 saniye sonra kaldır
      setTimeout(() => {
        if (document.body.contains(successModal)) {
          document.body.removeChild(successModal);
        }
      }, 1000);
    } else {
      // Normal masa için ödeme yöntemi seçimi modal'ı göster
      const confirmPaymentMethodIfNeeded = (method) => {
        if (!isGeceDonercisiMode || (method !== 'Nakit' && method !== 'Kredi Kartı')) return Promise.resolve(true);
        return new Promise((resolveConfirm) => {
          const overlay = document.createElement('div');
          overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2500]';
          overlay.innerHTML = `
            <div class="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-200">
              <div class="text-base font-extrabold text-gray-900 mb-1">Emin misiniz?</div>
              <div class="text-sm text-gray-600 mb-4">Ödeme yöntemi: <span class="font-bold text-gray-900">${method}</span></div>
              <div class="flex gap-3">
                <button id="noBtn" class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-800 font-bold transition-all">Vazgeç</button>
                <button id="yesBtn" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 rounded-xl text-white font-extrabold transition-all shadow-md">Evet</button>
              </div>
            </div>
          `;
          document.body.appendChild(overlay);
          const cleanup = (val) => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            resolveConfirm(val);
          };
          overlay.querySelector('#yesBtn').onclick = () => cleanup(true);
          overlay.querySelector('#noBtn').onclick = () => cleanup(false);
          overlay.onclick = (e) => e.target === overlay && cleanup(false);
        });
      };

      paymentMethod = await new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
          <h3 class="text-xl font-bold text-gray-800 mb-2">Ödeme Yöntemi Seçin</h3>
          <p class="text-sm text-gray-600 mb-6">Masa: ${selectedOrder.table_name}</p>
          <p class="text-lg font-semibold text-gray-800 mb-6">Toplam: ₺${selectedOrder.total_amount.toFixed(2)}</p>
          <div class="grid grid-cols-2 gap-3 mb-4">
            <button id="cashBtn" class="p-4 rounded-xl font-semibold bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105">
              <div class="flex flex-col items-center space-y-2">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Nakit</span>
              </div>
            </button>
            <button id="cardBtn" class="p-4 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105">
              <div class="flex flex-col items-center space-y-2">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <span>Kredi Kartı</span>
              </div>
            </button>
          </div>
          <button id="cancelBtn" class="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-semibold transition-all">
            İptal
          </button>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      modal.querySelector('#cashBtn').onclick = async () => {
        const ok = await confirmPaymentMethodIfNeeded('Nakit');
        if (!ok) return;
        document.body.removeChild(modal);
        resolve('Nakit');
      };
      
      modal.querySelector('#cardBtn').onclick = async () => {
        const ok = await confirmPaymentMethodIfNeeded('Kredi Kartı');
        if (!ok) return;
        document.body.removeChild(modal);
        resolve('Kredi Kartı');
      };
      
      modal.querySelector('#cancelBtn').onclick = () => {
        document.body.removeChild(modal);
        resolve(null);
      };
      });
    }

    if (!paymentMethod) {
      return; // Kullanıcı iptal etti
    }

    try {
      const result = await window.electronAPI.completeTableOrder(selectedOrder.id, paymentMethod);
      
      if (result.success) {
        // Modal'ı kapat ve siparişleri yenile
        setShowModal(false);
        setSelectedOrder(null);
        setOrderItems([]);
        await loadTableOrders();
        // Başarı toast'ı göster
        setShowSuccessToast(true);
        setTimeout(() => {
          setShowSuccessToast(false);
        }, 1000);
      } else {
        setErrorToast({ message: 'Masa sonlandırılamadı: ' + (result.error || 'Bilinmeyen hata') });
        setTimeout(() => setErrorToast(null), 4000);
      }
    } catch (error) {
      console.error('Masa sonlandırılırken hata:', error);
      setErrorToast({ message: 'Masa sonlandırılamadı: ' + error.message });
      setTimeout(() => setErrorToast(null), 4000);
    }
  };

  // Kısmi ödeme modal'ını aç
  const handlePartialPayment = () => {
    setShowModal(false);
    setShowPartialPaymentModal(true);
  };

  // Adisyon yazdır
  const handleRequestAdisyon = async () => {
    if (!selectedOrder || orderItems.length === 0) return;
    
    if (!window.electronAPI || !window.electronAPI.printAdisyon) {
      console.error('printAdisyon API mevcut değil. Lütfen uygulamayı yeniden başlatın.');
      setErrorToast({ message: 'Hata: Adisyon yazdırma API\'si yüklenemedi. Lütfen uygulamayı yeniden başlatın.' });
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }
    
    // Order items'ı adisyon formatına çevir
    const adisyonItems = orderItems.map(item => ({
      id: item.product_id,
      name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      portion: item.portion !== null && item.portion !== undefined ? item.portion : null,
      isGift: item.isGift || false,
      staff_name: item.staff_name || null,
      category_id: null // Kategori bilgisi item'da yoksa sonra eklenebilir
    }));
    
    const adisyonData = {
      items: adisyonItems,
      tableName: selectedOrder.table_name,
      tableType: selectedOrder.table_type,
      orderNote: selectedOrder.order_note || null,
      orderSource: selectedOrder.order_source || null, // 'Trendyol', 'Yemeksepeti', or null
      orderId: selectedOrder.id || null, // Fiş numarası için
      sale_date: selectedOrder.order_date || new Date().toLocaleDateString('tr-TR'),
      sale_time: selectedOrder.order_time || new Date().toLocaleTimeString('tr-TR'),
      cashierOnly: true // Sadece kasa yazıcısından fiyatlı fiş
    };

    try {
      // Adisyon yazdırma toast'ını göster (eğer App.jsx'teki gibi bir toast sistemi varsa)
      // Şimdilik sadece console log ile göster
      console.log('Adisyon yazdırılıyor...');
      
      const result = await window.electronAPI.printAdisyon(adisyonData);
      
      if (result.success) {
        console.log('Adisyon başarıyla yazdırıldı');
        // Başarı mesajı gösterilebilir
      } else {
        console.error('Adisyon yazdırılamadı:', result.error);
        setErrorToast({ message: 'Adisyon yazdırılamadı: ' + (result.error || 'Bilinmeyen hata') });
        setTimeout(() => setErrorToast(null), 4000);
      }
    } catch (error) {
      console.error('Adisyon yazdırılırken hata:', error);
      setErrorToast({ message: 'Adisyon yazdırılamadı: ' + error.message });
      setTimeout(() => setErrorToast(null), 4000);
    }
  };

  // Masa aktar
  const handleTransferTable = async (sourceTableId, targetTableId) => {
    if (!window.electronAPI || !window.electronAPI.transferTableOrder) {
      setErrorToast({ message: 'Masa aktarımı şu anda kullanılamıyor' });
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }

    try {
      const result = await window.electronAPI.transferTableOrder(sourceTableId, targetTableId);
      
      if (result.success) {
        // Modal'ı kapat ve siparişleri yenile
        setShowTransferModal(false);
        setShowModal(false);
        setSelectedOrder(null);
        setOrderItems([]);
        await loadTableOrders();
        // Başarı toast'ı göster
        setShowSuccessToast(true);
        setTimeout(() => {
          setShowSuccessToast(false);
        }, 2000);
      } else {
        setErrorToast({ message: 'Masa aktarılamadı: ' + (result.error || 'Bilinmeyen hata') });
        setTimeout(() => setErrorToast(null), 4000);
      }
    } catch (error) {
      console.error('Masa aktarılırken hata:', error);
      setErrorToast({ message: 'Masa aktarılamadı: ' + error.message });
      setTimeout(() => setErrorToast(null), 4000);
    }
  };

  // Ürün bazlı ödeme tamamlandı (siparişleri yenile)
  const handleCompletePartialPayment = async (payments) => {
    if (!selectedOrder || !window.electronAPI) {
      return;
    }

    try {
      // Siparişleri yenile
      await loadTableOrders();
      
      // Sipariş detaylarını yeniden yükle
      const updatedItems = await window.electronAPI.getTableOrderItems(selectedOrder.id);
      setOrderItems(updatedItems || []);
      
      // Eğer tüm ürünlerin ödemesi alındıysa modal'ı kapat
      const unpaidItems = updatedItems.filter(item => !item.is_paid && !item.isGift);
      if (unpaidItems.length === 0) {
        setShowPartialPaymentModal(false);
      }
    } catch (error) {
      console.error('Sipariş yenileme hatası:', error);
    }
  };


  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold gradient-text">Masalar</h2>
        <button
          onClick={() => setShowTransferModal(true)}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-bold rounded-xl transition-all duration-300 hover:shadow-lg hover:scale-105 active:scale-95 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span>Masa Aktar</span>
        </button>
      </div>
      
      {/* Sultan Somatı için Salon Seçimi */}
      {isSultanSomatiMode ? (
        <div className="flex flex-wrap justify-center gap-3 mb-4">
          {SULTAN_SOMATI_SALONS.map((salon) => (
            <button
              key={salon.id}
              onClick={() => setSelectedType(salon.id)}
              className={`px-6 py-3 rounded-xl font-bold transition-all duration-300 text-base ${
                selectedType === salon.id
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg transform scale-105'
                  : 'bg-purple-50 text-purple-600 hover:bg-purple-100 hover:text-purple-700'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="text-xl">{salon.icon}</span>
                <span>{salon.name}</span>
                <span className="text-xs opacity-75">({salon.count})</span>
              </div>
            </button>
          ))}
        </div>
      ) : isYakasGrillMode ? (
        /* Yaka's Grill için Salon/Paket/Yemeksepeti/TrendyolGO Seçimi */
        <div className="flex justify-center gap-4 mb-4 flex-wrap">
          <button
            onClick={() => setSelectedType('salon')}
            className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 text-lg ${
              selectedType === 'salon'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg transform scale-105'
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700'
            }`}
          >
            <div className="flex items-center space-x-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span>Salon</span>
            </div>
          </button>
          
          <button
            onClick={() => setSelectedType('package')}
            className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 text-lg ${
              selectedType === 'package'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg transform scale-105'
                : 'bg-orange-50 text-orange-600 hover:bg-orange-100 hover:text-orange-700'
            }`}
          >
            <div className="flex items-center space-x-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span>Paket</span>
            </div>
          </button>

          <button
            onClick={() => setSelectedType('yemeksepeti')}
            className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 text-lg ${
              selectedType === 'yemeksepeti'
                ? 'bg-gradient-to-r from-red-500 via-red-600 to-red-500 text-white shadow-lg transform scale-105'
                : 'bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700'
            }`}
          >
            <div className="flex items-center space-x-3">
              <img 
                src="/yemeksepeti.png" 
                alt="Yemeksepeti" 
                className="w-6 h-6 rounded-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <span style={{display: 'none'}}>🍽️</span>
              <span>Yemeksepeti</span>
            </div>
          </button>

          <button
            onClick={() => setSelectedType('trendyolgo')}
            className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 text-lg ${
              selectedType === 'trendyolgo'
                ? 'bg-gradient-to-r from-yellow-400 via-orange-500 to-yellow-500 text-white shadow-lg transform scale-105'
                : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100 hover:text-yellow-700'
            }`}
          >
            <div className="flex items-center space-x-3">
              <img 
                src="/trendyol.webp" 
                alt="Trendyol" 
                className="w-6 h-6 rounded-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <span style={{display: 'none'}}>🛒</span>
              <span>TrendyolGO</span>
            </div>
          </button>
        </div>
      ) : isGeceDonercisiMode ? (
        /* Gece Dönercisi: Salon, Bahçe, Paket, TrendyolGO, Yemeksepeti, Migros Yemek */
        <div className="flex justify-center gap-3 mb-4 flex-wrap">
          {GECE_DONERCISI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedType(cat.id)}
              className={`px-5 py-3 rounded-xl font-bold transition-all duration-300 text-sm ${
                selectedType === cat.id
                  ? 'bg-gradient-to-r from-slate-600 to-slate-800 text-white shadow-lg transform scale-105'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="text-lg">{cat.icon}</span>
                <span>{cat.name}</span>
                <span className="text-xs opacity-75">({cat.count})</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Normal Mod için Masa Tipi Seçimi */
        <div className="flex justify-center gap-4 mb-4">
          <button
            onClick={() => setSelectedType('inside')}
            className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 text-lg ${
              selectedType === 'inside'
                ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg transform scale-105'
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700'
            }`}
          >
            <div className="flex items-center space-x-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>İçeri</span>
            </div>
          </button>
          
          <button
            onClick={() => setSelectedType('outside')}
            className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 text-lg ${
              selectedType === 'outside'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg transform scale-105'
                : 'bg-orange-50 text-orange-600 hover:bg-orange-100 hover:text-orange-700'
            }`}
          >
            <div className="flex items-center space-x-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Dışarı</span>
            </div>
          </button>
        </div>
      )}

      {/* Masalar Grid */}
      <div className="grid grid-cols-10 gap-1 mb-6">
        {(isSultanSomatiMode ? currentSalonTables : isYakasGrillMode ? (
          selectedType === 'salon' ? yakasGrillTables : 
          selectedType === 'package' ? yakasGrillPackageTables :
          selectedType === 'yemeksepeti' ? yakasGrillYemeksepetiTables :
          selectedType === 'trendyolgo' ? yakasGrillTrendyolGOTables : yakasGrillTables
        ) : isGeceDonercisiMode ? currentGeceDonercisiTables : (selectedType === 'inside' ? insideTables : outsideTables)).map((table) => {
          const hasOrder = getTableOrder(table.id);
          const isOutside = !isSultanSomatiMode && !isYakasGrillMode && !isGeceDonercisiMode && table.type === 'outside';
          const isSultanTable = isSultanSomatiMode && table.salonId;
          const isYakasGrillTable = isYakasGrillMode && table.type === 'masa';
          const isYakasGrillPackageTable = isYakasGrillMode && table.type === 'package';
          const isYakasGrillYemeksepetiTable = isYakasGrillMode && table.type === 'yemeksepeti';
          const isYakasGrillTrendyolGOTable = isYakasGrillMode && table.type === 'trendyolgo';
          const isGeceSalon = isGeceDonercisiMode && table.type === 'salon';
          const isGeceBahce = isGeceDonercisiMode && table.type === 'bahce';
          const isGecePaket = isGeceDonercisiMode && table.type === 'paket';
          const isGeceTrendyolgo = isGeceDonercisiMode && table.type === 'trendyolgo';
          const isGeceYemeksepeti = isGeceDonercisiMode && table.type === 'yemeksepeti';
          const isGeceMigros = isGeceDonercisiMode && table.type === 'migros-yemek';

          return (
            <button
              key={table.id}
              onClick={() => handleTableClick(table)}
              className={`table-btn group relative overflow-hidden rounded-md p-1 border transition-all duration-300 hover:shadow-sm hover:scale-105 active:scale-95 aspect-square ${
                hasOrder
                  // Dolu masalar – kan kırmızısı tonlar
                  ? 'bg-gradient-to-br from-red-700 to-red-900 border-red-800 hover:border-red-900'
                  : isSultanTable
                  // Sultan Somatı salon masaları – mor/pembe tonlar
                  ? 'bg-gradient-to-br from-purple-50 to-pink-100 border-purple-300 hover:border-purple-400'
                  : isYakasGrillTable
                  // Yaka's Grill masaları – mavi/cyan tonlar
                  ? 'bg-gradient-to-br from-blue-50 to-cyan-100 border-blue-300 hover:border-blue-400'
                  : isYakasGrillPackageTable
                  // Yaka's Grill paket masaları – turuncu/amber tonlar
                  ? 'bg-gradient-to-br from-orange-50 to-amber-100 border-orange-300 hover:border-orange-400'
                  : isYakasGrillYemeksepetiTable
                  // Yaka's Grill Yemeksepeti masaları – kırmızı tonlar
                  ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-300 hover:border-red-400'
                  : isYakasGrillTrendyolGOTable
                  ? 'bg-gradient-to-br from-yellow-50 to-orange-100 border-yellow-300 hover:border-yellow-400'
                  : isGeceSalon
                  ? 'bg-gradient-to-br from-slate-50 to-slate-100 border-slate-300 hover:border-slate-400'
                  : isGeceBahce
                  ? 'bg-gradient-to-br from-emerald-50 to-green-100 border-emerald-300 hover:border-emerald-400'
                  : isGecePaket
                  ? 'bg-gradient-to-br from-orange-50 to-amber-100 border-orange-300 hover:border-orange-400'
                  : isGeceTrendyolgo
                  ? 'bg-gradient-to-br from-yellow-50 to-orange-100 border-yellow-300 hover:border-yellow-400'
                  : isGeceYemeksepeti
                  ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-300 hover:border-red-400'
                  : isGeceMigros
                  ? 'bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-300 hover:border-blue-400'
                  : isOutside
                  ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-300 hover:border-amber-400'
                  : 'bg-gradient-to-br from-pink-50 to-pink-100 border-pink-200 hover:border-pink-300'
              }`}
            >
              <div className="flex flex-col items-center justify-center space-y-1 h-full">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow ${
                  hasOrder
                    // Dolu masalarda iç daire – yoğun kırmızı
                    ? 'bg-gradient-to-br from-red-600 to-red-900'
                    : isSultanTable
                    ? 'bg-gradient-to-br from-purple-200 to-pink-300'
                    : isYakasGrillTable
                    ? 'bg-gradient-to-br from-blue-200 to-cyan-300'
                    : isYakasGrillPackageTable
                    ? 'bg-gradient-to-br from-orange-200 to-amber-300'
                    : isYakasGrillYemeksepetiTable
                    ? 'bg-gradient-to-br from-red-200 to-red-300'
                    : isYakasGrillTrendyolGOTable
                    ? 'bg-gradient-to-br from-yellow-200 to-orange-300'
                    : isGeceSalon
                    ? 'bg-gradient-to-br from-slate-200 to-slate-300'
                    : isGeceBahce
                    ? 'bg-gradient-to-br from-emerald-200 to-green-300'
                    : isGecePaket
                    ? 'bg-gradient-to-br from-orange-200 to-amber-300'
                    : isGeceTrendyolgo
                    ? 'bg-gradient-to-br from-yellow-200 to-orange-300'
                    : isGeceYemeksepeti
                    ? 'bg-gradient-to-br from-red-200 to-red-300'
                    : isGeceMigros
                    ? 'bg-gradient-to-br from-blue-200 to-indigo-300'
                    : isOutside
                    ? 'bg-gradient-to-br from-amber-200 to-amber-300'
                    : 'bg-gradient-to-br from-pink-100 to-pink-200'
                }`}>
                  {hasOrder ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : isSultanTable ? (
                    <span className="text-lg">{table.icon}</span>
                  ) : (isGeceSalon || isGeceBahce || isGecePaket || isGeceTrendyolgo || isGeceYemeksepeti || isGeceMigros) ? (
                    <span className="text-lg">{table.icon}</span>
                  ) : isYakasGrillTable ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  ) : isYakasGrillPackageTable ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  ) : isYakasGrillYemeksepetiTable ? (
                    <img 
                      src="/yemeksepeti.png" 
                      alt="Yemeksepeti" 
                      className="w-5 h-5 rounded-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'block';
                      }}
                    />
                  ) : isYakasGrillTrendyolGOTable ? (
                    <img 
                      src="/trendyol.webp" 
                      alt="Trendyol" 
                      className="w-5 h-5 rounded-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'block';
                      }}
                    />
                  ) : (
                    <svg className={`w-5 h-5 ${isOutside ? 'text-white' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  )}
                </div>
                <span className={`font-bold text-xs leading-tight text-center ${
                  hasOrder
                    ? 'text-red-50'
                    : isSultanTable
                    ? 'text-purple-900'
                    : isYakasGrillTable
                    ? 'text-blue-900'
                    : isYakasGrillPackageTable
                    ? 'text-orange-900'
                    : isYakasGrillYemeksepetiTable
                    ? 'text-red-900'
                    : isYakasGrillTrendyolGOTable
                    ? 'text-yellow-900'
                    : isGeceSalon
                    ? 'text-slate-900'
                    : isGeceBahce
                    ? 'text-emerald-900'
                    : isGecePaket
                    ? 'text-orange-900'
                    : isGeceTrendyolgo
                    ? 'text-yellow-900'
                    : isGeceYemeksepeti
                    ? 'text-red-900'
                    : isGeceMigros
                    ? 'text-blue-900'
                    : isOutside
                    ? 'text-amber-900'
                    : 'text-pink-900'
                }`}>{table.name}</span>
                <div
                  className={`text-[10px] font-semibold mt-1 px-2 py-0.5 rounded-md ${
                    hasOrder
                      ? 'bg-red-900 text-red-100'
                      : isSultanTable
                      ? 'bg-purple-100 text-purple-800'
                      : isYakasGrillTable
                      ? 'bg-blue-100 text-blue-800'
                      : isYakasGrillPackageTable
                      ? 'bg-orange-100 text-orange-800'
                      : isYakasGrillYemeksepetiTable
                      ? 'bg-red-100 text-red-800'
                      : isYakasGrillTrendyolGOTable
                      ? 'bg-yellow-100 text-yellow-800'
                      : isGeceSalon
                      ? 'bg-slate-100 text-slate-800'
                      : isGeceBahce
                      ? 'bg-emerald-100 text-emerald-800'
                      : isGecePaket
                      ? 'bg-orange-100 text-orange-800'
                      : isGeceTrendyolgo
                      ? 'bg-yellow-100 text-yellow-800'
                      : isGeceYemeksepeti
                      ? 'bg-red-100 text-red-800'
                      : isGeceMigros
                      ? 'bg-blue-100 text-blue-800'
                      : isOutside
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-pink-100 text-pink-800'
                  }`}
                >
                  {hasOrder ? 'Dolu' : 'Boş'}
                </div>
                {hasOrder && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* PAKET Başlığı - Sadece normal mod için (Gece Dönercisi'nde kategoriler içinde) */}
      {!isSultanSomatiMode && !isYakasGrillMode && !isGeceDonercisiMode && !isLacromisaMode && effectivePackageTablesCount > 0 && (
        <div className="mb-6 mt-8">
          <div className="flex items-center justify-center mb-4">
            <div className="flex items-center space-x-3 px-8 py-3 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 rounded-2xl shadow-xl transform hover:scale-105 transition-all duration-300">
              <svg className="w-7 h-7 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <h3 className="text-2xl font-black text-white tracking-wider drop-shadow-lg">PAKET</h3>
            </div>
          </div>

          {/* Paket Masaları Grid */}
          <div className="grid grid-cols-5 gap-2">
            {packageTables.map((table) => {
            const hasOrder = getTableOrder(table.id);
            return (
              <button
                key={table.id}
                onClick={() => handleTableClick(table)}
                className={`table-btn group relative overflow-hidden rounded-lg p-2 border-2 transition-all duration-300 hover:shadow-lg hover:scale-105 active:scale-95 ${
                  hasOrder
                    // Paket masalar dolu – kırmızı ton
                    ? 'bg-gradient-to-br from-rose-100 to-red-200 border-red-500 hover:border-red-600'
                    : 'bg-gradient-to-br from-white to-orange-50 border-orange-300 hover:border-orange-400'
                }`}
              >
                <div className="flex flex-col items-center justify-center space-y-1.5 h-full">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow ${
                    hasOrder
                      ? 'bg-gradient-to-br from-red-600 to-red-900'
                      : 'bg-gradient-to-br from-orange-400 to-yellow-400'
                  }`}>
                    {hasOrder ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    )}
                  </div>
                  <span className="font-extrabold text-sm text-gray-800 leading-tight">{table.name}</span>
                  <div
                    className={`text-[10px] font-semibold mt-1 px-2 py-0.5 rounded-md ${
                      hasOrder
                        ? 'bg-red-900 text-red-100'
                        : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {hasOrder ? 'Dolu' : 'Boş'}
                  </div>
                  {hasOrder && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-400 rounded-full animate-pulse"></span>
                  )}
                </div>
              </button>
            );
          })}
          </div>
        </div>
      )}

      {/* Masa Sipariş Detay Modal */}
      {showModal && selectedOrder && (
        <TableOrderModal
          order={selectedOrder}
          items={orderItems}
          tenantId={tenantId}
          onClose={() => {
            setShowModal(false);
            setSelectedOrder(null);
            setOrderItems([]);
            loadTableOrders(); // Siparişleri yenile
          }}
          onCompleteTable={handleCompleteTable}
          onPartialPayment={handlePartialPayment}
          onItemCancelled={async () => {
            // Ürün iptal edildiğinde sipariş detaylarını yenile
            if (selectedOrder && window.electronAPI && window.electronAPI.getTableOrderItems) {
              try {
                const updatedItems = await window.electronAPI.getTableOrderItems(selectedOrder.id);
                setOrderItems(updatedItems || []);
                // Sipariş bilgisini de güncelle
                const updatedOrders = await window.electronAPI.getTableOrders();
                const updatedOrder = updatedOrders.find(o => o.id === selectedOrder.id);
                if (updatedOrder) {
                  setSelectedOrder(updatedOrder);
                }
                loadTableOrders(); // Tüm siparişleri yenile
              } catch (error) {
                console.error('Sipariş detayları yenilenemedi:', error);
              }
            }
          }}
          onRequestAdisyon={handleRequestAdisyon}
          onAddItems={handleAddItems}
          onCancelEntireTable={() => {
            // Tüm masa iptal edildiğinde modalı kapat ve siparişleri yenile
            setShowModal(false);
            setSelectedOrder(null);
            setOrderItems([]);
            loadTableOrders(); // Siparişleri yenile
          }}
        />
      )}

      {/* Masa Aktar Modal */}
      {showTransferModal && (
        <TableTransferModal
          currentOrder={null}
          currentTableId={null}
          currentTableType={selectedType}
          onClose={() => {
            setShowTransferModal(false);
          }}
          onTransfer={handleTransferTable}
          tenantId={tenantId}
          insideTablesCount={insideTablesCount}
          outsideTablesCount={outsideTablesCount}
          packageTablesCount={packageTablesCount}
        />
      )}

      {/* Kısmi Ödeme Modal */}
      {showPartialPaymentModal && selectedOrder && (
        <TablePartialPaymentModal
          order={selectedOrder}
          items={orderItems}
          totalAmount={selectedOrder.total_amount}
          tenantId={tenantId}
          onClose={() => {
            setShowPartialPaymentModal(false);
            setShowModal(true);
          }}
          onComplete={handleCompletePartialPayment}
        />
      )}

      {/* Başarı Toast */}
      {showSuccessToast && (
        <div className="fixed inset-x-0 top-0 z-[1400] flex justify-center pointer-events-none pt-8">
          <div className="bg-white/98 backdrop-blur-xl border-2 border-green-300 rounded-3xl shadow-2xl px-8 py-5 pointer-events-auto animate-fade-in transform transition-all duration-300 scale-100">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-xl ring-4 ring-green-100">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-xl font-bold text-gray-900">Masa başarıyla sonlandırıldı</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {errorToast && (
        <div className="fixed inset-x-0 top-0 z-[1400] flex justify-center pointer-events-none pt-8">
          <div className="bg-white/98 backdrop-blur-xl border-2 border-red-300 rounded-3xl shadow-2xl px-8 py-5 pointer-events-auto animate-fade-in transform transition-all duration-300 scale-100 max-w-md mx-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-xl ring-4 ring-red-100 flex-shrink-0">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Hata</p>
                <p className="text-lg font-bold text-gray-900">{errorToast.message}</p>
              </div>
              <button
                onClick={() => setErrorToast(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TablePanel;

