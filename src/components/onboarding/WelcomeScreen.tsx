import React, { useRef, useState } from 'react';

import { importBackupFile, looksLikeInsightsExport, parseBackupJson } from '../../lib/backup';

import appLogo from '../../assets/everybody-logo-512.png';

interface WelcomeScreenProps {
  onContinue: (name: string) => void;
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const [name, setName] = useState('');
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const handleRestoreClick = () => {
    backupInputRef.current?.click();
  };

  const handleRestoreFile = async (file: File) => {
    const raw = await file.text();
    const parsed = parseBackupJson(raw);
    if (!parsed) {
      alert(
        looksLikeInsightsExport(raw)
          ? `That file is an Insights export. It cannot be restored as a full backup.\n\nTo restore, choose a file named everybody-backup-YYYY-MM-DD.json.`
          : `That backup file does not look valid.\n\nTo restore, choose a file named everybody-backup-YYYY-MM-DD.json.`
      );
      return;
    }
    importBackupFile(parsed);
    // Reload so the app starts with the restored state (skips onboarding)
    window.location.reload();
  };


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
          <div className="eb-appicon inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 p-2">
            <img src={appLogo} alt="EveryBody" className="w-full h-full" />
          </div>
          <h1 className="mb-4">Welcome to EveryBody</h1>
          <p className="text-lg">A calm place to track symptoms and spot patterns, one day at a time</p>
        </div>
        <div className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm mb-2 text-[rgb(var(--color-text))]">
              What should we call you?
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
              placeholder="Enter your name"
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

          <button
            type="button"
            onClick={handleRestoreClick}
            className="w-full py-4 rounded-xl border border-neutral-200 bg-white text-[rgb(var(--color-text))] hover:bg-neutral-50 transition-all duration-200 font-medium"
          >
            Restore from backup
          </button>

          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void handleRestoreFile(f);
              // allow choosing the same file again
              e.currentTarget.value = '';
            }}
          />
        </div>
        <p className="text-sm text-center mt-8 text-[rgb(var(--color-text-secondary))]">
          Your data is private and secure
        </p>
      </div>
    </div>
  );
}