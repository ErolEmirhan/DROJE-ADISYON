import React, { useMemo } from 'react';
import { getThemeColors } from '../utils/themeUtils';

const CategoryPanel = ({ categories, selectedCategory, onSelectCategory, themeColor = '#f97316' }) => {
  // Tema renklerini hesapla
  const theme = useMemo(() => getThemeColors(themeColor), [themeColor]);
  return (
    <div className="mb-4">
      <div className="mb-3 pb-2 relative">
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full shadow-sm" style={{ backgroundImage: theme.gradient.horizontal }}></div>
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-md" style={{ backgroundImage: theme.gradient.main }}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold bg-clip-text text-transparent" style={{ backgroundImage: theme.gradient.main }}>
              Kategoriler
            </h2>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2">
        {categories.map((category, index) => {
          const isSelected = selectedCategory?.id === category.id;
          
          return (
            <button
              key={category.id}
              onClick={() => onSelectCategory(category)}
              className={`
                group relative overflow-hidden rounded-xl py-2.5 px-3 transition-all duration-200 transform
                ${isSelected 
                  ? 'bg-white border-2 shadow-md scale-105' 
                  : 'bg-white border border-gray-200 text-gray-800 hover:shadow-md hover:scale-105 active:scale-95'
                }
              `}
              style={isSelected ? { borderColor: theme.primary500 } : { borderColor: '#e5e7eb' }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = theme.primary300;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }
              }}
            >
              {/* Content */}
              <div className="relative z-10 flex items-center justify-center w-full">
                {/* Category Name */}
                <div className="text-center w-full">
                  <span className={`
                    font-extrabold text-xs italic transition-all duration-200 leading-tight
                    ${isSelected ? '' : 'text-gray-800'}
                  `} style={{ 
                    fontFamily: 'Montserrat, sans-serif', 
                    fontWeight: 900,
                    color: isSelected ? theme.primary600 : undefined
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.color = theme.primary600;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.color = '#1f2937';
                    }
                  }}
                  >
                    {category.name}
                  </span>
                </div>
              </div>
              
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: theme.primary500 }}></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryPanel;

