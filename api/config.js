import { send, access, calToken, locked } from './_lib/http.js';
import { backend } from './_lib/store.js';
import { rakutenReady } from './_lib/rakuten.js';
import { mailReady } from './_lib/mail.js';

export default function handler(req, res) {
  const { canEdit, canView } = access(req);
  send(res, 200, {
    canEdit, canView, locked: locked(),
    storage: backend,
    calToken: canView ? calToken() : '',
    features: {
      fx: true, weather: true, walk: true, geocode: true, discover: true,
      hotels: rakutenReady(),
      watch: rakutenReady() && !!process.env.CRON_SECRET,
      mail: mailReady()
    }
  });
}
