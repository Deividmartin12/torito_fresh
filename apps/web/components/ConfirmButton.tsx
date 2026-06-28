"use client";

import { ReactNode } from "react";

export function ConfirmButton({
  children,
  message,
  className = "btn-secondary",
  onConfirm,
}: {
  children: ReactNode;
  message: string;
  className?: string;
  onConfirm: () => void;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (window.confirm(message)) onConfirm();
      }}
    >
      {children}
    </button>
  );
}
