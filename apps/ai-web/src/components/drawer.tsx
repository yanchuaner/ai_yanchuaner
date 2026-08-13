"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./drawer.module.css";

type DrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Drawer({ open, title, onClose, children }: DrawerProps) {
  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <aside
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className={styles.header}>
          <strong>{title}</strong>
          <button className={styles.close} type="button" onClick={onClose} aria-label="关闭">
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>
  );
}
