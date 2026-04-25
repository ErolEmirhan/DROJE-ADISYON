import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getThemeColors } from '../utils/themeUtils';
import { isGeceDonercisi, isYakasGrill, isLacromisa } from '../utils/sultanSomatTables';
import { GECE_BRANCHES, getGeceSelectedBranch, getOrCreateGeceDeviceId, setGeceSelectedBranch } from '../utils/geceDonercisiBranchSelection';
import { fetchBranchStockMap, upsertDeviceBranchSelection, adjustBranchStock } from '../utils/geceDonercisiMasalarFirestore';

const SettingsModal = ({ onClose, onProductsUpdated, themeColor = '#f97316', tenantId = null }) => {
  // Tema renklerini hesapla
  const theme = useMemo(() => getThemeColors(themeColor), [themeColor]);
  const isYakasGrillMode = tenantId && isYakasGrill(tenantId);
  const isGeceDonercisiMode = tenantId && isGeceDonercisi(tenantId);
  const isLacromisaMode = tenantId && isLacromisa(tenantId);
  const [activeTab, setActiveTab] = useState('password'); // 'password', 'products', 'printers', or 'stock'
  const [showPlatformPriceModal, setShowPlatformPriceModal] = useState(false);
  const [platformPriceType, setPlatformPriceType] = useState(null); // 'yemeksepeti' or 'trendyolgo'
  const [printerSubTab, setPrinterSubTab] = useState('usb'); // 'usb' or 'network'
  const [geceBranch, setGeceBranch] = useState(() => getGeceSelectedBranch());
  const [isSavingGeceBranch, setIsSavingGeceBranch] = useState(false);
  /** Gece Dönercisi: Firebase branchStocks — her şube ayrı harita (admin panel ile aynı kaynak) */
  const [geceStocksByBranch, setGeceStocksByBranch] = useState({ SEKER: {}, SANCAK: {} });
  const [isLoadingGeceBranchStocks, setIsLoadingGeceBranchStocks] = useState(false);
  const [geceStockQtyInput, setGeceStockQtyInput] = useState({ SEKER: '', SANCAK: '' });
  const [geceStockSetInput, setGeceStockSetInput] = useState({ SEKER: '', SANCAK: '' });
  const [geceStockSavingBranch, setGeceStockSavingBranch] = useState(null); // 'SEKER' | 'SANCAK' | null
  /** Gece Dönercisi şube stoku: uygulama içi bildirim (alert yerine) */
  const [geceStockNotice, setGeceStockNotice] = useState(null); // { variant, title, message, key }
  const geceStockNoticeTimerRef = useRef(null);
  /** Gece: confirm() yerine (Electron’da odak/input sorunu) */
  const [geceSettingsConfirm, setGeceSettingsConfirm] = useState(null); // { message, onConfirm }

  // Stock management state
  const [stockFilterCategory, setStockFilterCategory] = useState(null);
  const [stockFilterProduct, setStockFilterProduct] = useState(null);
  const [stockAdjustmentAmount, setStockAdjustmentAmount] = useState('');
  const [stockAdjustmentType, setStockAdjustmentType] = useState('add'); // 'add' or 'subtract'
  /** Stok sekmesi kart ızgarasında metin arama */
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  /** Gece: stok ekranına her girişte şube sorulur; yalnızca bu şubenin stokları görünür (satış şubesinden bağımsız) */
  const [stockGeceSessionBranch, setStockGeceSessionBranch] = useState(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Product management state
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    category_id: '',
    price: '',
    image: ''
  });
  // Lacromisa: daha kompakt inline düzenleme
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showCreateProductPanel, setShowCreateProductPanel] = useState(false);
  const [inlineEditingProductId, setInlineEditingProductId] = useState(null);
  const [inlineDraft, setInlineDraft] = useState(null); // { name, category_id, price, image }
  const [inlineSaving, setInlineSaving] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryDropdownRef = useRef(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(null); // { productId, productName }
  const [deleteCategoryModal, setDeleteCategoryModal] = useState(null); // { categoryId, categoryName, productCount }
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  
  // Printer management state
  const [printers, setPrinters] = useState({ usb: [], network: [], all: [] });
  const [printerAssignments, setPrinterAssignments] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [showCategoryAssignModal, setShowCategoryAssignModal] = useState(false);
  const [assigningCategory, setAssigningCategory] = useState(null);
  const [cashierPrinter, setCashierPrinter] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [isOptimizingImages, setIsOptimizingImages] = useState(false);
  const [lastOptimizeResult, setLastOptimizeResult] = useState(null);
  const [showFirebaseImageModal, setShowFirebaseImageModal] = useState(false);
  const [firebaseImages, setFirebaseImages] = useState([]);
  const [isLoadingFirebaseImages, setIsLoadingFirebaseImages] = useState(false);
  const [isCreatingImageRecords, setIsCreatingImageRecords] = useState(false);
  

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setShowCategoryDropdown(false);
      }
    };

    if (showCategoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCategoryDropdown]);

  useEffect(() => {
    return () => {
      if (geceStockNoticeTimerRef.current) {
        clearTimeout(geceStockNoticeTimerRef.current);
        geceStockNoticeTimerRef.current = null;
      }
    };
  }, []);

  const dismissGeceStockNotice = () => {
    if (geceStockNoticeTimerRef.current) {
      clearTimeout(geceStockNoticeTimerRef.current);
      geceStockNoticeTimerRef.current = null;
    }
    setGeceStockNotice(null);
  };

  const showGeceStockNotice = (variant, title, message) => {
    if (geceStockNoticeTimerRef.current) {
      clearTimeout(geceStockNoticeTimerRef.current);
      geceStockNoticeTimerRef.current = null;
    }
    setGeceStockNotice({ variant, title, message, key: Date.now() });
    geceStockNoticeTimerRef.current = setTimeout(() => {
      setGeceStockNotice(null);
      geceStockNoticeTimerRef.current = null;
    }, 4200);
  };

  useEffect(() => {
    loadCategories();
    loadAllProducts();
    if (activeTab === 'printers') {
      loadPrinters();
      loadPrinterAssignments();
      loadCashierPrinter();
    }
    if (activeTab === 'stock') {
      // Stok sekmesi açıldığında ürünleri yükle
      loadAllProducts();
      // Gece Dönercisi: mevcut şubeyi yeniden oku (başka yerden değişmiş olabilir)
      if (isGeceDonercisiMode) {
        const b = getGeceSelectedBranch();
        setGeceBranch(b);
        // Stok ekranına her girişte şube seçimi zorunlu; diğer şube bu ekranda gösterilmez
        setStockGeceSessionBranch(null);
        setStockFilterProduct(null);
      }
    }
  }, [activeTab, isGeceDonercisiMode]);

  useEffect(() => {
    if (activeTab !== 'stock') setStockSearchQuery('');
  }, [activeTab]);

  useEffect(() => {
    if (!isGeceDonercisiMode) setStockGeceSessionBranch(null);
  }, [isGeceDonercisiMode]);

  const normalizeTr = (s) => {
    try {
      return String(s || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return String(s || '').toLowerCase().trim();
    }
  };

  const allowedStockCategoryNames = useMemo(() => new Set(['icecekler', 'yan urunler']), []);

  const isAllowedStockCategory = (categoryName) => {
    const norm = normalizeTr(categoryName);
    return allowedStockCategoryNames.has(norm);
  };

  const allowedStockCategories = useMemo(() => {
    if (!isGeceDonercisiMode) return categories;
    return (categories || []).filter((c) => isAllowedStockCategory(c?.name));
  }, [categories, isGeceDonercisiMode]);

  const stockTabProductList = useMemo(() => {
    if (stockFilterCategory) {
      return products.filter((p) => p.category_id === stockFilterCategory.id);
    }
    if (isGeceDonercisiMode) {
      return products.filter((p) => {
        const cat = categories.find((c) => c.id === p.category_id);
        return isAllowedStockCategory(cat?.name);
      });
    }
    return products;
  }, [products, stockFilterCategory, isGeceDonercisiMode, categories]);

  const stockTabProductGridList = useMemo(() => {
    const raw = stockSearchQuery.trim();
    if (!raw) return stockTabProductList;
    const q = raw.toLocaleLowerCase('tr-TR');
    return stockTabProductList.filter((p) =>
      String(p?.name || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [stockTabProductList, stockSearchQuery]);

  /** Tam ekran stok sol panel: içecekler + yan ürünler (filtre/arama yok, doğrudan liste) */
  const stockSidebarCategories = useMemo(
    () => (categories || []).filter((c) => allowedStockCategoryNames.has(normalizeTr(c?.name))),
    [categories, allowedStockCategoryNames]
  );

  const stockSidebarProductList = useMemo(() => {
    const ids = new Set(stockSidebarCategories.map((c) => c.id));
    const list = (products || []).filter((p) => ids.has(p.category_id));
    const iceCat = stockSidebarCategories.find((c) => normalizeTr(c?.name) === 'icecekler');
    const yanCat = stockSidebarCategories.find((c) => normalizeTr(c?.name) === 'yan urunler');
    const rank = (p) => {
      if (iceCat && p.category_id === iceCat.id) return 0;
      if (yanCat && p.category_id === yanCat.id) return 1;
      return 2;
    };
    return [...list].sort((a, b) => {
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'tr');
    });
  }, [products, stockSidebarCategories]);

  const stockFullscreenOpen = activeTab === 'stock' && (!isGeceDonercisiMode || !!stockGeceSessionBranch);

  const exitStockFullscreen = () => {
    setStockFilterProduct(null);
    setStockSearchQuery('');
    setActiveTab('password');
  };

  const getGeceStockForBranch = (productId, branch) => {
    if (branch !== 'SEKER' && branch !== 'SANCAK') return 0;
    const key = String(productId);
    const v = geceStocksByBranch[branch]?.[key];
    return Number.isFinite(v) ? v : 0;
  };

  const getDisplayedStock = (product) => {
    if (isGeceDonercisiMode && geceBranch) {
      return getGeceStockForBranch(product?.id, geceBranch);
    }
    const trackStock = product?.trackStock === true;
    const stock = trackStock && product?.stock !== undefined ? (product.stock || 0) : null;
    return stock ?? 0;
  };

  const loadGeceAllBranchStocks = async () => {
    if (!isGeceDonercisiMode) {
      setGeceStocksByBranch({ SEKER: {}, SANCAK: {} });
      return;
    }
    try {
      setIsLoadingGeceBranchStocks(true);
      const [seker, sancak] = await Promise.all([
        fetchBranchStockMap('SEKER'),
        fetchBranchStockMap('SANCAK'),
      ]);
      setGeceStocksByBranch({ SEKER: seker || {}, SANCAK: sancak || {} });
    } catch (e) {
      console.error('Şube stokları yüklenemedi:', e);
      setGeceStocksByBranch({ SEKER: {}, SANCAK: {} });
    } finally {
      setIsLoadingGeceBranchStocks(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'stock') return;
    if (!isGeceDonercisiMode) return;
    loadGeceAllBranchStocks();
  }, [activeTab, isGeceDonercisiMode]);

  useEffect(() => {
    if (!stockFilterProduct) return;
    setGeceStockQtyInput({ SEKER: '', SANCAK: '' });
    setGeceStockSetInput({ SEKER: '', SANCAK: '' });
  }, [stockFilterProduct?.id]);

  const saveGeceBranch = async (branch) => {
    setGeceSelectedBranch(branch);
    setGeceBranch(branch);
    // Aynı pencere içinde App'e haber ver (localStorage event'i aynı tab'da tetiklenmez)
    try {
      window.dispatchEvent(new CustomEvent('gece-branch-changed', { detail: { branch } }));
    } catch {
      // ignore
    }
    try {
      setIsSavingGeceBranch(true);
      const deviceId = getOrCreateGeceDeviceId();
      await upsertDeviceBranchSelection({
        tenantId,
        deviceId,
        branch,
        platform: 'desktop',
      });
    } catch (e) {
      console.error('Şube seçimi Firebase kaydı başarısız:', e);
      // UI'yi kilitlemeyelim — internet yoksa bile local seçim geçerli kalsın
    } finally {
      setIsSavingGeceBranch(false);
    }

    await loadGeceAllBranchStocks();
  };

  const handleGeceBranchStockDelta = async (branch, productId, mode) => {
    if (!tenantId || (branch !== 'SEKER' && branch !== 'SANCAK')) return;
    const amount = parseInt(String(geceStockQtyInput[branch] || '').replace(/\D/g, ''), 10);
    if (!amount || amount < 1) {
      showGeceStockNotice('warning', 'Miktar gerekli', 'Lütfen geçerli bir miktar girin (en az 1).');
      return;
    }
    const delta = mode === 'add' ? amount : -amount;
    try {
      setGeceStockSavingBranch(branch);
      await adjustBranchStock({
        tenantId,
        branch,
        productId: String(productId),
        delta,
        deviceId: getOrCreateGeceDeviceId(),
      });
      setGeceStockQtyInput((prev) => ({ ...prev, [branch]: '' }));
      await loadGeceAllBranchStocks();
      if (onProductsUpdated) onProductsUpdated();
      showGeceStockNotice(
        'success',
        mode === 'add' ? 'Stok artırıldı' : 'Stok azaltıldı',
        mode === 'add'
          ? `${branch} şubesinde +${amount} adet işlendi.`
          : `${branch} şubesinde −${amount} adet işlendi.`
      );
    } catch (e) {
      console.error('Şube stok güncelleme:', e);
      showGeceStockNotice('error', 'Güncellenemedi', e?.message || 'Stok güncellenemedi. Bağlantınızı kontrol edin.');
    } finally {
      setGeceStockSavingBranch(null);
    }
  };

  const handleGeceBranchStockSetAbsolute = async (branch, productId) => {
    if (!tenantId || (branch !== 'SEKER' && branch !== 'SANCAK')) return;
    const raw = String(geceStockSetInput[branch] ?? '').trim();
    const target = parseInt(raw, 10);
    if (raw === '' || Number.isNaN(target) || target < 0) {
      showGeceStockNotice('warning', 'Geçersiz değer', '0 veya daha büyük tam sayı girin.');
      return;
    }
    const current = getGeceStockForBranch(productId, branch);
    const delta = target - current;
    if (delta === 0) {
      showGeceStockNotice('info', 'Değişiklik yok', 'Stok zaten bu değerde.');
      return;
    }
    try {
      setGeceStockSavingBranch(branch);
      await adjustBranchStock({
        tenantId,
        branch,
        productId: String(productId),
        delta,
        deviceId: getOrCreateGeceDeviceId(),
      });
      setGeceStockSetInput((prev) => ({ ...prev, [branch]: '' }));
      await loadGeceAllBranchStocks();
      if (onProductsUpdated) onProductsUpdated();
      showGeceStockNotice(
        'success',
        'Stok güncellendi',
        `${branch} şubesi için yeni stok: ${target} adet.`
      );
    } catch (e) {
      console.error('Şube stok ayarlama:', e);
      showGeceStockNotice('error', 'Güncellenemedi', e?.message || 'Stok güncellenemedi.');
    } finally {
      setGeceStockSavingBranch(null);
    }
  };

  const loadCategories = async () => {
    const cats = await window.electronAPI.getCategories();
    setCategories(cats);
    if (cats.length > 0 && !selectedCategory) {
      setSelectedCategory(cats[0]);
      setProductForm(prev => ({ ...prev, category_id: cats[0].id }));
    }
  };

  const loadAllProducts = async () => {
    const prods = await window.electronAPI.getProducts();
    setProducts(prods);
  };

  const loadPrinters = async () => {
    try {
      const result = await window.electronAPI.getPrinters();
      if (result && result.success) {
        setPrinters(result.printers);
      }
    } catch (error) {
      console.error('Yazıcı yükleme hatası:', error);
    }
  };

  const runOptimizeAllImagesAfterConfirm = async () => {
    try {
      setIsOptimizingImages(true);
      setLastOptimizeResult(null);
      const result = await window.electronAPI.optimizeAllProductImages();
      setLastOptimizeResult(result);

      if (result && result.success) {
        alert(
          `Görsel optimizasyon tamamlandı.\n\n` +
          `İşlenen: ${result.processed}\n` +
          `Atlanan: ${result.skipped}\n` +
          `Hata: ${result.failed}`
        );
      } else {
        alert(
          'Görsel optimizasyon tamamlanamadı: ' +
          (result?.error || 'Bilinmeyen hata')
        );
      }
    } catch (error) {
      console.error('Görsel optimizasyon hatası:', error);
      alert('Görsel optimizasyon hatası: ' + error.message);
    } finally {
      setIsOptimizingImages(false);
    }
  };

  const handleOptimizeAllImages = () => {
    if (!window.electronAPI || typeof window.electronAPI.optimizeAllProductImages !== 'function') {
      alert('Görsel optimizasyon özelliği yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
      return;
    }

    const confirmMsg =
      'Tüm ürün görselleri Firebase Storage üzerinde yeniden optimize edilecek.\n\n' +
      '- Tümü WebP formatına dönüştürülecek\n' +
      '- Maksimum genişlik 600px, kalite ~65\n' +
      '- Amaç: 50–120 KB arası, 200 KB üstü reddedilir\n\n' +
      'Bu işlem internet bağlantınıza ve görsel sayısına göre birkaç dakika sürebilir.\n\n' +
      'Devam etmek istiyor musunuz?';

    if (isGeceDonercisiMode) {
      setGeceSettingsConfirm({
        message: confirmMsg,
        onConfirm: () => {
          setGeceSettingsConfirm(null);
          void runOptimizeAllImagesAfterConfirm();
        },
      });
      return;
    }

    if (!window.confirm(confirmMsg)) {
      return;
    }

    void runOptimizeAllImagesAfterConfirm();
  };

  const runCreateImageRecordsForAllProducts = async () => {
    try {
      setIsCreatingImageRecords(true);
      const result = await window.electronAPI.createImageRecordsForAllProducts();
      if (result.success) {
        alert(
          `✅ Image kayıtları oluşturuldu!\n\n` +
          `Oluşturulan: ${result.created}\n` +
          `Atlanan: ${result.skipped}\n` +
          `Hata: ${result.errors}`
        );
      } else {
        alert('Image kayıtları oluşturulamadı: ' + (result.error || 'Bilinmeyen hata'));
      }
    } catch (error) {
      console.error('Image kayıtları oluşturma hatası:', error);
      alert('Image kayıtları oluşturma hatası: ' + error.message);
    } finally {
      setIsCreatingImageRecords(false);
    }
  };

  const handleCreateImageRecordsForAllProducts = () => {
    const msg =
      "Tüm mevcut ürünler için Firebase'de image kayıtları oluşturulacak.\n\n" +
      "Bu işlem sadece görseli olan ve henüz Firebase'de kaydı olmayan ürünler için çalışır.\n\n" +
      'Devam etmek istiyor musunuz?';

    if (isGeceDonercisiMode) {
      setGeceSettingsConfirm({
        message: msg,
        onConfirm: () => {
          setGeceSettingsConfirm(null);
          void runCreateImageRecordsForAllProducts();
        },
      });
      return;
    }

    if (!window.confirm(msg)) {
      return;
    }

    void runCreateImageRecordsForAllProducts();
  };

  const loadPrinterAssignments = async () => {
    try {
      const assignments = await window.electronAPI.getPrinterAssignments();
      console.log('Yazıcı atamaları yüklendi:', assignments);
      setPrinterAssignments(assignments || []);
    } catch (error) {
      console.error('Yazıcı atamaları yükleme hatası:', error);
    }
  };

  const loadCashierPrinter = async () => {
    try {
      const cashier = await window.electronAPI.getCashierPrinter();
      setCashierPrinter(cashier);
    } catch (error) {
      console.error('Kasa yazıcısı yükleme hatası:', error);
    }
  };

  const handleSetCashierPrinter = async (printerName, printerType) => {
    try {
      const isCurrentCashier = cashierPrinter && 
        cashierPrinter.printerName === printerName && 
        cashierPrinter.printerType === printerType;
      
      if (isCurrentCashier) {
        // Zaten kasa yazıcısıysa, kaldır
        await window.electronAPI.setCashierPrinter(null);
        setCashierPrinter(null);
        alert('Kasa yazıcısı kaldırıldı');
      } else {
        // Kasa yazıcısı olarak ayarla
        await window.electronAPI.setCashierPrinter({ printerName, printerType });
        setCashierPrinter({ printerName, printerType });
        alert(`${printerName} kasa yazıcısı olarak ayarlandı`);
      }
    } catch (error) {
      console.error('Kasa yazıcısı ayarlama hatası:', error);
      alert('Kasa yazıcısı ayarlanırken hata oluştu: ' + error.message);
    }
  };

  const handleAssignCategory = async (printerName, printerType) => {
    setSelectedPrinter({ name: printerName, type: printerType });
    // Bu yazıcıya zaten atanmış kategorileri yükle
    const existingAssignments = printerAssignments.filter(
      a => a.printerName === printerName && a.printerType === printerType
    );
    // category_id'leri number'a çevir (tip uyumluluğu için)
    const existingCategoryIds = existingAssignments.map(a => Number(a.category_id));
    console.log('Modal açılıyor - Mevcut atamalar:', existingCategoryIds);
    setSelectedCategories(existingCategoryIds);
    setShowCategoryAssignModal(true);
  };

  const toggleCategorySelection = (categoryId) => {
    setSelectedCategories(prev => {
      const newSelection = prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId];
      console.log('Kategori seçimi değişti:', categoryId, 'Yeni seçim:', newSelection);
      return newSelection;
    });
  };

  const confirmCategoryAssignment = async () => {
    if (!selectedPrinter) return;
    
    console.log('Kategori atama başlatılıyor - Seçilen kategoriler:', selectedCategories);
    
    if (selectedCategories.length === 0) {
      alert('Lütfen en az bir kategori seçin');
      return;
    }
    
    setAssigningCategory(true);
    
    try {
      // Önce bu yazıcıya zaten atanmış kategorileri bul
      const existingAssignments = printerAssignments.filter(
        a => a.printerName === selectedPrinter.name && a.printerType === selectedPrinter.type
      );
      // Tip uyumluluğu için number'a çevir
      const existingCategoryIds = existingAssignments.map(a => Number(a.category_id));
      
      console.log('Mevcut atamalar:', existingCategoryIds);
      console.log('Seçilen kategoriler:', selectedCategories);
      
      // Kaldırılacak kategoriler (eski atamalarda var ama yeni seçimde yok)
      const toRemove = existingCategoryIds.filter(id => !selectedCategories.includes(id));
      
      // Eklenecek kategoriler (yeni seçimde var ama eski atamalarda yok)
      const toAdd = selectedCategories.filter(id => !existingCategoryIds.includes(id));
      
      console.log('Kaldırılacak kategoriler:', toRemove);
      console.log('Eklenecek kategoriler:', toAdd);
      
      // Önce kaldırılacak kategorileri kaldır
      for (const categoryId of toRemove) {
        const assignment = existingAssignments.find(a => a.category_id === categoryId);
        if (assignment) {
          const result = await window.electronAPI.removePrinterAssignment(
            assignment.printerName,
            assignment.printerType,
            categoryId
          );
          if (!result || !result.success) {
            console.error('Kategori kaldırma hatası:', categoryId, result);
          }
        }
      }
      
      // Sonra eklenecek kategorileri ekle - hepsini sırayla ekle
      const addResults = [];
      console.log(`Toplam ${toAdd.length} kategori eklenecek`);
      
      for (let i = 0; i < toAdd.length; i++) {
        const categoryId = toAdd[i];
        console.log(`[${i + 1}/${toAdd.length}] Kategori ekleniyor:`, categoryId, 'Tip:', typeof categoryId);
    
    try {
      const result = await window.electronAPI.assignCategoryToPrinter({
        printerName: selectedPrinter.name,
        printerType: selectedPrinter.type,
        category_id: categoryId
      });
      
          addResults.push({ categoryId, result });
          
          if (!result || !result.success) {
            console.error('Kategori ekleme hatası:', categoryId, result);
            throw new Error(result?.error || `Kategori ${categoryId} atanamadı`);
          }
          
          console.log(`✓ Kategori ${categoryId} başarıyla eklendi`);
          
          // Her atama arasında kısa bir bekleme (race condition önlemek için)
          if (i < toAdd.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error) {
          console.error(`Kategori ${categoryId} eklenirken hata:`, error);
          throw error;
        }
      }
      
      console.log('Tüm kategoriler eklendi:', addResults);
      
      // Veritabanını yeniden yükle
        await loadPrinterAssignments();
      
        setShowCategoryAssignModal(false);
        setSelectedPrinter(null);
        setAssigningCategory(null);
      setSelectedCategories([]);
      
      const addedCount = toAdd.length;
      const removedCount = toRemove.length;
      let message = '';
      if (addedCount > 0 && removedCount > 0) {
        message = `${addedCount} kategori eklendi, ${removedCount} kategori kaldırıldı`;
      } else if (addedCount > 0) {
        message = `${addedCount} kategori başarıyla atandı`;
      } else if (removedCount > 0) {
        message = `${removedCount} kategori kaldırıldı`;
      }
      alert(message || 'Kategori atamaları güncellendi');
    } catch (error) {
      console.error('Kategori atama hatası:', error);
      alert('Kategori atanamadı: ' + error.message);
      setAssigningCategory(null);
      // Hata durumunda da veritabanını yeniden yükle
      await loadPrinterAssignments();
    }
  };

  const runRemoveCategoryAssignment = async (categoryId) => {
    try {
      const assignment = printerAssignments.find(a => a.category_id === categoryId);
      if (!assignment) {
        alert('Atama bulunamadı');
        return;
      }

      const result = await window.electronAPI.removePrinterAssignment(
        assignment.printerName,
        assignment.printerType,
        categoryId
      );

      if (result && result.success) {
        await loadPrinterAssignments();
        alert('Kategori ataması kaldırıldı');
      } else {
        alert(result?.error || 'Kategori ataması kaldırılamadı');
      }
    } catch (error) {
      console.error('Kategori ataması kaldırma hatası:', error);
      alert('Kategori ataması kaldırılamadı: ' + error.message);
    }
  };

  const handleRemoveCategoryAssignment = (categoryId) => {
    if (!categoryId) return;

    const msg = 'Bu kategorinin yazıcı atamasını kaldırmak istediğinize emin misiniz?';

    if (isGeceDonercisiMode) {
      setGeceSettingsConfirm({
        message: msg,
        onConfirm: () => {
          setGeceSettingsConfirm(null);
          void runRemoveCategoryAssignment(categoryId);
        },
      });
      return;
    }

    if (!confirm(msg)) {
      return;
    }

    void runRemoveCategoryAssignment(categoryId);
  };

  const handlePasswordChange = async () => {
    setPasswordError('');
    setPasswordSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Tüm alanları doldurun');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Yeni parolalar eşleşmiyor');
      return;
    }

    if (newPassword.length !== 4 || !/^\d+$/.test(newPassword)) {
      setPasswordError('Parola 4 haneli rakam olmalıdır');
      return;
    }

    // API kontrolü
    if (!window.electronAPI || typeof window.electronAPI.changePassword !== 'function') {
      setPasswordError('API yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
      return;
    }

    try {
      const result = await window.electronAPI.changePassword(currentPassword, newPassword);
      if (result && result.success) {
        setPasswordSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setPasswordSuccess(false);
        }, 3000);
      } else {
        setPasswordError(result?.error || 'Parola değiştirilemedi');
      }
    } catch (error) {
      console.error('Parola değiştirme hatası:', error);
      setPasswordError('Bir hata oluştu: ' + (error.message || 'Bilinmeyen hata'));
    }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    
    if (!productForm.name || !productForm.category_id || !productForm.price) {
      alert('Lütfen tüm alanları doldurun');
      return;
    }

    const price = parseFloat(productForm.price);
    if (isNaN(price) || price <= 0) {
      alert('Geçerli bir fiyat girin');
      return;
    }

    try {
      if (editingProduct) {
        // Update product
        await window.electronAPI.updateProduct({
          id: editingProduct.id,
          name: productForm.name,
          category_id: parseInt(productForm.category_id),
          price: price,
          image: productForm.image || null
        });
      } else {
        // Create product
        await window.electronAPI.createProduct({
          name: productForm.name,
          category_id: parseInt(productForm.category_id),
          price: price,
          image: productForm.image || null
        });
      }
      
      // Reset form
      setProductForm({ name: '', category_id: selectedCategory?.id || '', price: '', image: '' });
      setEditingProduct(null);
      setShowCreateProductPanel(false);
      loadAllProducts();
      
      // Ana uygulamayı yenile
      if (onProductsUpdated) {
        onProductsUpdated();
      }
    } catch (error) {
      alert('Ürün kaydedilemedi: ' + error.message);
    }
  };

  const handleDeleteProduct = (productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setDeleteConfirmModal({ productId, productName: product.name });
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmModal) return;

    try {
      const result = await window.electronAPI.deleteProduct(deleteConfirmModal.productId);
      
      // Response kontrolü
      if (!result || !result.success) {
        alert(result?.error || 'Ürün silinemedi');
        setDeleteConfirmModal(null);
        return;
      }
      
      // Başarılı silme
      loadAllProducts();
      
      // Ana uygulamayı yenile
      if (onProductsUpdated) {
        onProductsUpdated();
      }
      
      setDeleteConfirmModal(null);
    } catch (error) {
      console.error('Ürün silme hatası:', error);
      alert('Ürün silinemedi: ' + (error.message || 'Bilinmeyen hata'));
      setDeleteConfirmModal(null);
    }
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setShowCreateProductPanel(true);
    setProductForm({
      name: product.name,
      category_id: String(product.category_id ?? ''),
      price: product.price.toString(),
      image: product.image || ''
    });
  };

  const beginInlineEdit = (product) => {
    setInlineEditingProductId(product.id);
    setInlineDraft({
      name: product.name || '',
      category_id: String(product.category_id || ''),
      price: String(product.price ?? ''),
      image: product.image || ''
    });
  };

  const cancelInlineEdit = () => {
    setInlineEditingProductId(null);
    setInlineDraft(null);
    setInlineSaving(false);
  };

  const saveInlineEdit = async (productId) => {
    if (!inlineDraft) return;
    if (!window.electronAPI || typeof window.electronAPI.updateProduct !== 'function') {
      alert('Ürün güncelleme özelliği yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
      return;
    }

    const name = String(inlineDraft.name || '').trim();
    const categoryIdNum = parseInt(String(inlineDraft.category_id || '').trim(), 10);
    const priceNum = parseFloat(String(inlineDraft.price || '').replace(',', '.'));

    if (!name) {
      alert('Ürün adı boş olamaz');
      return;
    }
    if (!Number.isFinite(categoryIdNum)) {
      alert('Kategori seçiniz');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      alert('Geçerli bir fiyat giriniz');
      return;
    }

    try {
      setInlineSaving(true);
      const result = await window.electronAPI.updateProduct({
        id: productId,
        name,
        category_id: categoryIdNum,
        price: priceNum,
        image: inlineDraft.image || null
      });

      if (result && (result.success || result.product)) {
        const updated = result.product || { id: productId, name, category_id: categoryIdNum, price: priceNum, image: inlineDraft.image || null };
        setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, ...updated } : p)));

        if (onProductsUpdated) onProductsUpdated();
        cancelInlineEdit();
      } else {
        throw new Error(result?.error || 'Ürün güncellenemedi');
      }
    } catch (e) {
      alert('Ürün güncellenemedi: ' + (e?.message || 'Bilinmeyen hata'));
    } finally {
      setInlineSaving(false);
    }
  };

  const selectInlineImage = async (productId) => {
    if (!window.electronAPI || typeof window.electronAPI.selectImageFile !== 'function') {
      alert('Dosya seçimi özelliği yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
      return;
    }
    try {
      const result = await window.electronAPI.selectImageFile(productId);
      if (result && result.success && result.path) {
        setInlineDraft((prev) => (prev ? { ...prev, image: result.path } : prev));
        // UI'yi anında güncelle (Electron tarafı Lacromisa için zaten auto-save yapıyor)
        setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, image: result.path } : p)));
      } else if (!result?.canceled) {
        alert('Dosya seçilemedi: ' + (result?.error || 'Bilinmeyen hata'));
      }
    } catch (e) {
      alert('Dosya seçme hatası: ' + (e?.message || 'Bilinmeyen hata'));
    }
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
    setShowCreateProductPanel(false);
    setProductForm({ name: '', category_id: selectedCategory?.id || '', price: '', image: '' });
  };

  const handleAddCategory = async () => {
    setCategoryError('');
    
    if (!newCategoryName || newCategoryName.trim() === '') {
      setCategoryError('Kategori adı boş olamaz');
      return;
    }

    // API kontrolü
    if (!window.electronAPI) {
      setCategoryError('Electron API yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
      console.error('window.electronAPI bulunamadı');
      return;
    }
    
    if (typeof window.electronAPI.createCategory !== 'function') {
      setCategoryError('Kategori ekleme özelliği yüklenemedi. Lütfen uygulamayı tamamen kapatıp yeniden başlatın.');
      console.error('window.electronAPI.createCategory fonksiyonu bulunamadı. Mevcut API fonksiyonları:', Object.keys(window.electronAPI || {}));
      return;
    }

    try {
      const result = await window.electronAPI.createCategory({ name: newCategoryName.trim() });
      
      if (result && result.success) {
        // Kategorileri yenile
        await loadCategories();
        // Yeni eklenen kategoriyi seç
        if (result.category) {
          setSelectedCategory(result.category);
          setProductForm(prev => ({ ...prev, category_id: result.category.id }));
        }
        // Modal'ı kapat ve formu temizle
        setShowAddCategoryModal(false);
        setNewCategoryName('');
        setCategoryError('');
        
        // Ana uygulamayı yenile
        if (onProductsUpdated) {
          onProductsUpdated();
        }
      } else {
        setCategoryError(result?.error || 'Kategori eklenemedi');
      }
    } catch (error) {
      console.error('Kategori ekleme hatası:', error);
      setCategoryError('Bir hata oluştu: ' + (error.message || 'Bilinmeyen hata'));
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setCategoryError('');
    setShowEditCategoryModal(true);
  };

  const handleUpdateCategory = async () => {
    setCategoryError('');
    
    if (!newCategoryName || newCategoryName.trim() === '') {
      setCategoryError('Kategori adı boş olamaz');
      return;
    }

    if (!editingCategory) {
      setCategoryError('Düzenlenecek kategori bulunamadı');
      return;
    }

    // API kontrolü
    if (!window.electronAPI) {
      setCategoryError('Electron API yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
      return;
    }
    
    if (typeof window.electronAPI.updateCategory !== 'function') {
      setCategoryError('Kategori güncelleme özelliği yüklenemedi. Lütfen uygulamayı tamamen kapatıp yeniden başlatın.');
      return;
    }

    try {
      const result = await window.electronAPI.updateCategory(editingCategory.id, { name: newCategoryName.trim() });
      
      if (result && result.success) {
        // Kategorileri yenile
        await loadCategories();
        // Güncellenen kategoriyi seç
        if (result.category) {
          setSelectedCategory(result.category);
          setProductForm(prev => ({ ...prev, category_id: result.category.id }));
        }
        // Modal'ı kapat ve formu temizle
        setShowEditCategoryModal(false);
        setEditingCategory(null);
        setNewCategoryName('');
        setCategoryError('');
        
        // Ana uygulamayı yenile
        if (onProductsUpdated) {
          onProductsUpdated();
        }
      } else {
        setCategoryError(result?.error || 'Kategori güncellenemedi');
      }
    } catch (error) {
      console.error('Kategori güncelleme hatası:', error);
      setCategoryError('Bir hata oluştu: ' + (error.message || 'Bilinmeyen hata'));
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryModal) return;
    
    try {
      const result = await window.electronAPI.deleteCategory(deleteCategoryModal.categoryId);
      
      if (result && result.success) {
        // Kategorileri yenile
        await loadCategories();
        
        // Eğer silinen kategori seçiliyse, seçimi temizle
        if (selectedCategory?.id === deleteCategoryModal.categoryId) {
          setSelectedCategory(null);
        }
        
        // Ana uygulamayı yenile
        if (onProductsUpdated) {
          onProductsUpdated();
        }
        
        setDeleteCategoryModal(null);
      } else {
        alert(result?.error || 'Kategori silinemedi');
        setDeleteCategoryModal(null);
      }
    } catch (error) {
      console.error('Kategori silme hatası:', error);
      alert('Kategori silinemedi: ' + error.message);
      setDeleteCategoryModal(null);
    }
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory.id)
    : products;

  /** Ürün sekmesi: kategori + arama (Lacromisa ve varsayılan ortak) */
  const productsForManagementList = useMemo(() => {
    if (!productSearchQuery.trim()) return filteredProducts;
    const q = productSearchQuery.toLowerCase();
    return filteredProducts.filter((p) =>
      String(p?.name || '').toLowerCase().includes(q)
    );
  }, [filteredProducts, productSearchQuery]);

  // Stock management functions
  const handleStockAdjustment = async () => {
    if (!stockFilterProduct) {
      alert('Lütfen bir ürün seçin');
      return;
    }
    
    const amount = parseInt(stockAdjustmentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Geçerli bir miktar girin');
      return;
    }
    
    try {
      // Gece Dönercisi: stok değişimi sadece Admin Dashboard'dan yapılır (salt-okunur)
      if (isGeceDonercisiMode) {
        alert('Bu ekranda stok değiştirilemez. Stok işlemleri sadece Admin Dashboard üzerinden yapılabilir.');
        return;
      }

      // Diğer tenant'lar: local/tenant stok sistemi (mevcut davranış)
      const result = await window.electronAPI.adjustProductStock(
        stockFilterProduct.id,
        stockAdjustmentType === 'add' ? amount : -amount
      );
      if (result && result.success) {
        alert(`Stok başarıyla ${stockAdjustmentType === 'add' ? 'artırıldı' : 'azaltıldı'}`);
        setStockAdjustmentAmount('');
        await loadAllProducts();
        const updatedProduct = result.product;
        setStockFilterProduct(updatedProduct);
        if (onProductsUpdated) {
          onProductsUpdated();
        }
      } else {
        alert(result?.error || 'Stok güncellenemedi');
      }
    } catch (error) {
      console.error('Stok güncelleme hatası:', error);
      alert('Stok güncellenemedi: ' + error.message);
    }
  };

  const handleToggleStockTracking = async (productId, currentTrackStock) => {
    if (isGeceDonercisiMode) {
      alert('Bu ekranda stok takibi aç/kapat yapılamaz. Bu işlem sadece Admin Dashboard üzerinden yapılabilir.');
      return;
    }
    try {
      const result = await window.electronAPI.toggleProductStockTracking(productId, !currentTrackStock);
      
      if (result && result.success) {
        // Ürünleri yenile
        await loadAllProducts();
        // Seçili ürünü güncelle
        if (stockFilterProduct && stockFilterProduct.id === productId) {
          setStockFilterProduct(result.product);
        }
        // Ana uygulamayı yenile
        if (onProductsUpdated) {
          onProductsUpdated();
        }
      } else {
        alert(result?.error || 'Stok takibi durumu değiştirilemedi');
      }
    } catch (error) {
      console.error('Stok takibi durumu değiştirme hatası:', error);
      alert('Stok takibi durumu değiştirilemedi: ' + error.message);
    }
  };

  const handleMoveCategory = async (categoryId, direction) => {
    if (!categories || categories.length === 0) return;

    const currentIndex = categories.findIndex(c => c.id === categoryId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) {
      return; // En üstte/en altta ise hareket etmesin
    }

    const newCategories = [...categories];
    const temp = newCategories[currentIndex];
    newCategories[currentIndex] = newCategories[targetIndex];
    newCategories[targetIndex] = temp;

    setCategories(newCategories);

    // Backend'e yeni sıralamayı gönder
    try {
      if (!window.electronAPI || typeof window.electronAPI.reorderCategories !== 'function') {
        alert('Kategori sıralama özelliği yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
        return;
      }

      const orderedIds = newCategories.map(c => c.id);
      const result = await window.electronAPI.reorderCategories(orderedIds);

      if (!result || !result.success) {
        console.error('Kategori sıralama hatası:', result);
        alert(result?.error || 'Kategori sıralaması kaydedilemedi');
        return;
      }

      // Backend’den dönen sıralamayı kaydet (güvenli olması için)
      if (Array.isArray(result.categories)) {
        setCategories(result.categories);
        // Seçili kategori referansını güncelle
        if (selectedCategory) {
          const updatedSelected = result.categories.find(c => c.id === selectedCategory.id);
          if (updatedSelected) {
            setSelectedCategory(updatedSelected);
          }
        }
      }

      // Ana uygulamadaki kategori/pano görünümünü yenile (masaüstü + mobil)
      if (onProductsUpdated) {
        onProductsUpdated();
      }
    } catch (error) {
      console.error('Kategori sıralama API hatası:', error);
      alert('Kategori sıralaması kaydedilemedi: ' + error.message);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center z-[999] animate-fade-in px-4">
      <div
        className={`bg-white rounded-2xl p-6 sm:p-8 w-full max-h-[92vh] shadow-2xl transform animate-scale-in relative overflow-hidden flex flex-col border border-slate-200/80 ${
          activeTab === 'products' || activeTab === 'stock' ? 'max-w-[min(96rem,96vw)]' : 'max-w-6xl'
        }`}
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 via-orange-400 to-blue-500"></div>
      
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all hover:rotate-90"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 via-orange-400 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold gradient-text mb-2">Ayarlar</h2>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('password')}
            className={`px-6 py-3 font-medium transition-all ${
              activeTab === 'password'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🔐 Parola Değiştirme
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-6 py-3 font-medium transition-all ${
              activeTab === 'products'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📦 Ürün Yönetimi
          </button>
          <button
            onClick={() => setActiveTab('printers')}
            className={`px-6 py-3 font-medium transition-all ${
              activeTab === 'printers'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🖨️ Adisyon Yönetimi
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-6 py-3 font-medium transition-all ${
              activeTab === 'stock'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📊 Stok Takibi
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-custom">
          {activeTab === 'password' && (
            <div className="max-w-md mx-auto">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mevcut Parola
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={currentPassword}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setCurrentPassword(val);
                      setPasswordError('');
                    }}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none transition-all"
                    placeholder="4 haneli parola"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Yeni Parola
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={newPassword}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setNewPassword(val);
                      setPasswordError('');
                    }}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none transition-all"
                    placeholder="4 haneli yeni parola"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Yeni Parola (Tekrar)
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={confirmPassword}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setConfirmPassword(val);
                      setPasswordError('');
                    }}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none transition-all"
                    placeholder="Yeni parolayı tekrar girin"
                  />
                </div>

                {passwordError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-600 text-sm">
                    ✅ Parola başarıyla değiştirildi!
                  </div>
                )}

                <button
                  onClick={handlePasswordChange}
                  className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:scale-105 transition-all"
                >
                  Parolayı Değiştir
                </button>
              </div>
            </div>
          )}

          {activeTab === 'products' && (
            <div className="space-y-6">
              {/* Yaka's Grill için Platform Fiyat Yönetimi Butonları */}
              {isYakasGrillMode && (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border-2 border-purple-200 mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Platform Fiyat Yönetimi</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => {
                        setPlatformPriceType('yemeksepeti');
                        setShowPlatformPriceModal(true);
                      }}
                      className="px-6 py-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-red-500 via-red-600 to-red-500 hover:from-red-600 hover:to-red-700 text-white shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                    >
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
                      <span>Yemeksepeti Fiyat Yönetimi</span>
                    </button>
                    <button
                      onClick={() => {
                        setPlatformPriceType('trendyolgo');
                        setShowPlatformPriceModal(true);
                      }}
                      className="px-6 py-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-yellow-400 via-orange-500 to-yellow-500 hover:from-yellow-500 hover:to-orange-600 text-white shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                    >
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
                      <span>TrendyolGO Fiyat Yönetimi</span>
                    </button>
                  </div>
                </div>
              )}
              
              {isLacromisaMode ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                  {/* Compact header */}
                  <div className="p-4 border-b border-slate-200">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[240px] relative">
                        <input
                          type="text"
                          value={productSearchQuery}
                          onChange={(e) => setProductSearchQuery(e.target.value)}
                          placeholder="Ürün ara…"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-500 focus:outline-none bg-white text-slate-900"
                        />
                        <svg className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>

                      <select
                        value={selectedCategory?.id || ''}
                        onChange={(e) => {
                          const id = e.target.value ? parseInt(e.target.value, 10) : null;
                          const cat = id ? categories.find((c) => c.id === id) : null;
                          setSelectedCategory(cat || null);
                        }}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-500 focus:outline-none bg-white text-slate-900"
                      >
                        <option value="">Tüm Kategoriler</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => setShowAddCategoryModal(true)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-900 font-semibold transition-all"
                      >
                        Kategori Ekle
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateProductPanel((v) => !v);
                          setEditingProduct(null);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all"
                      >
                        {showCreateProductPanel ? 'Yeni Ürün (Kapat)' : 'Yeni Ürün'}
                      </button>

                      <div className="text-xs font-semibold tabular-nums text-slate-500">
                        {productsForManagementList.length} kayıt
                      </div>
                    </div>

                    {showCreateProductPanel && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Yeni ürün</div>
                        <form onSubmit={handleProductSubmit} className="grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-12 md:col-span-5">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Ürün adı</label>
                            <input
                              type="text"
                              value={productForm.name}
                              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900/20 focus:outline-none bg-white text-sm"
                              placeholder="Ürün adı"
                              required
                            />
                          </div>
                          <div className="col-span-12 md:col-span-4">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Kategori</label>
                            <select
                              value={productForm.category_id || ''}
                              onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-slate-900 focus:outline-none bg-white text-sm"
                              required
                            >
                              <option value="" disabled>Kategori seç</option>
                              {categories.map((c) => (
                                <option key={c.id} value={String(c.id)}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-12 md:col-span-3">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Fiyat (₺)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={productForm.price}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^\d.,]/g, '');
                                const normalized = val.replace(',', '.');
                                const parts = normalized.split('.');
                                const finalValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : normalized;
                                setProductForm({ ...productForm, price: finalValue });
                              }}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-slate-900 focus:outline-none bg-white text-sm text-right font-semibold"
                              placeholder="0.00"
                              required
                            />
                          </div>
                          <div className="col-span-12 flex justify-end">
                            <button
                              type="submit"
                              className="px-6 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
                            >
                              Ürünü ekle
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>

                  <div className="max-h-[min(68vh,720px)] overflow-auto">
                    <div className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur border-b border-slate-200">
                      <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <div className="col-span-1">#</div>
                        <div className="col-span-4">Ürün</div>
                        <div className="col-span-3">Kategori</div>
                        <div className="col-span-2 text-right">Fiyat</div>
                        <div className="col-span-2 text-right">İşlem</div>
                      </div>
                    </div>

                    {productsForManagementList.map((product) => {
                        const isInline = inlineEditingProductId === product.id;
                        const draft = isInline ? inlineDraft : null;
                        const catName = categories.find((c) => c.id === product.category_id)?.name || '—';

                        return (
                          <div key={product.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                            <div className="grid grid-cols-12 gap-2 px-4 py-2 items-center">
                              <div className="col-span-1 text-[11px] font-mono text-slate-400 tabular-nums">{product.id}</div>
                              <div className="col-span-4 min-w-0">
                                {isInline ? (
                                  <input
                                    type="text"
                                    value={draft?.name || ''}
                                    onChange={(e) => setInlineDraft((prev) => ({ ...(prev || {}), name: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-slate-900 focus:outline-none bg-white text-sm font-semibold text-slate-900"
                                  />
                                ) : (
                                  <div className="text-sm font-semibold text-slate-900 truncate" title={product.name}>
                                    {product.name}
                                  </div>
                                )}
                              </div>

                              <div className="col-span-3 min-w-0">
                                {isInline ? (
                                  <select
                                    value={draft?.category_id || ''}
                                    onChange={(e) => setInlineDraft((prev) => ({ ...(prev || {}), category_id: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-500 focus:outline-none bg-white text-slate-900 text-sm"
                                  >
                                    <option value="" disabled>Kategori</option>
                                    {categories.map((c) => (
                                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="text-sm font-semibold text-slate-700 truncate">{catName}</div>
                                )}
                              </div>

                              <div className="col-span-2 text-right">
                                {isInline ? (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={draft?.price || ''}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/[^\d.,]/g, '');
                                      setInlineDraft((prev) => ({ ...(prev || {}), price: val }));
                                    }}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-500 focus:outline-none bg-white text-slate-900 text-sm font-extrabold text-right"
                                    placeholder="0.00"
                                  />
                                ) : (
                                  <div className="text-sm font-extrabold text-slate-900">{Number(product.price || 0).toFixed(2)} ₺</div>
                                )}
                              </div>

                              <div className="col-span-2 flex justify-end gap-2">
                                {isInline ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => saveInlineEdit(product.id)}
                                      disabled={inlineSaving}
                                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm disabled:opacity-60"
                                      title="Kaydet"
                                    >
                                      {inlineSaving ? '…' : 'Kaydet'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelInlineEdit}
                                      disabled={inlineSaving}
                                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 font-extrabold text-sm disabled:opacity-60"
                                      title="İptal"
                                    >
                                      İptal
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => beginInlineEdit(product)}
                                      className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm"
                                      title="Düzenle"
                                    >
                                      Düzenle
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProduct(product.id)}
                                      className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-sm"
                                      title="Sil"
                                    >
                                      Sil
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                    {productsForManagementList.length === 0 && (
                      <div className="py-16 text-center text-sm font-medium text-slate-500">
                        Bu filtrelere uygun ürün yok
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-[min(70vh,640px)] max-h-[min(78vh,720px)]">
                  <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-3 py-3 sm:px-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[160px] max-w-md">
                        <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={productSearchQuery}
                          onChange={(e) => setProductSearchQuery(e.target.value)}
                          placeholder="Ürün ara…"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900/15"
                        />
                      </div>
                      <select
                        value={selectedCategory?.id || ''}
                        onChange={(e) => {
                          const id = e.target.value ? parseInt(e.target.value, 10) : null;
                          setSelectedCategory(id ? categories.find((c) => c.id === id) || null : null);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
                      >
                        <option value="">Tüm kategoriler</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowAddCategoryModal(true)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        + Kategori
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editingProduct || showCreateProductPanel) {
                            handleCancelEdit();
                          } else {
                            setEditingProduct(null);
                            setShowCreateProductPanel(true);
                            setProductForm({
                              name: '',
                              category_id: selectedCategory?.id ? String(selectedCategory.id) : '',
                              price: '',
                              image: '',
                            });
                          }
                        }}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        {editingProduct || showCreateProductPanel ? 'Formu kapat' : 'Yeni ürün'}
                      </button>
                      {window.electronAPI && typeof window.electronAPI.optimizeAllProductImages === 'function' && (
                        <button
                          type="button"
                          onClick={handleOptimizeAllImages}
                          className="rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 hover:bg-white"
                        >
                          Görsel optimizasyon
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCreateImageRecordsForAllProducts}
                        disabled={isCreatingImageRecords}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {isCreatingImageRecords ? 'Kayıtlar…' : 'Firebase image kayıtları'}
                      </button>
                      <span className="ml-auto text-xs font-semibold tabular-nums text-slate-500">
                        {productsForManagementList.length} kayıt
                      </span>
                    </div>
                    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(null)}
                        className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${
                          !selectedCategory ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Tümü
                      </button>
                      {categories.map((cat) => (
                        <div key={cat.id} className="group relative flex shrink-0 items-stretch">
                          <button
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`rounded-l-md px-2.5 py-1 text-xs font-semibold ${
                              selectedCategory?.id === cat.id
                                ? 'bg-slate-900 text-white'
                                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {cat.name}
                          </button>
                          <div className="flex rounded-r-md ring-1 ring-slate-200 bg-slate-50 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              title="Yukarı"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveCategory(cat.id, 'up');
                              }}
                              className="px-1 text-slate-500 hover:bg-slate-200"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              title="Aşağı"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveCategory(cat.id, 'down');
                              }}
                              className="px-1 text-slate-500 hover:bg-slate-200"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              title="Düzenle"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCategory(cat);
                              }}
                              className="px-1 text-slate-500 hover:bg-slate-200"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              title="Sil"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteCategoryModal({ categoryId: cat.id, categoryName: cat.name });
                              }}
                              className="px-1 text-red-600 hover:bg-red-50"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {(editingProduct || showCreateProductPanel) && (
                    <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3 sm:px-4">
                      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        {editingProduct ? 'Ürün düzenle' : 'Yeni ürün'}
                      </div>
                      <form onSubmit={handleProductSubmit} className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="min-w-[140px] flex-1">
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Ürün adı</label>
                            <input
                              type="text"
                              value={productForm.name}
                              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                              placeholder="Ad"
                              required
                            />
                          </div>
                          <div className="min-w-[140px] flex-1">
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Kategori</label>
                            <select
                              value={productForm.category_id || ''}
                              onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                              required
                            >
                              <option value="" disabled>Seçin</option>
                              {categories.map((c) => (
                                <option key={c.id} value={String(c.id)}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-28">
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Fiyat ₺</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={productForm.price}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^\d.,]/g, '');
                                const normalized = val.replace(',', '.');
                                const parts = normalized.split('.');
                                const finalValue =
                                  parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : normalized;
                                setProductForm({ ...productForm, price: finalValue });
                              }}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-semibold focus:border-slate-900 focus:outline-none"
                              placeholder="0.00"
                              required
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                            >
                              {editingProduct ? 'Kaydet' : 'Ekle'}
                            </button>
                            {(editingProduct || showCreateProductPanel) && (
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                İptal
                              </button>
                            )}
                          </div>
                        </div>
                        <details className="text-xs text-slate-500">
                          <summary className="cursor-pointer font-semibold text-slate-600">Görsel (isteğe bağlı)</summary>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={productForm.image}
                              onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                              className="min-w-[200px] flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm"
                              placeholder="URL"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.electronAPI || typeof window.electronAPI.selectImageFile !== 'function') {
                                  alert('Dosya seçimi yüklenemedi.');
                                  return;
                                }
                                try {
                                  const productId = editingProduct ? editingProduct.id : null;
                                  const result = await window.electronAPI.selectImageFile(productId);
                                  if (result.success && result.path) {
                                    setProductForm({ ...productForm, image: result.path });
                                  } else if (!result.canceled) {
                                    alert('Dosya seçilemedi: ' + (result.error || 'Bilinmeyen'));
                                  }
                                } catch (error) {
                                  alert('Dosya: ' + error.message);
                                }
                              }}
                              className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold"
                            >
                              Dosya
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setIsLoadingFirebaseImages(true);
                                setShowFirebaseImageModal(true);
                                try {
                                  const result = await window.electronAPI.getFirebaseImages();
                                  if (result.success) setFirebaseImages(result.images || []);
                                  else alert('Firebase: ' + (result.error || 'Hata'));
                                } catch (error) {
                                  alert(error.message);
                                } finally {
                                  setIsLoadingFirebaseImages(false);
                                }
                              }}
                              className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold"
                            >
                              Firebase
                            </button>
                          </div>
                        </details>
                      </form>
                    </div>
                  )}

                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full min-w-[520px] border-collapse text-sm">
                      <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-100">
                        <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          <th className="whitespace-nowrap px-2 py-2.5 sm:px-3 w-12">#</th>
                          <th className="whitespace-nowrap px-2 py-2.5 sm:px-3">Ürün</th>
                          <th className="hidden md:table-cell whitespace-nowrap px-3 py-2.5">Kategori</th>
                          <th className="whitespace-nowrap px-2 py-2.5 text-right sm:px-3 w-24">Fiyat</th>
                          <th className="whitespace-nowrap px-2 py-2.5 text-center sm:px-3 w-20">Stok</th>
                          <th className="whitespace-nowrap px-2 py-2.5 text-right sm:px-3 w-32">İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productsForManagementList.map((product) => {
                          const category = categories.find((c) => c.id === product.category_id);
                          const track = product.trackStock === true;
                          const st = product.stock !== undefined ? product.stock : null;
                          return (
                            <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50/90">
                              <td className="px-2 py-2 font-mono text-xs text-slate-400 sm:px-3">{product.id}</td>
                              <td className="px-2 py-2 font-medium text-slate-900 sm:px-3">
                                <div className="max-w-[220px] truncate sm:max-w-none" title={product.name}>{product.name}</div>
                                <div className="text-[11px] text-slate-500 md:hidden">{category?.name || '—'}</div>
                              </td>
                              <td className="hidden px-3 py-2 text-slate-600 md:table-cell">{category?.name || '—'}</td>
                              <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-900 sm:px-3">
                                {Number(product.price || 0).toFixed(2)} ₺
                              </td>
                              <td className="px-2 py-2 text-center sm:px-3">
                                {track && st !== null ? (
                                  <span
                                    className={`inline-block min-w-[2rem] rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                                      st === 0
                                        ? 'bg-red-100 text-red-700'
                                        : st < 10
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-emerald-50 text-emerald-800'
                                    }`}
                                  >
                                    {st}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right sm:px-3">
                                <button
                                  type="button"
                                  onClick={() => handleEditProduct(product)}
                                  className="mr-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Düzenle
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(product.id)}
                                  className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                >
                                  Sil
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {productsForManagementList.length === 0 && (
                      <div className="py-14 text-center text-sm font-medium text-slate-500">Kayıt bulunamadı</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'stock' && isGeceDonercisiMode && stockGeceSessionBranch === null && (
            <div className="relative flex min-h-[min(52vh,480px)] flex-col items-center justify-center gap-6 rounded-xl border border-slate-200 bg-white px-4 py-10 shadow-sm">
              <div className="max-w-md">
                <p className="text-center text-xs font-bold uppercase tracking-wide text-slate-500">Stok takibi</p>
                <h3 className="mt-2 text-center text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                  Hangi şubenin stoğunu yöneteceksiniz?
                </h3>
                <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
                  Şube seçtikten sonra stok ekranı tam ekran açılır. Her stok sekmesine girişinizde şube seçmeniz gerekir.
                </p>
              </div>
              <div className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:justify-center">
                {GECE_BRANCHES.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => setStockGeceSessionBranch(b.value)}
                    className="flex-1 rounded-2xl border-2 border-slate-200 bg-gradient-to-b from-white to-slate-50 py-5 text-base font-extrabold text-slate-900 shadow-sm transition-all hover:border-slate-900 hover:shadow-md active:scale-[0.99] sm:py-6 sm:text-lg"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              {isLoadingGeceBranchStocks && (
                <p className="text-xs font-semibold text-slate-500">Şube stokları yükleniyor…</p>
              )}
            </div>
          )}

          {activeTab === 'printers' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Yazıcı Yönetimi</h3>
              
              {/* Sub Tabs */}
              <div className="flex space-x-3 mb-6">
                <button
                  onClick={() => setPrinterSubTab('usb')}
                  className={`px-6 py-3 rounded-xl font-medium transition-all ${
                    printerSubTab === 'usb'
                      ? 'bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white shadow-lg'
                      : 'bg-white text-gray-700 hover:bg-orange-50 border-2 border-gray-200'
                  }`}
                >
                  🔌 USB ile Bağlı Yazıcılar
                </button>
                <button
                  onClick={() => setPrinterSubTab('network')}
                  className={`px-6 py-3 rounded-xl font-medium transition-all ${
                    printerSubTab === 'network'
                      ? 'bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white shadow-lg'
                      : 'bg-white text-gray-700 hover:bg-orange-50 border-2 border-gray-200'
                  }`}
                >
                  🌐 Ethernet Yazıcılar
                </button>
              </div>

              {/* Printer List */}
              <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-custom">
                {(printerSubTab === 'usb' ? printers.usb : printers.network).map((printer) => {
                  // Bir yazıcı birden fazla kategoriye atanabilir
                  const assignments = printerAssignments.filter(
                    a => a.printerName === printer.name && a.printerType === printerSubTab
                  );
                  // Tip uyumluluğu için number'a çevir
                  const assignedCategories = assignments
                    .map(a => {
                      const categoryIdNum = Number(a.category_id);
                      return categories.find(c => Number(c.id) === categoryIdNum);
                    })
                    .filter(c => c !== undefined);
                  
                  const isCashierPrinter = cashierPrinter && 
                    cashierPrinter.printerName === printer.name && 
                    cashierPrinter.printerType === printerSubTab;

                  return (
                    <div
                      key={printer.name}
                      className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-4 flex-1">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            isCashierPrinter 
                              ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
                              : 'bg-gradient-to-br from-blue-200 to-orange-200'
                          }`}>
                            <svg className={`w-6 h-6 ${isCashierPrinter ? 'text-white' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-gray-800">{printer.displayName || printer.name}</h4>
                              {isCashierPrinter && (
                                <span className="inline-flex items-center px-2 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-bold">
                                  💰 KASA YAZICISI
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{printer.description || 'Açıklama yok'}</p>
                            {assignedCategories.length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {assignedCategories.map(category => (
                                  <span key={category.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-100 text-orange-700 text-xs font-medium">
                                    📋 {category.name}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveCategoryAssignment(category.id);
                                      }}
                                      className="hover:bg-orange-200 rounded px-1 transition-colors"
                                      title="Kategori atamasını kaldır"
                                    >
                                      ✕
                                    </button>
                                </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 mt-1">Kategori atanmamış</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSetCashierPrinter(printer.name, printerSubTab)}
                          className={`flex-1 px-4 py-2 rounded-lg hover:shadow-lg transition-all font-medium ${
                            isCashierPrinter
                              ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white'
                              : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                          }`}
                        >
                          {isCashierPrinter ? '💰 Kasa Yazıcısını Kaldır' : '💰 Kasa Yazıcısı Seç'}
                        </button>
                        <button
                          onClick={() => handleAssignCategory(printer.name, printerSubTab)}
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white rounded-lg hover:shadow-lg transition-all font-medium"
                        >
                          Kategori Ata
                        </button>
                      </div>
                    </div>
                  );
                })}
                
                {(printerSubTab === 'usb' ? printers.usb : printers.network).length === 0 && (
                  <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                    <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    <p className="text-gray-500 font-medium">
                      {printerSubTab === 'usb' ? 'USB' : 'Ethernet'} yazıcı bulunamadı
                    </p>
                    <p className="text-sm text-gray-400 mt-2">Yazıcılarınızı kontrol edin</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {stockFullscreenOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100 text-slate-900">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900 sm:text-lg">Stok takibi</h1>
              <p className="text-[11px] font-medium text-slate-500">İçecekler ve yan ürünler</p>
            </div>
            <button
              type="button"
              onClick={exitStockFullscreen}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              aria-label="Kapat"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          {isGeceDonercisiMode && stockGeceSessionBranch && (
            <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Düzenlenen şube</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {GECE_BRANCHES.find((x) => x.value === stockGeceSessionBranch)?.label || stockGeceSessionBranch}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Satış şubesi:{' '}
                    <span className="font-semibold text-slate-700">
                      {geceBranch ? GECE_BRANCHES.find((x) => x.value === geceBranch)?.label || geceBranch : '—'}
                    </span>
                    {isLoadingGeceBranchStocks ? ' · Stoklar yükleniyor…' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStockGeceSessionBranch(null);
                    setStockFilterProduct(null);
                  }}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100"
                >
                  Şube değiştir
                </button>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="flex min-h-[200px] max-h-[42vh] shrink-0 flex-col border-b border-slate-200 bg-white lg:max-h-none lg:w-[min(100%,420px)] lg:border-b-0 lg:border-r lg:border-slate-200 xl:w-[min(100%,480px)]">
              <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-2">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Ürünler</p>
                <p className="text-[11px] text-slate-500">{stockSidebarProductList.length} kayıt · içecekler ve yan ürünler</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-custom">
                {stockSidebarCategories.length === 0 ? (
                  <div className="py-16 text-center text-sm text-slate-500">
                    &quot;İçecekler&quot; veya &quot;Yan Ürünler&quot; adlı kategorilerden en az biri tanımlı olmalı.
                  </div>
                ) : stockSidebarProductList.length === 0 ? (
                  <div className="py-16 text-center text-sm text-slate-500">Bu kategorilerde ürün yok</div>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {stockSidebarProductList.map((product) => {
                      const category = categories.find((c) => c.id === product.category_id);
                      const trackStock = product.trackStock === true;
                      const sessionBr = stockGeceSessionBranch;
                      const geceOneStock =
                        isGeceDonercisiMode && sessionBr ? getGeceStockForBranch(product.id, sessionBr) : null;
                      const stock =
                        isGeceDonercisiMode && sessionBr
                          ? geceOneStock
                          : trackStock && product.stock !== undefined
                            ? product.stock || 0
                            : null;
                      const selected = stockFilterProduct?.id === product.id;
                      const selectRow = () => {
                        setStockFilterProduct(product);
                        setStockAdjustmentAmount('');
                        setStockAdjustmentType('add');
                      };
                      return (
                        <li key={product.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={selectRow}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                selectRow();
                              }
                            }}
                            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2 py-2 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                              selected
                                ? 'border-slate-900 bg-slate-50 shadow-md ring-1 ring-slate-900/10'
                                : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 to-slate-200">
                              {product.image ? (
                                <img
                                  src={product.image}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-lg font-black text-slate-400">
                                  {(product.name || '?').charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-xs font-bold leading-snug text-slate-900">{product.name}</p>
                              <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">{category?.name || '—'}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-extrabold tabular-nums text-slate-700">
                                  {Number(product.price || 0).toFixed(2)} ₺
                                </span>
                                {isGeceDonercisiMode && sessionBr ? (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                                      geceOneStock === 0
                                        ? 'bg-red-100 text-red-700'
                                        : geceOneStock < 10
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {geceOneStock}
                                  </span>
                                ) : (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                                      !trackStock
                                        ? 'bg-slate-100 text-slate-600'
                                        : stock === 0
                                          ? 'bg-red-100 text-red-700'
                                          : stock < 10
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {trackStock ? (stock === null ? '—' : stock) : 'Kapalı'}
                                  </span>
                                )}
                              </div>
                            </div>
                            {!isGeceDonercisiMode && (
                              <div className="flex shrink-0 flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleStockTracking(product.id, trackStock);
                                  }}
                                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                    trackStock
                                      ? 'border border-amber-200 bg-amber-50 text-amber-900'
                                      : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                                  }`}
                                >
                                  {trackStock ? 'Kapat' : 'Aç'}
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>

            <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
              {!stockFilterProduct ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 shadow-sm">
                    <p className="text-base font-bold text-slate-800">Stok yönetimi</p>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                      Soldan bir içecek seçin; görsel ve stok işlemleri burada görünür.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-xl">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                    <div className="relative mx-auto aspect-square w-full max-w-[240px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 shadow-inner sm:mx-0">
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                        <span className="text-5xl font-black text-slate-300">
                          {(stockFilterProduct.name || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      {stockFilterProduct.image ? (
                        <img
                          src={stockFilterProduct.image}
                          alt=""
                          className="relative z-10 h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.classList.add('opacity-0', 'pointer-events-none');
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">{stockFilterProduct.name}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {categories.find((c) => c.id === stockFilterProduct.category_id)?.name || '—'} ·{' '}
                        <span className="tabular-nums text-slate-800">{Number(stockFilterProduct.price || 0).toFixed(2)} ₺</span>
                      </p>
                      {!isGeceDonercisiMode && (
                        <button
                          type="button"
                          onClick={() => handleToggleStockTracking(stockFilterProduct.id, stockFilterProduct.trackStock)}
                          className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                            stockFilterProduct.trackStock
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                          }`}
                        >
                          {stockFilterProduct.trackStock ? 'Stok takibi açık' : 'Stok takibini aç'}
                        </button>
                      )}
                    </div>
                  </div>

                  {isGeceDonercisiMode ? (
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs leading-relaxed text-slate-600">
                        Aşağıdaki alan yalnızca{' '}
                        <span className="font-bold text-slate-900">
                          {GECE_BRANCHES.find((x) => x.value === stockGeceSessionBranch)?.label || stockGeceSessionBranch}
                        </span>{' '}
                        şubesi içindir.
                      </p>
                      <div className="grid gap-4">
                        {stockGeceSessionBranch &&
                          GECE_BRANCHES.filter((x) => x.value === stockGeceSessionBranch).map(({ value: br, label }) => {
                            const cur = getGeceStockForBranch(stockFilterProduct.id, br);
                            const busy = geceStockSavingBranch === br;
                            return (
                              <div key={br} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-extrabold text-slate-900">{label}</span>
                                  <span
                                    className={`rounded-lg px-2 py-1 text-sm font-bold ${
                                      cur <= 0 ? 'bg-red-100 text-red-700' : cur < 10 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    Stok: {cur}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-end gap-2">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    disabled={busy}
                                    value={geceStockQtyInput[br]}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/\D/g, '');
                                      setGeceStockQtyInput((prev) => ({ ...prev, [br]: v }));
                                    }}
                                    className="min-w-[100px] flex-1 rounded-lg border-2 border-slate-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
                                    placeholder="Miktar"
                                  />
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleGeceBranchStockDelta(br, stockFilterProduct.id, 'add')}
                                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    + Ekle
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleGeceBranchStockDelta(br, stockFilterProduct.id, 'sub')}
                                    className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                                  >
                                    − Çıkar
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
                                  <label className="w-full text-xs font-semibold text-slate-600">Doğrudan sayıya ayarla</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    disabled={busy}
                                    value={geceStockSetInput[br]}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/\D/g, '');
                                      setGeceStockSetInput((prev) => ({ ...prev, [br]: v }));
                                    }}
                                    className="min-w-[100px] flex-1 rounded-lg border-2 border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                                    placeholder="Yeni stok"
                                  />
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleGeceBranchStockSetAbsolute(br, stockFilterProduct.id)}
                                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    Kaydet
                                  </button>
                                </div>
                                {busy && <p className="text-xs text-slate-500">Kaydediliyor…</p>}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ) : stockFilterProduct.trackStock ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="mb-4 text-sm text-slate-600">
                        Mevcut stok:{' '}
                        <span className="font-bold text-blue-600">
                          {stockFilterProduct.stock !== undefined ? stockFilterProduct.stock || 0 : 0}
                        </span>
                      </p>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">İşlem tipi</label>
                          <select
                            value={stockAdjustmentType}
                            onChange={(e) => setStockAdjustmentType(e.target.value)}
                            className="w-full rounded-xl border-2 border-slate-200 px-4 py-2 focus:border-blue-500 focus:outline-none"
                          >
                            <option value="add">Stok ekle</option>
                            <option value="subtract">Stok çıkar</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Miktar</label>
                          <input
                            type="number"
                            min="1"
                            value={stockAdjustmentAmount}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              setStockAdjustmentAmount(val);
                            }}
                            className="w-full rounded-xl border-2 border-slate-200 px-4 py-2 focus:border-blue-500 focus:outline-none"
                            placeholder="Miktar"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={handleStockAdjustment}
                            className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-2.5 font-semibold text-white shadow-sm transition-all hover:shadow-md"
                          >
                            {stockAdjustmentType === 'add' ? 'Ekle' : 'Çıkar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-900">
                      Bu ürün için stok takibi kapalı. Yukarıdaki <span className="font-bold">Stok takibini aç</span> ile açabilirsiniz.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Category Assignment Modal */}
      {showCategoryAssignModal && selectedPrinter && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-[1000] animate-fade-in px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl transform animate-scale-in relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 via-orange-400 to-blue-500"></div>
            
            <button
              onClick={() => {
                setShowCategoryAssignModal(false);
                setSelectedPrinter(null);
                setAssigningCategory(null);
                setSelectedCategories([]);
              }}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-500 via-orange-400 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Kategori Ata</h3>
              <p className="text-gray-600 mb-2">
                <span className="font-semibold text-orange-600">{selectedPrinter.name}</span>
              </p>
              <p className="text-sm text-gray-500">Bu yazıcıya birden fazla kategori seçebilirsiniz</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kategorileri Seçin (Çoklu Seçim)
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-custom">
                  {categories.map(category => {
                    // Tip uyumluluğu için number'a çevir
                    const categoryIdNum = Number(category.id);
                    
                    // Bu kategoriye zaten bir yazıcı atanmış mı kontrol et
                    const existingAssignment = printerAssignments.find(a => {
                      const assignmentCategoryId = Number(a.category_id);
                      return assignmentCategoryId === categoryIdNum;
                    });
                    
                    const isAssignedToThisPrinter = existingAssignment && 
                      existingAssignment.printerName === selectedPrinter.name && 
                      existingAssignment.printerType === selectedPrinter.type;
                    const isAssignedToOtherPrinter = existingAssignment && !isAssignedToThisPrinter;
                    const isSelected = selectedCategories.includes(categoryIdNum);
                    
                    return (
                      <div
                        key={category.id}
                        onClick={() => {
                          if (!isAssignedToOtherPrinter) {
                            toggleCategorySelection(categoryIdNum);
                          }
                        }}
                        className={`w-full px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${
                          isSelected
                        ? 'bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white'
                            : isAssignedToThisPrinter
                            ? 'bg-orange-200 text-orange-800 border-2 border-orange-400'
                            : isAssignedToOtherPrinter
                            ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-400 cursor-not-allowed opacity-60'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (!isAssignedToOtherPrinter) {
                                  toggleCategorySelection(categoryIdNum);
                                }
                              }}
                              disabled={isAssignedToOtherPrinter}
                              className="w-5 h-5 rounded border-2 border-gray-300 text-orange-600 focus:ring-orange-500 focus:ring-2 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="font-medium">{category.name}</span>
                    </div>
                          {isAssignedToThisPrinter && !isSelected && (
                            <span className="text-xs bg-orange-600 text-white px-2 py-1 rounded">
                              Bu yazıcıya atanmış
                            </span>
                          )}
                          {isAssignedToOtherPrinter && (
                            <span className="text-xs bg-yellow-600 text-white px-2 py-1 rounded">
                              {existingAssignment.printerName} yazıcısına atanmış
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  💡 Bir kategoriye sadece bir yazıcı atanabilir. Başka yazıcıya atanmış kategoriler seçilemez.
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowCategoryAssignModal(false);
                    setSelectedPrinter(null);
                    setAssigningCategory(null);
                    setSelectedCategories([]);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-medium"
                >
                  İptal
                  </button>
                    <button
                  onClick={confirmCategoryAssignment}
                  disabled={assigningCategory}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white rounded-xl hover:shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assigningCategory ? 'Atanıyor...' : 'Kategorileri Ata'}
                    </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-[1000] animate-fade-in px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl transform animate-scale-in relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-500 via-emerald-500 to-green-500"></div>
            
            <button
              onClick={() => {
                setShowAddCategoryModal(false);
                setNewCategoryName('');
                setCategoryError('');
              }}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Yeni Kategori Ekle</h3>
              <p className="text-gray-600">Yeni bir ürün kategorisi oluşturun</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kategori Adı
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    setCategoryError('');
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCategory();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-green-500 focus:outline-none transition-all"
                  placeholder="Kategori adını girin"
                  autoFocus
                />
              </div>

              {categoryError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  {categoryError}
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowAddCategoryModal(false);
                    setNewCategoryName('');
                    setCategoryError('');
                  }}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all transform hover:scale-105"
                >
                  İptal
                </button>
                <button
                  onClick={handleAddCategory}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all transform hover:scale-105"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Ekle</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {showEditCategoryModal && editingCategory && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-[1000] animate-fade-in px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl transform animate-scale-in relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500"></div>
            
            <button
              onClick={() => {
                setShowEditCategoryModal(false);
                setEditingCategory(null);
                setNewCategoryName('');
                setCategoryError('');
              }}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Kategori Düzenle</h3>
              <p className="text-gray-600 text-sm">
                <span className="font-semibold text-blue-600">{editingCategory.name}</span> kategorisinin adını değiştirin
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kategori Adı
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    setCategoryError('');
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleUpdateCategory();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-all"
                  placeholder="Kategori adını girin"
                  autoFocus
                />
              </div>

              {categoryError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  {categoryError}
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowEditCategoryModal(false);
                    setEditingCategory(null);
                    setNewCategoryName('');
                    setCategoryError('');
                  }}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all transform hover:scale-105"
                >
                  İptal
                </button>
                <button
                  onClick={handleUpdateCategory}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all transform hover:scale-105"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Güncelle</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-[1000] animate-fade-in px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl transform animate-scale-in relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
            
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Ürünü Sil</h3>
              <p className="text-gray-600 mb-4">
                <span className="font-semibold text-orange-600">{deleteConfirmModal.productName}</span> adlı ürünü silmek istediğinize emin misiniz?
              </p>
              <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-200">
                ⚠️ Bu işlem geri alınamaz!
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all transform hover:scale-105"
              >
                İptal
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all transform hover:scale-105"
              >
                <div className="flex items-center justify-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Sil</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Firebase Image Selection Modal */}
      {showFirebaseImageModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-[1000] animate-fade-in px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-4xl shadow-2xl transform animate-scale-in relative overflow-hidden flex flex-col max-h-[90vh]">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500"></div>
            
            <button
              onClick={() => {
                setShowFirebaseImageModal(false);
                setFirebaseImages([]);
              }}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Firebase'den Görsel Seç</h3>
              <p className="text-gray-600">Firebase'de kayıtlı görsellerden birini seçin</p>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-custom mb-6">
              {isLoadingFirebaseImages ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                  <p className="mt-4 text-gray-600">Görseller yükleniyor...</p>
                </div>
              ) : firebaseImages.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                  <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-500 font-medium">Firebase'de görsel bulunamadı</p>
                  <p className="text-sm text-gray-400 mt-2">Firebase'de görsel eklemek için URL girebilirsiniz</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {firebaseImages.map((image) => (
                    <div
                      key={image.id}
                      onClick={() => {
                        setProductForm({ ...productForm, image: image.url });
                        setShowFirebaseImageModal(false);
                        setFirebaseImages([]);
                      }}
                      className="bg-white rounded-xl border-2 border-gray-200 hover:border-blue-500 cursor-pointer transition-all hover:shadow-lg overflow-hidden group"
                    >
                      <div className="aspect-square bg-gray-100 relative overflow-hidden">
                        <img
                          src={image.url}
                          alt={image.product_name || 'Görsel'}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-400">Görsel yüklenemedi</div>';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all"></div>
                      </div>
                      <div className="p-3">
                        {image.product_name && (
                          <p className="text-sm font-semibold text-gray-800 truncate">{image.product_name}</p>
                        )}
                        <p className="text-xs text-gray-500 truncate mt-1">{image.url}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowFirebaseImageModal(false);
                  setFirebaseImages([]);
                }}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-medium"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Platform Fiyat Yönetimi Modal */}
      {showPlatformPriceModal && platformPriceType && (
        <PlatformPriceModal
          platformType={platformPriceType}
          products={products}
          categories={categories}
          onClose={() => {
            setShowPlatformPriceModal(false);
            setPlatformPriceType(null);
            loadAllProducts(); // Ürünleri yenile
          }}
          themeColor={themeColor}
        />
      )}

      {/* Delete Category Confirmation Modal */}
      {deleteCategoryModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-[1000] animate-fade-in px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl transform animate-scale-in relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
            
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Kategoriyi Sil</h3>
              <p className="text-gray-600 mb-4">
                <span className="font-semibold text-orange-600">{deleteCategoryModal.categoryName}</span> kategorisini silmek istediğinizden emin misiniz?
              </p>
              <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-200">
                ⚠️ Bu işlem geri alınamaz! Kategorideki tüm ürünler de silinecektir.
              </p>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => setDeleteCategoryModal(null)}
                className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all transform hover:scale-105"
              >
                İptal
              </button>
              <button
                onClick={handleDeleteCategory}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all transform hover:scale-105"
              >
                <div className="flex items-center justify-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Sil</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {geceStockNotice && (
        <div className="fixed inset-x-0 bottom-8 z-[1200] flex justify-center px-4 pointer-events-none">
          <div
            key={geceStockNotice.key}
            role="alert"
            aria-live="polite"
            className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-[0_22px_55px_-12px_rgba(15,23,42,0.42)] backdrop-blur-xl ring-1 ring-slate-900/5 animate-slide-up"
          >
            <div
              className={`h-1.5 w-full bg-gradient-to-r ${
                geceStockNotice.variant === 'success'
                  ? 'from-emerald-400 via-teal-500 to-cyan-600'
                  : geceStockNotice.variant === 'error'
                    ? 'from-rose-500 via-red-600 to-red-800'
                    : geceStockNotice.variant === 'warning'
                      ? 'from-amber-400 via-orange-500 to-orange-600'
                      : 'from-slate-500 via-slate-600 to-slate-800'
              }`}
            />
            <div className="relative px-5 pt-4 pb-4 bg-gradient-to-br from-white via-slate-50/90 to-slate-100/80">
              <button
                type="button"
                onClick={dismissGeceStockNotice}
                className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
                aria-label="Kapat"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="flex gap-4 pr-10">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${
                    geceStockNotice.variant === 'success'
                      ? 'from-emerald-500 to-teal-600 shadow-emerald-500/30'
                      : geceStockNotice.variant === 'error'
                        ? 'from-rose-500 to-red-600 shadow-rose-500/30'
                        : geceStockNotice.variant === 'warning'
                          ? 'from-amber-400 to-orange-600 shadow-amber-500/30'
                          : 'from-slate-500 to-slate-800 shadow-slate-600/30'
                  }`}
                >
                  {geceStockNotice.variant === 'success' && (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {geceStockNotice.variant === 'error' && (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.122zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  )}
                  {geceStockNotice.variant === 'warning' && (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  {geceStockNotice.variant === 'info' && (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 110-16 8 8 0 010 16z" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h4 className="text-base font-extrabold tracking-tight text-slate-900">{geceStockNotice.title}</h4>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-slate-600">{geceStockNotice.message}</p>
                </div>
              </div>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className={`h-full rounded-full bg-gradient-to-r gece-stock-notice-bar ${
                    geceStockNotice.variant === 'success'
                      ? 'from-emerald-400 to-teal-500'
                      : geceStockNotice.variant === 'error'
                        ? 'from-rose-500 to-red-600'
                        : geceStockNotice.variant === 'warning'
                          ? 'from-amber-400 to-orange-500'
                          : 'from-slate-400 to-slate-600'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {geceSettingsConfirm && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-gradient-to-br from-white to-slate-50 shadow-2xl overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-orange-600" />
            <div className="px-6 pt-5 pb-4">
              <h2 className="text-lg font-extrabold text-slate-900">Onay</h2>
              <p className="mt-3 text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">
                {geceSettingsConfirm.message}
              </p>
            </div>
            <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-4 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setGeceSettingsConfirm(null)}
                className="px-5 py-2.5 rounded-xl font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => geceSettingsConfirm.onConfirm?.()}
                className="px-6 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md transition"
              >
                Devam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

// Platform Fiyat Yönetimi Modal Komponenti
const PlatformPriceModal = ({ platformType, products, categories, onClose, themeColor }) => {
  const [editingPrices, setEditingPrices] = useState({});
  const [savingProductId, setSavingProductId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [localProducts, setLocalProducts] = useState(products);

  // products prop'u değiştiğinde local state'i güncelle
  useEffect(() => {
    setLocalProducts(products);
  }, [products]);

  const platformName = platformType === 'yemeksepeti' ? 'Yemeksepeti' : 'TrendyolGO';
  const platformColor = platformType === 'yemeksepeti' 
    ? 'from-red-500 via-red-600 to-red-500' 
    : 'from-yellow-400 via-orange-500 to-yellow-500';

  // Filtrelenmiş ürünler
  const filteredProducts = useMemo(() => {
    let filtered = localProducts;
    
    // Kategori filtresi
    if (selectedCategoryId) {
      filtered = filtered.filter(p => p.category_id === selectedCategoryId);
    }
    
    // Arama filtresi
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [localProducts, selectedCategoryId, searchQuery]);

  const handlePriceChange = (productId, value) => {
    setEditingPrices(prev => ({
      ...prev,
      [productId]: value
    }));
  };

  const handleSavePrice = async (product) => {
    const newPrice = editingPrices[product.id];
    if (!newPrice || isNaN(parseFloat(newPrice)) || parseFloat(newPrice) < 0) {
      return;
    }

    setSavingProductId(product.id);
    
    try {
      const priceField = platformType === 'yemeksepeti' ? 'yemeksepeti_price' : 'trendyolgo_price';
      
      // Ürünü güncelle
      const updatedProduct = {
        ...product,
        [priceField]: parseFloat(newPrice)
      };
      
      const result = await window.electronAPI.updateProduct(updatedProduct);
      
      // updateProduct başarılı olursa result.success veya result.product döner
      if (result && (result.success || result.product)) {
        // Local products state'ini güncelle
        setLocalProducts(prevProducts => 
          prevProducts.map(p => 
            p.id === product.id 
              ? { ...p, [priceField]: parseFloat(newPrice) }
              : p
          )
        );
        
        // Local state'i güncelle
        setEditingPrices(prev => {
          const newPrices = { ...prev };
          delete newPrices[product.id];
          return newPrices;
        });
        
        // Başarı mesajı (opsiyonel)
        console.log(`✅ ${product.name} için ${platformName} fiyatı güncellendi: ${newPrice}₺`);
      } else {
        throw new Error((result && result.error) || 'Fiyat güncellenemedi');
      }
      
    } catch (error) {
      console.error('Fiyat güncelleme hatası:', error);
      alert(`Fiyat güncellenemedi: ${error.message}`);
    } finally {
      setSavingProductId(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[2000] animate-fade-in px-4 py-8">
      <div className="bg-white rounded-3xl w-full max-w-6xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] transform animate-scale-in relative overflow-hidden border border-gray-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className={`px-8 py-6 border-b border-gray-200 bg-gradient-to-r ${platformColor} text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {platformType === 'yemeksepeti' ? (
                <img 
                  src="/yemeksepeti.png" 
                  alt="Yemeksepeti" 
                  className="w-10 h-10 rounded-full object-cover bg-white p-1"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
              ) : (
                <img 
                  src="/trendyol.webp" 
                  alt="Trendyol" 
                  className="w-10 h-10 rounded-full object-cover bg-white p-1"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
              )}
              <span style={{display: 'none'}}>{platformType === 'yemeksepeti' ? '🍽️' : '🛒'}</span>
              <h2 className="text-2xl font-bold">{platformName} Fiyat Yönetimi</h2>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all duration-200"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-8 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-4">
            {/* Kategori Filtresi */}
            <select
              value={selectedCategoryId || ''}
              onChange={(e) => setSelectedCategoryId(e.target.value ? parseInt(e.target.value) : null)}
              className="px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none bg-white"
            >
              <option value="">Tüm Kategoriler</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            {/* Arama */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ürün ara..."
                className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
              />
              <svg className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Products List */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-3">
            {filteredProducts.map((product) => {
              const category = categories.find(c => c.id === product.category_id);
              // Local state'teki güncel ürünü bul (güncellenmiş fiyatlar için)
              const currentProduct = localProducts.find(p => p.id === product.id) || product;
              const priceField = platformType === 'yemeksepeti' ? 'yemeksepeti_price' : 'trendyolgo_price';
              const currentPrice = currentProduct[priceField] !== undefined && currentProduct[priceField] !== null 
                ? currentProduct[priceField] 
                : currentProduct.price;
              const isEditing = editingPrices[product.id] !== undefined;
              const editValue = isEditing ? editingPrices[product.id] : currentPrice;

              return (
                <div
                  key={product.id}
                  className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-orange-300 transition-all"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-gray-900">{product.name}</h3>
                        {category && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                            {category.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>Normal Fiyat: <span className="font-semibold text-gray-800">{product.price.toFixed(2)}₺</span></span>
                        <span className="text-gray-400">|</span>
                        <span>{platformName} Fiyatı: <span className="font-semibold text-orange-600">{currentPrice.toFixed(2)}₺</span></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {isEditing ? (
                        <>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editValue}
                            onChange={(e) => handlePriceChange(product.id, e.target.value)}
                            className="w-32 px-3 py-2 rounded-lg border-2 border-orange-300 focus:border-orange-500 focus:outline-none text-right"
                            placeholder="Fiyat"
                          />
                          <button
                            onClick={() => handleSavePrice(product)}
                            disabled={savingProductId === product.id}
                            className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg font-semibold transition-all disabled:opacity-50"
                          >
                            {savingProductId === product.id ? 'Kaydediliyor...' : 'Kaydet'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingPrices(prev => {
                                const newPrices = { ...prev };
                                delete newPrices[product.id];
                                return newPrices;
                              });
                            }}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-all"
                          >
                            İptal
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handlePriceChange(product.id, currentPrice)}
                          className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-semibold transition-all"
                        >
                          Düzenle
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>Ürün bulunamadı</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-xl font-semibold transition-all"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SettingsModal;

