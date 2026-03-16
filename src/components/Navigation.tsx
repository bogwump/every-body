import React from 'react';
import { Home, Calendar, TrendingUp, History as HistoryIcon, Moon, User } from 'lucide-react';

import appLogo from '../assets/everybody-logo-256.png';

interface NavigationProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'rhythm', label: 'Rhythm', icon: Moon },
  { id: 'insights', label: 'Insights', icon: TrendingUp },
  { id: 'history', label: 'History', icon: HistoryIcon },
  { id: 'profile', label: 'Profile', icon: User }
];

export function Navigation({ currentScreen, onNavigate }: NavigationProps) {
  return (
    <>
      {/* Mobile Navigation */}
      <nav className="eb-mobile-nav fixed bottom-0 left-0 right-0 border-t border-[rgb(var(--color-border)/0.9)] bg-[rgb(var(--color-surface)/0.88)] backdrop-blur-xl md:hidden z-50 shadow-[0_-8px_24px_rgba(31,41,55,0.08)]">
        <div className="flex items-center justify-around px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex min-w-[4.25rem] flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl transition-all ${
                  isActive
                    ? 'text-[rgb(var(--color-primary-dark))] bg-[rgb(var(--color-primary)/0.12)] shadow-[0_8px_20px_rgba(31,41,55,0.06)]'
                    : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]'
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${isActive ? 'bg-white/70' : 'bg-[rgb(var(--color-background)/0.92)]'}`}><Icon className="w-4 h-4" /></span>
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {/* Desktop Navigation */}
      <nav className="hidden md:block fixed left-0 top-0 bottom-0 w-64 bg-[rgb(var(--color-surface)/0.94)] backdrop-blur-xl border-r border-[rgb(var(--color-border)/0.9)] z-50 shadow-[8px_0_28px_rgba(31,41,55,0.05)]">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="eb-appicon w-10 h-10 p-1">
              <img src={appLogo} alt="EveryBody" className="w-full h-full" />
            </div>
            <h2 className="eb-title">EveryBody</h2>
          </div>
          <div className="space-y-2 rounded-[1.75rem] border border-[rgb(var(--color-border)/0.8)] bg-[rgb(var(--color-background)/0.58)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                    isActive
                      ? 'text-[rgb(var(--color-primary-dark))] bg-white shadow-[0_8px_20px_rgba(31,41,55,0.06)]'
                      : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))] hover:bg-white/65'
                  }`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${isActive ? 'bg-[rgb(var(--color-primary)/0.12)]' : 'bg-white/80'}`}><Icon className="w-4 h-4" /></span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}