import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import CategoryPanel from './components/CategoryPanel';
import TablePanel from './components/TablePanel';
import ProductGrid from './components/ProductGrid';
import Cart from './components/Cart';
import SalesHistory from './components/SalesHistory';
import PaymentModal from './components/PaymentModal';
import SplitPaymentModal from './components/SplitPaymentModal';
import ReceiptModal from './components/ReceiptModal';
import RoleSplash from './components/RoleSplash';
import SaleSuccessToast from './components/SaleSuccessToast';
import SplashScreen from './components/SplashScreen';
import UpdateModal from './components/UpdateModal';

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [currentView, setCurrentView] = useState('pos'); // 'pos', 'sales', or 'tables'
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSplitPaymentModal, setShowSplitPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null); // Masa seçimi
  const [userType, setUserType] = useState('Personel'); // 'Admin' or 'Personel'
  const [activeRoleSplash, setActiveRoleSplash] = useState(null);
  const [saleSuccessInfo, setSaleSuccessInfo] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(null);
  const [tableRefreshTrigger, setTableRefreshTrigger] = useState(0);
  const triggerRoleSplash = (role) => {
    setActiveRoleSplash(role);
    setTimeout(() => setActiveRoleSplash(null), 1000);
  };

  useEffect(() => {
    loadCategories();
    
    // Update event listeners
    if (window.electronAPI) {
      window.electronAPI.onUpdateAvailable((info) => {
        setUpdateInfo({ ...info, downloaded: false });
      });
      
      window.electronAPI.onUpdateDownloaded((info) => {
        setUpdateInfo({ ...info, downloaded: true });
      });
      
      window.electronAPI.onUpdateError((error) => {
        console.error('Update error:', error);
        // Hata durumunda modal'ı kapat
        setUpdateInfo(null);
      });
      
      window.electronAPI.onUpdateProgress((progress) => {
        setUpdateDownloadProgress(progress);
      });
    }
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadProducts(selectedCategory.id);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    const cats = await window.electronAPI.getCategories();
    setCategories(cats);
    if (cats.length > 0) {
      setSelectedCategory(cats[0]);
    }
  };

  const loadProducts = async (categoryId) => {
    const prods = await window.electronAPI.getProducts(categoryId);
    setProducts(prods);
  };

  const refreshProducts = async () => {
    // Kategorileri yenile
    const cats = await window.electronAPI.getCategories();
    setCategories(cats);
    
    // Seçili kategoriyi koru veya ilk kategoriyi seç
    let categoryToLoad = selectedCategory;
    if (cats.length > 0) {
      if (!categoryToLoad || !cats.find(c => c.id === categoryToLoad.id)) {
        categoryToLoad = cats[0];
        setSelectedCategory(cats[0]);
      } else {
        // Mevcut kategoriyi güncelle (order_index değişmiş olabilir)
        const updatedCategory = cats.find(c => c.id === categoryToLoad.id);
        if (updatedCategory) {
          setSelectedCategory(updatedCategory);
          categoryToLoad = updatedCategory;
        }
      }
      
      // Seçili kategorinin ürünlerini yenile
      if (categoryToLoad) {
        await loadProducts(categoryToLoad.id);
      }
    }
  };

  const addToCart = (product) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  const updateCartItemQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const removeFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedTable(null); // Sepet temizlendiğinde masa seçimini de temizle
  };

  const handleTableSelect = (table) => {
    setSelectedTable(table);
    setCurrentView('pos'); // Masa seçildiğinde pos view'a geç
    // İlk kategoriyi yükle
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0]);
    }
  };

  const completeTableOrder = async () => {
    if (cart.length === 0 || !selectedTable) return;
    
    if (!window.electronAPI || !window.electronAPI.createTableOrder) {
      console.error('createTableOrder API mevcut değil. Lütfen uygulamayı yeniden başlatın.');
      alert('Hata: Masa siparişi API\'si yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
      return;
    }
    
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const orderData = {
      items: cart,
      totalAmount,
      tableId: selectedTable.id,
      tableName: selectedTable.name,
      tableType: selectedTable.type
    };

    try {
      const result = await window.electronAPI.createTableOrder(orderData);
      
      if (result.success) {
        clearCart();
        setSaleSuccessInfo({ 
          totalAmount, 
          paymentMethod: 'Masaya Kaydedildi',
          tableName: selectedTable.name
        });
        // Masalar görünümünü yenile
        setTableRefreshTrigger(Date.now());
      }
    } catch (error) {
      console.error('Masa siparişi kaydedilirken hata:', error);
      alert('Masa siparişi kaydedilemedi: ' + error.message);
    }
  };

  const handlePayment = () => {
    if (cart.length === 0) return;
    setShowPaymentModal(true);
  };

  const completeSale = async (paymentMethod) => {
    if (paymentMethod === 'split') {
      // Ayrı ödemeler modal'ını aç
      setShowPaymentModal(false);
      setShowSplitPaymentModal(true);
      return;
    }

    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const saleData = {
      items: cart,
      totalAmount,
      paymentMethod
    };

    const result = await window.electronAPI.createSale(saleData);
    
    if (result.success) {
      setShowPaymentModal(false);
      // Fiş modal'ını göster
      setReceiptData({
        sale_id: result.saleId,
        totalAmount,
        paymentMethod,
        sale_date: new Date().toLocaleDateString('tr-TR'),
        sale_time: new Date().toLocaleTimeString('tr-TR'),
        items: cart
      });
      setShowReceiptModal(true);
      clearCart();
      setSaleSuccessInfo({ totalAmount, paymentMethod });
    }
  };

  const completeSplitPayment = async (splitPayments) => {
    // Her ürün için ayrı satış kaydı oluştur
    let successCount = 0;
    let totalAmount = 0;

    for (const item of splitPayments) {
      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      const saleData = {
        items: [{ ...item, quantity: item.quantity }],
        totalAmount: itemTotal,
        paymentMethod: item.paymentMethod
      };

      const result = await window.electronAPI.createSale(saleData);
      if (result.success) {
        successCount++;
      }
    }

    if (successCount === splitPayments.length) {
      setShowSplitPaymentModal(false);
      // Fiş modal'ını göster (tüm ürünler için birleşik fiş)
      setReceiptData({
        totalAmount,
        paymentMethod: 'Ayrı Ödemeler',
        sale_date: new Date().toLocaleDateString('tr-TR'),
        sale_time: new Date().toLocaleTimeString('tr-TR'),
        items: splitPayments
      });
      setShowReceiptModal(true);
      clearCart();
      setSaleSuccessInfo({ 
        totalAmount, 
        paymentMethod: 'Ayrı Ödemeler',
        splitPayment: true
      });
    }
  };

  const getTotalAmount = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const getTotalItems = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  return (
    <>
      {showSplash && (
        <SplashScreen onComplete={() => setShowSplash(false)} />
      )}
      <div className="min-h-screen bg-gradient-to-br from-[#f0f4ff] via-[#e0e7ff] to-[#fce7f3] text-gray-800">
        <Navbar 
        currentView={currentView} 
        setCurrentView={(view) => {
          setCurrentView(view);
          // Masalar görünümüne geçildiğinde seçili masayı temizle
          if (view === 'tables') {
            setSelectedTable(null);
            clearCart();
          }
        }}
        totalItems={getTotalItems()}
        userType={userType}
        setUserType={setUserType}
        onRoleSplash={triggerRoleSplash}
        onProductsUpdated={refreshProducts}
      />
      
      {currentView === 'tables' ? (
        <div className="p-6">
          <TablePanel 
            onSelectTable={handleTableSelect}
            refreshTrigger={tableRefreshTrigger}
          />
        </div>
      ) : currentView === 'pos' ? (
        <div className="flex h-[calc(100vh-80px)]">
          {/* Sol Panel - Kategoriler ve Ürünler */}
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            {selectedTable && (
              <div className="mb-4 p-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl shadow-lg flex items-center justify-between">
                <p className="text-lg font-semibold">
                  Masa: {selectedTable.name} için sipariş oluşturuyorsunuz
                </p>
                <button
                  onClick={() => {
                    setSelectedTable(null);
                    clearCart();
                  }}
                  className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
                  title="Masa seçimini iptal et"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <CategoryPanel
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />
            <ProductGrid
              products={products}
              onAddToCart={addToCart}
            />
          </div>

          {/* Sağ Panel - Sepet */}
          <div className="w-[420px] bg-gradient-to-b from-purple-50/80 to-pink-50/80 backdrop-blur-xl border-l border-purple-200 p-6">
            <Cart
              cart={cart}
              onUpdateQuantity={updateCartItemQuantity}
              onRemoveItem={removeFromCart}
              onClearCart={clearCart}
              onCheckout={handlePayment}
              onSaveToTable={completeTableOrder}
              totalAmount={getTotalAmount()}
              selectedTable={selectedTable}
            />
          </div>
        </div>
      ) : (
        <div className="p-6">
          <SalesHistory />
        </div>
      )}

      {showPaymentModal && (
        <PaymentModal
          totalAmount={getTotalAmount()}
          onSelectPayment={completeSale}
          onClose={() => setShowPaymentModal(false)}
        />
      )}

      {showSplitPaymentModal && (
        <SplitPaymentModal
          cart={cart}
          totalAmount={getTotalAmount()}
          onCompleteSplitPayment={completeSplitPayment}
          onClose={() => setShowSplitPaymentModal(false)}
        />
      )}

      {showReceiptModal && receiptData && (
        <ReceiptModal
          saleInfo={receiptData}
          items={receiptData.items}
          onClose={() => {
            setShowReceiptModal(false);
            setReceiptData(null);
          }}
          onPrint={async () => {
            if (window.electronAPI && window.electronAPI.printReceipt) {
              await window.electronAPI.printReceipt(receiptData);
            } else {
              // Fallback: window.print()
              window.print();
            }
          }}
        />
      )}

      {activeRoleSplash && <RoleSplash role={activeRoleSplash} />}
      <SaleSuccessToast
        info={saleSuccessInfo}
        onClose={() => setSaleSuccessInfo(null)}
      />
      {updateInfo && (
        <UpdateModal
          updateInfo={updateInfo}
          downloadProgress={updateDownloadProgress}
          onDownload={async () => {
            if (window.electronAPI) {
              await window.electronAPI.downloadUpdate();
            }
          }}
          onInstall={() => {
            if (window.electronAPI) {
              window.electronAPI.installUpdate();
            }
          }}
          onClose={() => {
            setUpdateInfo(null);
            setUpdateDownloadProgress(null);
          }}
        />
      )}
      </div>
    </>
  );
}

export default App;

