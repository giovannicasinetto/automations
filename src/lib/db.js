// Supabase service-role client. Server-side only — never ship this key to a
// browser. Reads config from .env.
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.warn('[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — DB writes will fail. Fill .env.');
}

const supabase = createClient(url || 'http://localhost', key || 'anon', {
  auth: { persistSession: false },
});

// Small helper: upsert in chunks to stay under payload limits.
async function upsertChunked(table, rows, opts = {}, chunk = 500) {
  const out = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { data, error } = await supabase.from(table).upsert(slice, opts).select();
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}

module.exports = { supabase, upsertChunked };
