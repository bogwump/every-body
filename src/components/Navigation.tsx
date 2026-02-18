import React from 'react';
import { Home, Calendar, TrendingUp, MessageCircle, Moon, User } from 'lucide-react';

import appLogo from '../assets/everybody-logo-256.png';

interface NavigationProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'resources', label: 'Rhythm', icon: Moon },
  { id: 'insights', label: 'Insights', icon: TrendingUp },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'profile', label: 'Profile', icon: User }
];

export function Navigation({ currentScreen, onNavigate }: NavigationProps) {
  return (
    <>
      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[rgb(var(--color-surface)/0.92)] backdrop-blur-xl border-t border-[rgb(228_228_231_/_0.7)] md:hidden z-50">
        <div className="flex items-center justify-around px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all  ${
                  isActive
                    ? 'text-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)/0.10)]'
                    : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {/* Desktop Navigation */}
      <nav className="hidden md:block fixed left-0 top-0 bottom-0 w-64 bg-[rgb(var(--color-surface))] border-r border-[rgb(228_228_231_/_0.7)] z-50">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="eb-appicon w-10 h-10 p-1">
              <img src={appLogo} alt="EveryBody" className="w-full h-full" />
            </div>
            <h2 className="eb-title">EveryBody</h2>
          </div>
          <div className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive
                      ? 'text-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)/0.10)]'
                      : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))] hover:bg-[rgba(0,0,0,0.03)]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
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