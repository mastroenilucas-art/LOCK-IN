// Settings come from app.config.json at the top of the project.
// Edit that file, not this one.
import cfg from '../app.config.json';

export const APP_NAME = (cfg.appName || 'Coach').trim();
export const SUPABASE_URL = (cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
export const SUPABASE_KEY = (cfg.supabaseKey || '').trim();
export const HELP_EMAIL = (cfg.helpEmail || '').trim();

// True until the placeholders in app.config.json are replaced with real values.
export const NEEDS_SETUP =
  !/^https?:\/\/.+/.test(SUPABASE_URL) ||
  SUPABASE_URL.includes('YOUR-PROJECT-ID') ||
  !SUPABASE_KEY ||
  SUPABASE_KEY.includes('PASTE-YOUR-KEY');
