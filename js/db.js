/* Minimal DB utilities for Supabase
   - createCliente
   - createLote
   - createRecetaWithProductos
   - getRecetasForUser
   Requires window.supabaseClient
*/
(function(){
  function ensure(){
    if(!window.supabaseClient) throw new Error('Supabase client not initialized');
    return window.supabaseClient;
  }

  async function createCliente(user_id, cliente){
    const sb = ensure();
    const payload = Object.assign({}, cliente, { user_id });
    const { data, error } = await sb.from('clientes').insert([payload]).select('*').single();
    if(error) throw error;
    return data;
  }

  async function createLote(cliente_id, lote){
    const sb = ensure();
    const payload = Object.assign({}, lote, { cliente_id });
    const { data, error } = await sb.from('lotes').insert([payload]).select('*').single();
    if(error) throw error;
    return data;
  }

  async function createRecetaWithProductos(user_id, clienteData, loteData, recetaData, productos){
    const sb = ensure();
    try{
      // create or find cliente - naive: always insert (caller may implement dedupe)
      const cliente = await createCliente(user_id, clienteData);
      const lote = await createLote(cliente.id, loteData);

      const recetaPayload = Object.assign({}, recetaData, { user_id, cliente_id: cliente.id, lote_id: lote.id });
      const { data: receta, error: recetaErr } = await sb.from('recetas').insert([recetaPayload]).select('*').single();
      if(recetaErr) throw recetaErr;

      // insert productos
      const productosPayload = (productos || []).map(p => Object.assign({}, p, { receta_id: receta.id }));
      if(productosPayload.length > 0){
        const { error: prodErr } = await sb.from('receta_productos').insert(productosPayload);
        if(prodErr) throw prodErr;
      }

      return receta;
    }catch(e){
      console.error('createRecetaWithProductos error', e);
      throw e;
    }
  }

  async function getRecetasForUser(user_id){
    const sb = ensure();
    const { data, error } = await sb.from('recetas').select('*, receta_productos(*)').eq('user_id', user_id).order('created_at', { ascending: false });
    if(error) throw error;
    return data;
  }

  window.db = { createCliente, createLote, createRecetaWithProductos, getRecetasForUser };
})();
