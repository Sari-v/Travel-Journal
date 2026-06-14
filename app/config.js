/* Meraki Travel — runtime config.
   Paste your Supabase project credentials here to switch on community features
   (accounts, cloud places, shared itineraries, likes & comments).
   Find them in Supabase → Project Settings → API.
   The anon key is safe to ship in a static site: Row-Level Security guards the data.
   Leave blank to run fully local (Add-a-place still works, stored on this device). */
window.MERAKI_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};
