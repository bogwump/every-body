import React from 'react';
import { Home, Calendar, TrendingUp, MessageCircle, BookOpen, User } from 'lucide-react';

interface NavigationProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'check-in', label: 'Check-in', icon: Calendar },
  { id: 'insights', label: 'Insights', icon: TrendingUp },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'resources', label: 'Learn', icon: BookOpen },
  { id: 'profile', label: 'Profile', icon: User },
];

export function Navigation({ currentScreen, onNavigate }: NavigationProps) {
  return (
    <>
      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden z-50">
        <div className="mx-auto max-w-3xl px-3 pb-3">
          <div className="flex items-center justify-around rounded-2xl border border-neutral-200/70 bg-white/85 backdrop-blur shadow-sm px-2 py-2">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all active:scale-[0.99] ${
                  isActive
                    ? 'text-white bg-[rgb(var(--color-primary))] shadow-sm'
                    : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))] hover:bg-neutral-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
          </div>
        </div>
      </nav>
      {/* Desktop Navigation */}
      <nav className="hidden md:block fixed left-0 top-0 bottom-0 w-64 bg-white/85 backdrop-blur border-r border-neutral-200/70 z-50">
        <div className="p-6">
          <div className="mb-8">
            <h2 className="text-xl font-semibold tracking-tight">EveryBody</h2>
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">Your daily check-in, made simple.</p>
          </div>
          <div className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all active:scale-[0.99] ${
                    isActive
                      ? 'bg-[rgb(var(--color-primary))] text-white shadow-sm'
                      : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))] hover:bg-neutral-50'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-[rgb(var(--color-text-secondary))]'}`} />
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