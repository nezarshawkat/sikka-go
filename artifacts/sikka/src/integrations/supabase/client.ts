export const supabase = {
  from: () => ({ select: () => Promise.resolve({ data: [], error: null }), insert: () => Promise.resolve({ error: new Error('Supabase removed') }), update: () => Promise.resolve({ error: new Error('Supabase removed') }), delete: () => Promise.resolve({ error: new Error('Supabase removed') }) }),
  functions: { invoke: () => Promise.resolve({ data: null, error: new Error('Supabase removed') }) },
  auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }), signOut: () => Promise.resolve({ error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
};
