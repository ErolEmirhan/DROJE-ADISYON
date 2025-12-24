import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PinModal from './PinModal';
import SettingsModal from './SettingsModal';
import SettingsSplash from './SettingsSplash';
import DateTimeDisplay from './DateTimeDisplay';
import { getThemeColors } from '../utils/themeUtils';

const Navbar = ({ currentView, setCurrentView, totalItems, userType, setUserType, onRoleSplash, onProductsUpdated, onExit, businessName = 'MAKARA', themeColor = '#f97316' }) => {
  // Tema renklerini hesapla
  const theme = useMemo(() => getThemeColors(themeColor), [themeColor]);
  
  // Debug: businessName prop'unu kontrol et
  useEffect(() => {
    console.log('📊 Navbar - businessName:', businessName);
  }, [businessName]);
  
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSettingsSplash, setShowSettingsSplash] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [serverURL, setServerURL] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', surname: '', password: '' });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingStaff, setEditingStaff] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showStaffAccountsModal, setShowStaffAccountsModal] = useState(false);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountAmount, setAccountAmount] = useState('');
  const [accountType, setAccountType] = useState('alacak'); // 'alacak' or 'verecek'
  const menuRef = useRef(null);

  // Dışarı tıklayınca menüyü kapat
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUserTypeChange = (type) => {
    setShowUserMenu(false);
    
    if (type === 'Admin') {
      // Admin seçildiyse PIN modal'ı aç
      setShowPinModal(true);
    } else {
      // Personel seçildiyse direkt geçiş yap
      setUserType(type);
      onRoleSplash?.('Personel');
      if (currentView === 'sales') {
        setCurrentView('pos');
      }
    }
  };

  const handlePinSuccess = () => {
    setUserType('Admin');
    setShowPinModal(false);
    onRoleSplash?.('Admin');
  };

  const handlePinClose = () => {
    setShowPinModal(false);
  };

  const handleOpenMobileModal = async () => {
    setShowMobileModal(true);
    loadStaff();
    try {
      const result = await window.electronAPI.generateQRCode();
      if (result && result.success) {
        setQrCode(result.qrCode);
        setServerURL(result.url);
      } else {
        alert('QR kod oluşturulamadı: ' + (result?.error || 'Bilinmeyen hata'));
      }
    } catch (error) {
      console.error('QR kod oluşturma hatası:', error);
      alert('QR kod oluşturulamadı');
    }
  };

  const loadStaff = async () => {
    try {
      const staff = await window.electronAPI.getStaff();
      setStaffList(staff);
    } catch (error) {
      console.error('Personel yükleme hatası:', error);
    }
  };

  const loadStaffAccounts = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getStaffAccounts) {
        const accounts = await window.electronAPI.getStaffAccounts();
        setStaffAccounts(accounts || []);
      } else {
        // Eğer API yoksa, staff listesinden accounts oluştur
        const accounts = staffList.map(staff => ({
          staffId: staff.id,
          staffName: `${staff.name} ${staff.surname}`,
          balance: 0,
          transactions: []
        }));
        setStaffAccounts(accounts);
      }
    } catch (error) {
      console.error('Personel hesapları yükleme hatası:', error);
      // Hata durumunda staff listesinden accounts oluştur
      const accounts = staffList.map(staff => ({
        staffId: staff.id,
        staffName: `${staff.name} ${staff.surname}`,
        balance: 0,
        transactions: []
      }));
      setStaffAccounts(accounts);
    }
  };

  const handleAddAccountTransaction = async () => {
    if (!editingAccount || !accountAmount || parseFloat(accountAmount) <= 0) {
      alert('Lütfen geçerli bir tutar girin');
      return;
    }

    try {
      const amount = parseFloat(accountAmount);
      // Alacak için pozitif, verecek için negatif
      const transactionAmount = accountType === 'alacak' ? amount : -amount;
      
      console.log('💰 Frontend - Transaction oluşturuluyor:', {
        staffId: editingAccount.staffId,
        accountAmount: amount,
        accountType: accountType,
        transactionAmount: transactionAmount
      });
      
      const transaction = {
        staffId: editingAccount.staffId,
        amount: transactionAmount, // Alacak: +, Verecek: -
        type: accountType,
        date: new Date().toISOString()
      };

      if (window.electronAPI && window.electronAPI.addStaffAccountTransaction) {
        const result = await window.electronAPI.addStaffAccountTransaction(transaction);
        if (result.success) {
          await loadStaffAccounts();
          setEditingAccount(null);
          setAccountAmount('');
          setAccountType('alacak');
          setSuccessMessage(`${editingAccount.staffName} için işlem eklendi`);
          setShowSuccessToast(true);
          setTimeout(() => setShowSuccessToast(false), 3000);
        } else {
          alert('Hata: ' + (result.error || 'Bilinmeyen hata'));
        }
      } else {
        // Fallback: Local state güncelle
        setStaffAccounts(prev => prev.map(acc => {
          if (acc.staffId === editingAccount.staffId) {
            const newBalance = acc.balance + transaction.amount;
            return {
              ...acc,
              balance: newBalance,
              transactions: [...(acc.transactions || []), transaction]
            };
          }
          return acc;
        }));
        setEditingAccount(null);
        setAccountAmount('');
        setAccountType('alacak');
        setSuccessMessage(`${editingAccount.staffName} için işlem eklendi`);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
      }
    } catch (error) {
      console.error('Hesap işlemi ekleme hatası:', error);
      alert('İşlem eklenemedi: ' + error.message);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaff.name || !newStaff.surname || !newStaff.password) {
      alert('Lütfen tüm alanları doldurun');
      return;
    }

    try {
      const result = await window.electronAPI.createStaff(newStaff);
      if (result && result.success) {
        const staffName = `${newStaff.name} ${newStaff.surname}`;
        setNewStaff({ name: '', surname: '', password: '' });
        setShowAddStaff(false);
        loadStaff();
        setSuccessMessage(`${staffName} başarıyla eklendi`);
        setShowSuccessToast(true);
        setTimeout(() => {
          setShowSuccessToast(false);
        }, 3000);
      } else {
        alert('Personel eklenemedi: ' + (result?.error || 'Bilinmeyen hata'));
      }
    } catch (error) {
      console.error('Personel ekleme hatası:', error);
      alert('Personel eklenemedi');
    }
  };

  const handleDeleteStaff = async (staffId) => {
    try {
      const result = await window.electronAPI.deleteStaff(staffId);
      if (result && result.success) {
        loadStaff();
        setDeleteConfirm(null);
        alert('Personel başarıyla silindi');
      } else {
        alert('Personel silinemedi: ' + (result?.error || 'Bilinmeyen hata'));
      }
    } catch (error) {
      console.error('Personel silme hatası:', error);
      alert('Personel silinemedi');
    }
  };

  const handleUpdatePassword = async () => {
    if (!editingStaff) {
      alert('Personel seçilmedi');
      return;
    }

    if (!newPassword || newPassword.trim().length < 4) {
      alert('Şifre en az 4 karakter olmalıdır');
      return;
    }

    try {
      console.log('Şifre güncelleme isteği gönderiliyor:', { staffId: editingStaff.id, passwordLength: newPassword.length });
      
      const result = await window.electronAPI.updateStaffPassword(editingStaff.id, newPassword.trim());
      
      console.log('Şifre güncelleme sonucu:', result);
      
      if (result && result.success) {
        const staffName = `${editingStaff.name} ${editingStaff.surname}`;
        setEditingStaff(null);
        setNewPassword('');
        setSuccessMessage(`${staffName} şifresi başarıyla güncellendi`);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
        loadStaff();
      } else {
        const errorMsg = result?.error || 'Bilinmeyen hata';
        console.error('Şifre güncelleme başarısız:', errorMsg);
        alert('Şifre güncellenemedi: ' + errorMsg);
      }
    } catch (error) {
      console.error('Şifre güncelleme hatası:', error);
      alert('Şifre güncellenemedi: ' + (error.message || 'Bilinmeyen hata'));
    }
  };


  return (
    <nav className="h-20 bg-white/90 backdrop-blur-xl border-b px-8 flex items-center justify-between shadow-lg relative z-50" style={{ borderColor: theme.primary200 + '80' }}>
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg overflow-hidden bg-white p-1">
          <img 
            src="./logo.png" 
            alt="Makara Logo" 
            className="w-full h-full object-contain"
            style={{ display: 'block' }}
            onError={(e) => {
              console.error('Logo yüklenemedi, icon.png kullanılıyor:', e.target.src);
              e.target.src = './icon.png'; // Fallback
            }}
            onLoad={() => console.log('Logo başarıyla yüklendi')}
          />
        </div>
        <div>
          <h1 className="text-lg font-bold bg-clip-text text-transparent" style={{ backgroundImage: theme.gradient.main }}>{businessName} Satış Sistemi</h1>
          <p className="text-xs text-gray-500 font-medium">v2.4.5 DROJE SYSTEMS</p>
        </div>
        <div className="ml-4 pl-4 border-l border-gray-300">
          <DateTimeDisplay />
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <button
          onClick={handleOpenMobileModal}
          className="px-6 py-3 rounded-xl font-medium transition-all duration-300 bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:shadow-lg"
        >
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>Mobil Personel</span>
          </div>
        </button>
        <button
          onClick={() => setCurrentView('tables')}
          className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
            currentView === 'tables'
              ? 'text-white shadow-lg transform scale-105'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
          }`}
          style={currentView === 'tables' ? { backgroundImage: theme.gradient.main } : {}}
        >
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span>Masalar</span>
          </div>
        </button>
        <button
          onClick={() => setCurrentView('pos')}
          className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
            currentView === 'pos'
              ? 'text-white shadow-lg transform scale-105'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
          }`}
          style={currentView === 'pos' ? { backgroundImage: theme.gradient.main } : {}}
        >
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Satış Yap</span>
            {totalItems > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {totalItems}
              </span>
            )}
          </div>
        </button>

        {userType === 'Admin' && (
          <>
            <button
              onClick={() => setCurrentView('sales')}
              className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                currentView === 'sales'
                  ? 'text-white shadow-lg transform scale-105'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
              }`}
              style={currentView === 'sales' ? { backgroundImage: theme.gradient.main } : {}}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Satış Detayları</span>
              </div>
            </button>
            <button
              onClick={() => setShowSettingsSplash(true)}
              className="px-6 py-3 rounded-xl font-medium transition-all duration-300 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800"
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Ayarlar</span>
              </div>
            </button>
          </>
        )}

        <div className="relative ml-4 pl-4 border-l border-gray-300" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
          >
            <div className="text-right">
              <p className="text-xs text-gray-500">Kullanıcı Tipi</p>
              <p className="text-sm font-medium text-gray-800 flex items-center space-x-1">
                <span>{userType}</span>
                <svg className={`w-4 h-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </p>
            </div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              userType === 'Admin' 
                ? 'bg-gradient-to-br from-blue-500 to-cyan-500' 
                : 'bg-gradient-to-br from-green-500 to-emerald-500'
            }`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border overflow-hidden animate-fade-in z-[100]" style={{ borderColor: theme.primary200 }}>
              <div className="p-2">
                <button
                  onClick={() => handleUserTypeChange('Admin')}
                  className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-all ${
                    userType === 'Admin'
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold">Admin</p>
                    <p className="text-xs opacity-75">Tüm yetkilere sahip</p>
                  </div>
                  {userType === 'Admin' && (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => handleUserTypeChange('Personel')}
                  className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-all mt-2 ${
                    userType === 'Personel'
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold">Personel</p>
                    <p className="text-xs opacity-75">Satış yapabilir</p>
                  </div>
                  {userType === 'Personel' && (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="border-t border-gray-200 p-3 bg-gray-50">
                <p className="text-xs text-gray-600 text-center">
                  {userType === 'Admin' ? '🔐 Tüm özelliklere erişim' : '📋 Satış işlemleri'}
                </p>
              </div>

              {/* Çıkış Butonu - Panelin En Altı */}
              <div className="border-t border-gray-200 p-2">
                <button
                  onClick={() => setShowExitConfirm(true)}
                  className="w-full flex items-center justify-center space-x-2 p-3 rounded-xl hover:bg-red-50 transition-all duration-300 text-red-600 hover:text-red-700"
                  title="Çıkış Yap"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="font-semibold">Çıkış Yap</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Çıkış Onay Modal */}
      {showExitConfirm && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-start justify-center pt-8 z-[9999] animate-fade-in" style={{ zIndex: 9999 }}>
          <div className="bg-white/95 backdrop-blur-xl border-2 border-red-200 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl animate-scale-in">
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Çıkış Yap</h3>
              <p className="text-gray-600">Uygulamayı kapatmak istediğinize emin misiniz?</p>
            </div>
            
            <div className="flex space-x-4">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600 hover:text-gray-800 font-semibold text-lg transition-all duration-300"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  if (onExit) {
                    onExit();
                  }
                }}
                className="flex-1 py-4 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 rounded-xl text-white font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:scale-105 active:scale-95"
              >
                Evet, Çık
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PIN Modal */}
      {showPinModal && (
        <PinModal
          onClose={handlePinClose}
          onSuccess={handlePinSuccess}
          themeColor={themeColor}
        />
      )}

      {/* Settings Splash */}
      {showSettingsSplash && (
        <SettingsSplash
          onComplete={() => {
            setShowSettingsSplash(false);
            setShowSettingsModal(true);
          }}
          themeColor={themeColor}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          onProductsUpdated={onProductsUpdated}
          themeColor={themeColor}
        />
      )}

      {/* Mobil Personel Modal - Elite Corporate Design */}
      {showMobileModal && createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1000] animate-fade-in px-4 py-8">
          <div className="bg-white rounded-3xl w-full max-w-7xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] transform animate-scale-in relative overflow-hidden border border-gray-200 max-h-[90vh] flex flex-col">
            {/* Premium Top Border */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600"></div>
            
            {/* Close Button - Elite */}
            <button
              onClick={() => {
                setShowMobileModal(false);
                setQrCode(null);
                setServerURL('');
              }}
              className="absolute top-6 right-6 w-10 h-10 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-all duration-200 border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md z-10"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Header - Corporate */}
            <div className="px-10 pt-10 pb-6 border-b border-gray-200">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg border-2 border-white">
                  <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-gray-900 mb-1 tracking-tight">Mobil Personel Yönetimi</h3>
                  <p className="text-sm text-gray-600 font-medium">Personel ekleyin, yönetin ve QR kod oluşturun</p>
                </div>
              </div>
            </div>

            {/* Content Area - Scrollable */}
            <div className="flex-1 overflow-y-auto px-10 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column - Personel Listesi */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-xl font-bold text-gray-900 mb-1">Personel Listesi</h4>
                      <p className="text-sm text-gray-500">{staffList.length} personel</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={async () => {
                          setShowStaffAccountsModal(true);
                          await loadStaffAccounts();
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-500 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all duration-200 flex items-center space-x-2 shadow-md hover:shadow-xl"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span>Alacak/Verecek</span>
                      </button>
                      <button
                        onClick={() => setShowAddStaff(true)}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all duration-200 flex items-center space-x-2 shadow-md hover:shadow-xl"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Personel Ekle</span>
                      </button>
                    </div>
                  </div>
                  
                  {staffList.length === 0 ? (
                    <div className="bg-gray-50 rounded-xl p-8 text-center border-2 border-dashed border-gray-300">
                      <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p className="text-gray-600 font-medium mb-1">Henüz personel eklenmemiş</p>
                      <p className="text-xs text-gray-500">Yeni personel eklemek için yukarıdaki butonu kullanın</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {staffList.map((staff) => (
                        <div key={staff.id} className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 hover:shadow-md transition-all duration-200">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
                                <span className="text-white font-bold text-sm">
                                  {staff.name.charAt(0)}{staff.surname.charAt(0)}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-gray-900 text-sm mb-0.5 truncate">
                                  {staff.name} {staff.surname}
                                </p>
                                <p className="text-xs text-gray-500">ID: {staff.id}</p>
                              </div>
                            </div>
                          </div>
                          {staff.is_manager && (
                            <div className="mb-2">
                              <div className="inline-flex items-center space-x-1 px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold rounded-md shadow-sm">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span>MÜDÜR</span>
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <button
                              onClick={() => {
                                setEditingStaff(staff);
                                setNewPassword('');
                              }}
                              className="flex-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-all duration-200 border border-blue-200 hover:border-blue-300 min-w-[80px]"
                            >
                              Şifre
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const result = await window.electronAPI.setStaffManager(staff.id, !staff.is_manager);
                                  if (result.success) {
                                    await loadStaff();
                                    alert(staff.is_manager ? 'Müdürlük kaldırıldı' : 'Müdür olarak atandı');
                                  } else {
                                    alert('Hata: ' + (result.error || 'Bilinmeyen hata'));
                                  }
                                } catch (error) {
                                  console.error('Müdür atama hatası:', error);
                                  alert('Müdür atanamadı: ' + error.message);
                                }
                              }}
                              className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 min-w-[80px] ${
                                staff.is_manager
                                  ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 hover:border-red-300'
                                  : 'bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:from-amber-500 hover:to-orange-600 shadow-sm'
                              }`}
                            >
                              {staff.is_manager ? 'Müdürlük Kaldır' : 'MÜDÜR'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(staff.id)}
                              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition-all duration-200 border border-red-200 hover:border-red-300"
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column - Forms & QR Code */}
                <div className="space-y-6">
                  {/* Personel Ekleme Formu */}
                  {showAddStaff && (
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 space-y-4 border-2 border-blue-200 shadow-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-lg font-bold text-gray-900">Yeni Personel Ekle</h4>
                        <button
                          onClick={() => {
                            setShowAddStaff(false);
                            setNewStaff({ name: '', surname: '', password: '' });
                          }}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">İsim</label>
                          <input
                            type="text"
                            placeholder="Personel ismi"
                            value={newStaff.name}
                            onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Soyisim</label>
                          <input
                            type="text"
                            placeholder="Personel soyismi"
                            value={newStaff.surname}
                            onChange={(e) => setNewStaff({ ...newStaff, surname: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Şifre</label>
                          <input
                            type="password"
                            placeholder="Minimum 4 karakter"
                            value={newStaff.password}
                            onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all bg-white"
                          />
                        </div>
                        <div className="flex space-x-3 pt-2">
                          <button
                            onClick={handleAddStaff}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-200 shadow-md"
                          >
                            Ekle
                          </button>
                          <button
                            onClick={() => {
                              setShowAddStaff(false);
                              setNewStaff({ name: '', surname: '', password: '' });
                            }}
                            className="px-6 py-3 bg-white text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all duration-200 border-2 border-gray-300"
                          >
                            İptal
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Şifre Değiştirme Form */}
                  {editingStaff && (
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 space-y-4 border-2 border-blue-200 shadow-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-lg font-bold text-gray-900">Şifre Değiştir</h4>
                        <button
                          onClick={() => {
                            setEditingStaff(null);
                            setNewPassword('');
                          }}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-3">
                          <span className="font-bold text-gray-900">{editingStaff.name} {editingStaff.surname}</span> için yeni şifre belirleyin
                        </p>
                        <input
                          type="password"
                          placeholder="Yeni şifre (min. 4 karakter)"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdatePassword();
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={handleUpdatePassword}
                          className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-200 shadow-md"
                        >
                          Kaydet
                        </button>
                        <button
                          onClick={() => {
                            setEditingStaff(null);
                            setNewPassword('');
                          }}
                          className="px-6 py-3 bg-white text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all duration-200 border-2 border-gray-300"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  )}

                  {/* QR Kod Section */}
                  <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-lg">
                    <h4 className="text-lg font-bold text-gray-900 mb-4">QR Kod Bağlantısı</h4>
                    {qrCode ? (
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <div className="bg-white p-4 rounded-2xl border-4 border-blue-200 shadow-xl">
                            <img src={qrCode} alt="QR Code" className="w-56 h-56" />
                          </div>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border-2 border-blue-200">
                          <p className="text-xs font-semibold text-gray-600 mb-2 text-center uppercase tracking-wide">Veya bu adresi tarayıcıya yazın:</p>
                          <p className="text-xs font-mono text-blue-700 text-center break-all bg-white p-2 rounded-lg border border-blue-200">{serverURL}</p>
                        </div>
                        <div className="flex items-start space-x-2 bg-amber-50 border-2 border-amber-200 rounded-xl p-3">
                          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <p className="text-xs text-amber-800 font-medium">
                            Aynı WiFi ağına bağlı olduğunuzdan emin olun
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
                        <p className="text-sm text-gray-600 font-medium">QR kod oluşturuluyor...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Silme Onay Modal - Elite */}
            {deleteConfirm && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2000]">
                <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-gray-200">
                  <div className="flex items-center justify-center mb-6">
                    <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center border-2 border-red-200">
                      <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-center mb-6">
                    <h4 className="text-xl font-bold text-gray-900 mb-2">Personeli Sil</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">Bu personeli silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</p>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-8 py-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-xl transition-all duration-200 border-2 border-gray-300 hover:border-gray-400 min-w-[120px]"
                    >
                      İptal
                    </button>
                    <button
                      onClick={() => handleDeleteStaff(deleteConfirm)}
                      className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl transition-all duration-200 shadow-md hover:shadow-lg min-w-[120px]"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Personel Alacak/Verecek Modal */}
      {showStaffAccountsModal && createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1000] animate-fade-in px-4 py-8">
          <div className="bg-white rounded-3xl w-full max-w-5xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] transform animate-scale-in relative overflow-hidden border border-gray-200 max-h-[90vh] flex flex-col">
            {/* Premium Top Border */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600"></div>
            
            {/* Close Button */}
            <button
              onClick={() => {
                setShowStaffAccountsModal(false);
                setEditingAccount(null);
                setAccountAmount('');
                setAccountType('alacak');
              }}
              className="absolute top-6 right-6 w-10 h-10 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-all duration-200 border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md z-10"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Header */}
            <div className="px-10 pt-10 pb-6 border-b border-gray-200">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-green-500 rounded-2xl flex items-center justify-center shadow-lg border-2 border-white">
                  <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-gray-900 mb-1 tracking-tight">Personel Alacak/Verecek Yönetimi</h3>
                  <p className="text-sm text-gray-600 font-medium">Personellerin alacak ve verecek hesaplarını yönetin</p>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-10 py-6">
              {editingAccount ? (
                /* İşlem Ekleme Formu */
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl p-6 space-y-4 border-2 border-emerald-200 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-lg font-bold text-gray-900">
                      {editingAccount.staffName} - İşlem Ekle
                    </h4>
                    <button
                      onClick={() => {
                        setEditingAccount(null);
                        setAccountAmount('');
                        setAccountType('alacak');
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">İşlem Tipi</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setAccountType('alacak')}
                          className={`px-6 py-4 rounded-xl font-bold transition-all duration-200 ${
                            accountType === 'alacak'
                              ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg transform scale-105'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-2 border-emerald-200'
                          }`}
                        >
                          <div className="flex items-center justify-center space-x-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            <span>Alacak</span>
                          </div>
                        </button>
                        <button
                          onClick={() => setAccountType('verecek')}
                          className={`px-6 py-4 rounded-xl font-bold transition-all duration-200 ${
                            accountType === 'verecek'
                              ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg transform scale-105'
                              : 'bg-red-50 text-red-700 hover:bg-red-100 border-2 border-red-200'
                          }`}
                        >
                          <div className="flex items-center justify-center space-x-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                            </svg>
                            <span>Verecek</span>
                          </div>
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Tutar (₺)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={accountAmount}
                        onChange={(e) => setAccountAmount(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition-all bg-white text-lg font-semibold"
                      />
                    </div>
                    
                    <div className="flex space-x-3 pt-2">
                      <button
                        onClick={handleAddAccountTransaction}
                        className={`flex-1 px-6 py-3 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-200 shadow-md ${
                          accountType === 'alacak'
                            ? 'bg-gradient-to-r from-emerald-600 to-green-500'
                            : 'bg-gradient-to-r from-red-600 to-red-500'
                        }`}
                      >
                        Ekle
                      </button>
                      <button
                        onClick={() => {
                          setEditingAccount(null);
                          setAccountAmount('');
                          setAccountType('alacak');
                        }}
                        className="px-6 py-3 bg-white text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all duration-200 border-2 border-gray-300"
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Personel Hesapları Listesi */
                <div className="space-y-4">
                  {staffAccounts.length === 0 ? (
                    <div className="bg-gray-50 rounded-xl p-8 text-center border-2 border-dashed border-gray-300">
                      <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <p className="text-gray-600 font-medium mb-1">Henüz hesap kaydı yok</p>
                      <p className="text-xs text-gray-500">Personel hesapları yükleniyor...</p>
                    </div>
                  ) : (
                    staffAccounts.map((account) => {
                      const isPositive = account.balance > 0;
                      const isNegative = account.balance < 0;
                      const balanceColor = isPositive 
                        ? 'text-emerald-600' 
                        : isNegative 
                        ? 'text-red-600' 
                        : 'text-gray-600';
                      const balanceBg = isPositive
                        ? 'bg-emerald-50 border-emerald-200'
                        : isNegative
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200';
                      
                      return (
                        <div key={account.staffId} className={`bg-white border-2 rounded-2xl p-5 hover:shadow-lg transition-all duration-200 ${balanceBg}`}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${
                                isPositive
                                  ? 'bg-gradient-to-br from-emerald-500 to-green-600'
                                  : isNegative
                                  ? 'bg-gradient-to-br from-red-500 to-red-600'
                                  : 'bg-gradient-to-br from-gray-400 to-gray-500'
                              }`}>
                                <span className="text-white font-bold text-lg">
                                  {account.staffName.split(' ').map(n => n[0]).join('')}
                                </span>
                              </div>
                              <div>
                                <h4 className="font-bold text-gray-900 text-lg">{account.staffName}</h4>
                                <p className="text-xs text-gray-500">ID: {account.staffId}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500 mb-1">Bakiye</p>
                              <p className={`text-2xl font-bold ${balanceColor}`}>
                                {account.balance > 0 ? '+' : ''}{account.balance.toFixed(2)} ₺
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => {
                                setEditingAccount(account);
                                setAccountAmount('');
                                setAccountType('alacak');
                              }}
                              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-200 text-sm"
                            >
                              <div className="flex items-center justify-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span>Alacak Ekle</span>
                              </div>
                            </button>
                            <button
                              onClick={() => {
                                setEditingAccount(account);
                                setAccountAmount('');
                                setAccountType('verecek');
                              }}
                              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-200 text-sm"
                            >
                              <div className="flex items-center justify-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                </svg>
                                <span>Verecek Ekle</span>
                              </div>
                            </button>
                            <button
                              onClick={async () => {
                                if (window.confirm(`${account.staffName} için bakiyeyi sıfırlamak istediğinize emin misiniz? Tüm işlem geçmişi silinecektir.`)) {
                                  try {
                                    if (window.electronAPI && window.electronAPI.resetStaffAccount) {
                                      const result = await window.electronAPI.resetStaffAccount(account.staffId);
                                      if (result.success) {
                                        await loadStaffAccounts();
                                        setSuccessMessage(`${account.staffName} için bakiye sıfırlandı`);
                                        setShowSuccessToast(true);
                                        setTimeout(() => setShowSuccessToast(false), 3000);
                                      } else {
                                        alert('Hata: ' + (result.error || 'Bilinmeyen hata'));
                                      }
                                    } else {
                                      alert('Sıfırlama özelliği mevcut değil');
                                    }
                                  } catch (error) {
                                    console.error('Bakiye sıfırlama hatası:', error);
                                    alert('Bakiye sıfırlanamadı: ' + error.message);
                                  }
                                }
                              }}
                              className="px-4 py-2.5 bg-gradient-to-r from-gray-600 to-gray-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-200 text-sm"
                            >
                              <div className="flex items-center justify-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>Sıfırla</span>
                              </div>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modern Success Toast */}
      {showSuccessToast && (
        createPortal(
          <div className="fixed inset-x-0 top-0 z-[2000] flex justify-center pointer-events-none pt-6">
            <div className="bg-white/95 backdrop-blur-xl border-2 border-green-300 rounded-2xl shadow-2xl px-6 py-4 pointer-events-auto animate-toast-slide-down max-w-md mx-4">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg ring-4 ring-green-100 flex-shrink-0 animate-scale-in">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Başarılı</p>
                  <p className="text-lg font-bold text-gray-900">{successMessage}</p>
                </div>
                <button
                  onClick={() => setShowSuccessToast(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      )}
    </nav>
  );
};

export default Navbar;

