import React from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import type { ColorTheme } from '../../types';

interface ColorThemeSelectionProps {
  selectedTheme: ColorTheme;
  onSelectTheme: (theme: ColorTheme) => void;
  onComplete: () => void;
  onBack: () => void;
}

const themes = [
  {
    id: 'sage' as ColorTheme,
    name: 'Sage',
    description: 'Calm and grounding',
    primary: 'rgb(132, 155, 130)',
    light: 'rgb(169, 189, 167)',
    accent: 'rgb(203, 186, 159)',
  },
  {
    id: 'lavender' as ColorTheme,
    name: 'Lavender',
    description: 'Gentle and soothing',
    primary: 'rgb(156, 136, 177)',
    light: 'rgb(190, 175, 207)',
    accent: 'rgb(217, 186, 203)',
  },
  {
    id: 'ocean' as ColorTheme,
    name: 'Ocean',
    description: 'Clear and refreshing',
    primary: 'rgb(115, 155, 175)',
    light: 'rgb(158, 191, 207)',
    accent: 'rgb(186, 216, 217)',
  },
  {
    id: 'terracotta' as ColorTheme,
    name: 'Terracotta',
    description: 'Warm and nurturing',
    primary: 'rgb(190, 130, 110)',
    light: 'rgb(215, 170, 155)',
    accent: 'rgb(225, 195, 170)',
  },
];

export function ColorThemeSelection({
  selectedTheme,
  onSelectTheme,
  onComplete,
  onBack,
}: ColorThemeSelectionProps) {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="mb-8 flex items-center gap-2 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))] transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
        <div className="mb-12">
          <h1 className="mb-4">Choose your theme</h1>
          <p className="text-lg">
            Select colors that feel right for you. You can change this anytime
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          {themes.map((theme) => {
            const isSelected = selectedTheme === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => onSelectTheme(theme.id)}
                className={`p-6 rounded-2xl border-2 text-left transition-all duration-200 hover:scale-[1.02] ${
                  isSelected
                    ? 'border-[rgb(var(--color-primary))] bg-white shadow-lg'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex gap-2">
                    <div
                      className="w-10 h-10 rounded-lg"
                      style={{ backgroundColor: theme.primary }}
                    />
                    <div
                      className="w-10 h-10 rounded-lg"
                      style={{ backgroundColor: theme.light }}
                    />
                    <div
                      className="w-10 h-10 rounded-lg"
                      style={{ backgroundColor: theme.accent }}
                    />
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-[rgb(var(--color-primary))] flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <h3 className="mb-1">{theme.name}</h3>
                <p className="text-sm">{theme.description}</p>
              </button>
            );
          })}
        </div>
        <button
          onClick={onComplete}
          className="w-full py-4 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all duration-200 font-medium"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}