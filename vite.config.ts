import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validatePublicConfig } from './src/publicConfig';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  validatePublicConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
  return { plugins: [react()] };
});
