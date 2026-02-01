import React, { useState, useEffect } from 'react';
import { initImageCache, getCachedImage } from '../utils/imageCache';
import { isGeceDonercisi, isYakasGrill } from '../utils/sultanSomatTables';

const ProductGrid = ({ products, onAddToCart, tenantId, categories = [] }) => {
  const [imageUrls, setImageUrls] = useState({});
  const [cacheInitialized, setCacheInitialized] = useState(false);

  // Cache'i başlat
  useEffect(() => {
    initImageCache().then(() => {
      setCacheInitialized(true);
    }).catch(error => {
      console.error('Image cache init hatası:', error);
      setCacheInitialized(true); // Hata olsa bile devam et
    });
  }, []);

  // Ürün görsellerini cache'den yükle
  useEffect(() => {
    if (!cacheInitialized) return;

    const loadImages = async () => {
      const urlMap = {};
      
      // Tüm görselleri paralel yükle
      const imagePromises = products
        .filter(product => product.image)
        .map(async (product) => {
          try {
            const cachedUrl = await getCachedImage(product.image);
            if (cachedUrl) {
              urlMap[product.id] = cachedUrl;
            }
          } catch (error) {
            console.error(`Görsel yükleme hatası (${product.id}):`, error);
          }
        });

      await Promise.all(imagePromises);
      setImageUrls(prev => ({ ...prev, ...urlMap }));
    };

    loadImages();
  }, [products, cacheInitialized]);

  const isYakasGrillMode = tenantId && isYakasGrill(tenantId);
  const isGeceDonercisiMode = tenantId && isGeceDonercisi(tenantId);

  const normalizeTr = (input) => {
    try {
      return String(input || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return String(input || '').toLowerCase().trim();
    }
  };

  const getCategoryNameForProduct = (product) => {
    const direct =
      product?.categoryName ||
      product?.category_name ||
      product?.category?.name ||
      '';
    if (direct) return direct;
    const cid = product?.category_id;
    if (cid == null) return '';
    const found = (categories || []).find((c) => c && c.id === cid);
    return found?.name || '';
  };

  const getGeceLavasOverrideImage = (product) => {
    if (!isGeceDonercisiMode) return '';
    const cat = normalizeTr(getCategoryNameForProduct(product));
    const name = normalizeTr(product?.name || '');
    if (!name.includes('lavas')) return '';
    if (cat === 'tavuk doner') return '/lavas.jpg';
    if (cat === 'et doner') return '/etlav.jpg';
    return '';
  };
  
  // Yaka's Grill için daha büyük kartlar (daha az sütun)
  const gridCols = isGeceDonercisiMode
    ? '' // Gece Dönercisi: auto-fit ile her ekranda büyük kartlar
    : isYakasGrillMode
      ? 'grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
      : 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-10';
  const gapClass = isGeceDonercisiMode ? 'gap-5 md:gap-6' : (isYakasGrillMode ? 'gap-4' : 'gap-2');
  
  return (
    <div className="flex-1 overflow-y-auto scrollbar-custom">
      <div
        className={`grid ${gridCols} ${gapClass} pb-4`}
        style={
          isGeceDonercisiMode
            ? { gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }
            : undefined
        }
      >
        {products.map((product) => {
          const cachedImageUrl = imageUrls[product.id] || product.image;
          const overrideImageUrl = getGeceLavasOverrideImage(product);
          const resolvedImageUrl = overrideImageUrl || cachedImageUrl;
          // Sadece stok takibi yapılan ürünler için kontrol et
          const trackStock = product.trackStock === true;
          const stock = trackStock && product.stock !== undefined ? (product.stock || 0) : null;
          const isOutOfStock = trackStock && stock !== null && stock === 0;
          
          return (
            <div
              key={product.id}
              onClick={() => !isOutOfStock && onAddToCart(product)}
              className={`${isGeceDonercisiMode ? 'product-card-gece' : 'product-card'} animate-fade-in touch-manipulation ${isOutOfStock ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className={isGeceDonercisiMode
                ? 'aspect-square bg-slate-50 rounded-3xl mb-4 flex items-center justify-center overflow-hidden relative group border border-slate-200 shadow-sm'
                : 'aspect-square bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg mb-1.5 flex items-center justify-center overflow-hidden relative group'
              }>
                {resolvedImageUrl ? (
                  <img 
                    src={resolvedImageUrl} 
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                    loading="lazy"
                    onError={(e) => {
                      // Hata durumunda görseli gizle
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="text-center">
                    <svg className={`mx-auto ${isGeceDonercisiMode ? 'text-slate-300 mb-2 w-20 h-20' : `text-purple-300 mb-1 ${isYakasGrillMode ? 'w-14 h-14' : 'w-10 h-10'}`}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <p className={`${isGeceDonercisiMode ? 'text-slate-400 text-xs font-semibold' : `text-purple-400 ${isYakasGrillMode ? 'text-xs' : 'text-[10px]'}`}`}>Görsel</p>
                  </div>
                )}
                <div className={`absolute inset-0 ${isGeceDonercisiMode ? 'bg-gradient-to-t from-slate-900/75 to-transparent' : 'bg-gradient-to-t from-purple-600/80 to-transparent'} opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-4`}>
                  <span className={`text-white font-semibold ${isGeceDonercisiMode ? 'text-sm' : (isYakasGrillMode ? 'text-sm' : 'text-xs')}`}>Sepete Ekle +</span>
                </div>
              </div>
              
              <h3 className={
                isGeceDonercisiMode
                  ? 'product-name-gece mb-3'
                  : `font-semibold text-gray-800 mb-1 truncate leading-tight ${isYakasGrillMode ? 'text-sm' : 'text-xs'}`
              } title={product.name}>{product.name}</h3>
              <div className="flex items-center justify-between">
                {isGeceDonercisiMode ? (
                  <span className="product-price-gece">
                    ₺{product.price.toFixed(2)}
                  </span>
                ) : (
                  <span className={`font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent ${isYakasGrillMode ? 'text-base' : 'text-sm'}`}>
                    ₺{product.price.toFixed(2)}
                  </span>
                )}
                {isOutOfStock ? (
                  <span className={`font-bold text-red-600 bg-red-100 px-2 py-1 rounded ${isGeceDonercisiMode ? 'text-sm' : (isYakasGrillMode ? 'text-sm' : 'text-xs')}`}>
                    Kalmadı
                  </span>
                ) : (
                  isGeceDonercisiMode ? (
                    <button className="bg-slate-900 rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-colors w-12 h-12">
                      <svg className="text-white w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  ) : (
                    <button className={`bg-gradient-to-r from-purple-500 to-pink-500 rounded flex items-center justify-center hover:scale-110 transition-transform ${isYakasGrillMode ? 'w-7 h-7' : 'w-5 h-5'}`}>
                      <svg className={`text-white ${isYakasGrillMode ? 'w-4 h-4' : 'w-3 h-3'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProductGrid;
