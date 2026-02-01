import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getThemeColors } from './utils/themeUtils';
import { isYakasGrill, isGeceDonercisi } from './utils/sultanSomatTables';
import Navbar from './components/Navbar';
import CategoryPanel from './components/CategoryPanel';
import TablePanel from './components/TablePanel';
import ProductGrid from './components/ProductGrid';
import Cart from './components/Cart';
import SalesHistory from './components/SalesHistory';
import PaymentModal from './components/PaymentModal';
import SplitPaymentModal from './components/SplitPaymentModal';
import RoleSplash from './components/RoleSplash';
import SaleSuccessToast from './components/SaleSuccessToast';
import PrintToast from './components/PrintToast';
import SplashScreen from './components/SplashScreen';
import ExitSplash from './components/ExitSplash';
import UpdateModal from './components/UpdateModal';
import ExpenseModal from './components/ExpenseModal';
import LauncherClient from './components/LauncherClient';
import CariMaliyetModal from './components/CariMaliyetModal';
import DonerOptionsModal from './components/DonerOptionsModal';
import BranchSelectModal from './components/BranchSelectModal';
import { getGeceSelectedBranch, getOrCreateGeceDeviceId, setGeceSelectedBranch } from './utils/geceDonercisiBranchSelection';
import { upsertDeviceBranchSelection } from './utils/geceDonercisiMasalarFirestore';

function App() {
  const [showLauncher, setShowLauncher] = useState(true);
  const [tenantId, setTenantId] = useState(null);
  const [tenantInfo, setTenantInfo] = useState(null); // Tenant bilgileri (businessName için)
  const [showSplash, setShowSplash] = useState(false);
  const [currentView, setCurrentView] = useState('pos'); // 'pos', 'sales', or 'tables'
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]); // Tüm kategorilerden ürünler (arama için)
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [orderNote, setOrderNote] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSplitPaymentModal, setShowSplitPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null); // Masa seçimi
  const [userType, setUserType] = useState('Personel'); // 'Admin' or 'Personel'
  const [activeRoleSplash, setActiveRoleSplash] = useState(null);
  const [saleSuccessInfo, setSaleSuccessInfo] = useState(null);
  const [printToast, setPrintToast] = useState(null); // { status: 'printing' | 'success' | 'error', message: string }
  const [errorToast, setErrorToast] = useState(null); // { message: string }
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(null);
  const [tableRefreshTrigger, setTableRefreshTrigger] = useState(0);
  const [showExitSplash, setShowExitSplash] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [suspendedInfo, setSuspendedInfo] = useState(null); // { message, businessName }
  const [showOnionModal, setShowOnionModal] = useState(false);
  const [pendingOnionProduct, setPendingOnionProduct] = useState(null);
  const [showPortionModal, setShowPortionModal] = useState(false);
  const [pendingPortionProduct, setPendingPortionProduct] = useState(null);
  const [showCariMaliyetModal, setShowCariMaliyetModal] = useState(false);
  const [showDonerOptionsModal, setShowDonerOptionsModal] = useState(false);
  const [pendingDonerProduct, setPendingDonerProduct] = useState(null);
  const [showBranchSelectModal, setShowBranchSelectModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(() => getGeceSelectedBranch());
  const searchInputRef = useRef(null);
  const triggerRoleSplash = (role) => {
    setActiveRoleSplash(role);
    setTimeout(() => setActiveRoleSplash(null), 1300);
  };

  const [broadcastMessage, setBroadcastMessage] = useState(null);

  // Her açılışta launcher göster (şimdilik "beni hatırla" yok)
  // useEffect(() => {
  //   const savedTenantId = localStorage.getItem('makara_tenant_id');
  //   if (savedTenantId) {
  //     setTenantId(savedTenantId);
  //     setShowLauncher(false);
  //     setShowSplash(true);
  //   }
  // }, []);

  const handleLauncherLogin = (tenantInfo) => {
    setTenantId(tenantInfo.tenantId);
    setTenantInfo(tenantInfo); // Tenant bilgilerini state'e kaydet
    // Tenant bilgilerini Electron'a gönder (müessese ismi değişimi için)
    if (window.electronAPI && window.electronAPI.setTenantInfo) {
      window.electronAPI.setTenantInfo(tenantInfo);
    }
    setShowLauncher(false);
    setShowSplash(true);
  };
  
  // Business name'i al (fallback: MAKARA)
  const businessName = tenantInfo?.businessName || 'MAKARA';
  
  // Tema rengini al (fallback: turuncu)
  const themeColor = tenantInfo?.themeColor || '#f97316';
  
  // Tema renklerini hesapla
  const theme = useMemo(() => getThemeColors(themeColor), [themeColor]);
  const isGeceDonercisiMode = tenantId && isGeceDonercisi(tenantId);

  const getActiveBranchForGece = () => {
    // Şube seçimi Settings'ten değiştirilebildiği için her işlem anında localStorage'tan oku
    return getGeceSelectedBranch();
  };

  // SettingsModal içinde şube değiştiğinde App state'ini güncelle
  useEffect(() => {
    const handler = () => {
      const b = getGeceSelectedBranch();
      setSelectedBranch(b);
      if (window.electronAPI && window.electronAPI.setGeceBranchSelection && isGeceDonercisiMode && b) {
        window.electronAPI.setGeceBranchSelection({ branch: b, deviceId: getOrCreateGeceDeviceId() }).catch(() => {});
      }
    };
    window.addEventListener('gece-branch-changed', handler);
    return () => window.removeEventListener('gece-branch-changed', handler);
  }, [isGeceDonercisiMode]);

  // Gece Dönercisi: cihaz bazlı şube seçimi (tek seferlik zorunlu popup)
  useEffect(() => {
    if (!tenantId || !isGeceDonercisiMode) return;
    const existing = getGeceSelectedBranch();
    setSelectedBranch(existing);
    if (!existing) {
      setShowBranchSelectModal(true);
    } else if (window.electronAPI && window.electronAPI.setGeceBranchSelection) {
      window.electronAPI.setGeceBranchSelection({ branch: existing, deviceId: getOrCreateGeceDeviceId() }).catch(() => {});
    }
  }, [tenantId, isGeceDonercisiMode]);
  
  // Debug: Tenant bilgilerini kontrol et
  useEffect(() => {
    if (tenantInfo) {
      console.log('✅ Tenant Info:', tenantInfo);
      console.log('✅ Business Name:', businessName);
      console.log('✅ Inside Tables:', tenantInfo.insideTables, 'Type:', typeof tenantInfo.insideTables);
      console.log('✅ Outside Tables:', tenantInfo.outsideTables, 'Type:', typeof tenantInfo.outsideTables);
      console.log('✅ Package Tables:', tenantInfo.packageTables, 'Type:', typeof tenantInfo.packageTables);
    }
  }, [tenantInfo, businessName]);

  // Debug: suspendedInfo değişikliklerini izle
  useEffect(() => {
    if (suspendedInfo) {
      console.log('🎨 suspendedInfo state güncellendi:', suspendedInfo);
      console.log('🎨 Modal render edilecek mi?', !!suspendedInfo);
    } else {
      console.log('🎨 suspendedInfo null/undefined');
    }
  }, [suspendedInfo]);

  useEffect(() => {
    if (!showLauncher && tenantId) {
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

        // Cleanup fonksiyonları
        const cleanups = [];

        // Broadcast message listener
        if (window.electronAPI.onBroadcastMessage) {
          const cleanup = window.electronAPI.onBroadcastMessage((data) => {
            console.log('📢 Broadcast message alındı:', data);
            setBroadcastMessage(data);
          });
          if (cleanup) cleanups.push(cleanup);
        }

        // Tenant suspended listener
        if (window.electronAPI.onTenantSuspended) {
          console.log('👂 Tenant suspended listener kuruluyor...');
          const cleanup = window.electronAPI.onTenantSuspended((data) => {
            console.log('⚠️⚠️⚠️ Tenant suspended event alındı:', data);
            console.log('⚠️⚠️⚠️ setSuspendedInfo çağrılıyor...');
            // Suspended modal'ı göster
            setSuspendedInfo(data);
            console.log('⚠️⚠️⚠️ setSuspendedInfo çağrıldı, suspendedInfo state:', data);
          });
          console.log('✅ Tenant suspended listener kuruldu');
          if (cleanup) cleanups.push(cleanup);
        } else {
          console.error('❌ window.electronAPI.onTenantSuspended mevcut değil!');
        }

        // Tüm cleanup fonksiyonlarını döndür
        return () => {
          console.log('🧹 Cleanup fonksiyonları çağrılıyor...');
          cleanups.forEach(cleanup => {
            if (typeof cleanup === 'function') {
              cleanup();
            }
          });
        };
      }
    }
  }, [showLauncher, tenantId]);

  useEffect(() => {
    if (selectedCategory) {
      loadProducts(selectedCategory.id);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    const cats = await window.electronAPI.getCategories();
    setCategories(cats);
    // Tüm ürünleri yükle (arama için)
    const allProds = await window.electronAPI.getProducts(null);
    setAllProducts(allProds);
    if (cats.length > 0) {
      setSelectedCategory(cats[0]);
    }
  };

  const loadProducts = async (categoryId) => {
    const prods = await window.electronAPI.getProducts(categoryId);
    setProducts(prods);
    // Tüm ürünleri de güncelle (arama için)
    const allProds = await window.electronAPI.getProducts(null);
    setAllProducts(allProds);
  };

  // Arama sorgusuna göre ürünleri filtrele
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) {
      // Arama yoksa sadece seçili kategorinin ürünlerini göster
      return products;
    }
    // Arama varsa tüm kategorilerden ara
    const query = searchQuery.toLowerCase().trim();
    return allProducts.filter(product => 
      product.name.toLowerCase().includes(query)
    );
  }, [products, allProducts, searchQuery]);

  const refreshProducts = async () => {
    // Kategorileri yenile
    const cats = await window.electronAPI.getCategories();
    setCategories(cats);
    
    // Tüm ürünleri güncelle (arama için)
    const allProds = await window.electronAPI.getProducts(null);
    setAllProducts(allProds);
    
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
        const prods = await window.electronAPI.getProducts(categoryToLoad.id);
        setProducts(prods);
      }
    }
  };

  const addToCart = (product) => {
    // Yaka's Grill için özel kategoriler kontrolü
    if (tenantId && isYakasGrill(tenantId)) {
      const category = categories.find(c => c.id === product.category_id);
      if (category && category.name) {
        const categoryNameLower = category.name.toLowerCase();
        const productNameLower = product.name.toLowerCase();
        
        // Porsiyon kategorisi için porsiyon seçici modal
        if (categoryNameLower === 'porsiyon') {
          setPendingPortionProduct(product);
          setShowPortionModal(true);
          return;
        }
        
        // Balık kategorisinde "Balık Porsiyon" ürünü için porsiyon seçici modal
        if (categoryNameLower === 'balık' && productNameLower.includes('balık porsiyon')) {
          setPendingPortionProduct(product);
          setShowPortionModal(true);
          return;
        }
        
        // Dürümler, Ekmek Arası, Balık kategorileri için soğan seçici modal (Balık Porsiyon hariç)
        if (categoryNameLower === 'dürümler' || categoryNameLower === 'ekmek arası' || categoryNameLower === 'balık') {
          setPendingOnionProduct(product);
          setShowOnionModal(true);
          return;
        }
      }
    }
    
    // Yemeksepeti, TrendyolGO veya Migros Yemek masası seçiliyse özel fiyatları kullan (Gece Dönercisi / Yaka's Grill)
    let productPrice = product.price;
    if (selectedTable) {
      if (selectedTable.type === 'yemeksepeti' && product.yemeksepeti_price) {
        productPrice = product.yemeksepeti_price;
      } else if (selectedTable.type === 'trendyolgo' && product.trendyolgo_price) {
        productPrice = product.trendyolgo_price;
      } else if (selectedTable.type === 'migros-yemek' && product.migros_yemek_price != null) {
        productPrice = product.migros_yemek_price;
      }
    }

    // Gece Dönercisi: Tavuk Döner / Et Döner kategorileri için özel seçim modalı
    if (tenantId && isGeceDonercisi(tenantId)) {
      const cat = categories.find((c) => c.id === product.category_id);
      const catName = (cat?.name || '').toLowerCase();
      if (catName.includes('tavuk döner') || catName.includes('et döner')) {
        setPendingDonerProduct({ ...product, price: productPrice });
        setShowDonerOptionsModal(true);
        return;
      }
    }
    
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id && !item.onionOption && !item.portion && !item.donerKey);
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id && !item.onionOption && !item.portion && !item.donerKey
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, price: productPrice, quantity: 1 }];
    });
  };

  const handleDonerOptionsConfirm = (opts) => {
    if (!pendingDonerProduct) {
      setShowDonerOptionsModal(false);
      return;
    }
    const parts = [opts.sogansiz ? 'Soğansız' : null, opts.domatessiz ? 'Domatessiz' : null].filter(Boolean);
    const donerOptionsText = parts.join(' • ');
    const donerKey = `${opts.sogansiz ? 'S' : 's'}|${opts.domatessiz ? 'D' : 'd'}`;

    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) =>
          item.id === pendingDonerProduct.id &&
          !item.onionOption &&
          !item.portion &&
          item.donerKey === donerKey
      );
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === pendingDonerProduct.id && item.donerKey === donerKey ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prevCart,
        {
          ...pendingDonerProduct,
          quantity: 1,
          donerKey,
          donerOptions: opts,
          donerOptionsText,
        },
      ];
    });

    setShowDonerOptionsModal(false);
    setPendingDonerProduct(null);
  };
  
  const handleOnionSelect = (option) => {
    if (!pendingOnionProduct) {
      setShowOnionModal(false);
      return;
    }
    
    // Yemeksepeti, TrendyolGO veya Migros Yemek masası seçiliyse özel fiyatları kullan
    let productPrice = pendingOnionProduct.price;
    if (selectedTable) {
      if (selectedTable.type === 'yemeksepeti' && pendingOnionProduct.yemeksepeti_price) {
        productPrice = pendingOnionProduct.yemeksepeti_price;
      } else if (selectedTable.type === 'trendyolgo' && pendingOnionProduct.trendyolgo_price) {
        productPrice = pendingOnionProduct.trendyolgo_price;
      } else if (selectedTable.type === 'migros-yemek' && pendingOnionProduct.migros_yemek_price != null) {
        productPrice = pendingOnionProduct.migros_yemek_price;
      }
    }
    
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === pendingOnionProduct.id && item.onionOption === option);
      if (existingItem) {
        return prevCart.map(item =>
          item.id === pendingOnionProduct.id && item.onionOption === option
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { ...pendingOnionProduct, price: productPrice, quantity: 1, onionOption: option }];
    });
    
    setShowOnionModal(false);
    setPendingOnionProduct(null);
  };

  const handlePortionSelect = (portion) => {
    if (!pendingPortionProduct) {
      setShowPortionModal(false);
      return;
    }
    
    // Yemeksepeti, TrendyolGO veya Migros Yemek masası seçiliyse özel fiyatları kullan
    let basePrice = pendingPortionProduct.price;
    if (selectedTable) {
      if (selectedTable.type === 'yemeksepeti' && pendingPortionProduct.yemeksepeti_price) {
        basePrice = pendingPortionProduct.yemeksepeti_price;
      } else if (selectedTable.type === 'trendyolgo' && pendingPortionProduct.trendyolgo_price) {
        basePrice = pendingPortionProduct.trendyolgo_price;
      } else if (selectedTable.type === 'migros-yemek' && pendingPortionProduct.migros_yemek_price != null) {
        basePrice = pendingPortionProduct.migros_yemek_price;
      }
    }
    
    // Porsiyona göre fiyat hesapla
    const originalPrice = basePrice;
    const newPrice = originalPrice * portion;
    
    setCart(prevCart => {
      // Aynı ürün ve aynı porsiyon varsa miktarı artır
      const existingItem = prevCart.find(item => 
        item.id === pendingPortionProduct.id && item.portion === portion
      );
      if (existingItem) {
        return prevCart.map(item =>
          item.id === pendingPortionProduct.id && item.portion === portion
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      // Yeni ürün olarak ekle (porsiyon bilgisi ve hesaplanmış fiyat ile)
      return [...prevCart, { 
        ...pendingPortionProduct, 
        quantity: 1, 
        portion: portion,
        originalPrice: originalPrice, // Orijinal fiyat (1 porsiyon)
        price: newPrice // Hesaplanmış fiyat
      }];
    });
    
    setShowPortionModal(false);
    setPendingPortionProduct(null);
  };

  const updateCartItemQuantity = (productId, newQuantity, onionOption = null, portion = null, donerKey = null) => {
    if (newQuantity <= 0) {
      removeFromCart(productId, onionOption, portion, donerKey);
      return;
    }
    setCart(prevCart =>
      prevCart.map(item => {
        // Eşleşme kontrolü: hem ID, hem onionOption (varsa), hem de portion (varsa) eşleşmeli
        const matchesId = item.id === productId;
        const matchesOnion = onionOption ? item.onionOption === onionOption : !item.onionOption;
        const matchesPortion = portion !== null ? item.portion === portion : !item.portion;
        const matchesDoner = donerKey ? item.donerKey === donerKey : !item.donerKey;
        
        if (matchesId && matchesOnion && matchesPortion && matchesDoner) {
          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId, onionOption = null, portion = null, donerKey = null) => {
    setCart(prevCart => {
      return prevCart.filter(item => {
        // Eşleşme kontrolü: hem ID, hem onionOption (varsa), hem de portion (varsa) eşleşmemeli
        const matchesId = item.id === productId;
        const matchesOnion = onionOption ? item.onionOption === onionOption : !item.onionOption;
        const matchesPortion = portion !== null ? item.portion === portion : !item.portion;
        const matchesDoner = donerKey ? item.donerKey === donerKey : !item.donerKey;
        
        // Eğer tüm kriterler eşleşiyorsa, bu item'ı filtrele (sil)
        return !(matchesId && matchesOnion && matchesPortion && matchesDoner);
      });
    });
  };

  const toggleGift = (productId) => {
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === productId ? { ...item, isGift: !item.isGift } : item
      )
    );
  };

  const updateItemNote = (productId, note, onionOption = null, portion = null, donerKey = null) => {
    setCart(prevCart =>
      prevCart.map(item => {
        // Eşleşme kontrolü: hem ID, hem onionOption (varsa), hem de portion (varsa) eşleşmeli
        const matchesId = item.id === productId;
        const matchesOnion = onionOption ? item.onionOption === onionOption : !item.onionOption;
        const matchesPortion = portion !== null ? item.portion === portion : !item.portion;
        const matchesDoner = donerKey ? item.donerKey === donerKey : !item.donerKey;
        
        if (matchesId && matchesOnion && matchesPortion && matchesDoner) {
          return { ...item, extraNote: note || null };
        }
        return item;
      })
    );
  };

  // Masa tipine göre orderSource'u belirle
  const getOrderSourceFromTable = (table) => {
    if (!table) return null;
    if (table.type === 'yemeksepeti') return 'Yemeksepeti';
    if (table.type === 'trendyolgo') return 'Trendyol';
    return null;
  };

  const clearCart = () => {
    setCart([]);
    setOrderNote('');
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

  const requestAdisyon = async () => {
    if (cart.length === 0 || !selectedTable) return;
    
    if (!window.electronAPI || !window.electronAPI.printAdisyon) {
      console.error('printAdisyon API mevcut değil. Lütfen uygulamayı yeniden başlatın.');
      setErrorToast({ message: 'Hata: Adisyon yazdırma API\'si yüklenemedi. Lütfen uygulamayı yeniden başlatın.' });
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }
    
    const adisyonData = {
      items: cart,
      tableName: selectedTable.name,
      tableType: selectedTable.type,
      orderNote: orderNote || null,
      orderSource: getOrderSourceFromTable(selectedTable), // 'Trendyol', 'Yemeksepeti', or null
      sale_date: new Date().toLocaleDateString('tr-TR'),
      sale_time: new Date().toLocaleTimeString('tr-TR'),
      cashierOnly: true // Sadece kasa yazıcısından fiyatlı fiş
    };

    try {
      // Adisyon yazdırma toast'ını göster
      setPrintToast({ status: 'printing', message: 'Adisyon yazdırılıyor...' });
      
      const result = await window.electronAPI.printAdisyon(adisyonData);
      
      if (result.success) {
        setPrintToast({ 
          status: 'success', 
          message: 'Adisyon başarıyla yazdırıldı' 
        });
      } else {
        setPrintToast({ 
          status: 'error', 
          message: result.error || 'Adisyon yazdırılamadı' 
        });
      }
    } catch (error) {
      console.error('Adisyon yazdırılırken hata:', error);
      setPrintToast({ 
        status: 'error', 
        message: 'Adisyon yazdırılamadı: ' + error.message 
      });
    }
  };

  const completeTableOrder = async () => {
    if (cart.length === 0 || !selectedTable) return;

    // Gece Dönercisi: şube seçimi zorunlu (stok düşümü şube bazlı)
    const activeBranch = isGeceDonercisiMode ? getActiveBranchForGece() : null;
    if (isGeceDonercisiMode && !activeBranch) {
      setShowBranchSelectModal(true);
      setErrorToast({ message: 'Şube seçimi zorunludur. Lütfen önce şube seçin.' });
      setTimeout(() => setErrorToast(null), 3500);
      return;
    }
    
    if (!window.electronAPI || !window.electronAPI.createTableOrder) {
      console.error('createTableOrder API mevcut değil. Lütfen uygulamayı yeniden başlatın.');
      setErrorToast({ message: 'Hata: Masa siparişi API\'si yüklenemedi. Lütfen uygulamayı yeniden başlatın.' });
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }
    
    const totalAmount = cart.reduce((sum, item) => {
      // İkram edilen ürünleri toplamdan çıkar
      if (item.isGift) return sum;
      return sum + (item.price * item.quantity);
    }, 0);
    
    const orderData = {
      items: cart,
      totalAmount,
      tableId: selectedTable.id,
      tableName: selectedTable.name,
      tableType: selectedTable.type,
      orderNote: orderNote || null,
      orderSource: getOrderSourceFromTable(selectedTable), // 'Trendyol', 'Yemeksepeti', or null
      ...(isGeceDonercisiMode
        ? { branch: activeBranch, deviceId: getOrCreateGeceDeviceId() }
        : {})
    };

    try {
      const result = await window.electronAPI.createTableOrder(orderData);
      
      if (result.success) {
        // Yeni sipariş mi yoksa mevcut siparişe ekleme mi?
        if (!result.isNewOrder) {
          console.log('📦 Mevcut siparişe eklendi:', result.orderId);
        } else {
          console.log('✨ Yeni sipariş oluşturuldu:', result.orderId);
        }
        // Sadece kategori bazlı yazıcılardan adisyon yazdır (kasa yazıcısından adisyon çıkmasın)
        // Her sipariş için o anın tarih/saatini kullan
        const now = new Date();
        const currentDate = now.toLocaleDateString('tr-TR');
        const currentTime = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        // Items'lara added_time ve added_date ekle (masaüstünden eklenen ürünler için staff_name null olacak)
        const itemsWithTime = cart.map(item => ({
          ...item,
          staff_name: null, // Masaüstünden eklenen ürünler için personel bilgisi yok
          added_date: currentDate,
          added_time: currentTime
        }));
        
        const adisyonData = {
          items: itemsWithTime,
          tableName: selectedTable.name,
          tableType: selectedTable.type,
          orderNote: orderNote || null,
          orderSource: getOrderSourceFromTable(selectedTable), // 'Trendyol', 'Yemeksepeti', or null
          orderId: result.orderId || null, // Fiş numarası için
          sale_date: currentDate,
          sale_time: currentTime
        };
        
        if (window.electronAPI && window.electronAPI.printAdisyon) {
          // Adisyon yazdırmayı arka planda yap, hata olsa bile devam et
          window.electronAPI.printAdisyon(adisyonData).catch(err => {
            console.error('Adisyon yazdırılırken hata:', err);
          });
        }
        
        // Kasadan masaya sipariş eklendiğinde kasa yazıcısından fiş yazdırma (sadece adisyon yeterli)
        
        // Sepeti temizle
        setCart([]);
        setOrderNote('');
        
        // Mevcut siparişe ekleme durumunda masa seçimini koru, yeni sipariş durumunda temizle
        if (result.isNewOrder) {
          setSelectedTable(null);
        }
        // Mevcut siparişe eklendiyse masa seçili kalır, böylece tekrar ürün eklenebilir
        
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
      setErrorToast({ message: 'Masa siparişi kaydedilemedi: ' + error.message });
      setTimeout(() => setErrorToast(null), 4000);
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

    const totalAmount = cart.reduce((sum, item) => {
      // İkram edilen ürünleri toplamdan çıkar
      if (item.isGift) return sum;
      return sum + (item.price * item.quantity);
    }, 0);

    // Gece Dönercisi: şube seçimi zorunlu (stok düşümü şube bazlı)
    const activeBranch = isGeceDonercisiMode ? getActiveBranchForGece() : null;
    if (isGeceDonercisiMode && !activeBranch) {
      setShowBranchSelectModal(true);
      setErrorToast({ message: 'Şube seçimi zorunludur. Lütfen önce şube seçin.' });
      setTimeout(() => setErrorToast(null), 3500);
      return;
    }
    
    const saleData = {
      items: cart,
      totalAmount,
      paymentMethod,
      orderNote: orderNote || null,
      orderSource: selectedTable ? getOrderSourceFromTable(selectedTable) : null, // 'Trendyol', 'Yemeksepeti', or null
      ...(isGeceDonercisiMode
        ? { branch: activeBranch, deviceId: getOrCreateGeceDeviceId() }
        : {})
    };

    const result = await window.electronAPI.createSale(saleData);
    
    if (result.success) {
      setShowPaymentModal(false);
      
      // Kasa yazıcısından satış fişi yazdır (sadece kasa yazıcısına)
      const receiptData = {
        sale_id: result.saleId,
        totalAmount,
        paymentMethod,
        sale_date: new Date().toLocaleDateString('tr-TR'),
        sale_time: new Date().toLocaleTimeString('tr-TR'),
        items: cart,
        orderNote: orderNote || null,
        cashierOnly: true // Sadece kasa yazıcısına yazdır
      };
      
      if (window.electronAPI && window.electronAPI.printReceipt) {
        setPrintToast({ status: 'printing', message: 'Fiş yazdırılıyor...' });
        window.electronAPI.printReceipt(receiptData).then(result => {
          if (result.success) {
            setPrintToast({ status: 'success', message: 'Fiş başarıyla yazdırıldı' });
          } else {
            setPrintToast({ status: 'error', message: result.error || 'Fiş yazdırılamadı' });
          }
        }).catch(err => {
          console.error('Fiş yazdırılırken hata:', err);
          setPrintToast({ status: 'error', message: 'Fiş yazdırılamadı: ' + err.message });
        });
      }
      
      // Kategori bazlı yazıcılardan adisyon yazdır
      const adisyonData = {
        items: cart,
        tableName: null, // Hızlı satış için masa yok
        tableType: null,
        orderNote: orderNote || null,
        orderSource: null, // Hızlı satış için orderSource yok
        sale_date: new Date().toLocaleDateString('tr-TR'),
        sale_time: new Date().toLocaleTimeString('tr-TR')
      };
      
      if (window.electronAPI && window.electronAPI.printAdisyon) {
        // Arka planda yazdır, hata olsa bile devam et
        window.electronAPI.printAdisyon(adisyonData).catch(err => {
          console.error('Adisyon yazdırılırken hata:', err);
        });
      }
      
      // Fiş modal'ını göster
      setReceiptData({
        sale_id: result.saleId,
        totalAmount,
        paymentMethod,
        sale_date: new Date().toLocaleDateString('tr-TR'),
        sale_time: new Date().toLocaleTimeString('tr-TR'),
        items: cart,
        orderNote: orderNote || null
      });
      setShowReceiptModal(true);
      const currentNote = orderNote;
      clearCart();
      setSaleSuccessInfo({ totalAmount, paymentMethod });
    }
  };

  const completeSplitPayment = async (payments) => {
    // Parçalı ödeme için tek bir satış oluştur (tüm ürünler bir arada)
    const totalAmount = cart.reduce((sum, item) => {
      // İkram edilen ürünleri toplamdan çıkar
      if (item.isGift) return sum;
      return sum + (item.price * item.quantity);
    }, 0);

    // Gece Dönercisi: şube seçimi zorunlu (stok düşümü şube bazlı)
    const activeBranch = isGeceDonercisiMode ? getActiveBranchForGece() : null;
    if (isGeceDonercisiMode && !activeBranch) {
      setShowBranchSelectModal(true);
      setErrorToast({ message: 'Şube seçimi zorunludur. Lütfen önce şube seçin.' });
      setTimeout(() => setErrorToast(null), 3500);
      return;
    }
    
    // Ödeme yöntemlerini birleştir (örn: "Nakit + Kredi Kartı")
    const paymentMethods = [...new Set(payments.map(p => p.method))];
    const paymentMethodString = paymentMethods.join(' + ');

    // Ödeme detaylarını string olarak oluştur
    const paymentDetails = payments.map(p => `${p.method}: ₺${p.amount.toFixed(2)}`).join(', ');

    const saleData = {
      items: cart,
      totalAmount,
      paymentMethod: `Parçalı Ödeme (${paymentDetails})`,
      orderNote: orderNote || null,
      ...(isGeceDonercisiMode
        ? { branch: activeBranch, deviceId: getOrCreateGeceDeviceId() }
        : {})
    };

    const result = await window.electronAPI.createSale(saleData);
    
    if (result.success) {
      setShowSplitPaymentModal(false);
      // Fiş modal'ını göster
      const receiptData = {
        sale_id: result.saleId,
        totalAmount,
        paymentMethod: `Parçalı Ödeme (${paymentDetails})`,
        sale_date: new Date().toLocaleDateString('tr-TR'),
        sale_time: new Date().toLocaleTimeString('tr-TR'),
        items: cart,
        orderNote: orderNote || null
      };
      
      // Kasa yazıcısından satış fişi yazdır (sadece kasa yazıcısına)
      if (window.electronAPI && window.electronAPI.printReceipt) {
        setPrintToast({ status: 'printing', message: 'Fiş yazdırılıyor...' });
        window.electronAPI.printReceipt({
          ...receiptData,
          cashierOnly: true // Sadece kasa yazıcısına yazdır
        }).then(result => {
          if (result.success) {
            setPrintToast({ status: 'success', message: 'Fiş başarıyla yazdırıldı' });
          } else {
            setPrintToast({ status: 'error', message: result.error || 'Fiş yazdırılamadı' });
          }
        }).catch(err => {
          console.error('Fiş yazdırılırken hata:', err);
          setPrintToast({ status: 'error', message: 'Fiş yazdırılamadı: ' + err.message });
        });
      }
      
      // Kategori bazlı yazıcılardan adisyon yazdır
      const adisyonData = {
        items: cart,
        tableName: null, // Hızlı satış için masa yok
        tableType: null,
        orderNote: orderNote || null,
        sale_date: new Date().toLocaleDateString('tr-TR'),
        sale_time: new Date().toLocaleTimeString('tr-TR')
      };
      
      if (window.electronAPI && window.electronAPI.printAdisyon) {
        // Arka planda yazdır, hata olsa bile devam et
        window.electronAPI.printAdisyon(adisyonData).catch(err => {
          console.error('Adisyon yazdırılırken hata:', err);
        });
      }
      
      clearCart();
      setSaleSuccessInfo({ 
        totalAmount, 
        paymentMethod: `Parçalı Ödeme (${paymentDetails})`,
        splitPayment: true
      });
    }
  };

  const getTotalAmount = () => {
    return cart.reduce((sum, item) => {
      // İkram edilen ürünleri toplamdan çıkar
      if (item.isGift) return sum;
      return sum + (item.price * item.quantity);
    }, 0);
  };

  const getTotalItems = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  const handleExit = () => {
    setShowExitSplash(true);
  };

  const handleExitComplete = async () => {
    // Veritabanını kaydet
    if (window.electronAPI && window.electronAPI.saveDatabase) {
      try {
        await window.electronAPI.saveDatabase();
      } catch (error) {
        console.error('Veritabanı kaydedilirken hata:', error);
      }
    }
    
    // Tüm state'leri temizle
    setCart([]);
    setOrderNote('');
    setSelectedTable(null);
    setCategories([]);
    setProducts([]);
    setAllProducts([]);
    setSelectedCategory(null);
    setCurrentView('pos');
    setSaleSuccessInfo(null);
    setPrintToast(null);
    setUpdateInfo(null);
    setUpdateDownloadProgress(null);
    setBroadcastMessage(null);
    setSuspendedInfo(null);
    setShowExitSplash(false);
    setShowSplash(false);
    
    // Tenant bilgilerini temizle
    setTenantId(null);
    setTenantInfo(null);
    
    // Electron'dan tenant bilgisini temizle
    if (window.electronAPI && window.electronAPI.setTenantInfo) {
      try {
        await window.electronAPI.setTenantInfo(null);
      } catch (error) {
        console.error('Tenant bilgisi temizlenirken hata:', error);
      }
    }
    
    // LauncherClient'e geri dön
    setShowLauncher(true);
  };

  const handleSaveExpense = async (expenseData) => {
    // Masrafı normal satış gibi Firebase Sales'e kaydet
    const saleData = {
      items: [{
        id: 'expense-' + Date.now(),
        name: expenseData.title,
        price: expenseData.amount,
        quantity: 1,
        isExpense: true // Masraf olduğunu belirt
      }],
      totalAmount: expenseData.amount,
      paymentMethod: 'Masraf',
      orderNote: null,
      isExpense: true // Satış değil, masraf
    };

    // Gece Dönercisi: meta ekle (stoktan düşmez; sadece kayıt amaçlı)
    const activeBranch = isGeceDonercisiMode ? getActiveBranchForGece() : null;
    if (isGeceDonercisiMode && activeBranch) {
      saleData.branch = activeBranch;
      saleData.deviceId = getOrCreateGeceDeviceId();
    }

    const result = await window.electronAPI.createSale(saleData);
    
    if (result.success) {
      setSaleSuccessInfo({ 
        totalAmount: expenseData.amount, 
        paymentMethod: 'Masraf',
        expenseTitle: expenseData.title
      });
    }
  };

  // Show launcher if tenant ID is not set
  if (showLauncher) {
    return <LauncherClient onLogin={handleLauncherLogin} />;
  }

  return (
    <>
      {showSplash && (
        <SplashScreen onComplete={() => setShowSplash(false)} businessName={businessName} />
      )}

      {/* Gece Dönercisi: Şube seçimi zorunlu popup (cihaz bazlı, tek seferlik) */}
      {isGeceDonercisiMode && (
        <BranchSelectModal
          open={showBranchSelectModal}
          themeColor="#0f172a"
          selectedBranch={selectedBranch}
          onSelectBranch={(b) => setSelectedBranch(b)}
          onConfirm={async (branch) => {
            // Local (zorunlu)
            setGeceSelectedBranch(branch);
            setSelectedBranch(branch);
            setShowBranchSelectModal(false);
            try {
              window.dispatchEvent(new CustomEvent('gece-branch-changed', { detail: { branch } }));
            } catch {}

            // Remote (gecedonercisimasalar) — başarısız olursa UI'yi kilitlemeyelim, sadece logla
            try {
              const deviceId = getOrCreateGeceDeviceId();
              if (window.electronAPI && window.electronAPI.setGeceBranchSelection) {
                await window.electronAPI.setGeceBranchSelection({ branch, deviceId });
              }
              await upsertDeviceBranchSelection({
                tenantId,
                deviceId,
                branch,
                platform: 'desktop',
              });
            } catch (e) {
              console.error('Şube seçimi Firebase kaydı başarısız:', e);
            }
          }}
          confirmText="Kaydet ve devam et"
        />
      )}

      {showExitSplash && (
        <ExitSplash onComplete={handleExitComplete} />
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
        onExit={handleExit}
        businessName={businessName}
        themeColor={themeColor}
        tenantId={tenantId}
      />
      
      {currentView === 'tables' ? (
        <div className="p-6">
          <TablePanel 
            onSelectTable={handleTableSelect}
            refreshTrigger={tableRefreshTrigger}
            onShowReceipt={(receiptData) => {
              setReceiptData(receiptData);
              setShowReceiptModal(true);
            }}
            tenantId={tenantId}
            insideTablesCount={tenantInfo?.insideTables !== undefined && tenantInfo?.insideTables !== null ? tenantInfo.insideTables : 20}
            outsideTablesCount={tenantInfo?.outsideTables !== undefined && tenantInfo?.outsideTables !== null ? tenantInfo.outsideTables : 20}
            packageTablesCount={tenantInfo?.packageTables !== undefined && tenantInfo?.packageTables !== null ? tenantInfo.packageTables : 5}
          />
        </div>
      ) : currentView === 'pos' ? (
        <div className="flex h-[calc(100vh-80px)]">
          {/* Sol Panel - Kategoriler ve Ürünler */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            {selectedTable && (
              <div className="mb-3 p-3 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white rounded-xl shadow-lg flex items-center justify-between">
                <p className="text-base font-semibold">
                  Masa: {selectedTable.name} için sipariş oluşturuyorsunuz
                </p>
                <button
                  onClick={() => {
                    setSelectedTable(null);
                    clearCart();
                  }}
                  className="ml-4 p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  title="Masa seçimini iptal et"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <CategoryPanel
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={(category) => {
                setSelectedCategory(category);
                setSearchQuery(''); // Kategori değiştiğinde aramayı temizle
              }}
              themeColor={themeColor}
              tenantId={tenantId}
              onCariMaliyetClick={() => {
                if (isGeceDonercisiMode) setShowCariMaliyetModal(true);
              }}
            />
            
            {/* Arama Çubuğu ve (sadece Admin için) Masraf Ekle Butonu */}
            <div className="mb-3 flex gap-2">
              <div className="flex-1 relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ürün ara..."
                  className="w-full px-3 py-2 pl-10 bg-white/90 backdrop-blur-xl border-2 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:border-transparent text-gray-800 font-medium placeholder-gray-400 transition-all duration-200 text-sm"
                  style={{ 
                    borderColor: theme.primary200,
                    '--focus-ring': theme.primary500 
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = theme.primary500;
                    e.target.style.boxShadow = `0 0 0 2px ${theme.primary500}40`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = theme.primary200;
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      if (searchInputRef.current) {
                        searchInputRef.current.focus();
                      }
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-purple-100 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {userType === 'Admin' && (
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Masraf Ekle</span>
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="mb-3 text-xs text-gray-600 font-medium">
                {filteredProducts.length > 0 
                  ? `${filteredProducts.length} ürün bulundu` 
                  : 'Ürün bulunamadı'}
              </p>
            )}
            
            <ProductGrid
              products={filteredProducts}
              onAddToCart={addToCart}
              tenantId={tenantId}
              categories={categories}
            />
          </div>

          {/* Sağ Panel - Sepet */}
          <div className="w-[420px] bg-gradient-to-b from-gray-50 to-gray-100 backdrop-blur-xl border-l border-gray-200 p-6">
            <Cart
              cart={cart}
              onUpdateQuantity={updateCartItemQuantity}
              onRemoveItem={removeFromCart}
              onClearCart={clearCart}
              onCheckout={handlePayment}
              onSaveToTable={completeTableOrder}
              onRequestAdisyon={requestAdisyon}
              totalAmount={getTotalAmount()}
              selectedTable={selectedTable}
              orderNote={orderNote}
              onOrderNoteChange={setOrderNote}
              onToggleGift={toggleGift}
              onUpdateItemNote={updateItemNote}
              themeColor={themeColor}
              tenantId={tenantId}
            />
          </div>
        </div>
      ) : (
        <div className="p-6">
          <SalesHistory themeColor={themeColor} />
        </div>
      )}

      {showPaymentModal && (
        <PaymentModal
          totalAmount={getTotalAmount()}
          onSelectPayment={completeSale}
          onClose={() => setShowPaymentModal(false)}
          tenantId={tenantId}
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

      {showExpenseModal && (
        <ExpenseModal
          onClose={() => setShowExpenseModal(false)}
          onSave={handleSaveExpense}
        />
      )}

      {showCariMaliyetModal && isGeceDonercisiMode && (
        <CariMaliyetModal
          tenantId={tenantId}
          themeColor={themeColor}
          products={allProducts}
          onClose={() => setShowCariMaliyetModal(false)}
        />
      )}

      {showDonerOptionsModal && pendingDonerProduct && isGeceDonercisiMode && (
        <DonerOptionsModal
          productName={pendingDonerProduct.name}
          themeColor={themeColor}
          onClose={() => {
            setShowDonerOptionsModal(false);
            setPendingDonerProduct(null);
          }}
          onConfirm={handleDonerOptionsConfirm}
        />
      )}

      {/* Soğan Seçici Modal (Yaka's Grill için) */}
      {showOnionModal && pendingOnionProduct && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-5 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowOnionModal(false)}
        >
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-slide-up">
            <div className={`bg-gradient-to-r ${theme.primary} to-${theme.primaryLight} text-white p-6`} style={{ background: `linear-gradient(135deg, ${themeColor} 0%, ${theme.primaryLight} 100%)` }}>
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black m-0">Soğan Seçimi</h2>
                <button 
                  onClick={() => setShowOnionModal(false)}
                  className="bg-white bg-opacity-20 border-none text-white w-9 h-9 rounded-xl cursor-pointer flex items-center justify-center text-2xl font-bold transition-all hover:bg-opacity-30"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6">
              <p className="m-0 mb-5 text-base text-gray-600 font-semibold text-center">
                {pendingOnionProduct.name}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleOnionSelect('Soğanlı')}
                  className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-2xl text-lg font-bold text-gray-800 cursor-pointer transition-all text-center flex items-center justify-center gap-3 hover:bg-gradient-to-br hover:from-gray-100 hover:to-gray-200 hover:-translate-y-0.5 hover:shadow-lg"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = themeColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <span className="text-2xl">🧅</span>
                  <span>Soğanlı</span>
                </button>
                <button
                  onClick={() => handleOnionSelect('Soğansız')}
                  className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-2xl text-lg font-bold text-gray-800 cursor-pointer transition-all text-center flex items-center justify-center gap-3 hover:bg-gradient-to-br hover:from-gray-100 hover:to-gray-200 hover:-translate-y-0.5 hover:shadow-lg"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = themeColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <span className="text-2xl">🚫</span>
                  <span>Soğansız</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Porsiyon Seçici Modal (Yaka's Grill için) */}
      {showPortionModal && pendingPortionProduct && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-5 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowPortionModal(false)}
        >
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-slide-up">
            <div className={`bg-gradient-to-r ${theme.primary} to-${theme.primaryLight} text-white p-6`} style={{ background: `linear-gradient(135deg, ${themeColor} 0%, ${theme.primaryLight} 100%)` }}>
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black m-0">Porsiyon Seçimi</h2>
                <button 
                  onClick={() => setShowPortionModal(false)}
                  className="bg-white bg-opacity-20 border-none text-white w-9 h-9 rounded-xl cursor-pointer flex items-center justify-center text-2xl font-bold transition-all hover:bg-opacity-30"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6">
              <p className="m-0 mb-5 text-base text-gray-600 font-semibold text-center">
                {pendingPortionProduct.name}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handlePortionSelect(0.5)}
                  className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-2xl text-lg font-bold text-gray-800 cursor-pointer transition-all text-center flex flex-col items-center justify-center gap-2 hover:bg-gradient-to-br hover:from-gray-100 hover:to-gray-200 hover:-translate-y-0.5 hover:shadow-lg"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = themeColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <span className="text-2xl font-black">0.5</span>
                  <span className="text-sm text-gray-500">Porsiyon</span>
                </button>
                <button
                  onClick={() => handlePortionSelect(1)}
                  className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-2xl text-lg font-bold text-gray-800 cursor-pointer transition-all text-center flex flex-col items-center justify-center gap-2 hover:bg-gradient-to-br hover:from-gray-100 hover:to-gray-200 hover:-translate-y-0.5 hover:shadow-lg"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = themeColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <span className="text-2xl font-black">1</span>
                  <span className="text-sm text-gray-500">Porsiyon</span>
                </button>
                <button
                  onClick={() => handlePortionSelect(1.5)}
                  className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-2xl text-lg font-bold text-gray-800 cursor-pointer transition-all text-center flex flex-col items-center justify-center gap-2 hover:bg-gradient-to-br hover:from-gray-100 hover:to-gray-200 hover:-translate-y-0.5 hover:shadow-lg"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = themeColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <span className="text-2xl font-black">1.5</span>
                  <span className="text-sm text-gray-500">Porsiyon</span>
                </button>
                <button
                  onClick={() => handlePortionSelect(2)}
                  className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-2xl text-lg font-bold text-gray-800 cursor-pointer transition-all text-center flex flex-col items-center justify-center gap-2 hover:bg-gradient-to-br hover:from-gray-100 hover:to-gray-200 hover:-translate-y-0.5 hover:shadow-lg"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = themeColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <span className="text-2xl font-black">2</span>
                  <span className="text-sm text-gray-500">Porsiyon</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeRoleSplash && <RoleSplash role={activeRoleSplash} />}
      <SaleSuccessToast
        info={saleSuccessInfo}
        onClose={() => setSaleSuccessInfo(null)}
      />
      <PrintToast
        status={printToast?.status}
        message={printToast?.message}
        onClose={() => setPrintToast(null)}
        autoHideDuration={printToast?.status === 'printing' ? null : 2500}
      />

      {/* Error Toast */}
      {errorToast && (
        <div className="fixed inset-x-0 top-0 z-[2000] flex justify-center pointer-events-none pt-6">
          <div className="bg-white/95 backdrop-blur-xl border-2 border-red-300 rounded-2xl shadow-2xl px-6 py-4 pointer-events-auto animate-toast-slide-down max-w-md mx-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg ring-4 ring-red-100 flex-shrink-0 animate-scale-in">
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

      {/* Minimize Button - Sol Alt Köşe */}
      <button
        onClick={() => {
          if (window.electronAPI && window.electronAPI.minimizeWindow) {
            window.electronAPI.minimizeWindow();
          }
        }}
        className="fixed bottom-4 left-4 z-50 w-10 h-10 rounded-full bg-white/80 hover:bg-white border-2 border-orange-300 hover:border-orange-500 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
        title="Uygulamayı Arka Plana Al (Alt+Tab)"
      >
        <svg 
          className="w-5 h-5 text-purple-600 group-hover:text-purple-700 transition-colors" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2.5} 
            d="M19 9l-7 7-7-7" 
            transform="rotate(90 12 12)"
          />
        </svg>
      </button>

      {/* Broadcast Message Modal */}
      {broadcastMessage && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in p-4" 
          onClick={() => setBroadcastMessage(null)}
          style={{ animation: 'fadeIn 0.3s ease' }}
        >
          <div 
            className="bg-gradient-to-br from-white to-slate-50 rounded-[32px] max-w-md w-full shadow-2xl overflow-hidden relative border border-white/20" 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              animation: 'slideUpScale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset'
            }}
          >
            {/* Dekoratif arka plan efektleri */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-orange-200/20 to-blue-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-orange-200/20 to-orange-200/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
            
            {/* Header */}
            <div className="relative text-white p-7 overflow-hidden" style={{ backgroundImage: `linear-gradient(to right, #4f46e5 0%, ${theme.primary} 50%, ${theme.primaryDark} 100%)` }}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-14 h-14 bg-white/25 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg border border-white/30">
                  <span className="text-3xl">📢</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-black text-white mb-1 tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                    Yeni Mesaj
                  </h3>
                  <p className="text-sm font-medium text-white/95">Yönetimden bildirim</p>
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="relative z-10 p-7">
              <div className="mb-5">
                <p className="text-base font-medium text-gray-800 leading-relaxed whitespace-pre-wrap tracking-wide">
                  {broadcastMessage.message}
                </p>
              </div>
              <div className="bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-semibold text-slate-600">
                  {broadcastMessage.date} {broadcastMessage.time}
                </p>
              </div>
            </div>
            
            {/* Footer */}
            <div className="relative z-10 border-t border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 flex justify-center">
              <button
                onClick={async () => {
                  // Mesajı okundu olarak işaretle
                  if (broadcastMessage.id && window.electronAPI && window.electronAPI.markBroadcastRead) {
                    try {
                      await window.electronAPI.markBroadcastRead(broadcastMessage.id);
                      console.log('✅ Broadcast mesajı okundu olarak işaretlendi:', broadcastMessage.id);
                    } catch (error) {
                      console.error('❌ Broadcast okunma işaretleme hatası:', error);
                    }
                  }
                  // Modal'ı kapat
                  setBroadcastMessage(null);
                }}
                className="px-12 py-4 bg-gradient-to-r from-indigo-600 via-orange-500 to-orange-600 hover:from-indigo-700 hover:via-orange-600 hover:to-orange-700 text-white font-bold rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 relative overflow-hidden group"
                style={{
                  boxShadow: '0 8px 20px rgba(102, 126, 234, 0.4)',
                  letterSpacing: '0.3px'
                }}
              >
                <span className="relative z-10">Anladım</span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </div>
          </div>
          
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpScale {
              from { transform: translateY(40px) scale(0.9); opacity: 0; }
              to { transform: translateY(0) scale(1); opacity: 1; }
            }
            .animate-fade-in {
              animation: fadeIn 0.3s ease-out;
            }
            .animate-slide-up-scale {
              animation: slideUpScale 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
          `}</style>
        </div>
      )}

      {/* Tenant Suspended Modal */}
      {suspendedInfo && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[10000] p-4" 
          style={{ animation: 'fadeIn 0.3s ease' }}
        >
          <div 
            className="bg-gradient-to-br from-white to-slate-50 rounded-[32px] max-w-md w-full shadow-2xl overflow-hidden relative border border-white/20"
            style={{ 
              animation: 'slideUpScale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset'
            }}
          >
            {/* Dekoratif arka plan efektleri */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-red-200/30 to-orange-200/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-pink-200/30 to-red-200/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
            
            {/* Header */}
            <div className="relative bg-gradient-to-r from-red-500 via-red-600 to-orange-500 text-white p-7 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-16 h-16 bg-white/25 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg border border-white/30">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-black text-white mb-1 tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                    Hesap Askıya Alındı
                  </h3>
                  <p className="text-sm font-medium text-white/95">Yönetim Bildirimi</p>
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="relative z-10 p-7">
              <div className="mb-5">
                <p className="text-base font-semibold text-gray-800 leading-relaxed mb-4 tracking-wide">
                  {suspendedInfo.message || 'Hesabınız yönetici tarafından askıya alınmıştır. Lütfen yönetici ile iletişime geçiniz.'}
                </p>
                {suspendedInfo.businessName && (
                  <div className="bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <p className="text-sm font-semibold text-slate-700">
                      {suspendedInfo.businessName}
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Footer */}
            <div className="relative z-10 border-t border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 flex justify-center">
              <button
                onClick={async () => {
                  setSuspendedInfo(null);
                  // Uygulamayı kapat
                  if (window.electronAPI && window.electronAPI.quitApp) {
                    await window.electronAPI.quitApp();
                  } else {
                    // Fallback
                    window.close();
                  }
                }}
                className="px-12 py-4 bg-gradient-to-r from-red-500 via-red-600 to-orange-500 hover:from-red-600 hover:via-red-700 hover:to-orange-600 text-white font-bold rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 relative overflow-hidden group"
                style={{
                  boxShadow: '0 8px 20px rgba(239, 68, 68, 0.4)',
                  letterSpacing: '0.3px'
                }}
              >
                <span className="relative z-10">Anladım</span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </div>
          </div>
          
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpScale {
              from { transform: translateY(40px) scale(0.9); opacity: 0; }
              to { transform: translateY(0) scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
    </>
  );
}

export default App;

