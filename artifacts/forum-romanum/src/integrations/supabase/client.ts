import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://hajfuirqchzucmkeaxxd.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhamZ1aXJxY2h6dWNta2VheHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDkwNTksImV4cCI6MjA5MjQyNTA1OX0.pzTjau8MGEFNpVu3lly5i3XPb6wpBAWZDB5BGg7Lls0";

export const isConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "forum-romanum-auth",
  },
});

export const signOut = async () => {
  await supabase.auth.signOut();
};
