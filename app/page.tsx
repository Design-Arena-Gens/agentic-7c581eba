"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, isSameDay, isToday, startOfDay } from "date-fns";

type Habit = {
  id: string;
  name: string;
  reminderTime: string | null;
  createdAt: string;
  history: string[];
  streak: number;
  longestStreak: number;
  lastCompleted: string | null;
  reminderLastNotified: string | null;
};

type Filter = "all" | "today" | "reminders";

type Toast = {
  id: string;
  message: string;
};

const STORAGE_KEY = "habitpulse:data:v1";

function createHabit(name: string, reminderTime: string | null): Habit {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    reminderTime,
    createdAt: now.toISOString(),
    history: [],
    streak: 0,
    longestStreak: 0,
    lastCompleted: null,
    reminderLastNotified: null,
  };
}

function uniqueHistory(history: string[]): string[] {
  const seen = new Set<string>();
  return history
    .map((iso) => format(startOfDay(new Date(iso)), "yyyy-MM-dd"))
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((key) => new Date(`${key}T00:00:00`).toISOString());
}

function hasCompletedToday(habit: Habit): boolean {
  return habit.history.some((iso) => isToday(new Date(iso)));
}

function getCompletionHistory(habit: Habit, days = 21) {
  const today = startOfDay(new Date());
  const cells = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    const active = habit.history.some((iso) => isSameDay(new Date(iso), day));
    cells.push({ day, active });
  }
  return cells;
}

export default function HomePage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [time, setTime] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [toast, setToast] = useState<Toast | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: Habit[] = JSON.parse(stored);
        setHabits(
          parsed.map((habit) => ({
            ...habit,
            history: uniqueHistory(habit.history ?? []),
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load habits", error);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  }, [habits, loaded]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!loaded || habits.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      const todayKey = format(now, "yyyy-MM-dd");
      const triggered: Habit[] = [];

      setHabits((current) =>
        current.map((habit) => {
          if (!habit.reminderTime) return habit;

          const [hours, minutes] = habit.reminderTime.split(":").map(Number);
          if (Number.isNaN(hours) || Number.isNaN(minutes)) return habit;

          const target = new Date(now);
          target.setHours(hours, minutes, 0, 0);

          const diff = now.getTime() - target.getTime();
          const withinWindow = diff >= 0 && diff <= 60 * 1000;
          const alreadyNotifiedToday = habit.reminderLastNotified === todayKey;
          const alreadyCompletedToday = hasCompletedToday(habit);

          if (withinWindow && !alreadyNotifiedToday && !alreadyCompletedToday) {
            triggered.push(habit);
            return {
              ...habit,
              reminderLastNotified: todayKey,
            };
          }

          return habit;
        })
      );

      if (triggered.length > 0) {
        const targetHabit = triggered[0];
        const message = `Time for "${targetHabit.name}"`;
        setToast({ id: crypto.randomUUID(), message });
        if (notificationPermission === "granted") {
          try {
            new Notification("HabitPulse Reminder", {
              body: message,
              tag: targetHabit.id,
            });
          } catch (error) {
            console.error("Notification error", error);
          }
        }
      }
    }, 30 * 1000);

    return () => clearInterval(interval);
  }, [habits.length, loaded, notificationPermission]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const filteredHabits = useMemo(() => {
    if (filter === "all") return habits;
    if (filter === "today") {
      return habits.filter((habit) => !hasCompletedToday(habit));
    }
    return habits.filter((habit) => Boolean(habit.reminderTime));
  }, [filter, habits]);

  const handleAddHabit = () => {
    if (!name.trim()) return;
    const habit = createHabit(name, time || null);
    setHabits((current) => [habit, ...current]);
    setName("");
    setTime("");
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddHabit();
    }
  };

  const requestNotifications = async () => {
    if (notificationPermission !== "default") return;
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
    } catch (error) {
      console.error("Permission error", error);
    }
  };

  const completeHabit = (habitId: string) => {
    const today = startOfDay(new Date());
    const todayIso = today.toISOString();
    setHabits((current) =>
      current.map((habit) => {
        if (habit.id !== habitId) return habit;
        if (habit.history.some((iso) => isSameDay(new Date(iso), today))) return habit;

        const lastDate = habit.lastCompleted ? startOfDay(new Date(habit.lastCompleted)) : null;
        const newHistory = uniqueHistory([...habit.history, todayIso]);
        const difference = lastDate ? differenceInCalendarDays(today, lastDate) : null;
        const continuing = difference === 1;
        const streak = continuing ? habit.streak + 1 : 1;
        const longestStreak = Math.max(streak, habit.longestStreak);

        return {
          ...habit,
          history: newHistory,
          streak,
          longestStreak,
          lastCompleted: todayIso,
        };
      })
    );
  };

  const resetHabit = (habitId: string) => {
    setHabits((current) =>
      current.map((habit) =>
        habit.id === habitId
          ? {
              ...habit,
              history: [],
              streak: 0,
              longestStreak: 0,
              lastCompleted: null,
              reminderLastNotified: null,
            }
          : habit
      )
    );
  };

  return (
    <>
      <section className="card">
        <div className="habit-form">
          <div className="input-group">
            <label htmlFor="habit-name" className="input-label">
              habit focus
            </label>
            <input
              id="habit-name"
              className="input-field"
              placeholder="e.g. Morning run, Journal, Read 20 pages"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="input-group">
            <label htmlFor="habit-time" className="input-label">
              reminder (optional)
            </label>
            <input
              id="habit-time"
              type="time"
              className="time-field"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
          <button className="action-button" onClick={handleAddHabit}>
            Add Habit
          </button>
        </div>
      </section>

      <section className="filters">
        <button
          className={`filter-pill ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All habits
        </button>
        <button
          className={`filter-pill ${filter === "today" ? "active" : ""}`}
          onClick={() => setFilter("today")}
        >
          Today&apos;s focus
        </button>
        <button
          className={`filter-pill ${filter === "reminders" ? "active" : ""}`}
          onClick={() => setFilter("reminders")}
        >
          With reminders
        </button>
      </section>

      <section className="habit-list">
        {filteredHabits.length === 0 ? (
          <div className="card list-empty">Start by adding a habit you care about most.</div>
        ) : (
          filteredHabits.map((habit) => {
            const completionCells = getCompletionHistory(habit);
            const completedToday = hasCompletedToday(habit);
            return (
              <article key={habit.id} className="habit-card">
                <div className="habit-header">
                  <div className="habit-info">
                    <span className="habit-name">{habit.name}</span>
                    <div className="habit-meta">
                      <span className="habit-streak">{habit.streak}-day streak</span>
                      <span>Record: {habit.longestStreak}</span>
                    </div>
                    {habit.reminderTime ? (
                      <div className="reminder-chip">
                        <span>
                          <span className="chip-dot" />
                          Reminder {habit.reminderTime}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="habit-actions">
                    <button
                      className="complete-button"
                      onClick={() => completeHabit(habit.id)}
                      disabled={completedToday}
                    >
                      {completedToday ? "Completed" : "I did it"}
                    </button>
                    <button
                      className="filter-pill"
                      style={{ fontSize: "0.8rem" }}
                      onClick={() => resetHabit(habit.id)}
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="history-grid" aria-hidden>
                  {completionCells.map(({ day, active }) => (
                    <div
                      key={format(day, "yyyy-MM-dd")}
                      className={`history-dot ${active ? "active" : ""}`}
                      title={`${format(day, "MMM d")}${active ? " • completed" : ""}`}
                    />
                  ))}
                </div>
              </article>
            );
          })
        )}
      </section>

      {notificationPermission === "default" && (
        <div className="reminder-banner">
          Enable push notifications so HabitPulse can nudge you right on time.
          <div>
            <button onClick={requestNotifications}>Enable reminders</button>
          </div>
        </div>
      )}

      {toast ? (
        <div className="toast">
          <span role="img" aria-label="alarm">
            ⏰
          </span>
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
