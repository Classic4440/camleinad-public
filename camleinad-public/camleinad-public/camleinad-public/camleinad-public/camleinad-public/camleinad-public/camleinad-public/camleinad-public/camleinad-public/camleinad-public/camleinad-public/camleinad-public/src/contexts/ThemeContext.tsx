import { createContext, useContext, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type SiteTheme = 'paper' | 'mist' | 'ink' | 'ember';

interface ThemeContextValue {
    theme: SiteTheme;
    cycleTheme: () => void;
}

const THEMES: SiteTheme[] = ['paper', 'mist', 'ink', 'ember'];
const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialTheme(): SiteTheme {
    let saved: string | null = null;
    try {
        saved = localStorage.getItem('cam-theme');
    } catch {
        saved = null;
    }

    if (saved && THEMES.includes(saved as SiteTheme)) {
        return saved as SiteTheme;
    }
    if (saved === 'light') return 'paper';
    if (saved === 'dark') return 'ink';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'paper';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<SiteTheme>(initialTheme);

    useLayoutEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.toggle('dark', theme === 'ink' || theme === 'ember');
    }, [theme]);

    function cycleTheme() {
        setTheme(current => {
            const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
            document.documentElement.dataset.theme = next;
            document.documentElement.classList.toggle('dark', next === 'ink' || next === 'ember');
            try {
                localStorage.setItem('cam-theme', next);
            } catch {
                // Keep the active session usable if browser storage is unavailable.
            }
            return next;
        });
    }

    return <ThemeContext.Provider value={{ theme, cycleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used inside ThemeProvider');
    return context;
}