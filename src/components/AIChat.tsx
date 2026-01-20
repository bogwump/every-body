import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Sparkles, Clock } from 'lucide-react';
import type { CheckInEntry, UserData } from '../types';
import { ENTRIES_KEY, loadFromStorage } from '../lib/storage';
import { filterByDays, mean } from '../lib/analytics';

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
    'Any ideas why I’ve felt tired lately?',
    'How can I support sleep and energy?',
    'What might be pushing my stress up?',
  ];
  if (cycleEnabled) {
    base.splice(1, 0, 'How do symptoms usually change across the month?');
  } else {
    base.splice(1, 0, 'How can I track symptoms without a cycle?');
  }
  return base;
}

export function AIChat({ userName, userData }: AIChatProps) {
  const entries = useMemo(() => loadFromStorage<CheckInEntry[]>(ENTRIES_KEY, []), []);
  const summary = useMemo(() => summarise(entries), [entries]);
  const cycleEnabled = userData.cycleTrackingMode === 'cycle';

  const opening = useMemo(() => {
    const parts: string[] = [];
    parts.push(`Hi ${userName}! I’m here with you.`);
    if (summary.daysTracked === 0) {
      parts.push('If you do a quick check-in, I can help you spot patterns as you go.');
    } else {
      parts.push(`You’ve logged ${summary.daysTracked} day${summary.daysTracked === 1 ? '' : 's'} so far.`);
      if (summary.avgSleep !== null || summary.avgEnergy !== null) {
        const bits: string[] = [];
        if (summary.avgSleep !== null) bits.push(`sleep ${summary.avgSleep}%`);
        if (summary.avgEnergy !== null) bits.push(`energy ${summary.avgEnergy}%`);
        parts.push(`In the last 7 days your average is ${bits.join(' and ')}.`);
      }
      if (!cycleEnabled) {
        parts.push('Cycle features are off, but you can still track symptoms and spot useful links.');
      }
    }
    parts.push('What would feel most helpful right now?');
    return parts.join(' ');
  }, [userName, summary, cycleEnabled]);

  const suggestedQuestions = useMemo(() => buildSuggestedQuestions(cycleEnabled), [cycleEnabled]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: opening,
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([
      {
        id: '1',
        text: opening,
        sender: 'ai',
        timestamp: new Date(),
      },
    ]);
    // reset suggested questions on mode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getAIResponse = (userMessage: string): string => {
    const lower = userMessage.toLowerCase();

    const softSafety =
      "\n\nI can help you spot patterns and try gentle ideas, but I can’t diagnose. If symptoms are severe, new, or worrying, it’s best to speak to a GP or pharmacist.";

    if (lower.includes('without a cycle') || lower.includes('no period') || lower.includes('coil') || lower.includes('menopause')) {
      return (
        "You can absolutely track symptoms without bleeding or a cycle. Focus on daily patterns (sleep, energy, mood, stress, pain) and watch how they move together over time. If you ever want cycle-phase features, you can switch them on in Profile, but it’s totally optional." +
        softSafety
      );
    }

    if (lower.includes('pattern') || lower.includes('last week')) {
      if (summary.daysTracked7 < 3) {
        return 'You don’t have many check-ins in the last week yet. If you log a few more days, I can give you a much clearer picture of what’s linked.' + softSafety;
      }
      const bits: string[] = [];
      if (summary.avgSleep !== null) bits.push(`average sleep: ${summary.avgSleep}%`);
      if (summary.avgEnergy !== null) bits.push(`average energy: ${summary.avgEnergy}%`);
      if (summary.avgStress !== null) bits.push(`average stress: ${summary.avgStress}%`);
      return (
        `Here’s what I can see from your last week: ${bits.join(', ')}. ` +
        'If you tell me what feels most annoying right now (sleep, fatigue, mood, pain), I’ll help you explore likely links.' +
        softSafety
      );
    }

    if (lower.includes('tired') || lower.includes('energy') || lower.includes('fatigue')) {
      const extra = summary.avgSleep !== null ? ` Your recent sleep average is ${summary.avgSleep}%.` : '';
      return (
        'Tiredness can come from lots of places, but the quickest thing to check is whether low sleep and low energy are showing up together.' +
        extra +
        ' If you want, I can suggest a 3-day experiment (small changes you can actually stick to) and then we can see if your data shifts.' +
        softSafety
      );
    }

    if (lower.includes('stress') || lower.includes('anxiety')) {
      const extra = summary.avgStress !== null ? ` Your recent stress average is ${summary.avgStress}%.` : '';
      return (
        'When stress is up, sleep and energy often take a hit. The goal is not “remove stress”, it’s “lower the load on your nervous system”.' +
        extra +
        ' Want ideas that fit your day (quick, medium, or longer)?' +
        softSafety
      );
    }

    if (lower.includes('eat') || lower.includes('food') || lower.includes('diet')) {
      return (
        'If you want something simple: aim for regular protein, fibre and hydration first. That supports energy and mood regardless of cycle. If you tell me whether you’re dealing with cravings, bloating, or low energy, I’ll suggest a few realistic options.' +
        softSafety
      );
    }

    if (lower.includes('pms') || lower.includes('luteal') || lower.includes('period')) {
      if (!cycleEnabled) {
        return (
          'Even with cycle features off, you can still track PMS-style patterns by looking at clusters of symptoms over time. If you do want cycle-phase insights, you can enable cycle tracking and optionally log bleeding or spotting.' +
          softSafety
        );
      }
      return (
        'PMS symptoms often show up in the later part of a cycle, but the best approach is to use your own data. If you keep logging, I can help you identify which symptoms tend to cluster together and what usually helps.' +
        softSafety
      );
    }

    return (
      "I’m here to help you make sense of what you’re logging and feel a bit more in control. What’s bothering you most right now? We’ll break it down together." +
      softSafety
    );
  };

  const handleSendMessage = (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: getAIResponse(messageText),
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 900);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
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
              <h3>Guide</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">Supportive, not a diagnosis</p>
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
                  message.sender === 'user' ? 'bg-[rgb(var(--color-primary))] text-white' : 'bg-white border border-neutral-200'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
                <div className="flex items-center gap-1 mt-2">
                  <Clock className={`w-3 h-3 ${message.sender === 'user' ? 'text-white opacity-70' : 'text-neutral-400'}`} />
                  <span className={`text-xs ${message.sender === 'user' ? 'text-white opacity-70' : 'text-neutral-400'}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
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
            <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-3">Try one of these:</p>
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
              onKeyPress={handleKeyPress}
              placeholder="Ask about your patterns, symptoms, or next steps..."
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
