// Alert emails through Resend (RESEND_API_KEY + ALERT_EMAIL). Without them, alerts still show in the app.
import { getJSON } from './http.js';

export const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL);
const escHTML = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendMail(subject, lines, link) {
  if (!mailReady()) return { sent: false, reason: 'not_configured' };
  const to = process.env.ALERT_EMAIL.split(',').map(s => s.trim()).filter(Boolean);
  const text = lines.join('\n\n') + (link ? '\n\nOpen the plan: ' + link : '');
  const html = lines.map(l => `<p style="font:15px/1.5 system-ui,sans-serif;margin:0 0 12px">${escHTML(l)}</p>`).join('')
    + (link ? `<p style="font:15px/1.5 system-ui,sans-serif"><a href="${escHTML(link)}">Open the plan</a></p>` : '');
  const r = await getJSON('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.ALERT_FROM || 'Trip planner <onboarding@resend.dev>', to, subject, text, html })
  });
  return r.ok ? { sent: true } : { sent: false, reason: (r.json && r.json.message) || 'Resend error ' + r.status };
}
