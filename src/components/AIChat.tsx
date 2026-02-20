import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bot, Clock, Send } from 'lucide-react';
import type { CheckInEntry, UserData } from '../types';
import { filterByDays, mean } from '../lib/analytics';
import { COMPANION_NAME, useChat, useEntries } from '../lib/appStore';

interface AIChatProps {
  userName: string;
  userData: UserData;
}

type EveReply = {
  answer: string;
  suggestions?: string[];
};

type EveContext = {
  daysWithData: number;
  last7Count: number;
  last14Count: number;
  averages: {
    sleep10: number | null;
    energy10: number | null;
    pain10: number | null;
    flow10: number | null;
    mood3: number | null;
  };
};

function hasNumeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function stripLegacyJunk(text: string): string {
  // Keep the single footer disclaimer in the UI, and keep the chat feeling human.
  const lines = text.split('\n');
  const cleaned = lines.filter((l) => {
    const s = l.trim();
    if (!s) return true;

    // Legacy repeated disclaimers / warnings
    if (s.startsWith('Supportive, not medical.')) return false;
    if (s.includes('Guidance is informational only')) return false;
    if (s.includes('For medical advice') && (s.includes('healthcare') || s.includes('professional'))) return false;
    if (s.includes('If something feels severe') && (s.includes('GP') || s.includes('pharmacist'))) return false;

    // Legacy technical error copy
    if (s.startsWith("I'm having trouble connecting")) return false;
    if (s.includes('make sure you started the Eve server')) return false;
    if (s.includes('npm run dev:all')) return false;

    return true;
  });

  return cleaned.join('\n').trimEnd();
}

function uniqueDays(entries: CheckInEntry[]): number {
  return new Set(entries.map((e) => e.dateISO)).size;
}

function buildEveContext(entries: CheckInEntry[]): EveContext {
  const daysWithData = uniqueDays(entries);

  const last7 = filterByDays(entries, 7);
  const last14 = filterByDays(entries, 14);

  const sleepVals = last14.map((e) => e.values.sleep).filter(hasNumeric);
  const energyVals = last14.map((e) => e.values.energy).filter(hasNumeric);
  const painVals = last14.map((e) => e.values.pain).filter(hasNumeric);
  const flowVals = last14.map((e) => e.values.flow).filter(hasNumeric);
  const moodVals = last14.map((e) => e.mood).filter((m): m is 1 | 2 | 3 => m === 1 || m === 2 || m === 3);

  const avg = (nums: number[]) => {
    const m = mean(nums);
    return Number.isFinite(m) ? Math.round(m * 10) / 10 : null;
  };

  return {
    daysWithData,
    last7Count: last7.length,
    last14Count: last14.length,
    averages: {
      sleep10: avg(sleepVals),
      energy10: avg(energyVals),
      pain10: avg(painVals),
      flow10: avg(flowVals),
      mood3: avg(moodVals),
    },
  };
}

function buildSuggestedQuestions(cycleEnabled: boolean): string[] {
  const base = [
    'What patterns do you notice in my last week?',
    'What should I focus on first?',
    'How can I support sleep and energy?',
    'What could be affecting my mood?',
  ];
  if (cycleEnabled) {
    base.splice(1, 0, 'Could any of this be linked to my cycle?');
  } else {
    base.splice(1, 0, 'How can I track patterns without a cycle?');
  }
  return base;
}

function buildFollowUpQuestions(userMessage: string, cycleEnabled: boolean, daysInLast7: number): string[] {
  const lower = userMessage.toLowerCase();

  if (lower.includes('pattern') || lower.includes('last week')) {
    if (daysInLast7 < 3) return ['What’s the easiest check-in to do daily?', 'What should I track first for quick insights?'];
    return [
      cycleEnabled ? 'Could this be linked to cycle phase?' : 'How can I track patterns without a cycle?',
      'What’s one small change I could try this week?',
    ];
  }

  if (lower.includes('sleep')) return ['What should I change first for better sleep?', 'Is stress affecting my sleep?'];
  if (lower.includes('mood') || lower.includes('irritable') || lower.includes('anxiety')) return ['Could sleep be driving this?', 'What’s one small thing I can try today?'];
  if (lower.includes('pain') || lower.includes('cramp')) return ['What usually helps cramps?', 'Is this worse at a certain time of month?'];
  if (lower.includes('bleed') || lower.includes('spot')) return ['What should I track about bleeding?', 'Could this be linked to stress or contraception?'];

  return ['Want help joining the dots from your last 7 days?', 'What’s one symptom you want to feel better first?'];
}

const STARTER_QUESTIONS_FRIENDLY = [
  'Want help joining the dots?',
  'Why might my mood be low lately?',
  'What could be driving tiredness?',
  'What should I track for quick insights?',
];

const OFFLINE_KEYWORD_RESPONSES: Array<{ test: (s: string) => boolean; replies: string[] }> = [
  {
    test: (s) => /bleeding|spotting|breakthrough|flow|brown discharge/i.test(s),
    replies: [
      `Spotting can happen for lots of reasons (cycle shifts, stress, contraception changes, or just “one of those weeks”).\n\nIf you want a simple way to track it for a few days:\n• colour (pink/red/brown)\n• amount (wipe-only vs pad)\n• any pain\n\nIf you tell me what it looks like today, I’ll help you decide what’s worth watching.`,
      `Thanks for telling me. A quick sanity check:\n• light and short-lived (often OK to monitor)\n• new pain, dizziness, or very heavy bleeding (worth getting checked)\n\nWant to tell me if it’s just when you wipe, or enough to need a pad?`,
    ],
  },
  {
    test: (s) => /pain|cramp|cramps|period pain/i.test(s),
    replies: [
      `I’m sorry you’re dealing with pain. A few gentle things that often help:\n• heat (10–20 mins)\n• light movement or stretching\n• a warm drink + hydration\n\nIf you tell me if it’s one-sided or general cramps, I’ll suggest the simplest next step.`,
    ],
  },
  {
    test: (s) => /night sweats|hot flush|hot flash|overheating/i.test(s),
    replies: [
      `Night sweats are miserable. A few practical things people often try:\n• cooler room (fan, lighter duvet)\n• breathable layers\n• avoid alcohol/spicy food close to bed if you’ve noticed triggers\n\nDo they wake you drenched, or is it more “running hot” and restless sleep?`,
    ],
  },
  {
    test: (s) => /anxiety|anxious|panic|irritable|irritability|snappy|rage|mood swing/i.test(s),
    replies: [
      `That anxious/snappy wave can feel intense. A gentle “steadying” combo some people try:\n• protein early in the day\n• a 5–10 minute walk or fresh air\n• reduce caffeine for a day if it’s making you buzzy\n• slow exhale breathing (4 in, 6–8 out)\n\nIf you tell me when it hits (morning vs evening), I’ll suggest the easiest lever first.`,
    ],
  },
  {
    test: (s) => /brain fog|foggy|forgetful|can’t think|cant think|focus/i.test(s),
    replies: [
      `Brain fog is so annoying. A few “have you tried” options people often experiment with:\n• hydration + a salty snack (if you feel lightheaded)\n• protein + fibre snack to steady blood sugar\n• a 10-minute walk (surprisingly good for focus)\n• magnesium glycinate in the evening (some people find it calming and sleep-supportive)\n\nWhen is the fog worst for you (morning, afternoon, after meals)?`,
    ],
  },
  {
    test: (s) => /tired|fatigue|exhausted|no energy|drained/i.test(s),
    replies: [
      `That “battery suddenly dropped” feeling is horrible. Two quick checks that sometimes help:\n• have you eaten protein in the last 3–4 hours?\n• have you had water today (not just tea/coffee)?\n\nIf you tell me what time it hits, I’ll suggest a simple routine for that window.`,
    ],
  },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function pickVariant(replies: string[], seed: string): string {
  const idx = Math.abs(hashString(seed)) % replies.length;
  return replies[idx];
}

function localCompanionReply(userMessage: string, ctx: EveContext, cycleEnabled: boolean): EveReply {
  const lower = userMessage.toLowerCase();

  // Friendly keyword-based help (offline mode / API failures)
  for (const item of OFFLINE_KEYWORD_RESPONSES) {
    if (item.test(lower)) {
      return {
        answer: pickVariant(item.replies, userMessage),
        suggestions: buildSuggestedQuestions(cycleEnabled).slice(0, 3),
      };
    }
  }

  // Trust gate: do not analyse before 5 days.
  if (ctx.daysWithData < 5) {
    const daysLeft = 5 - ctx.daysWithData;
    const nudge = ctx.daysWithData === 0
      ? `If you log a few check-ins, I can start spotting patterns that are specific to you.`
      : `You’ve logged ${ctx.daysWithData} day${ctx.daysWithData === 1 ? '' : 's'} so far. If you log ${daysLeft} more day${daysLeft === 1 ? '' : 's'}, I can start looking for patterns with more confidence.`;

    const focus =
      lower.includes('sleep') ? 'sleep' :
      (lower.includes('mood') || lower.includes('irritable') || lower.includes('anxiety')) ? 'mood' :
      lower.includes('energy') || lower.includes('tired') ? 'energy' :
      lower.includes('pain') || lower.includes('cramp') ? 'pain' :
      (lower.includes('bleed') || lower.includes('spot') || lower.includes('flow')) ? 'bleeding' :
      'one symptom';

    return {
      answer: [
        `Want help joining the dots?`,
        nudge,
        `For now, we can keep it simple: focus on ${focus} and do a quick daily check-in.`,
        cycleEnabled
          ? `If you’re tracking cycle days, we’ll be able to see if things shift around bleeding once you’ve got a bit more data.`
          : `If you’re not tracking cycle days, that’s totally fine. We can still find patterns from sleep, mood, energy, pain, and bleeding.`,
        `What’s the one thing you most want to feel better first?`,
      ].filter(Boolean).join('\n\n'),
      suggestions: [
        'What should I track first?',
        'How do I build a simple daily habit?',
        cycleEnabled ? 'Could this be linked to my cycle?' : 'How can I track without a cycle?',
      ].slice(0, 3),
    };
  }

  // From day 5+: gentle, cautious pattern language based on core metrics.
  const parts: string[] = [];
  parts.push('Want help joining the dots?');

  const snapBits: string[] = [];
  if (ctx.averages.sleep10 != null) snapBits.push(`sleep ~${ctx.averages.sleep10}/10`);
  if (ctx.averages.energy10 != null) snapBits.push(`energy ~${ctx.averages.energy10}/10`);
  if (ctx.averages.pain10 != null) snapBits.push(`pain ~${ctx.averages.pain10}/10`);
  if (ctx.averages.flow10 != null) snapBits.push(`bleeding ~${ctx.averages.flow10}/10`);
  if (ctx.averages.mood3 != null) snapBits.push(`mood ~${ctx.averages.mood3}/3`);

  if (snapBits.length) parts.push(`Quick snapshot (last ~2 weeks): ${snapBits.join(', ')}.`);

  // Light pattern hints (no heavy stats)
  // If the user asks about something, prioritise that
  const wantsSleep = lower.includes('sleep') || lower.includes('insomnia') || lower.includes('wake');
  const wantsMood = lower.includes('mood') || lower.includes('irritable') || lower.includes('anxiety') || lower.includes('snappy');
  const wantsEnergy = lower.includes('energy') || lower.includes('tired') || lower.includes('fatigue');
  const wantsPain = lower.includes('pain') || lower.includes('cramp');
  const wantsBleed = lower.includes('bleed') || lower.includes('spot') || lower.includes('flow');

  const suggestions: string[] = [];

  const action = () => {
    if (wantsSleep) return `Some people try a tiny 3-night experiment: same bedtime window, dim screens 45 mins before bed, and a 10-minute wind-down (stretch, shower, or audio). Want to pick one?`;
    if (wantsMood) return `If mood feels wobbly, some people start with one lever for 3 days: protein early, less caffeine, or a short walk. Want the easiest one for your routine?`;
    if (wantsEnergy) return `For energy dips, some people focus on steadier blood sugar: protein + fibre snack mid-morning and mid-afternoon for 3 days. Want to try it?`;
    if (wantsPain) return `For pain, heat + gentle movement is often the quickest relief. If you tell me if it’s one-sided or general cramps, I’ll tailor a simple plan.`;
    if (wantsBleed) return `If bleeding/spotting is the focus, tracking colour + amount + pain for a few days helps us see if it’s a short blip or a pattern. Want a simple tracking checklist?`;
    return `Some people start by choosing 1–2 symptoms to prioritise for a week (sleep + one other), then we review what moved. Want me to suggest a simple focus?`;
  };

  parts.push(cycleEnabled
    ? `If you’re tracking cycle days, we can also watch whether symptoms shift around bleeding.`
    : `If you’re not tracking cycle days, that’s fine. We can still find patterns from sleep, mood, energy, pain, and bleeding.`);

  parts.push(action());

  suggestions.push('What’s one symptom you want to feel better first?');
  if (cycleEnabled) suggestions.push('Could this be linked to cycle phase?');
  suggestions.push('Give me one small thing to try for 3 days.');

  return {
    answer: parts.join('\n\n'),
    suggestions: suggestions.slice(0, 3),
  };
}

export function AIChat({ userName: _userName, userData }: AIChatProps) {
  const { entries } = useEntries();
  const cycleEnabled = userData.cycleTrackingMode === 'cycle';

  const eveContext = useMemo(() => buildEveContext(entries), [entries]);
  const suggestedQuestions = useMemo(() => buildSuggestedQuestions(cycleEnabled), [cycleEnabled]);

  const { messagesWithDate: messages, addMessage } = useChat();
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [followUps, setFollowUps] = useState<{ aiId: string; questions: string[] } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // iOS Safari can "pull to refresh" if a scrollable area doesn't properly capture touch scroll.
  // Track touch start and gently prevent the refresh gesture when the chat is already at the top.
  const touchStartYRef = useRef<number>(0);
  const touchStartScrollTopRef = useRef<number>(0);

  const SCROLL_TOP_KEY = 'everybody_eve_scrollTop_v1';
  const SCROLL_MANUAL_KEY = 'everybody_eve_manualScroll_v1';

  const [manualScroll, setManualScroll] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SCROLL_MANUAL_KEY) === '1';
    } catch {
      return false;
    }
  });

  const opening = useMemo(() => `Hi, I’m ${COMPANION_NAME}. Want help joining the dots today?`, []);

  useEffect(() => {
    if (messages.length === 0) {
      addMessage({ sender: 'ai', text: opening, timestampISO: new Date().toISOString() });
    }
  }, [messages.length, addMessage, opening]);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
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
    scrollToBottom('auto');
  };

  useLayoutEffect(() => {
    restoreScrollPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!manualScroll) scrollToBottom('auto');
  }, [messages, manualScroll]);

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

  // Native listener fallback (some iOS versions treat React's touch handlers as passive).
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;

    const onTouchStart = (ev: TouchEvent) => {
      touchStartYRef.current = ev.touches?.[0]?.clientY ?? 0;
      touchStartScrollTopRef.current = el.scrollTop ?? 0;
    };

    const onTouchMove = (ev: TouchEvent) => {
      const y = ev.touches?.[0]?.clientY ?? 0;
      const pullingDown = y > touchStartYRef.current;
      const atTop = (touchStartScrollTopRef.current <= 0) && (el.scrollTop <= 0);
      if (pullingDown && atTop) {
        ev.preventDefault();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const handleScroll = () => {
    const el = scrollAreaRef.current;
    if (!el) return;

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

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches?.[0]?.clientY ?? 0;
    touchStartScrollTopRef.current = scrollAreaRef.current?.scrollTop ?? 0;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = scrollAreaRef.current;
    if (!el) return;

    // If the user is trying to pull down while already at the very top,
    // prevent Safari's pull-to-refresh from hijacking the gesture.
    const y = e.touches?.[0]?.clientY ?? 0;
    const pullingDown = y > touchStartYRef.current;
    const atTop = (touchStartScrollTopRef.current <= 0) && (el.scrollTop <= 0);
    if (pullingDown && atTop) {
      e.preventDefault();
    }
  };

  function buildSummaryText(): string {
    const parts: string[] = [];
    parts.push(`Days with data: ${eveContext.daysWithData}`);
    parts.push(`Entries last 7 days: ${eveContext.last7Count}`);
    parts.push(`Entries last 14 days: ${eveContext.last14Count}`);
    parts.push(`Cycle tracking enabled: ${cycleEnabled ? 'yes' : 'no'}`);
    if (eveContext.averages.sleep10 != null) parts.push(`Avg sleep (0-10): ${eveContext.averages.sleep10}`);
    if (eveContext.averages.mood3 != null) parts.push(`Avg mood (1-3): ${eveContext.averages.mood3}`);
    if (eveContext.averages.energy10 != null) parts.push(`Avg energy (0-10): ${eveContext.averages.energy10}`);
    if (eveContext.averages.pain10 != null) parts.push(`Avg pain (0-10): ${eveContext.averages.pain10}`);
    if (eveContext.averages.flow10 != null) parts.push(`Avg bleeding/flow (0-10): ${eveContext.averages.flow10}`);
    parts.push(`Analysis gate: ${eveContext.daysWithData < 5 ? 'LOW_DATA (no pattern claims)' : 'OK_TO_ANALYSE'}`);
    return parts.join('\n');
  }

  async function askEve(userMessage: string): Promise<EveReply> {
    // Local companion mode: when Mock Eve is enabled, or when the API isn't available,
    // keep Eve warm and useful rather than “broken”.
    if (Boolean(userData.useMockEve)) {
      return localCompanionReply(userMessage, eveContext, cycleEnabled);
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
            eveContext,
          },
        }),
      });

      if (!res.ok) throw new Error('Eve request failed');
      const data = (await res.json()) as EveReply;

      // Safety/trust guard: if we're under the 5-day gate, soften any overly-confident language.
      if (eveContext.daysWithData < 5) {
        const softened = `${stripLegacyJunk(data.answer)}\n\n(Still early days in your tracking. If you log a few more check-ins, I can start spotting patterns that are specific to you.)`;
        return { ...data, answer: softened };
      }

      return { ...data, answer: stripLegacyJunk(data.answer) };
    } catch {
      // Graceful fallback: keep the companion usable even without the server.
      return localCompanionReply(userMessage, eveContext, cycleEnabled);
    }
  }

  const handleSendMessage = (text?: string) => {
    const messageText = (text || inputText).trim();
    if (!messageText) return;

    // When the user sends a new message, always jump back to the latest bubble.
    setManualScroll(false);
    try {
      sessionStorage.setItem(SCROLL_MANUAL_KEY, '0');
    } catch {
      // ignore
    }

    const userId = `${Date.now().toString()}-user`;
    addMessage({ sender: 'user', text: messageText, timestampISO: new Date().toISOString(), id: userId });
    setInputText('');
    setIsTyping(true);
    setFollowUps(null);

    requestAnimationFrame(() => scrollToBottom('auto'));

    (async () => {
      try {
        const data = await askEve(messageText);
        const aiId = `${Date.now().toString()}-ai`;
        addMessage({ sender: 'ai', text: data.answer, timestampISO: new Date().toISOString(), id: aiId });

        const qs = Array.isArray(data.suggestions) && data.suggestions.length
          ? data.suggestions.slice(0, 3)
          : buildFollowUpQuestions(messageText, cycleEnabled, eveContext.last7Count).slice(0, 3);
        setFollowUps({ aiId, questions: qs });
      } catch {
        const aiId = `${Date.now().toString()}-ai`;
        const fallback = localCompanionReply(messageText, eveContext, cycleEnabled);
        addMessage({ sender: 'ai', text: fallback.answer, timestampISO: new Date().toISOString(), id: aiId });

        const qs = Array.isArray(fallback.suggestions) && fallback.suggestions.length
          ? fallback.suggestions.slice(0, 3)
          : buildFollowUpQuestions(messageText, cycleEnabled, eveContext.last7Count).slice(0, 3);
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
    <div className="eb-page flex flex-col min-h-[100svh] h-[100dvh] overflow-hidden py-0">
      <div className="eb-page-inner flex-1 flex flex-col pb-24 space-y-0">
        <div className="eb-card p-0 overflow-hidden flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-200 bg-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-dark))] flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3>{COMPANION_NAME}</h3>
                <p className="text-xs text-[rgb(var(--color-text-secondary))]">Here to support you with care and understanding</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-6 bg-[rgb(var(--color-background))]"
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
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
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{stripLegacyJunk(message.text)}</p>
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
