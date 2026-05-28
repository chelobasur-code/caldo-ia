/* Supabase client initializer
   Expectations:
   - Include @supabase/supabase-js via CDN or bundler so that `supabase.createClient` is available
   - Provide `window.SUPABASE_URL` and `window.SUPABASE_ANON_KEY` in your index.html or set up via bundler env
   This script attaches `window.supabaseClient` (the initialized client) or null if not available.
*/
(function(){
  try{
    const url = window.SUPABASE_URL || '';
    const key = window.SUPABASE_ANON_KEY || '';
    if(!url || !key){
      console.warn('Supabase: SUPABASE_URL or SUPABASE_ANON_KEY not set on window. Configure them before initialization.');
    }

    // Prefer global `supabase` (CDN or bundle exposing createClient)
    if(window.supabase && typeof window.supabase.createClient === 'function'){
      window.supabaseClient = window.supabase.createClient(url, key);
      return;
    }

    // Some bundles expose createClient directly
    if(window.createClient && typeof window.createClient === 'function'){
      window.supabaseClient = window.createClient(url, key);
      return;
    }

    // If neither available, leave null and log instructions
    console.warn('Supabase JS not found. Add the CDN script or install @supabase/supabase-js and bundle it.');
    window.supabaseClient = null;
  }catch(e){
    console.error('Error initializing Supabase client', e);
    window.supabaseClient = null;
  }
})();
