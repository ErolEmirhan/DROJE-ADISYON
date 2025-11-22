import React from 'react';

const CategoryPanel = ({ categories, selectedCategory, onSelectCategory }) => {
  return (
    <div className="mb-6">
      <div className="mb-6 pb-4 relative">
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 rounded-full shadow-sm"></div>
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-3xl font-extrabold bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
              Kategoriler
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Ürün kategorilerini seçin</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category)}
            className={`category-btn ${
              selectedCategory?.id === category.id
                ? 'category-btn-active'
                : 'category-btn-inactive'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CategoryPanel;

