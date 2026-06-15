/* Meraki Travel — data layer (Supabase).
   Exposes window.DB. When config is blank, DB.ready is false and every call is a
   safe no-op, so the app runs fully local. When configured, this handles auth,
   community places, itineraries, comments and likes (no dislikes). */
(function () {
  const cfg = (window.MERAKI_CONFIG || {});
  const ready = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  let sb = null;
  if (ready) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  const authCbs = [];
  let session = null, profile = null;

  async function loadProfile() {
    if (!session) { profile = null; return null; }
    const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    profile = data || { id: session.user.id, handle: 'you', display_name: 'You' };
    return profile;
  }
  function fireAuth() { authCbs.forEach(cb => { try { cb(session, profile); } catch (e) {} }); }

  if (ready) {
    sb.auth.getSession().then(async ({ data }) => {
      session = data.session; if (session) await loadProfile(); fireAuth();
    });
    sb.auth.onAuthStateChange(async (_e, s) => {
      session = s; if (session) await loadProfile(); else profile = null; fireAuth();
    });
  }

  // dataURL -> Blob (for Storage uploads)
  function dataURLtoBlob(d) {
    const [head, b64] = d.split(',');
    const mime = (head.match(/:(.*?);/) || [, 'image/jpeg'])[1];
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  // camelCase place (app shape) -> snake_case row (db shape)
  function toRow(p) {
    return {
      city_id: p.city, category: p.category, subcategory: p.subcategory,
      name: p.name, neighborhood: p.neighborhood, address: p.address,
      lat: p.lat, lng: p.lng, price: p.price || null,
      review_summary: p.reviewSummary || null, google_review_summary: p.googleReviewSummary || null,
      local_tip: p.localTip || null, story: p.story || null, highlight: p.highlight || null,
      source: 'community', author_id: session && session.user.id, status: 'published'
    };
  }
  // db row -> app place shape (namespaced id like curated places)
  function fromRow(r) {
    return {
      id: r.city_id + '/' + r.id, _rawId: r.id, city: r.city_id, dbId: r.id,
      source: 'community', author: r.author_id === (session && session.user.id) ? 'me' : 'other',
      authorId: r.author_id, category: r.category, subcategory: r.subcategory || 'added by the community',
      name: r.name, neighborhood: r.neighborhood, address: r.address || '',
      lat: r.lat, lng: r.lng, price: r.price || '',
      googleRating: 0, googleReviewCount: 0,
      reviewSummary: r.review_summary || '', googleReviewSummary: '', localTip: r.local_tip || '',
      story: r.story || '', highlight: r.highlight || '', likeCount: r.like_count || 0,
      photoUrls: (r.place_photos || []).map(x => x.url), createdAt: r.created_at
    };
  }

  const DB = {
    ready,
    get session() { return session; },
    get user() { return session ? session.user : null; },
    get profile() { return profile; },
    onAuth(cb) { authCbs.push(cb); if (session !== null || !ready) cb(session, profile); },

    async signInEmail(email) {
      if (!ready) return { error: 'not configured' };
      return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href.split('?')[0] } });
    },
    async signInGoogle() {
      if (!ready) return { error: 'not configured' };
      return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href.split('?')[0] } });
    },
    async signInApple() {
      if (!ready) return { error: 'not configured' };
      return sb.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: window.location.href.split('?')[0] } });
    },
    async signInPhone(phone) {
      if (!ready) return { error: { message: 'not configured' } };
      return sb.auth.signInWithOtp({ phone });          // sends an SMS code
    },
    async verifyPhone(phone, token) {
      if (!ready) return { error: { message: 'not configured' } };
      return sb.auth.verifyOtp({ phone, token, type: 'sms' });
    },
    async signOut() { if (ready) await sb.auth.signOut(); },

    // ---- email + password ----
    async signUpEmail(email, password, name) {
      if (!ready) return { error: { message: 'not configured' } };
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: name ? { name } : undefined, emailRedirectTo: window.location.href.split('?')[0] }
      });
      // confirm-email ON -> user but no session; OFF -> session present
      return { data, error, needsConfirm: !error && data && data.user && !data.session };
    },
    async signInPassword(email, password) {
      if (!ready) return { error: { message: 'not configured' } };
      return sb.auth.signInWithPassword({ email, password });
    },
    async resetPassword(email) {
      if (!ready) return { error: { message: 'not configured' } };
      return sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href.split('?')[0] });
    },
    async updatePassword(password) {
      if (!ready || !session) return { error: { message: 'sign in first' } };
      return sb.auth.updateUser({ password });
    },
    async updateEmail(email) {
      if (!ready || !session) return { error: { message: 'sign in first' } };
      return sb.auth.updateUser({ email });
    },

    // ---- profile ----
    async updateProfile(fields) {
      if (!ready || !session) return null;
      const { data, error } = await sb.from('profiles').update(fields).eq('id', session.user.id).select().single();
      if (error) { console.warn('updateProfile', error.message); return null; }
      profile = data;
      return data;
    },
    async uploadAvatar(dataUrl) {
      return DB.uploadPhoto(dataUrl, 'avatars/' + (session ? session.user.id : 'anon'));
    },
    async getMyItineraries() {
      if (!ready || !session) return [];
      const { data } = await sb.from('itineraries').select('*').eq('author_id', session.user.id)
        .order('created_at', { ascending: false });
      return data || [];
    },

    // ---- shared journals (moments) ----
    async shareMoment(m) {
      if (!ready || !session) return null;
      const { data, error } = await sb.from('moments').insert({
        author_id: session.user.id, city_id: m.cityId, place_ref: m.placeRef || null,
        place_name: m.placeName || null, body: m.body || null, mood: m.mood || null,
        happened_at: m.happenedAt || null, is_public: true
      }).select('*, profiles(handle, display_name, avatar_url)').single();
      if (error) { console.warn('shareMoment', error.message); return null; }
      return data;
    },
    async getCityMoments(cityId) {
      if (!ready) return [];
      const { data, error } = await sb.from('moments')
        .select('*, profiles(handle, display_name, avatar_url)')
        .eq('city_id', cityId).eq('is_public', true)
        .order('created_at', { ascending: false }).limit(100);
      if (error) { console.warn('getCityMoments', error.message); return []; }
      return data || [];
    },

    // ---- places ----
    async getCommunityPlaces(cityId) {
      if (!ready) return [];
      const { data, error } = await sb.from('places')
        .select('*, place_photos(url)').eq('city_id', cityId).eq('status', 'published')
        .order('created_at', { ascending: false });
      if (error) { console.warn('getCommunityPlaces', error.message); return []; }
      return (data || []).map(fromRow);
    },
    async addPlace(place, photoDataUrls) {
      if (!ready || !session) return null;
      const { data, error } = await sb.from('places').insert(toRow(place)).select().single();
      if (error) { console.warn('addPlace', error.message); return null; }
      if (photoDataUrls && photoDataUrls.length) {
        for (const d of photoDataUrls) {
          const url = await DB.uploadPhoto(d, 'places/' + data.id);
          if (url) await sb.from('place_photos').insert({ place_id: data.id, url, author_id: session.user.id });
        }
      }
      const { data: full } = await sb.from('places').select('*, place_photos(url)').eq('id', data.id).single();
      return fromRow(full || data);
    },
    async uploadPhoto(dataUrl, prefix) {
      if (!ready || !session) return null;
      try {
        const blob = dataURLtoBlob(dataUrl);
        const path = prefix + '/' + crypto.randomUUID() + '.jpg';
        const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: blob.type, upsert: false });
        if (error) { console.warn('uploadPhoto', error.message); return null; }
        return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
      } catch (e) { console.warn('uploadPhoto', e); return null; }
    },

    // push local (device) places up on first sign-in; returns count synced
    async migrateLocal(localPlaces, photoCache) {
      if (!ready || !session || !localPlaces.length) return 0;
      let n = 0;
      for (const p of localPlaces) {
        const photos = (photoCache && photoCache[p.id]) || [];
        const row = await DB.addPlace(p, photos);
        if (row) n++;
      }
      return n;
    },

    // ---- itineraries ----
    async getItineraries(cityId) {
      if (!ready) return [];
      const { data, error } = await sb.from('itineraries')
        .select('*, profiles(handle, display_name)')
        .eq('city_id', cityId).eq('is_published', true)
        .order('like_count', { ascending: false }).order('created_at', { ascending: false });
      if (error) { console.warn('getItineraries', error.message); return []; }
      return data || [];
    },
    async getItinerary(id) {
      if (!ready) return null;
      const { data } = await sb.from('itineraries').select('*, profiles(handle, display_name)').eq('id', id).single();
      if (!data) return null;
      const { data: stops } = await sb.from('itinerary_stops').select('*').eq('itinerary_id', id)
        .order('day').order('position');
      data.stops = stops || [];
      return data;
    },
    async createItinerary(itin, stops, publish) {
      if (!ready || !session) return null;
      const { data, error } = await sb.from('itineraries').insert({
        city_id: itin.cityId, author_id: session.user.id, title: itin.title,
        summary: itin.summary || null, days: itin.days || 1, is_published: !!publish
      }).select().single();
      if (error) { console.warn('createItinerary', error.message); return null; }
      if (stops && stops.length) {
        const rows = stops.map((s, i) => ({
          itinerary_id: data.id, day: s.day || 1, position: s.position != null ? s.position : i,
          place_ref: s.placeRef, place_name: s.placeName, note: s.note || null
        }));
        await sb.from('itinerary_stops').insert(rows);
      }
      return data;
    },

    // ---- likes (no dislikes) ----
    async likedSet(targetType, ids) {
      if (!ready || !session || !ids.length) return new Set();
      const { data } = await sb.from('likes').select('target_id')
        .eq('target_type', targetType).eq('user_id', session.user.id).in('target_id', ids);
      return new Set((data || []).map(r => r.target_id));
    },
    async toggleLike(targetType, targetId, currentlyLiked) {
      if (!ready || !session) return { needsAuth: !session };
      if (currentlyLiked) {
        await sb.from('likes').delete().eq('target_type', targetType).eq('target_id', targetId).eq('user_id', session.user.id);
        return { liked: false };
      }
      await sb.from('likes').insert({ target_type: targetType, target_id: targetId, user_id: session.user.id });
      return { liked: true };
    },

    // ---- comments ----
    async getComments(targetType, targetId) {
      if (!ready) return [];
      const { data } = await sb.from('comments').select('*, profiles(handle, display_name)')
        .eq('target_type', targetType).eq('target_id', targetId).order('created_at');
      return data || [];
    },
    async addComment(targetType, targetId, body) {
      if (!ready || !session) return null;
      const { data, error } = await sb.from('comments')
        .insert({ target_type: targetType, target_id: targetId, author_id: session.user.id, body })
        .select('*, profiles(handle, display_name)').single();
      if (error) { console.warn('addComment', error.message); return null; }
      return data;
    },
    async report(targetType, targetId, reason) {
      if (!ready || !session) return false;
      const { error } = await sb.from('reports')
        .insert({ target_type: targetType, target_id: targetId, reporter_id: session.user.id, reason: reason || null });
      return !error;
    }
  };

  window.DB = DB;
})();
