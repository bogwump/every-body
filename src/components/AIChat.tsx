import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Sparkles, Clock } from 'lucide-react';
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

export function AIChat({ userName: _userName, userData }: AIChatProps) {
  const { entries } = useEntries();
  const summary = useMemo(() => summarise(entries), [entries]);
  const cycleEnabled = userData.cycleTrackingMode === 'cycle';

  const opening = useMemo(() => {
    // Requested: include the product name in the opening message.
    return `Hi there! I’m ${COMPANION_NAME}, your EveryBody companion. Start with a quick check-in and I’ll help you spot patterns as you go. What would you like help with today?`;
  }, []);

  const suggestedQuestions = useMemo(() => buildSuggestedQuestions(cycleEnabled), [cycleEnabled]);

  const { messagesWithDate: messages, addMessage } = useChat();
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [followUps, setFollowUps] = useState<{ aiId: string; questions: string[] } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If there is no chat history, seed it with the current opening.
    if (messages.length === 0) {
      addMessage({ sender: 'ai', text: opening, timestampISO: new Date().toISOString() });
    }
  }, [messages.length, addMessage, opening]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    const history = messages
      .slice(-12)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));

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

    if (!res.ok) {
      throw new Error('Eve request failed');
    }
    return (await res.json()) as { answer: string; suggestions?: string[]; safety_note?: string };
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

    addMessage({ sender: 'user', text: messageText, timestampISO: new Date().toISOString(), id: userMessage.id });
    setInputText('');
    setIsTyping(true);
    setFollowUps(null);

    (async () => {
      try {
        const data = await askEve(messageText);
        const aiId = `${Date.now().toString()}-ai`;
        const safety = (data.safety_note || '').trim();
        const aiText = safety ? `${data.answer}\n\n${safety}` : data.answer;
        addMessage({ sender: 'ai', text: aiText, timestampISO: new Date().toISOString(), id: aiId });

        const qs = Array.isArray(data.suggestions) && data.suggestions.length
          ? data.suggestions.slice(0, 3)
          : buildFollowUpQuestions(messageText, cycleEnabled, summary.daysTracked7).slice(0, 3);
        setFollowUps({ aiId, questions: qs });
      } catch {
        const aiId = `${Date.now().toString()}-ai`;
        addMessage({
          sender: 'ai',
          text:
            "I’m having trouble connecting right now. If you’re running locally, make sure you started the Eve server with: npm run dev:all.\n\nYou can still use the app as normal, and we can try again in a moment.",
          timestampISO: new Date().toISOString(),
          id: aiId,
        });
        setFollowUps({ aiId, questions: buildFollowUpQuestions(messageText, cycleEnabled, summary.daysTracked7).slice(0, 3) });
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
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-dark))] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3>{COMPANION_NAME}</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">Supportive, not medical</p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 bg-neutral-50">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
                  // Use a calm, readable user bubble that works across light theme palettes.
                  message.sender === 'user'
                    ? 'bg-[rgb(var(--color-primary-light))] text-[rgb(var(--color-text-primary))] border border-[rgb(var(--color-primary))]'
                    : 'bg-white border border-neutral-200'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
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
          <div className="max-w-4xl mx-auto">
            <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-3">Suggested questions:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleSendMessage(question)}
                  className="text-sm px-4 py-2 rounded-full border border-[rgb(var(--color-primary))] text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary))] hover:text-white transition-all"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-neutral-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
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
  );
}
