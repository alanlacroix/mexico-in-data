// Cloudflare Pages Function: our own subscribe form -> beehiiv, with the API key kept SERVER-SIDE.
// The public site posts {email} here; this calls beehiiv's API with secrets from Cloudflare env vars,
// so the key never touches the page. Set BEEHIIV_API_KEY and BEEHIIV_PUB_ID in the Pages project's
// Settings -> Environment variables. Route: POST /api/subscribe.
const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  let email = '';
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) { const b = await request.json(); email = String(b.email || '').trim(); }
    else { const f = await request.formData(); email = String(f.get('email') || '').trim(); }
  } catch (_) { /* fall through to validation */ }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'Enter a valid email address.' }, 400);
  if (!env.BEEHIIV_API_KEY || !env.BEEHIIV_PUB_ID) return json({ ok: false, error: 'Signups are not switched on yet. Try again shortly.' }, 503);

  try {
    const r = await fetch(`https://api.beehiiv.com/v2/publications/${env.BEEHIIV_PUB_ID}/subscriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.BEEHIIV_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reactivate_existing: true, send_welcome_email: true, utm_source: 'mexicobrief.com' }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); return json({ ok: false, error: 'Could not subscribe right now, please try again.', detail: t.slice(0, 200) }, 502); }
    return json({ ok: true }, 200);
  } catch (_) {
    return json({ ok: false, error: 'Network error, please try again.' }, 502);
  }
}

// GET /api/subscribe -> a tiny health check so we can confirm Functions are live and whether the env is set.
export async function onRequestGet({ env }) {
  return json({ ok: true, configured: Boolean(env.BEEHIIV_API_KEY && env.BEEHIIV_PUB_ID) }, 200);
}
