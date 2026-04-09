'use client';

import type { CSSProperties, ReactNode } from 'react';
import './styles.scss';

export interface ButtonProps {
  onClick?: () => void;
  id?: string;
  sx?: CSSProperties;
  children?: ReactNode;
}

export default function Button({ onClick, children, id, sx }: ButtonProps) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      style={sx}
      className="base-button"
    >
      {children}
    </button>
  );
}
