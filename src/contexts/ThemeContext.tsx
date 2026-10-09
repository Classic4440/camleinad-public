import { createContext, useContext, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type SiteTheme = 'paper' | 'mist' | 'ink' | 'ember';

interface ThemeContextValue {
    theme: SiteTheme;
    cycleTheme: () => void;
    setTheme: (nextTheme: SiteTheme) => void;
}

const THEMES: SiteTheme[] = ['paper', 'mist', 'ink', 'ember'];
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(nextTheme: SiteTheme) {
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.classList.toggle('dark', nextTheme === 'ink' || nextTheme === 'ember');
    try {
        localStorage.setItem('cam-theme', nextTheme);
    } catch {
        // Keep the active session usable if browser storage is unavailable.
    }
}

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
    const [theme, setThemeState] = useState<SiteTheme>(initialTheme);

    useLayoutEffect(() => {
        applyTheme(theme);
    }, [theme]);

    function setTheme(nextTheme: SiteTheme) {
        if (!THEMES.includes(nextTheme)) return;
        setThemeState(nextTheme);
    }

    function cycleTheme() {
        setThemeState(current => {
            const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
            return next;
        });
    }

    return <ThemeContext.Provider value={{ theme, cycleTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used inside ThemeProvider');
    return context;
}