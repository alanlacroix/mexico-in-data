// Cloudflare Pages Function: our own subscribe form -> beehiiv, with the API key kept SERVER-SIDE.
// The public site posts {email} here; this calls beehiiv's API with secrets from Cloudflare env vars,
// so the key never touches the page. Set BEEHIIV_API_KEY and BEEHIIV_PUB_ID in the Pages project's
// Settings -> Environment variables. Route: POST /api/subscribe.
const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} });

const MAX_BODY_BYTES = 2048;

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // API clients still pass body, email, honeypot, and provider validation
  try { return new URL(origin).host === new URL(request.url).host; }
  catch { return false; }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Request not allowed.' }, 403);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) return json({ ok: false, error: 'Request too large.' }, 413);

  const ct = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['application/json', 'application/x-www-form-urlencoded'].includes(ct)) {
    return json({ ok: false, error: 'Unsupported request type.' }, 415);
  }

  let email = '', website = '';
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ ok: false, error: 'Request too large.' }, 413);
    const body = ct === 'application/json' ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw));
    email = String(body.email || '').trim();
    website = String(body.website || '').trim();
  } catch (_) { /* fall through to validation */ }

  // Honeypot: answer normally so simple bots do not learn how to route around it.
  if (website) return json({ ok: true }, 200);
  if (email.length > 254) return json({ ok: false, error: 'Enter a valid email address.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'Enter a valid email address.' }, 400);
  if (!env.BEEHIIV_API_KEY || !env.BEEHIIV_PUB_ID) return json({ ok: false, error: 'Signups are not switched on yet. Try again shortly.' }, 503);

  try {
    const r = await fetch(`https://api.beehiiv.com/v2/publications/${env.BEEHIIV_PUB_ID}/subscriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.BEEHIIV_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: true,
        double_opt_override: 'on',
        utm_source: 'mexicobrief.com',
        utm_medium: 'website',
        utm_campaign: 'weekly',
      }),
    });
    if (!r.ok) return json({ ok: false, error: 'Could not subscribe right now. Please try again.' }, 502);
    return json({ ok: true }, 200);
  } catch (_) {
    return json({ ok: false, error: 'Could not subscribe right now. Please try again.' }, 502);
  }
}

// GET /api/subscribe -> a tiny health check so we can confirm Functions are live and whether the env is set.
export async function onRequestGet({ env }) {
  return json({ ok: true, configured: Boolean(env.BEEHIIV_API_KEY && env.BEEHIIV_PUB_ID) }, 200);
}
