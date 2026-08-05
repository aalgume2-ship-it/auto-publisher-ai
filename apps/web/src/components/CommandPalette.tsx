'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, LayoutDashboard, RadioTower, Sparkles, FolderKanban, MenuSquare, CreditCard, UserCircle2, Settings2, ArrowLeft } from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  labelEn: string;
  icon: React.ComponentType<{ size?: number }>;
  href: string;
  group: string;
  keywords?: string[];
}

const COMMANDS: CommandItem[] = [
  { id: 'dashboard', label: 'الرئيسية', labelEn: 'Dashboard', icon: LayoutDashboard, href: '/dashboard/', group: 'Navigation', keywords: ['home', 'main'] },
  { id: 'studio', label: 'الاستوديو', labelEn: 'Studio', icon: Sparkles, href: '/dashboard/series/', group: 'Navigation', keywords: ['series', 'create', 'video'] },
  { id: 'assets', label: 'الأصول', labelEn: 'Assets', icon: FolderKanban, href: '/dashboard/assets/', group: 'Navigation', keywords: ['media', 'files', 'library'] },
  { id: 'channels', label: 'القنوات', labelEn: 'Channels', icon: RadioTower, href: '/dashboard/channels/', group: 'Navigation', keywords: ['youtube', 'social'] },
  { id: 'publishing', label: 'النشر', labelEn: 'Publishing', icon: MenuSquare, href: '/dashboard/posts/', group: 'Navigation', keywords: ['schedule', 'queue', 'publish'] },
  { id: 'billing', label: 'الفوترة', labelEn: 'Billing', icon: CreditCard, href: '/dashboard/billing/', group: 'Navigation', keywords: ['payment', 'plan', 'subscription'] },
  { id: 'admin', label: 'الإدارة', labelEn: 'Admin', icon: UserCircle2, href: '/dashboard/admin/', group: 'Navigation', keywords: ['workspace', 'settings'] },
  { id: 'settings', label: 'الإعدادات', labelEn: 'Settings', icon: Settings2, href: '/dashboard/settings/', group: 'Navigation', keywords: ['config', 'integrations', 'api'] },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return COMMANDS;
    const q = query.toLowerCase().trim();
    return COMMANDS.filter((cmd) => {
      if (cmd.label.toLowerCase().includes(q)) return true;
      if (cmd.labelEn.toLowerCase().includes(q)) return true;
      if (cmd.keywords?.some((k) => k.includes(q))) return true;
      return false;
    });
  }, [query]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [filtered]);

  const flatItems = useMemo(() => filtered, [filtered]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const navigate = useCallback((href: string) => {
    onClose();
    router.push(href);
  }, [onClose, router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && flatItems[selectedIndex]) {
      e.preventDefault();
      navigate(flatItems[selectedIndex].href);
    }
  }, [flatItems, selectedIndex, navigate, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="cmd-panel glass-card" onClick={(e) => e.stopPropagation()} dir="ltr">
        <div className="cmd-input-wrap">
          <Search size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="cmd-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, navigate..."
            aria-label="Search commands"
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </div>
        <div className="cmd-results" ref={listRef}>
          {flatItems.length === 0 ? (
            <div className="cmd-empty">
              <p>No results for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="cmd-group">
                <p className="cmd-group-label">{group}</p>
                {items.map((item) => {
                  const Icon = item.icon;
                  const idx = flatItems.indexOf(item);
                  const isActive = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      className={`cmd-item${isActive ? ' active' : ''}`}
                      onClick={() => navigate(item.href)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <Icon size={16} />
                      <span className="cmd-item-label">{item.labelEn}</span>
                      <span className="cmd-item-sub">{item.label}</span>
                      <ArrowLeft size={14} style={{ opacity: 0.4 }} />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmd-footer">
          <span><kbd className="cmd-kbd-sm">↑↓</kbd> Navigate</span>
          <span><kbd className="cmd-kbd-sm">↵</kbd> Open</span>
          <span><kbd className="cmd-kbd-sm">ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

/** Hook: Cmd/Ctrl+K opens the palette. Returns { open, setOpen } */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { open, setOpen };
}
