
  # EveryBody

  A lightweight, friendly hormone and symptom tracking app. Built for a "do first, personalise later" onboarding, optional cycle tracking (including a no-period mode), modular symptom modules, and data-driven insights.

  ## Running the code

  Run `npm i` to install the dependencies.

  ### Eve chat (AI)

  Eve now runs through a tiny local server so your OpenAI API key is never exposed in the browser.

  1) Copy `.env.example` to `.env` and add your OpenAI API key.

  2) Run `npm run dev:all` to start both:
  - the Vite app on http://localhost:3000
  - the Eve server on http://localhost:5174

  (If you don’t want Eve running, you can still run `npm run dev`, but the chat will show a “can’t connect” message.)
  