import React from 'react';

const ProductGrid = ({ products, onAddToCart }) => {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-custom">
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-10 gap-2 pb-4">
        {products.map((product) => (
          <div
            key={product.id}
            onClick={() => onAddToCart(product)}
            className="product-card animate-fade-in"
          >
            <div className="aspect-square bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg mb-1.5 flex items-center justify-center overflow-hidden relative group">
              {product.image ? (
                <img 
                  src={product.image} 
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                />
              ) : (
                <div className="text-center">
                  <svg className="w-10 h-10 mx-auto text-purple-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <p className="text-[10px] text-purple-400">Görsel</p>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-purple-600/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-2">
                <span className="text-white font-medium text-xs">Sepete Ekle +</span>
              </div>
            </div>
            
            <h3 className="font-semibold text-gray-800 mb-1 truncate text-xs leading-tight">{product.name}</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                ₺{product.price.toFixed(2)}
              </span>
              <button className="w-5 h-5 bg-gradient-to-r from-purple-500 to-pink-500 rounded flex items-center justify-center hover:scale-110 transition-transform">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductGrid;

