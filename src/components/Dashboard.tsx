import { Calendar } from "lucide-react";
import { useUser, useEntries } from "../lib/appStore";

export function Dashboard() {
  const { user, cycleMode } = useUser();
  const { entries } = useEntries();

  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const todayPhase = user?.cyclePhase;

  return (
    <div className="eb-container space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back, {user?.name ?? "there"}
        </h1>
        <p className="text-sm text-neutral-500">{todayLabel}</p>
      </div>

      {/* Symptom tracking hero */}
      <div className="eb-card eb-hero eb-hero-surface rounded-2xl p-6 relative">
        <Calendar className="absolute top-4 right-4 opacity-70" />

        {/* Title stays black */}
        <h3 className="text-lg font-semibold mb-1">Symptom tracking</h3>

        {/* Supporting text is white */}
        {todayPhase ? (
          <>
            <h3 className="mb-1">Today’s phase</h3>
            <p className="text-sm eb-hero-on-dark-muted">
              {todayPhase}
            </p>
          </>
        ) : (
          <p className="text-sm eb-hero-on-dark-muted">
            {cycleMode === "no-cycle"
              ? "Cycle features are off, but you can still track symptoms and patterns."
              : "Add bleeding or spotting (optional) to unlock cycle-phase insights."}
          </p>
        )}

        {/* Inset cards */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="eb-inset rounded-xl p-4">
            <div className="eb-inset-label">Today</div>
            <div className="eb-inset-value">Checked in</div>
          </div>

          <div className="eb-inset rounded-xl p-4">
            <div className="eb-inset-label">Goal</div>
            <div className="eb-inset-value">Cycle Health</div>
          </div>
        </div>
      </div>

      {/* Insight card */}
      <button className="eb-card w-full text-left rounded-2xl p-6 hover:shadow-md transition">
        <h3 className="font-semibold mb-1">Nice work keeping up the habit</h3>
        <p className="text-sm text-neutral-600">
          If you want, we can look for links between symptoms and lifestyle across the last few weeks.
        </p>
        <span className="mt-3 inline-block text-sm text-primary">
          Show me insights →
        </span>
      </button>
    </div>
  );
}
