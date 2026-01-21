import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  // Fail fast with a clear message.
  console.error(
    'Missing OPENAI_API_KEY. Create a .env file in the project root and add:\nOPENAI_API_KEY=your_key_here'
  );
}

const client = new OpenAI({ apiKey });

function systemPrompt() {
  return `You are Eve, the EveryBody companion.

Goal:
- Answer the user's question directly and helpfully.
- Use their logged data if provided (context.summaryText). If there's not enough data, still answer generally, then suggest what to track next.

Style:
- UK English. Warm, capable, practical.
- No robotic disclaimers. Do NOT append a long safety disclaimer to every message.
- If the user mentions serious red flags (e.g. heavy bleeding, fainting, severe pain, fever, shortness of breath, suicidal thoughts), include a short safety note.

Rules:
- Do not diagnose. Do not prescribe.
- You can offer general information and self-care ideas.
- Ask up to 2 clarifying questions if needed.

Return STRICT JSON only in this shape:
{
  "answer": "string",
  "suggestions": ["string", "string", "string"],
  "safety_note": "string"
}
"suggestions" should be 1-3 short, clickable next questions.
If no safety note is needed, return an empty string for safety_note.`;
}


function mockEveResponse(message = '') {
  const m = String(message || '').toLowerCase();

  const base = {
    safety_note: '',
    suggestions: []
  };

  if (m.includes('spotting') || (m.includes('between') && m.includes('bleed'))) {
    return {
      answer:
        "Spotting between bleeds can be quite common, especially if your hormones are shifting or you’re using hormonal contraception. It’s often linked to things like ovulation, stress/illness, or the lining of the womb being a bit unsettled.\n\nA couple of quick checks: is it light (just on wiping), and does it settle within a day or two?\n\nIf it’s new for you, keeps happening for a few cycles, is heavy like a period, happens after sex, or comes with pelvic pain/fever/unusual discharge, it’s worth speaking to a GP or pharmacist.",
      suggestions: [
        "What counts as heavy bleeding?",
        "Could this be linked to contraception?",
        "What should I track next time?"
      ],
      safety_note: ""
    };
  }

  if (m.includes('hair') && (m.includes('fall') || m.includes('shedd'))) {
    return {
      answer:
        "Hair shedding that seems to flare once a month can happen for a few reasons. A common pattern is hormone shifts across the month (oestrogen and progesterone changes), or a lagged response to stress/illness (hair can react weeks later). It can also be linked to low iron, thyroid changes, or not eating enough protein.\n\nA helpful way to narrow it down: track the days it happens (and how noticeable it is), plus sleep, stress, and any spotting/bleeding. If you’re cycle-tracking, we can see whether it clusters around ovulation or just before a bleed.\n\nIf it’s sudden, patchy, with scalp irritation, or you’re also feeling very tired/cold or getting shortness of breath, it’s worth a GP chat and asking about iron/ferritin and thyroid tests.",
      suggestions: [
        "Is monthly hair shedding hormone-related?",
        "What should I log to spot the pattern?",
        "When should I speak to a GP?"
      ],
      safety_note: ""
    };
  }

  // Generic but still useful
  return {
    answer:
      "Tell me a bit more and I’ll help you make sense of it. What’s the one thing you’re noticing most (and when did it start)? If you can, add any context like bleeding/spotting, stress, sleep, or new meds so I can suggest the most likely patterns to look for.",
    suggestions: [
      "What should I track first?",
      "Could this be linked to my cycle?",
      "What might be influencing this?"
    ],
    safety_note: ""
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

app.post('/api/eve', async (req, res) => {
  try {
    const { message, history, context, mock, lowCost } = req.body || {};

    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing OPENAI_API_KEY. Add it to a .env file in the project root.'
      });
    }

    const userMessage = typeof message === 'string' ? message : '';

    const isMock = Boolean(mock) || Boolean(context && context.useMockEve);
    if (isMock) {
      return res.json(mockEveResponse(userMessage));
    }

    const safeHistory = Array.isArray(history) ? history : [];
    const summaryText = context && typeof context.summaryText === 'string' ? context.summaryText : '';

    const input = [];
    input.push({ role: 'system', content: systemPrompt() });

    // Keep history short for speed/cost.
    const historyLimit = (lowCost || process.env.EVE_LOW_COST === '1') ? 6 : 12;
    for (const h of safeHistory.slice(-historyLimit)) {
      if (!h || (h.role !== 'user' && h.role !== 'assistant')) continue;
      if (typeof h.content !== 'string') continue;
      input.push({ role: h.role, content: h.content });
    }

    const promptParts = [];
    if (summaryText.trim()) {
      promptParts.push(`User data summary:\n${summaryText.trim()}`);
    }
    promptParts.push(`User message:\n${userMessage}`);

    input.push({ role: 'user', content: promptParts.join('\n\n') });

    const response = await client.responses.create({
      // Model name from OpenAI docs examples.
      model: process.env.EVE_MODEL || 'gpt-4.1-mini',
      // Keep replies compact during testing
      max_output_tokens: (lowCost || process.env.EVE_LOW_COST === '1') ? 320 : 600,
      input
      // Optional later: web search tool.
      // tools: [{ type: 'web_search' }]
    });

    const text = (response.output_text || '').trim();
    const parsed = safeJsonParse(text);

    if (!parsed || typeof parsed !== 'object') {
      return res.json({
        answer: text || "I'm here. Tell me a bit more and I'll help you make sense of it.",
        suggestions: [
          'What should I track next?',
          'What might be influencing this?',
          'What small change could I try?'
        ],
        safety_note: ''
      });
    }

    const answer = typeof parsed.answer === 'string' ? parsed.answer : '';
    const safety_note = typeof parsed.safety_note === 'string' ? parsed.safety_note : '';
    const suggestionsRaw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const suggestions = suggestionsRaw
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean)
      .slice(0, 3);

    return res.json({ answer, suggestions, safety_note });
  } catch (err) {
    console.error(err);
    return res.status(200).json({
      answer: "I’m having trouble connecting right now. If you’re in testing mode, turn on ‘Mock Eve’ in Profile to keep going without any API calls.",
      suggestions: ["Turn on Mock Eve", "What should I track first?", "Show me my recent patterns"],
      safety_note: ""
    });
  }
});

const port = Number(process.env.EVE_PORT || 5174);
app.listen(port, () => {
  console.log(`Eve server running on http://localhost:${port}`);
});
