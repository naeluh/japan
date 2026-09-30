import { send, access } from './_lib/http.js';
import { hasRedis } from './_lib/store.js';

export default function handler(req, res) {
  const { canEdit, canView } = access(req);
  send(res, 200, {
    canEdit, canView,
    storage: hasRedis ? 'redis' : 'local',
    features: {
      fx: true, weather: true, walk: true, geocode: true,
      hotels: !!(process.env.RAKUTEN_APP_ID && process.env.RAKUTEN_ACCESS_KEY)
    }
  });
}
