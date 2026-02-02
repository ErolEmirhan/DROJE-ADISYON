import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getThemeColors } from '../utils/themeUtils';
import { isGeceDonercisi, isYakasGrill, isLacromisa } from '../utils/sultanSomatTables';
import { GECE_BRANCHES, getGeceSelectedBranch, getOrCreateGeceDeviceId, setGeceSelectedBranch } from '../utils/geceDonercisiBranchSelection';
import { fetchBranchStockMap, upsertDeviceBranchSelection } from '../utils/geceDonercisiMasalarFirestore';

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
  const [geceBranchStocks, setGeceBranchStocks] = useState({}); // productId(string) -> stock
  const [isLoadingGeceBranchStocks, setIsLoadingGeceBranchStocks] = useState(false);
  
  // Stock management state
  const [stockFilterCategory, setStockFilterCategory] = useState(null);
  const [stockFilterProduct, setStockFilterProduct] = useState(null);
  const [stockAdjustmentAmount, setStockAdjustmentAmount] = useState('');
  const [stockAdjustmentType, setStockAdjustmentType] = useState('add'); // 'add' or 'subtract'
  
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
      }
    }
  }, [activeTab]);

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

  const getDisplayedStock = (product) => {
    if (isGeceDonercisiMode && geceBranch) {
      const key = String(product?.id);
      const v = geceBranchStocks?.[key];
      return Number.isFinite(v) ? v : 0;
    }
    const trackStock = product?.trackStock === true;
    const stock = trackStock && product?.stock !== undefined ? (product.stock || 0) : null;
    return stock ?? 0;
  };

  const loadGeceBranchStocks = async (branch) => {
    if (!isGeceDonercisiMode || !branch) {
      setGeceBranchStocks({});
      return;
    }
    try {
      setIsLoadingGeceBranchStocks(true);
      const map = await fetchBranchStockMap(branch);
      setGeceBranchStocks(map || {});
    } catch (e) {
      console.error('Şube stokları yüklenemedi:', e);
      setGeceBranchStocks({});
    } finally {
      setIsLoadingGeceBranchStocks(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'stock') return;
    if (!isGeceDonercisiMode) return;
    if (!geceBranch) {
      setGeceBranchStocks({});
      return;
    }
    loadGeceBranchStocks(geceBranch);
  }, [activeTab, isGeceDonercisiMode, geceBranch]);

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

    // Şube değişince şube stoklarını yükle
    await loadGeceBranchStocks(branch);
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

  const handleOptimizeAllImages = async () => {
    if (!window.electronAPI || typeof window.electronAPI.optimizeAllProductImages !== 'function') {
      alert('Görsel optimizasyon özelliği yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
      return;
    }

    if (
      !window.confirm(
        'Tüm ürün görselleri Firebase Storage üzerinde yeniden optimize edilecek.\n\n' +
        '- Tümü WebP formatına dönüştürülecek\n' +
        '- Maksimum genişlik 600px, kalite ~65\n' +
        '- Amaç: 50–120 KB arası, 200 KB üstü reddedilir\n\n' +
        'Bu işlem internet bağlantınıza ve görsel sayısına göre birkaç dakika sürebilir.\n\n' +
        'Devam etmek istiyor musunuz?'
      )
    ) {
      return;
    }

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

  const handleRemoveCategoryAssignment = async (categoryId) => {
    if (!categoryId) return;
    
    if (!confirm(`Bu kategorinin yazıcı atamasını kaldırmak istediğinize emin misiniz?`)) {
      return;
    }
    
    try {
      // Kategori bazlı kaldırma için categoryId kullan
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
    setProductForm({
      name: product.name,
      category_id: product.category_id,
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

      // Ana uygulamadaki kategori/pano görünümünü yenile (masaüstü POS + mobil)
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
      <div className="bg-white rounded-3xl p-8 w-full max-w-6xl max-h-[90vh] shadow-2xl transform animate-scale-in relative overflow-hidden flex flex-col">
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

                      <div className="text-sm font-bold text-slate-600">
                        {(filteredProducts || []).filter((p) => {
                          if (!productSearchQuery) return true;
                          return String(p?.name || '').toLowerCase().includes(productSearchQuery.toLowerCase());
                        }).length} ürün
                      </div>
                    </div>

                    {showCreateProductPanel && (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-extrabold text-slate-900 mb-3">Yeni Ürün Ekle</div>
                        <form onSubmit={handleProductSubmit} className="grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-12 md:col-span-4">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Ürün</label>
                            <input
                              type="text"
                              value={productForm.name}
                              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-500 focus:outline-none bg-white"
                              placeholder="Ürün adı"
                              required
                            />
                          </div>
                          <div className="col-span-12 md:col-span-3">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Kategori</label>
                            <select
                              value={productForm.category_id || ''}
                              onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-500 focus:outline-none bg-white"
                              required
                            >
                              <option value="" disabled>Kategori seç</option>
                              {categories.map((c) => (
                                <option key={c.id} value={String(c.id)}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-12 md:col-span-2">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Fiyat</label>
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
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-500 focus:outline-none bg-white text-right"
                              placeholder="0.00"
                              required
                            />
                          </div>
                          <div className="col-span-12 md:col-span-3">
                            <label className="block text-xs font-bold text-slate-600 mb-1">Görsel (opsiyonel)</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={productForm.image}
                                onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-500 focus:outline-none bg-white"
                                placeholder="URL veya dosya seç"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  const productId = null;
                                  const result = await window.electronAPI.selectImageFile(productId);
                                  if (result?.success && result?.path) setProductForm({ ...productForm, image: result.path });
                                }}
                                className="px-3 py-2 rounded-xl bg-slate-900 text-white font-semibold"
                              >
                                Dosya
                              </button>
                            </div>
                          </div>
                          <div className="col-span-12">
                            <button
                              type="submit"
                              className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-extrabold hover:shadow-lg transition-all"
                            >
                              Ekle
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* Dense table */}
                  <div className="max-h-[62vh] overflow-y-auto">
                    <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
                      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-extrabold text-slate-600">
                        <div className="col-span-5">Ürün</div>
                        <div className="col-span-3">Kategori</div>
                        <div className="col-span-2 text-right">Fiyat</div>
                        <div className="col-span-2 text-right">İşlem</div>
                      </div>
                    </div>

                    {(filteredProducts || [])
                      .filter((p) => {
                        if (!productSearchQuery) return true;
                        return String(p?.name || '').toLowerCase().includes(productSearchQuery.toLowerCase());
                      })
                      .map((product) => {
                        const isInline = inlineEditingProductId === product.id;
                        const draft = isInline ? inlineDraft : null;
                        const catName = categories.find((c) => c.id === product.category_id)?.name || '—';

                        return (
                          <div key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center">
                              <div className="col-span-5 flex items-center gap-3 min-w-0">
                                {product.image ? (
                                  <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-9 h-9 rounded-xl object-cover border border-slate-200 bg-white"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 text-sm">
                                    📦
                                  </div>
                                )}

                                <div className="min-w-0 flex-1">
                                  {isInline ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={draft?.name || ''}
                                        onChange={(e) => setInlineDraft((prev) => ({ ...(prev || {}), name: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-500 focus:outline-none bg-white text-slate-900 text-sm font-semibold"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => selectInlineImage(product.id)}
                                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 font-semibold whitespace-nowrap"
                                        title="Görsel seç"
                                      >
                                        Görsel
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="text-sm font-extrabold text-slate-900 truncate">{product.name}</div>
                                      <div className="text-[11px] font-semibold text-slate-500 truncate">{catName}</div>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="col-span-3">
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

                    {(filteredProducts || []).filter((p) => {
                      if (!productSearchQuery) return true;
                      return String(p?.name || '').toLowerCase().includes(productSearchQuery.toLowerCase());
                    }).length === 0 && (
                      <div className="p-10 text-center text-slate-500 font-semibold">
                        Ürün bulunamadı
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Product Form */}
                  <div className="bg-gradient-to-br from-orange-50 to-orange-50 rounded-2xl p-6 border border-orange-200">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">
                      {editingProduct ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
                    </h3>
                    <form onSubmit={handleProductSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Ürün Adı
                          </label>
                          <input
                            type="text"
                            value={productForm.name}
                            onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                            className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
                            placeholder="Ürün adı"
                            required
                          />
                        </div>

                        <div className="relative" ref={categoryDropdownRef}>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Kategori
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                            className={`w-full px-4 py-3 rounded-xl border-2 transition-all text-left flex items-center justify-between ${
                              productForm.category_id
                                ? 'border-orange-500 bg-orange-50'
                                : 'border-gray-200 hover:border-orange-300'
                            } focus:border-orange-500 focus:outline-none`}
                          >
                            <span className={productForm.category_id ? 'text-orange-700 font-medium' : 'text-gray-500'}>
                              {productForm.category_id
                                ? categories.find(c => c.id === parseInt(productForm.category_id))?.name || 'Kategori Seçin'
                                : 'Kategori Seçin'}
                            </span>
                            <svg 
                              className={`w-5 h-5 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''} ${
                                productForm.category_id ? 'text-orange-600' : 'text-gray-400'
                              }`}
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          
                          {showCategoryDropdown && (
                            <div className="absolute z-20 w-full mt-2 bg-white rounded-xl shadow-2xl border-2 border-orange-200 overflow-hidden max-h-60 overflow-y-auto">
                              {categories.map(cat => (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => {
                                    setProductForm({ ...productForm, category_id: cat.id.toString() });
                                    setShowCategoryDropdown(false);
                                  }}
                                  className={`w-full px-4 py-3 text-left hover:bg-orange-50 transition-all flex items-center space-x-3 ${
                                    productForm.category_id === cat.id.toString()
                                      ? 'bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white'
                                      : 'text-gray-700'
                                  }`}
                                >
                                  <div className={`w-2 h-2 rounded-full ${
                                    productForm.category_id === cat.id.toString()
                                      ? 'bg-white'
                                      : 'bg-orange-500'
                                  }`}></div>
                                  <span className="font-medium">{cat.name}</span>
                                  {productForm.category_id === cat.id.toString() && (
                                    <svg className="w-5 h-5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Fiyat (₺)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={productForm.price}
                            onChange={(e) => {
                              // Sadece sayı ve nokta/virgül kabul et
                              const val = e.target.value.replace(/[^\d.,]/g, '');
                              // Virgülü noktaya çevir
                              const normalized = val.replace(',', '.');
                              // Sadece bir ondalık ayırıcı olmasını sağla
                              const parts = normalized.split('.');
                              const finalValue = parts.length > 2 
                                ? parts[0] + '.' + parts.slice(1).join('')
                                : normalized;
                              setProductForm({ ...productForm, price: finalValue });
                            }}
                            className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
                            placeholder="0.00"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Ürün Görseli (Opsiyonel)
                          </label>
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              value={productForm.image}
                              onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                              className="flex-1 px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
                              placeholder="Görsel URL'si girin veya dosya seçin"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.electronAPI || typeof window.electronAPI.selectImageFile !== 'function') {
                                  alert('Dosya seçimi özelliği yüklenemedi. Lütfen uygulamayı yeniden başlatın.');
                                  return;
                                }
                                
                                try {
                                  // Ürün ID'sini parametre olarak gönder (düzenleme modunda)
                                  const productId = editingProduct ? editingProduct.id : null;
                                  const result = await window.electronAPI.selectImageFile(productId);
                                  if (result.success && result.path) {
                                    setProductForm({ ...productForm, image: result.path });
                                  } else if (!result.canceled) {
                                    alert('Dosya seçilemedi: ' + (result.error || 'Bilinmeyen hata'));
                                  }
                                } catch (error) {
                                  alert('Dosya seçme hatası: ' + error.message);
                                }
                              }}
                              className="px-6 py-2 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg transform hover:scale-105 transition-all whitespace-nowrap"
                            >
                              📁 Dosya Seç
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setIsLoadingFirebaseImages(true);
                                setShowFirebaseImageModal(true);
                                try {
                                  const result = await window.electronAPI.getFirebaseImages();
                                  if (result.success) {
                                    setFirebaseImages(result.images || []);
                                  } else {
                                    alert('Firebase görselleri yüklenemedi: ' + (result.error || 'Bilinmeyen hata'));
                                  }
                                } catch (error) {
                                  alert('Firebase görselleri yükleme hatası: ' + error.message);
                                } finally {
                                  setIsLoadingFirebaseImages(false);
                                }
                              }}
                              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-medium hover:shadow-lg transform hover:scale-105 transition-all whitespace-nowrap"
                            >
                              🔥 Firebase'den Seç
                            </button>
                            {productForm.image && (
                              <button
                                type="button"
                                onClick={() => setProductForm({ ...productForm, image: '' })}
                                className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            💡 Görsel URL'si girebilir, dosya seçebilir veya Firebase'den seçebilirsiniz. URL girildiğinde otomatik olarak Firebase'e kaydedilir.
                          </p>
                          {productForm.image && (
                            <div className="mt-2">
                              <img 
                                src={productForm.image} 
                                alt="Önizleme" 
                                className="w-24 h-24 object-cover rounded-lg border-2 border-orange-200"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex space-x-3">
                        <button
                          type="submit"
                          className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:scale-105 transition-all"
                        >
                          {editingProduct ? 'Güncelle' : 'Ekle'}
                        </button>
                        {editingProduct && (
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-all"
                          >
                            İptal
                          </button>
                        )}
                      </div>
                    </form>
                  </div>

                  {/* Firebase Image Records Button */}
                  <div className="mb-6">
                    <button
                      onClick={async () => {
                        if (!window.confirm(
                          'Tüm mevcut ürünler için Firebase\'de image kayıtları oluşturulacak.\n\n' +
                          'Bu işlem sadece görseli olan ve henüz Firebase\'de kaydı olmayan ürünler için çalışır.\n\n' +
                          'Devam etmek istiyor musunuz?'
                        )) {
                          return;
                        }
                        
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
                      }}
                      disabled={isCreatingImageRecords}
                      className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold hover:shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingImageRecords ? '🔄 Oluşturuluyor...' : '🔥 Tüm Ürünler İçin Firebase Image Kayıtları Oluştur'}
                    </button>
                  </div>

                  {/* Product List */}
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-6">Mevcut Ürünler</h3>
                    
                    {/* Modern Category Filter */}
                    <div className="mb-6">
                      <div className="bg-gradient-to-br from-orange-50 via-orange-50 to-blue-50 rounded-2xl p-4 border-2 border-orange-200 shadow-lg">
                        <div className="flex items-center space-x-2 mb-3">
                          <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                          </svg>
                          <span className="text-sm font-semibold text-gray-700">Kategori Filtrele</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setSelectedCategory(null)}
                            className={`px-4 py-2.5 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 ${
                              !selectedCategory
                                ? 'bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white shadow-lg scale-105'
                                : 'bg-white text-gray-700 hover:bg-orange-50 border-2 border-gray-200 hover:border-orange-300'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                              </svg>
                              <span>Tümü</span>
                            </div>
                          </button>
                          {categories.map(cat => (
                            <div key={cat.id} className="relative group">
                              <button
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-4 py-2.5 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 ${
                                  selectedCategory?.id === cat.id
                                    ? 'bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 text-white shadow-lg scale-105'
                                    : 'bg-white text-gray-700 hover:bg-orange-50 border-2 border-gray-200 hover:border-orange-300'
                                }`}
                              >
                                <div className="flex items-center space-x-2">
                                  <div className={`w-2 h-2 rounded-full ${
                                    selectedCategory?.id === cat.id ? 'bg-white' : 'bg-orange-500'
                                  }`}></div>
                                  <span>{cat.name}</span>
                                  {selectedCategory?.id === cat.id && (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              </button>
                              <div className="absolute -top-1 -right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                                {/* Yukarı taşı */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveCategory(cat.id, 'up');
                                  }}
                                  className="w-6 h-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full flex items-center justify-center shadow-lg transition-all"
                                  title="Yukarı Taşı"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                </button>
                                {/* Aşağı taşı */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveCategory(cat.id, 'down');
                                  }}
                                  className="w-6 h-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full flex items-center justify-center shadow-lg transition-all"
                                  title="Aşağı Taşı"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditCategory(cat);
                                  }}
                                  className="w-6 h-6 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all"
                                  title="Kategoriyi Düzenle"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteCategoryModal({ categoryId: cat.id, categoryName: cat.name });
                                  }}
                                  className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all"
                                  title="Kategoriyi Sil"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => setShowAddCategoryModal(true)}
                            className="px-4 py-2.5 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg hover:shadow-xl border-2 border-green-400"
                          >
                            <div className="flex items-center space-x-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              <span>Kategori Ekle</span>
                            </div>
                          </button>
                        </div>
                        {selectedCategory && (
                          <div className="mt-3 pt-3 border-t border-orange-200">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">
                                <span className="font-semibold text-orange-600">{selectedCategory.name}</span> kategorisinde
                              </span>
                              <span className="text-sm font-bold text-orange-600">
                                {filteredProducts.length} ürün
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto scrollbar-custom">
                      {filteredProducts.map(product => {
                        const category = categories.find(c => c.id === product.category_id);
                        return (
                          <div
                            key={product.id}
                            className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-all flex items-center justify-between"
                          >
                            <div className="flex items-center space-x-4 flex-1">
                              {product.image ? (
                                <img src={product.image} alt={product.name} className="w-16 h-16 rounded-lg object-cover" />
                              ) : (
                                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-orange-200 to-orange-200 flex items-center justify-center">
                                  <span className="text-2xl">📦</span>
                                </div>
                              )}
                              <div className="flex-1">
                                <h4 className="font-semibold text-gray-800">{product.name}</h4>
                                <p className="text-sm text-gray-500">{category?.name || 'Kategori yok'}</p>
                                <p className="text-lg font-bold text-orange-600">{product.price.toFixed(2)} ₺</p>
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditProduct(product)}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
                              >
                                ✏️ Düzenle
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product.id)}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
                              >
                                🗑️ Sil
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'stock' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Stok Takibi</h3>

              {isGeceDonercisiMode && (
                <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800">
                  <div className="text-sm font-extrabold tracking-tight">Salt-okunur</div>
                  <div className="text-sm text-white/90 font-medium mt-1">
                    Bu ekranda stok değerleri ve stok takibi değiştirilemez. Tüm stok işlemleri sadece <b>Admin Dashboard</b> üzerinden yapılır.
                  </div>
                </div>
              )}

              {/* Gece Dönercisi: Şube seçimi (stok sekmesinin en üstünde) */}
              {isGeceDonercisiMode && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">Şube Seçimi</h4>
                      <p className="text-sm text-slate-600 font-medium mt-1">
                        Bu cihazın şubesini seçin. Seçiminizi daha sonra buradan değiştirebilirsiniz.
                      </p>
                      {geceBranch ? (
                        <p className="text-sm mt-2">
                          Seçili Şube:{' '}
                          <span className="font-extrabold text-slate-900">
                            {GECE_BRANCHES.find((b) => b.value === geceBranch)?.label || geceBranch}
                          </span>
                        </p>
                      ) : (
                        <p className="text-sm mt-2 font-bold text-red-600">
                          Şube seçimi zorunludur.
                        </p>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      {isSavingGeceBranch ? 'Kaydediliyor…' : ''}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {GECE_BRANCHES.map((b) => {
                      const active = geceBranch === b.value;
                      return (
                        <button
                          key={b.value}
                          type="button"
                          onClick={() => saveGeceBranch(b.value)}
                          className={`px-5 py-4 rounded-2xl border-2 font-extrabold transition-all ${
                            active
                              ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                              : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
                          }`}
                          disabled={isSavingGeceBranch}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>

                  {geceBranch && (
                    <div className="mt-4 text-xs font-semibold text-slate-500">
                      {isLoadingGeceBranchStocks ? 'Şube stokları yükleniyor…' : 'Şube stokları admin paneldeki (şube bazlı) stoklarla senkron.'}
                    </div>
                  )}
                </div>
              )}
              
              {/* Filtreler */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-50 rounded-2xl p-6 border border-orange-200">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Filtrele</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kategori
                    </label>
                    <select
                      value={stockFilterCategory?.id || ''}
                      onChange={(e) => {
                        const catId = e.target.value ? parseInt(e.target.value) : null;
                        const cat = (isGeceDonercisiMode ? allowedStockCategories : categories).find(c => c.id === catId);
                        setStockFilterCategory(cat || null);
                        setStockFilterProduct(null); // Kategori değişince ürün seçimini temizle
                      }}
                      className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
                    >
                      <option value="">Tüm Kategoriler</option>
                      {(isGeceDonercisiMode ? allowedStockCategories : categories).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  {stockFilterCategory && (
                    <div className="flex items-end">
                      {!isGeceDonercisiMode && (
                        <button
                          onClick={async () => {
                            if (!window.confirm(
                              `${stockFilterCategory.name} kategorisindeki TÜM ürünlerin stokunu 0 yapmak ve stok takibini açmak istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`
                            )) {
                              return;
                            }
                            
                            try {
                              const result = await window.electronAPI.markCategoryOutOfStock(stockFilterCategory.id);
                              
                              if (result && result.success) {
                                alert(`✅ ${result.updatedCount} ürün "kalmadı" olarak işaretlendi`);
                                // Ürünleri yenile
                                await loadAllProducts();
                                // Ana uygulamayı yenile
                                if (onProductsUpdated) {
                                  onProductsUpdated();
                                }
                              } else {
                                alert(result?.error || 'Kategori işaretlenemedi');
                              }
                            } catch (error) {
                              console.error('Kategori işaretleme hatası:', error);
                              alert('Kategori işaretlenemedi: ' + error.message);
                            }
                          }}
                          className="w-full px-4 py-2 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                        >
                          🔴 Kalmadı İşaretle
                        </button>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ürün
                    </label>
                    <select
                      value={stockFilterProduct?.id || ''}
                      onChange={(e) => {
                        const prodId = e.target.value ? parseInt(e.target.value) : null;
                        const prod = products.find(p => p.id === prodId);
                        setStockFilterProduct(prod || null);
                      }}
                      className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
                      disabled={!stockFilterCategory && categories.length > 0}
                    >
                      <option value="">Ürün Seçin</option>
                      {(stockFilterCategory 
                        ? products.filter(p => p.category_id === stockFilterCategory.id)
                        : (isGeceDonercisiMode
                          ? products.filter(p => {
                            const cat = categories.find(c => c.id === p.category_id);
                            return isAllowedStockCategory(cat?.name);
                          })
                          : products)
                      ).map(prod => (
                        <option key={prod.id} value={prod.id}>
                          {prod.name} {(isGeceDonercisiMode && geceBranch) ? `(Stok: ${getDisplayedStock(prod)})` : (prod.stock !== undefined ? `(Stok: ${prod.stock || 0})` : '')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Stok Güncelleme */}
              {stockFilterProduct && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-gray-800">
                      {stockFilterProduct.name}
                    </h4>
                    {!isGeceDonercisiMode && (
                      <button
                        onClick={() => handleToggleStockTracking(stockFilterProduct.id, stockFilterProduct.trackStock)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          stockFilterProduct.trackStock
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                        }`}
                      >
                        {stockFilterProduct.trackStock ? '✅ Stok Takibi Açık' : '❌ Stok Takibi Kapalı'}
                      </button>
                    )}
                  </div>

                  {isGeceDonercisiMode ? (
                    <>
                      {geceBranch ? (
                        <p className="text-sm text-gray-600 mb-1">
                          Mevcut Stok:{' '}
                          <span className="font-bold text-blue-600">{getDisplayedStock(stockFilterProduct)}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-red-600 font-semibold">
                          Stokları görmek için önce şube seçiniz.
                        </p>
                      )}
                      <p className="text-sm text-gray-500 italic mt-3">
                        Not: Bu ekranda stok güncelleme ve stok takibi değişikliği kapalıdır.
                      </p>
                    </>
                  ) : stockFilterProduct.trackStock ? (
                    <>
                      <p className="text-sm text-gray-600 mb-4">
                        Mevcut Stok: <span className="font-bold text-blue-600">{isGeceDonercisiMode && geceBranch ? getDisplayedStock(stockFilterProduct) : (stockFilterProduct.stock !== undefined ? (stockFilterProduct.stock || 0) : 0)}</span>
                      </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        İşlem Tipi
                      </label>
                      <select
                        value={stockAdjustmentType}
                        onChange={(e) => setStockAdjustmentType(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
                      >
                        <option value="add">Stok Ekle</option>
                        <option value="subtract">Stok Çıkar</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Miktar
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={stockAdjustmentAmount}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setStockAdjustmentAmount(val);
                        }}
                        className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
                        placeholder="Miktar"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={handleStockAdjustment}
                        className="w-full px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                      >
                        {stockAdjustmentType === 'add' ? '➕ Ekle' : '➖ Çıkar'}
                      </button>
                    </div>
                  </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 italic">
                      Bu ürün için stok takibi yapılmıyor. Stok takibini açmak için yukarıdaki butona tıklayın.
                    </p>
                  )}
                </div>
              )}

              {/* Ürün Listesi */}
              <div>
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Ürün Stokları</h4>
                <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto scrollbar-custom">
                  {(stockFilterCategory 
                    ? products.filter(p => p.category_id === stockFilterCategory.id)
                    : (isGeceDonercisiMode
                      ? products.filter(p => {
                        const cat = categories.find(c => c.id === p.category_id);
                        return isAllowedStockCategory(cat?.name);
                      })
                      : products)
                  ).map(product => {
                    const category = categories.find(c => c.id === product.category_id);
                    const trackStock = product.trackStock === true;
                    const stock = isGeceDonercisiMode && geceBranch
                      ? getDisplayedStock(product)
                      : (trackStock && product.stock !== undefined ? (product.stock || 0) : null);
                    return (
                      <div
                        key={product.id}
                        className={`bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-all flex items-center justify-between ${isGeceDonercisiMode ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (!isGeceDonercisiMode) return;
                          setStockFilterCategory(category || null);
                          setStockFilterProduct(product);
                          setStockAdjustmentAmount('');
                          setStockAdjustmentType('add');
                        }}
                      >
                        <div className="flex items-center space-x-4 flex-1">
                          {product.image ? (
                            <img src={product.image} alt={product.name} className="w-16 h-16 rounded-lg object-cover" />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-orange-200 to-orange-200 flex items-center justify-center">
                              <span className="text-2xl">📦</span>
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-gray-800">{product.name}</h4>
                              {isGeceDonercisiMode ? (
                                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">Şube Stok</span>
                              ) : trackStock ? (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Stok Takibi</span>
                                ) : (
                                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Takip Yok</span>
                                )}
                            </div>
                            <p className="text-sm text-gray-500">{category?.name || 'Kategori yok'}</p>
                            <div className="flex items-center gap-4 mt-1">
                              <p className="text-lg font-bold text-orange-600">{product.price.toFixed(2)} ₺</p>
                              {(isGeceDonercisiMode && geceBranch) || (trackStock && stock !== null) ? (
                                <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
                                  stock === 0 
                                    ? 'bg-red-100 text-red-700' 
                                    : stock < 10 
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  Stok: {stock}
                                </span>
                              ) : trackStock ? (
                                <span className="text-sm text-gray-400 px-3 py-1 rounded-lg bg-gray-100">
                                  Stok: 0
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        {!isGeceDonercisiMode && (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => {
                                setStockFilterCategory(category || null);
                                setStockFilterProduct(product);
                                setStockAdjustmentAmount('');
                                setStockAdjustmentType('add');
                              }}
                              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm"
                            >
                              📊 Stok Güncelle
                            </button>
                            <button
                              onClick={() => handleToggleStockTracking(product.id, trackStock)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                trackStock
                                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                                  : 'bg-green-500 text-white hover:bg-green-600'
                              }`}
                            >
                              {trackStock ? '❌ Takibi Kapat' : '✅ Takibi Aç'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
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

