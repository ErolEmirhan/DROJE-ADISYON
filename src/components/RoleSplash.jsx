import React from 'react';
import { createPortal } from 'react-dom';

const roleStyles = {
  Admin: 'bg-blue-600',
  Personel: 'bg-emerald-500'
};

const RoleSplash = ({ role }) => {
  if (!role) return null;

  const bg = roleStyles[role] || 'bg-gray-800';

  return createPortal(
    <div className={`${bg} fixed inset-0 flex items-center justify-center z-[1999] animate-fade-in`}>
      <span className="text-white text-6xl md:text-7xl font-black tracking-[0.4em] animate-pulse">
        {role.toUpperCase()}
      </span>
    </div>,
    document.body
  );
};

export default RoleSplash;

