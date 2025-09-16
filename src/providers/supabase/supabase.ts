import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Utility: Clear local session/state quickly when app is opened with ?reset=1
try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('reset') === '1') {
        localStorage.clear();
        sessionStorage.clear();
        // Supabase stores auth in localStorage under this key
        localStorage.removeItem('sb-' + btoa(import.meta.env.VITE_SUPABASE_URL) + '-auth-token');
        // Strip the query param and reload once
        url.searchParams.delete('reset');
        window.location.replace(url.toString());
    }
} catch {}
