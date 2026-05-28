/* Lightweight auth helpers for Supabase
   Exposes `window.auth` with simple methods for signUp, signIn, signOut, getCurrentUser, onAuthStateChange
   Requires `window.supabaseClient` to be initialized (see js/supabaseClient.js).
*/
(function(){
  function ensure(){
    if(!window.supabaseClient){
      throw new Error('Supabase client not initialized (window.supabaseClient)');
    }
    return window.supabaseClient;
  }

  async function signUp(email, password, profile){
    const sb = ensure();
    try{
      const res = await sb.auth.signUp({ email, password });
      if(res.error) throw res.error;
      // create profile row if profile provided
      if(profile && res.user){
        await sb.from('profiles').insert([{ id: res.user.id, nombre: profile.nombre || null, rol: profile.rol || 'productor' }]);
      }
      return res;
    }catch(e){
      console.error('signUp error', e);
      throw e;
    }
  }

  async function signIn(email, password){
    const sb = ensure();
    try{
      const res = await sb.auth.signInWithPassword ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signIn({ email, password });
      if(res.error) throw res.error;
      return res;
    }catch(e){
      console.error('signIn error', e);
      throw e;
    }
  }

  async function signOut(){
    const sb = ensure();
    try{
      const res = await sb.auth.signOut();
      return res;
    }catch(e){
      console.error('signOut error', e);
      throw e;
    }
  }

  async function getCurrentUser(){
    const sb = ensure();
    try{
      if(sb.auth.getUser) {
        const { data, error } = await sb.auth.getUser();
        if(error) throw error;
        return data.user;
      }
      return sb.auth.user ? sb.auth.user() : null;
    }catch(e){
      console.error('getCurrentUser error', e);
      return null;
    }
  }

  function onAuthStateChange(cb){
    if(!window.supabaseClient) return () => {};
    const sub = window.supabaseClient.auth.onAuthStateChange((event, session) => cb(event, session));
    return () => { if(sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe(); };
  }

  window.auth = { signUp, signIn, signOut, getCurrentUser, onAuthStateChange };
})();
