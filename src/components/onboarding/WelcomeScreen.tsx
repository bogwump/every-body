import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

interface WelcomeScreenProps {
  onContinue: (name: string) => void;
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onContinue(name.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[rgba(var(--color-primary),0.1)] mb-6">
            <Sparkles className="w-8 h-8 text-[rgb(var(--color-primary))]" />
          </div>
          <h1 className="mb-4">Welcome to EveryBody</h1>
          <p className="text-lg">
            Your friendly companion for spotting patterns and feeling more in control
          </p>
        </div>
        <div className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm mb-2 text-[rgb(var(--color-text))]">
              What should I call you?
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && name.trim()) {
                  handleSubmit(e);
                }
              }}
              placeholder="Your name (optional)"
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary))] focus:border-transparent bg-white transition-all"
              autoFocus
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="w-full py-4 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
          >
            Continue
          </button>
        </div>
        <p className="text-sm text-center mt-8 text-[rgb(var(--color-text-secondary))]">
          Your data is private and secure
        </p>
      </div>
    </div>
  );
}