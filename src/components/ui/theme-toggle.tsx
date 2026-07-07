"use client"

import { useState, useEffect } from "react"
import { Moon, Sun } from "lucide-react"
import { cn } from "../../lib/utils"

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark') || localStorage.getItem('bc_theme') === 'dark'
  )

  // Sync document element + persist choice across reloads.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('bc_theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Thème sombre"
      className={cn(
        "flex w-14 h-7 p-0.5 rounded-full cursor-pointer transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-green focus-visible:ring-offset-2",
        isDark
          ? "bg-slate-800 border-slate-700"
          : "bg-slate-100 border border-bc-border",
        className
      )}
      onClick={() => setIsDark(!isDark)}
    >
      <div className="flex items-center w-full relative">
        <div className="w-full flex justify-between px-1.5 absolute">
          <Sun className={cn("w-3.5 h-3.5 transition-opacity", isDark ? "text-slate-400" : "opacity-0")} strokeWidth={2} />
          <Moon className={cn("w-3.5 h-3.5 transition-opacity", isDark ? "opacity-0" : "text-slate-400")} strokeWidth={2} />
        </div>
        <div
          className={cn(
            "z-10 flex justify-center items-center w-5 h-5 rounded-full transition-transform duration-300",
            isDark 
              ? "transform translate-x-7 bg-slate-700 shadow-sm" 
              : "transform translate-x-0.5 bg-white shadow-sm"
          )}
        >
          {isDark ? (
            <Moon 
              className="w-3 h-3 text-white" 
              strokeWidth={2}
            />
          ) : (
            <Sun 
              className="w-3 h-3 text-slate-700" 
              strokeWidth={2}
            />
          )}
        </div>
      </div>
    </button>
  )
}
