import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Send, Bot, Clock } from 'lucide-react';
import type { CheckInEntry, UserData } from '../types';
import { filterByDays, mean } from '../lib/analytics';
import { COMPANION_NAME, useChat, useEntries } from '../lib/appStore';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface AIChatProps {
  userName: string;
  userData: UserData;
}

function stripLegacyDisclaimer(text: string): string {
  // Earlier builds appended a long disclaimer into every AI message.
  // We keep the single footer disclaimer in the UI instead.
  const lines = text.split('\n');
  const cleaned = lines.filter((l) => {
    const s = l.trim();
    if (!s) return true;
    if (s.startsWith('Supportive, not medical.')) return false;
    if (s.includes('If something feels severe') && (s.includes('GP') || s.includes('pharmacist'))) return false;
    return true;
  });
  return cleaned.join('\n').trimEnd();
}

function hasNumeric(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function summarise(entries: CheckInEntry[]) {
  const last7 = filterByDays(entries, 7);
  const avgSleep = mean(last7.map((e) => e.values.sleep).filter(hasNumeric));
  const avgEnergy = mean(last7.map((e) => e.values.energy).filter(hasNumeric));
  const avgStress = mean(last7.map((e) => e.values.stress).filter(hasNumeric));
  return {
    daysTracked: entries.length,
    daysTracked7: last7.length,
    avgSleep: Number.isFinite(avgSleep) ? Math.round(avgSleep) : null,
    avgEnergy: Number.isFinite(avgEnergy) ? Math.round(avgEnergy) : null,
    avgStress: Number.isFinite(avgStress) ? Math.round(avgStress) : null,
  };
}

function buildSuggestedQuestions(cycleEnabled: boolean): string[] {
  const base = [
    'What patterns do you notice in my last week?',
    'Why might I feel tired lately?',
    'How can I support sleep and energy?',
    'What could be increasing my stress?',
  ];
  if (cycleEnabled) {
    base.splice(1, 0, 'How do symptoms usually change across the month?');
  } else {
    base.splice(1, 0, 'How can I track symptoms without a cycle?');
  }
  return base;
}

function buildFollowUpQuestions(userMessage: string, cycleEnabled: boolean, daysTracked7: number): string[] {
  const lower = userMessage.toLowerCase();

  // Keep it short and practical. 1–3 max.
  if (lower.includes('pattern') || lower.includes('last week')) {
    if (daysTracked7 < 3) {
      return ['What’s the easiest check-in to do daily?', 'What should I track first for quick insights?'];
    }
    return [
      cycleEnabled ? 'Is any of this linked to my cycle phase?' : 'How can I track patterns without a cycle?',
      'What’s one small change I could try this week?',
    ];
  }

  if (lower.includes('tired') || lower.includes('energy') || lower.includes('fatigue')) {
    return ['Could sleep be driving this?', 'What 3-day experiment should I try?', cycleEnabled ? 'Does this change across the month?' : 'What patterns should I watch for?'];
  }

  if (lower.includes('stress') || lower.includes('anxiety')) {
    return ['What’s the quickest way to lower stress today?', 'How can I protect my sleep this week?', 'What might be triggering this?'];
  }

  if (lower.includes('sleep')) {
    return ['What should I change first for better sleep?', 'Is stress affecting my sleep?', 'What does my sleep trend look like?'];
  }

  if (lower.includes('pms') || lower.includes('luteal') || lower.includes('period')) {
    return [cycleEnabled ? 'What symptoms tend to cluster before a period?' : 'Should I turn cycle tracking on?', 'What helps most people with these symptoms?', 'What can I try next cycle?'];
  }

  // Default gentle prompts.
  return ['What patterns do you notice in my last week?', 'How do symptoms usually change over time?', 'What should I focus on first?'];
}

type EveReply = { answer: string; suggestions?: string[]; safety_note?: string };

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function score01(v: number, max = 10): number {
  if (!Number.isFinite(v)) return 0;
  return clamp01(v / max);
}

function formatDay(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString([], { weekday: 'short' });
  } catch {
    return iso;
  }
}

function pickTopBy<T>(items: T[], score: (t: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const it of items) {
    const s = score(it);
    if (s > bestScore) {
      best = it;
      bestScore = s;
    }
  }
  return best;
}

function localCompanionReply(userMessage: string, entries: CheckInEntry[], cycleEnabled: boolean): EveReply {
  const lower = userMessage.toLowerCase();
  const last7 = filterByDays(entries, 7);
  const last14 = filterByDays(entries, 14);

  const hasEnough = last7.length >= 4;
  const hasSome = last7.length >= 2;

  const moodVals = last14.map((e) => e.mood).filter((m): m is 1 | 2 | 3 => m === 1 || m === 2 || m === 3);
  const sleepVals = last14.map((e) => e.values.sleep).filter(hasNumeric);
  const energyVals = last14.map((e) => e.values.energy).filter(hasNumeric);
  const stressVals = last14.map((e) => e.values.stress).filter(hasNumeric);
  const brainFogVals = last14.map((e) => e.values.brainFog).filter(hasNumeric);
  const fatigueVals = last14.map((e) => e.values.fatigue).filter(hasNumeric);

  const avgSleep = mean(sleepVals);
  const avgEnergy = mean(energyVals);
  const avgStress = mean(stressVals);
  const avgMood = mean(moodVals);

  const keyFocus = (() => {
    if (lower.includes('sleep')) return 'sleep';
    if (lower.includes('energy') || lower.includes('tired') || lower.includes('fatigue')) return 'energy';
    if (lower.includes('stress') || lower.includes('anxiety')) return 'stress';
    if (lower.includes('brain fog') || lower.includes('fog')) return 'brainFog';
    if (lower.includes('night') || lower.includes('sweat')) return 'nightSweats';
    if (lower.includes('cycle') || lower.includes('period') || lower.includes('pms') || lower.includes('luteal')) return 'cycle';
    return 'patterns';
  })();

  // Lightweight "joining the dots" patterns.
  const patterns: string[] = [];
  if (hasSome) {
    const lowSleepDays = last14.filter((e) => hasNumeric(e.values.sleep) && (e.values.sleep as number) <= 4);
    const highStressDays = last14.filter((e) => hasNumeric(e.values.stress) && (e.values.stress as number) >= 7);
    const highBrainFogDays = last14.filter((e) => hasNumeric(e.values.brainFog) && (e.values.brainFog as number) >= 7);

    if (lowSleepDays.length >= 2 && (fatigueVals.length || energyVals.length)) {
      patterns.push(
        `On days where sleep looks lower, fatigue/energy tends to swing more. If you want, we can watch whether better sleep lines up with steadier energy.`
      );
    }
    if (highStressDays.length >= 2) {
      patterns.push(`I’m seeing a couple of higher-stress days in your recent check-ins. Often stress shows up next in sleep or focus.`);
    }
    if (highBrainFogDays.length >= 2) {
      patterns.push(`Brain fog has spiked on a couple of days. We can test if it clusters with low sleep, high stress, or certain cycle phases.`);
    }
  }

  const strongest = pickTopBy(last14, (e) => {
    const s = score01(e.values.stress ?? 0);
    const f = score01(e.values.fatigue ?? 0);
    const b = score01(e.values.brainFog ?? 0);
    return s + f + b;
  });

  const joinDotsLead = hasEnough
    ? 'Want help joining the dots?'
    : 'Want help getting the first few dots on the page?';

  const lowDataNudge =
    last7.length < 3
      ? `You don’t have many check-ins in the last week yet. If you log a couple more days, I can be much more confident about patterns.`
      : '';

  const oneLineSnapshot = (() => {
    const bits: string[] = [];
    if (Number.isFinite(avgSleep)) bits.push(`sleep feels about ${Math.round(avgSleep)}/10 lately`);
    if (Number.isFinite(avgEnergy)) bits.push(`energy about ${Math.round(avgEnergy)}/10`);
    if (Number.isFinite(avgStress)) bits.push(`stress about ${Math.round(avgStress)}/10`);
    if (Number.isFinite(avgMood)) bits.push(`mood about ${Math.round(avgMood)}/3`);
    if (!bits.length) return '';
    return `Quick snapshot (last ~2 weeks): ${bits.join(', ')}.`;
  })();

  const cycleLine = cycleEnabled
    ? `If you’re tracking cycle days, we can also look for phase patterns (for example, whether sleep or mood shifts before a bleed).`
    : `If you don’t want cycle tracking, that’s fine. We can still find patterns just from sleep, mood, energy, and stress.`;

  const actionIdeas = (() => {
    // Keep these gentle and "some people try".
    if (keyFocus === 'sleep') {
      return `Some people try a simple 3-night experiment: same bedtime window, dim screens 45 minutes before, and a short wind-down (shower, stretch, or audio). Want to pick one to test?`;
    }
    if (keyFocus === 'energy') {
      return `Some people find it helps to pick one lever for 3 days: morning daylight, a protein-first breakfast, or a 10-minute walk. Want to try one and see if energy shifts?`;
    }
    if (keyFocus === 'stress') {
      return `If stress is the main thing, some people start with a “tiny reset”: 60 seconds of slow breathing, then one small next step. Want a few options that fit your day?`;
    }
    if (keyFocus === 'cycle') {
      return `If you tell me roughly where you are in your cycle (or whether you’ve had any spotting/bleeding), I can look for the most likely links and what tends to help people in that phase.`;
    }
    return `Some people start by choosing 1–2 symptoms to prioritise for a week (sleep + one other), then we review what moved. Want me to suggest a simple focus based on your recent check-ins?`;
  })();

  const patternLine = (() => {
    if (!patterns.length && strongest) {
      return `A day that stands out is ${formatDay(strongest.dateISO)}. If you remember anything different about that day (sleep, food, workload, cycle), that context can really help.`;
    }
    if (!patterns.length) return '';
    return patterns.slice(0, 2).join(' ');
  })();

  const answerParts = [
    `${joinDotsLead}`,
    lowDataNudge,
    oneLineSnapshot,
    patternLine,
    cycleLine,
    actionIdeas,
  ].filter(Boolean);

  const suggestions = (() => {
    const s: string[] = [];
    s.push('Want help joining the dots from your last 7 days?');
    s.push('What’s one symptom you want to feel better first?');
    if (cycleEnabled) s.push('Could this be linked to cycle phase?');
    s.push('Give me one small thing to try for 3 days.');
    return s.slice(0, 3);
  })();

  return {
    answer: answerParts.join('\n\n'),
    suggestions
  };
}

export function AIChat({ userName: _userName, userData }: AIChatProps) {
  const { entries } = useEntries();
  const summary = useMemo(() => summarise(entries), [entries]);
  const cycleEnabled = userData.cycleTrackingMode === 'cycle';

  const opening = useMemo(() => {
    // Requested: include the product name in the opening message.
    return `Hi, I’m ${COMPANION_NAME}. Want help joining the dots today?`;
  }, []);

  const suggestedQuestions = useMemo(() => buildSuggestedQuestions(cycleEnabled), [cycleEnabled]);

  const { messagesWithDate: messages, addMessage } = useChat();
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [followUps, setFollowUps] = useState<{ aiId: string; questions: string[] } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Scroll behaviour requirements:
  // - When opening Chat with existing history, show the most recent messages (bottom).
  // - If the user scrolls up, remember their place when navigating away and back.
  // - If they type a new message, jump back to the bottom (latest bubble).
  const SCROLL_TOP_KEY = 'everybody_eve_scrollTop_v1';
  const SCROLL_MANUAL_KEY = 'everybody_eve_manualScroll_v1';
  const [manualScroll, setManualScroll] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SCROLL_MANUAL_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // If there is no chat history, seed it with the current opening.
    if (messages.length === 0) {
      addMessage({ sender: 'ai', text: opening, timestampISO: new Date().toISOString() });
    }
  }, [messages.length, addMessage, opening]);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    // Using scrollIntoView keeps this working whether the scroll container is the chat list
    // or the page (depending on viewport height).
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  const restoreScrollPosition = () => {
    const el = scrollAreaRef.current;
    if (!el) return;
    try {
      const manual = sessionStorage.getItem(SCROLL_MANUAL_KEY) === '1';
      const saved = sessionStorage.getItem(SCROLL_TOP_KEY);
      if (manual && saved) {
        const n = Number(saved);
        if (Number.isFinite(n)) el.scrollTop = n;
        return;
      }
    } catch {
      // ignore
    }
    // Default: open at the latest message.
    scrollToBottom('auto');
  };

  // Restore on first paint, after the DOM has measured.
  useLayoutEffect(() => {
    restoreScrollPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll only when the user hasn't manually scrolled away.
  useEffect(() => {
    if (!manualScroll) scrollToBottom('auto');
  }, [messages, manualScroll]);

  // Persist scroll position when the user navigates away.
  useEffect(() => {
    return () => {
      const el = scrollAreaRef.current;
      if (!el) return;
      try {
        sessionStorage.setItem(SCROLL_TOP_KEY, String(el.scrollTop));
        sessionStorage.setItem(SCROLL_MANUAL_KEY, manualScroll ? '1' : '0');
      } catch {
        // ignore
      }
    };
  }, [manualScroll]);

  const handleScroll = () => {
    const el = scrollAreaRef.current;
    if (!el) return;

    // If the user is close to the bottom, allow auto-scroll again.
    const thresholdPx = 120;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= thresholdPx;

    try {
      sessionStorage.setItem(SCROLL_TOP_KEY, String(el.scrollTop));
    } catch {
      // ignore
    }

    if (atBottom) {
      if (manualScroll) setManualScroll(false);
      try {
        sessionStorage.setItem(SCROLL_MANUAL_KEY, '0');
      } catch {
        // ignore
      }
    } else {
      if (!manualScroll) setManualScroll(true);
      try {
        sessionStorage.setItem(SCROLL_MANUAL_KEY, '1');
      } catch {
        // ignore
      }
    }
  };

  function buildSummaryText(): string {
    const last7 = filterByDays(entries, 7);
    const last30 = filterByDays(entries, 30);

    const avgSleep7 = mean(last7.map((e) => e.values.sleep).filter(hasNumeric));
    const avgEnergy7 = mean(last7.map((e) => e.values.energy).filter(hasNumeric));
    const avgStress7 = mean(last7.map((e) => e.values.stress).filter(hasNumeric));
    const avgMood7 = mean(last7.map((e) => e.values.mood).filter(hasNumeric));

    const parts: string[] = [];
    parts.push(`Entries total: ${entries.length}`);
    parts.push(`Entries last 7 days: ${last7.length}`);
    parts.push(`Entries last 30 days: ${last30.length}`);
    parts.push(`Cycle tracking enabled: ${cycleEnabled ? 'yes' : 'no'}`);

    const fmt = (v: number) => `${Math.round(v)}%`;
    const avgs: string[] = [];
    if (Number.isFinite(avgSleep7)) avgs.push(`sleep ${fmt(avgSleep7)}`);
    if (Number.isFinite(avgEnergy7)) avgs.push(`energy ${fmt(avgEnergy7)}`);
    if (Number.isFinite(avgStress7)) avgs.push(`stress ${fmt(avgStress7)}`);
    if (Number.isFinite(avgMood7)) avgs.push(`mood ${fmt(avgMood7)}`);
    if (avgs.length) parts.push(`Last 7 day averages: ${avgs.join(', ')}`);

    return parts.join('\n');
  }

  async function askEve(userMessage: string) {
    // Local companion mode: when Mock Eve is enabled, or when the API isn't available,
    // we still want Eve to feel useful and warm rather than "broken".
    if (Boolean(userData.useMockEve)) {
      return localCompanionReply(userMessage, entries, cycleEnabled);
    }

    const history = messages
      .slice(-12)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));

    try {
      const res = await fetch('/api/eve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history,
          mock: Boolean(userData.useMockEve),
          lowCost: Boolean(userData.eveLowCostMode),
          context: {
            summaryText: buildSummaryText(),
            cycleEnabled,
            useMockEve: Boolean(userData.useMockEve),
          },
        }),
      });

      if (!res.ok) throw new Error('Eve request failed');
      return (await res.json()) as EveReply;
    } catch {
      // Graceful fallback: keep the companion usable even without the server.
      return localCompanionReply(userMessage, entries, cycleEnabled);
    }
  }

  const handleSendMessage = (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageText,
      sender: 'user',
      timestamp: new Date(),
    };

    // When the user sends a new message, always jump back to the latest bubble.
    setManualScroll(false);
    try {
      sessionStorage.setItem(SCROLL_MANUAL_KEY, '0');
    } catch {
      // ignore
    }

    addMessage({ sender: 'user', text: messageText, timestampISO: new Date().toISOString(), id: userMessage.id });
    setInputText('');
    setIsTyping(true);
    setFollowUps(null);

    // Ensure the input stays visible and we land at the end of the thread.
    requestAnimationFrame(() => scrollToBottom('auto'));

    (async () => {
      try {
        const data = await askEve(messageText);
        const aiId = `${Date.now().toString()}-ai`;
        addMessage({ sender: 'ai', text: data.answer, timestampISO: new Date().toISOString(), id: aiId });

        const qs = Array.isArray(data.suggestions) && data.suggestions.length
          ? data.suggestions.slice(0, 3)
          : buildFollowUpQuestions(messageText, cycleEnabled, summary.daysTracked7).slice(0, 3);
        setFollowUps({ aiId, questions: qs });
      } catch {
        const aiId = `${Date.now().toString()}-ai`;
        const fallback = localCompanionReply(messageText, entries, cycleEnabled);
        addMessage({ sender: 'ai', text: fallback.answer, timestampISO: new Date().toISOString(), id: aiId });
        const qs = Array.isArray(fallback.suggestions) && fallback.suggestions.length
          ? fallback.suggestions.slice(0, 3)
          : buildFollowUpQuestions(messageText, cycleEnabled, summary.daysTracked7).slice(0, 3);
        setFollowUps({ aiId, questions: qs });
      } finally {
        setIsTyping(false);
      }
    })();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="eb-page flex flex-col py-4">
      <div className="eb-page-inner flex-1 flex flex-col pb-6 space-y-0">
        <div className="eb-card p-0 overflow-hidden flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-200 bg-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-dark))] flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3>{COMPANION_NAME}</h3>
</div>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 bg-[rgb(var(--color-background))]"
          >
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`w-full max-w-[85%] sm:max-w-[80%] lg:max-w-[44rem] rounded-2xl px-4 py-3 ${
                      message.sender === 'user'
                        ? 'bg-[rgb(var(--color-primary-light))] text-[rgb(var(--color-text-primary))] border border-[rgb(var(--color-primary))]'
                        : 'bg-white border border-neutral-200'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{stripLegacyDisclaimer(message.text)}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Clock
                        className={`w-3 h-3 ${
                          message.sender === 'user' ? 'text-[rgb(var(--color-text-secondary))]' : 'text-neutral-400'
                        }`}
                      />
                      <span
                        className={`text-xs ${
                          message.sender === 'user' ? 'text-[rgb(var(--color-text-secondary))]' : 'text-neutral-400'
                        }`}
                      >
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Follow-up suggestion pills (shown only under the latest AI message) */}
                    {message.sender === 'ai' && followUps?.aiId === message.id && followUps.questions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-100">
                        <p className="text-xs text-[rgb(var(--color-text-secondary))] mb-2">You could ask me:</p>
                        <div className="flex flex-wrap gap-2">
                          {followUps.questions.map((q, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSendMessage(q)}
                              className="text-xs px-3 py-1.5 rounded-full border border-[rgb(var(--color-primary))] text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary))] hover:text-white transition-all"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border border-neutral-200 rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-[rgb(var(--color-primary))] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-[rgb(var(--color-primary))] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-[rgb(var(--color-primary))] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Suggested Questions */}
          {messages.length === 1 && (
            <div className="px-6 py-4 bg-white border-t border-neutral-200">
              <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-3">Suggested questions:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleSendMessage(question)}
                    className="text-sm px-4 py-2 rounded-full border border-[rgb(var(--color-primary))] text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary))] hover:text-white transition-all"
                    type="button"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="bg-white border-t border-neutral-200 px-6 py-4 flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about your symptoms..."
                className="flex-1 px-4 py-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary))] focus:border-transparent"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim()}
                className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                type="button"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-center mt-3 text-[rgb(var(--color-text-secondary))]">
              Guidance is informational only. For medical advice, speak to a healthcare professional.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}