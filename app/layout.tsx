import "./globals.css";
import { ReactNode } from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "HabitPulse",
  description: "A mobile habit tracker with streaks and smart reminders.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="app-shell">
          <header className="app-header">
            <div className="branding">
              <span className="logo">HabitPulse</span>
              <span className="tagline">Stay on track with streaks & reminders</span>
            </div>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
