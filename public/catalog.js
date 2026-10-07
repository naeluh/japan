// Where to stay, how to get between cities and what to do: the options and the expected total for two.
// Pure data and math (no DOM): the Plan screen (stays.js) and the tests import it. Prices are April 2027 estimates in
// US dollars for both of you; stays are per night (lo–hi), legs and extras are totals. Nights always come from the route.
import { links } from './trip.js';

const q = links.google;

/* City name -> option pool. A second Tokyo stop gets the east-side list. */
export const CITY = {
  tokyo: { jp: '東京', color: 'tokyo' },
  tokyo2: { jp: '東京', color: 'tokyo', note: 'Your first stay is on the west side, so this list leads with old and central Tokyo: Nihonbashi, Asakusa, Ginza, Marunouchi and Yanaka.' },
  hakone: { jp: '箱根', color: 'hakone' },
  kyoto: { jp: '京都', color: 'kyoto' },
  naoshima: { jp: '直島', color: 'naoshima' }
};
export const DEFAULT_STAY = { tokyo: 'trunk', tokyo2: 'k5', hakone: 'fore', kyoto: 'ace', naoshima: 'mylodge' };

// lo/hi = estimated April price per night for two. meals: 'db' dinner and breakfast, 'b' breakfast.
const TOKYO = [
  { id: 'trunk', west: true, name: 'TRUNK(HOTEL) Yoyogi Park', area: 'Tomigaya', blurb: 'Rooftop heated pool and fire pit, Scandinavian-Japanese design, next to Yoyogi Park.', lo: 650, hi: 900, type: 'hotel', url: 'https://www.expedia.com/go/hotel/info/95141392' },
  { id: 'mustard', west: true, name: 'MUSTARD Hotel Shimokitazawa', area: 'Shimokitazawa', blurb: 'Café lobby, garden and a small bar. The best value with character.', lo: 150, hi: 230, type: 'hotel', url: 'https://www.hotels.com/ho2005725312/mustard-hotel-shimokitazawa-tokyo-japan' },
  { id: 'alldayplace', west: true, name: 'all day place shibuya', area: 'Shibuya', blurb: 'Compact, stylish rooms and a ground-floor coffee bar.', lo: 220, hi: 320, type: 'hotel', url: 'https://www.hotels.com/ho2322491968/all-day-place-shibuya-tokyo-japan' },
  { id: 'yuenbettei', west: true, name: 'Yuen Bettei Daita', area: 'Edge of Shimokitazawa', blurb: 'Indoor and outdoor hot spring baths. Some rooms have a hinoki tub or private garden.', lo: 300, hi: 650, type: 'ryokan', onsen: true, url: 'https://www.trip.com/hotels/tokyo-hotel-detail-60905083/onsen-ryokan-yuen-bettei-tokyo-daita' },
  { id: 'yuenshinjuku', west: true, name: 'Onsen Ryokan Yuen Shinjuku', area: 'Shinjuku', blurb: 'Rooftop hot spring with water brought in daily from Nakaizu.', lo: 280, hi: 450, type: 'ryokan', onsen: true, url: 'https://www.trip.com/hotels/v2/tokyo-hotel-detail-32579406/onsen-ryokan-yuen-shinjuku' },
  { id: 'sawanoya', name: 'Ryokan Sawanoya', area: 'Yanaka, old Tokyo', blurb: 'Family-run since 1949, with private cypress and clay baths you lock for yourselves.', lo: 110, hi: 200, type: 'ryokan', url: 'https://www.gotokyo.org/en/spot/232/index.html' },
  { id: 'hoshinoya', name: 'HOSHINOYA Tokyo', area: 'Otemachi', blurb: 'A 17-floor tower of ryokan with a natural hot spring on the top floor.', lo: 1200, hi: 1800, type: 'ryokan', onsen: true, url: 'https://www.expedia.com/Tokyo-Hotels-HOSHINOYA-Tokyo.h16250945.Hotel-Information' },
  { id: 'excel', west: true, name: 'Kichijoji Excel Hotel Tokyu', area: 'Kichijoji', blurb: 'The nicest hotel in Kichijoji, a short walk to Inokashira Park.', lo: 200, hi: 320, type: 'hotel', url: 'https://www.tokyuhotels.co.jp/en/kichijoji-e/index.html' },
  { id: 'rei', west: true, name: 'Kichijoji Tokyu REI Hotel', area: 'Kichijoji', blurb: 'Simple and clean, 3 minutes from Inokashira Park.', lo: 140, hi: 220, type: 'hotel', url: 'https://www.tokyuhotelsjapan.com/global/kichijoji-r/' },
  { id: 'bna', west: true, name: 'BnA Hotel Koenji', area: 'Koenji', blurb: 'Two artist-designed rooms, a bar with locals and a rooftop lounge.', lo: 150, hi: 250, type: 'hotel', url: 'http://www.bna-koenji.com/' },
  { id: 'mets', west: true, name: 'JR East Hotel Mets Koenji', area: 'Koenji', blurb: 'Practical and connected to the station.', lo: 130, hi: 200, type: 'hotel', url: 'https://www.expedia.com/go/hotel/info/22953231' }
];
const TOKYO_EAST = [
  { id: 'k5', name: 'Hotel K5', area: 'Nihonbashi Kabutocho', blurb: 'A 1923 bank building turned design hotel, with a bar, a restaurant and beds veiled in indigo. Faces the old Tokyo Stock Exchange.', lo: 400, hi: 650, type: 'hotel', url: 'https://www.ikyu.com/en-us/00002752/' },
  { id: 'gatekaminarimon', name: 'The Gate Hotel Kaminarimon', area: 'Asakusa', blurb: 'Across from Senso-ji, with a 13th-floor restaurant and bar looking out at Tokyo Skytree.', lo: 260, hi: 400, type: 'hotel', url: 'https://www.ikyu.com/en-us/00001822/' },
  { id: 'mujiginza', name: 'MUJI HOTEL GINZA', area: 'Ginza', blurb: 'Calm, minimal rooms above MUJI’s flagship store, in the middle of Ginza.', lo: 320, hi: 450, type: 'hotel', url: 'https://travel.rakuten.com/hkg/en-us/hotel_info_item/cnt_japan/sub_tokyo/cty_chuo_ward/10123456874002/' },
  { id: 'tokyostation', name: 'The Tokyo Station Hotel', area: 'Marunouchi', blurb: 'Inside the restored red-brick Tokyo Station building. Narita Express leaves from downstairs.', lo: 450, hi: 700, type: 'hotel', url: q('The Tokyo Station Hotel booking') },
  { id: 'hamacho', name: 'Hamacho Hotel Tokyo Nihonbashi', area: 'Nihonbashi Hamacho', blurb: 'Green, design-led hotel near the Sumida River and the Kiyosumi-Shirakawa coffee district.', lo: 200, hi: 300, type: 'hotel', url: q('Hamacho Hotel Tokyo Nihonbashi booking') },
  { id: 'nono', name: 'Onyado Nono Asakusa', area: 'Asakusa', blurb: 'Hot spring hotel with tatami touches and natural hot spring baths. Rough price estimate.', lo: 160, hi: 260, type: 'ryokan', onsen: true, url: q('Onyado Nono Asakusa Natural Hot Springs booking') },
  { id: 'bvlgari', name: 'Bvlgari Hotel Tokyo', area: 'Yaesu, by Tokyo Station', blurb: 'High-floor luxury next to Tokyo Station.', lo: 1600, hi: 2200, type: 'hotel', url: q('Bvlgari Hotel Tokyo booking') }
];
export const POOLS = {
  tokyo: TOKYO,
  tokyo2: [...TOKYO_EAST, ...TOKYO.filter(o => !o.west), ...TOKYO.filter(o => o.west)],
  hakone: [
    { id: 'fore', name: 'Hakone Retreat före', area: 'Sengokuhara', blurb: 'Nordic forest retreat with onsen, spa, fire pit and a free café lounge.', lo: 260, hi: 400, type: 'hotel', onsen: true, url: 'https://www.trip.com/hotels/hakone-hotel-detail-6467220/hakone-retreat-fre/' },
    { id: 'tent', name: 'Onsen Guesthouse HAKONE TENT', area: 'Gora', blurb: 'Lively bar and two private-use hot spring baths. Futons and shared toilets.', lo: 100, hi: 160, type: 'hotel', onsen: true, url: 'https://www.hotels.com/ho576303/onsen-guesthouse-hakone-tent-hostel-hakone-japan' },
    { id: 'indigo', name: 'Hotel Indigo Hakone Gora', area: 'Gora', blurb: 'Private bath in every room, a firepit and shared hot springs.', lo: 350, hi: 550, type: 'hotel', onsen: true, url: 'https://www.hotels.com/ho1204542720/hotel-indigo-hakone-gora-an-ihg-hotel-hakone-japan/' },
    { id: 'ajisai', name: 'Ajisai Onsen Ryokan', area: 'Gora', blurb: 'Award-winning private open-air onsen.', lo: 150, hi: 260, type: 'ryokan', onsen: true, url: 'https://www.expedia.com/Hakone-Gora.dx6128316' },
    { id: 'tenyu', name: 'Hakone Kowakien TEN-YU', area: 'Ninotaira', blurb: 'A private open-air onsen on every terrace, spa treatments and a kaiseki dinner.', lo: 500, hi: 750, type: 'ryokan', onsen: true, meals: 'db', url: 'https://www.hotels.com/ho628570/hakone-kowakien-ten-yu-hakone-japan' },
    { id: 'matsuzakaya', name: 'Matsuzakaya Honten', area: 'Ashinoyu, on the bus route to Lake Ashi', blurb: 'Founded in 1662. Its own sulfur hot spring, private open-air baths in many rooms plus 5 to reserve, and kaiseki dinner, breakfast and drinks included.', lo: 600, hi: 1000, type: 'ryokan', onsen: true, meals: 'db', url: 'https://kinnotake-resorts.com/matsuzakayahonten/en/' },
    { id: 'karaku', name: 'Hakone Gora KARAKU', area: 'Gora', blurb: 'Private open-air onsen in all 70 rooms, 3 minutes from Gora Station.', lo: 700, hi: 950, type: 'ryokan', onsen: true, url: 'https://www.japanryokanguide.com/en/ryokans/hakone-gora-karaku' },
    { id: 'kadan', name: 'Gora Kadan', area: 'Gora', blurb: 'Relais & Châteaux. Full spa with a steam bath and pool, plus a kaiseki dinner.', lo: 1000, hi: 1600, type: 'ryokan', onsen: true, meals: 'db', url: 'https://www.hotels.com/ho16589600/gora-kadan-hakone-japan' },
    { id: 'fujiya', name: 'The Fujiya Hotel', area: 'Miyanoshita', blurb: 'Japan’s grand old hotel, open since 1878, full of Meiji-era carved wood and period detail.', lo: 380, hi: 550, type: 'hotel', onsen: true, url: q('The Fujiya Hotel Hakone booking') },
    { id: 'hyatt', name: 'Hyatt Regency Hakone Resort and Spa', area: 'Gora', blurb: 'Contemporary resort with its own hot spring baths, a spa and roomy rooms.', lo: 380, hi: 600, type: 'hotel', onsen: true, url: q('Hyatt Regency Hakone Resort and Spa booking') },
    { id: 'hanaori', name: 'Hakone Ashinoko Hanaori', area: 'Lake Ashi, at Togendai', blurb: 'Lakeside hot spring hotel by the ropeway station and boat pier.', lo: 300, hi: 450, type: 'hotel', onsen: true, url: q('Hakone Ashinoko Hanaori booking') },
    { id: 'princeashi', name: 'The Prince Hakone Lake Ashinoko', area: 'Lake Ashi shore', blurb: 'Quiet lakeside hotel on the far shore of Lake Ashi.', lo: 230, hi: 380, type: 'hotel', url: q('The Prince Hakone Lake Ashinoko booking') },
    { id: 'nanase', name: 'Hakone Nanase', area: 'Miyanoshita', blurb: 'Small hot spring inn that guests praise for its meals.', lo: 270, hi: 400, type: 'ryokan', onsen: true, url: q('Hakone Nanase Miyanoshita booking') },
    { id: 'fukuzumiro', name: 'Fukuzumiro', area: 'Tonosawa, near Hakone-Yumoto', blurb: 'Historic wooden riverside ryokan from the Meiji era. Rough price estimate.', lo: 400, hi: 650, type: 'ryokan', onsen: true, meals: 'db', url: q('Fukuzumiro Hakone ryokan booking') },
    { id: 'kinnotake', name: 'Kinnotake Sengokuhara', area: 'Sengokuhara', blurb: 'Adults-only ryokan where every room has its own open-air hot spring bath. Rough price estimate.', lo: 1000, hi: 1600, type: 'ryokan', onsen: true, meals: 'db', url: 'https://kinnotake-resorts.com/' }
  ],
  kyoto: [
    { id: 'ace', name: 'Ace Hotel Kyoto', area: 'Karasuma-Oike', blurb: 'Kengo Kuma design, a rooftop bar and Stumptown Coffee in the lobby.', lo: 550, hi: 850, type: 'hotel', url: 'https://www.acehotel.com/kyoto/' },
    { id: 'anteroom', name: 'Hotel Anteroom Kyoto', area: 'South of Kyoto Station', blurb: 'Art hotel with a gallery and artist-designed rooms.', lo: 120, hi: 220, type: 'hotel', url: 'https://hotel-anteroom.com/en/' },
    { id: 'goodnature', name: 'GOOD NATURE HOTEL KYOTO', area: 'Kawaramachi', blurb: 'Green-wall lobby, natural materials and free morning yoga.', lo: 400, hi: 600, type: 'hotel', url: 'https://www.travelocity.com/Kyoto-Hotels-Good-Nature-Hotel-Kyoto.h37234951.Hotel-Reviews' },
    { id: 'tougetsu', name: 'Tougetsu Ryokan', area: 'Nakagyo, near Nishiki Market', blurb: 'A simple traditional inn, a short walk from Ace and the Manga Museum.', lo: 180, hi: 280, type: 'ryokan', meals: 'b', url: 'https://www.kayak.com/Kyoto-Hotels-Tougetsu.666906.ksp' },
    { id: 'yoshida', name: 'Yoshida-Sanso', area: 'Sakyo, near the Philosopher’s Path', blurb: 'Five-room former imperial-family villa with a garden and kaiseki meals. Adults only.', lo: 400, hi: 550, type: 'ryokan', meals: 'db', url: 'https://www.hotels.com/ho311134/' },
    { id: 'togetsutei', name: 'Togetsutei', area: 'Arashiyama, by Togetsukyo Bridge', blurb: 'Hot spring ryokan from 1897. Some rooms have a private open-air or hinoki bath.', lo: 400, hi: 700, type: 'ryokan', onsen: true, meals: 'db', url: 'https://www.expedia.com/Kyoto-Hotels-Togetsutei.h3837237.Hotel-Information' },
    { id: 'hiiragiya', name: 'Hiiragiya', area: 'Downtown, near Nishiki Market', blurb: 'Founded in 1818. Kaiseki dinner, a Japanese garden and a steam room.', lo: 1000, hi: 1600, type: 'ryokan', meals: 'db', url: 'https://www.expedia.com/Kyoto-Hotels-Hiiragiya.h5363078.Hotel-Information' },
    { id: 'tawaraya', name: 'Tawaraya', area: 'Downtown', blurb: 'Often called Japan’s finest ryokan, with 18 rooms.', lo: 1000, hi: 1900, type: 'ryokan', meals: 'db', url: 'https://joinpearl.co/blogs/visiting-tawaraya-kyoto-what-to-know-before-you-go-in-2026', how: 'No online booking: go through a Japan travel specialist or a luxury hotel concierge, months ahead.', linkLabel: 'How to book' },
    { id: 'celestine', name: 'Hotel The Celestine Kyoto Gion', area: 'Gion, by Yasaka Shrine', blurb: 'Garden hotel steps from Yasaka Shrine, with a shared bath and a relaxing bar.', lo: 380, hi: 600, type: 'hotel', url: 'https://expedia.com/Gion-hotels-Hotel-The-Celestine-Kyoto-Gion.h17857390.Hotel-information' },
    { id: 'nohga', name: 'Nohga Hotel Kiyomizu Kyoto', area: 'Higashiyama, near Kiyomizu-dera', blurb: 'Design hotel in the old temple district, walkable to Kiyomizu and Gion.', lo: 180, hi: 300, type: 'hotel', url: q('Nohga Hotel Kiyomizu Kyoto booking') },
    { id: 'parkhyatt', name: 'Park Hyatt Kyoto', area: 'Higashiyama slope, by Yasaka Pagoda', blurb: 'Glass-and-wood luxury hotel above the old streets, between Kiyomizu-dera and Gion.', lo: 1000, hi: 1600, type: 'hotel', url: q('Park Hyatt Kyoto booking') },
    { id: 'hatanaka', name: 'Ryokan Gion Hatanaka', area: 'Gion', blurb: 'One of the few inns that still hosts maiko and geiko evenings for guests.', lo: 550, hi: 900, type: 'ryokan', meals: 'db', url: q('Gion Hatanaka ryokan booking') },
    { id: 'motonago', name: 'Motonago Ryokan', area: 'Higashiyama, near Kodai-ji', blurb: 'Relaxed 11-room ryokan with a 13-part regional dinner.', lo: 350, hi: 550, type: 'ryokan', meals: 'db', url: q('Motonago ryokan Kyoto booking') },
    { id: 'sowaka', name: 'Sowaka', area: 'Gion', blurb: 'Stylish ryokan-hotel with garden-view rooms and a highly rated restaurant.', lo: 600, hi: 1000, type: 'ryokan', url: q('Sowaka Kyoto booking') },
    { id: 'suiran', name: 'Suiran, a Luxury Collection Hotel', area: 'Arashiyama, on the river', blurb: 'Riverside luxury in Arashiyama, near the bamboo grove.', lo: 900, hi: 1400, type: 'hotel', url: q('Suiran Luxury Collection Kyoto booking') },
    { id: 'muni', name: 'MUNI KYOTO', area: 'Arashiyama, on the river', blurb: 'Small luxury hotel on the riverbank in Arashiyama.', lo: 700, hi: 1000, type: 'hotel', url: q('MUNI KYOTO booking') },
    { id: 'hoshinoyakyoto', name: 'HOSHINOYA Kyoto', area: 'Arashiyama, upriver', blurb: 'Riverside ryokan-style retreat reached by the inn’s own boat. Rough price estimate.', lo: 1200, hi: 1800, type: 'ryokan', url: 'https://www.za.kayak.com/Kyoto-Hotels-Hoshinoya-Kyoto.337889.ksp' },
    { id: 'homm', name: 'Homm Stay Nagi Arashiyama', area: 'Arashiyama', blurb: 'Modern, good-value base in Arashiyama.', lo: 150, hi: 250, type: 'hotel', url: q('Homm Stay Nagi Arashiyama booking') },
    { id: 'granvia', name: 'Hotel Granvia Kyoto', area: 'Inside Kyoto Station', blurb: 'The easiest base for an early Shinkansen to Naoshima.', lo: 250, hi: 400, type: 'hotel', url: q('Hotel Granvia Kyoto booking') },
    { id: 'aman', name: 'Aman Kyoto', area: 'North Kyoto, near Kinkaku-ji', blurb: 'Secluded forest-garden retreat. Rough price estimate.', lo: 1600, hi: 2500, type: 'hotel', url: q('Aman Kyoto booking') }
  ],
  naoshima: [
    { id: 'mylodge', name: 'MY LODGE Naoshima', area: 'Naoshima', blurb: 'Modern lodge with ocean views, a restaurant and a terrace.', lo: 180, hi: 260, type: 'hotel', url: q('MY LODGE Naoshima booking') },
    { id: 'uno', name: 'UNO HOTEL', area: 'Uno Port, on the mainland', blurb: 'Design hotel with a coffee shop and a communal living room. Ferry over each day.', lo: 230, hi: 320, type: 'hotel', url: q('UNO HOTEL Tamano booking') },
    { id: 'tsutsujiso', name: 'Naoshima Tsutsujiso Lodge', area: 'Near Benesse House', blurb: 'Simple lodge and trailer rooms by the sea.', lo: 100, hi: 180, type: 'hotel', url: 'https://www.expedia.com/Naoshima-Hotels-Naoshima-Tsutsujiso-Lodge.h117098440.Hotel-Information' },
    { id: 'bh_museum', name: 'Benesse House Museum', area: 'Inside the art museum', blurb: 'Rooms inside Tadao Ando’s museum, decorated with work by the artists on show. Guests can walk the galleries after closing.', lo: 380, hi: 550, type: 'hotel', badge: 'Inside the museum', url: 'https://benesse-artsite.jp/en/', linkLabel: 'Book on the Benesse Art Site' },
    { id: 'bh_oval', name: 'Benesse House Oval', area: 'Hilltop above the museum', blurb: 'The most exclusive wing: six rooms reached by a private funicular, with panoramic Inland Sea views and after-hours museum access.', lo: 550, hi: 950, type: 'hotel', badge: 'Museum access after hours', url: 'https://benesse-artsite.jp/en/', linkLabel: 'Book on the Benesse Art Site' },
    { id: 'bh_park', name: 'Benesse House Park', area: 'By the sculpture lawn', blurb: 'The largest wing, facing the art-filled lawn and the sea, a short walk to the museum. Free museum entry for guests.', lo: 320, hi: 480, type: 'hotel', url: 'https://benesse-artsite.jp/en/', linkLabel: 'Book on the Benesse Art Site' },
    { id: 'bh_beach', name: 'Benesse House Beach', area: 'On the shoreline', blurb: 'Eight suite-style rooms steps from the water. Free museum entry for guests.', lo: 600, hi: 850, type: 'hotel', url: 'https://benesse-artsite.jp/en/', linkLabel: 'Book on the Benesse Art Site' },
    { id: 'minshuku', name: 'Minshuku in Honmura', area: 'Honmura village', blurb: 'Family-run tatami guesthouse, usually with shared bathrooms.', lo: 150, hi: 280, type: 'ryokan', meals: 'db', url: 'https://japanuncharted.com/kagawa/area-stay/naoshima-best-areas-to-stay' },
    { id: 'roka', name: 'Naoshima Ryokan Roka', area: 'Edge of Honmura', blurb: '11 suites, each with its own open-air bath, plus contemporary art and local seafood.', lo: 750, hi: 1100, type: 'ryokan', meals: 'db', url: 'https://roka.voyage/en/' }
  ]
};

/* Ways to travel, keyed by the pools they join. Costs are for both of you, converted at ¥155 to $1. approx: rough figure. */
export const LEGS = {
  airport: { title: 'Narita Airport and Tokyo', note: 'Prices cover both trips.', def: 'nex', options: [
    { id: 'nex', name: 'Narita Express round-trip ticket', d: 'To Shibuya on arrival, back from Tokyo Station on departure (about 1 hour). ¥5,200 each for visitors, valid 14 days.', cost: 67, url: 'https://www.jreast.co.jp/en/multi/pass/nex.html' },
    { id: 'limo', name: 'Airport Limousine Bus', d: 'No train changes, with stops at stations and big hotels. About ¥3,000 each way per person; traffic can add time.', cost: 77, url: 'https://www.limousinebus.co.jp/en/' },
    { id: 'lowcost', name: 'Low-cost bus to Tokyo Station, then train', d: 'About ¥1,500 each way per person, plus one train change.', cost: 45, url: 'https://www.japan-guide.com/e/e2027.html' },
    { id: 'car', name: 'Private car', d: 'Door to door with your bags. Roughly ¥25,000–30,000 per car each way.', cost: 355, approx: true, url: q('Narita airport private transfer Shibuya') }
  ] },
  'tokyo>hakone': { def: 'romance', options: [
    { id: 'romance', name: 'Romancecar + 2-day Hakone Freepass', d: 'Shinjuku to Hakone-Yumoto in about 80 minutes. The pass covers all Hakone buses, the ropeway and the lake boat. ¥7,100 pass + ¥1,200 seat each.', cost: 107, url: 'https://hakonetrip.odakyu-global.com/passes/hakone-freepass/' },
    { id: 'shink', name: 'Shinkansen to Odawara + Hakone Freepass', d: 'Faster from Tokyo or Shinagawa Station, then the Hakone-area pass (¥6,000 each).', cost: 126, approx: true, url: 'https://smart-ex.jp/en/' },
    { id: 'car', name: 'Private driver to your hotel', d: 'About 2 hours door to door, roughly ¥40,000–50,000 per car. Includes a Hakone-area pass for the loop.', cost: 367, approx: true, url: q('Tokyo to Hakone private driver') }
  ] },
  'hakone>kyoto': { note: 'The bus to Odawara is covered by the Freepass.', def: 'hikari', options: [
    { id: 'hikari', name: 'Hikari Shinkansen, reserved seats', d: 'Odawara to Kyoto in about 2 hours. ¥12,100 each. Sit in seat E for Mt. Fuji.', cost: 156, url: 'https://smart-ex.jp/en/' },
    { id: 'green', name: 'Hikari Shinkansen, Green Car', d: 'First-class seats, ¥16,970 each.', cost: 219, url: 'https://smart-ex.jp/en/' }
  ] },
  'kyoto>naoshima': { def: 'uno', options: [
    { id: 'uno', name: 'Shinkansen, Uno Line and ferry', d: 'Nozomi to Okayama (about 1 hour, about ¥7,700), JR to Uno (¥590), then a 20-minute ferry (¥370).', cost: 112, url: 'https://benesse-artsite.jp/en/access/' },
    { id: 'unogreen', name: 'Same route, Green Car to Okayama', d: 'About ¥11,350 each for the Shinkansen.', cost: 159, url: 'https://smart-ex.jp/en/' },
    { id: 'taka', name: 'Via Takamatsu', d: 'Marine Liner over the Seto Ohashi Bridge (¥1,550), then a 50-minute ferry (¥680). Slower, more scenic.', cost: 128, url: 'https://benesse-artsite.jp/en/access/' }
  ] },
  'naoshima>tokyo2': { note: 'About 5 hours door to door.', def: 'nozomi', options: [
    { id: 'nozomi', name: 'Ferry, Uno Line and Nozomi', d: 'Nozomi Okayama to Tokyo, ¥17,770 each.', cost: 242, url: 'https://smart-ex.jp/en/' },
    { id: 'nozomigreen', name: 'Same route, Green Car', d: 'Nozomi Green Car, ¥23,840 each.', cost: 320, url: 'https://smart-ex.jp/en/' }
  ] }
};

/* Things to do, each tied to the city it happens in. on: counted unless you untick it. */
export const EXTRAS = [
  { id: 'ghibli', pool: 'tokyo', on: true, name: 'Ghibli Museum', when: 'Kichijoji. Tickets go on sale March 10 at 10am Japan time.', cost: 15, links: [['Buy tickets', 'https://ghibli-museum.jp/en/ticket-information/']] },
  { id: 'sky', pool: 'tokyo', on: true, name: 'SHIBUYA SKY at sunset', when: 'Evening slots are ¥3,400 each online. The official site often rejects foreign cards; Klook sells the same slots.', cost: 45, links: [['Official tickets', 'https://www.shibuya-scramble-square.com/sky/'], ['Klook', q('Klook SHIBUYA SKY ticket')]] },
  { id: 'live', pool: 'tokyo', on: true, name: 'Live music in Shimokitazawa', when: 'A few stops from Shibuya. Most live houses sell tickets at the door.', cost: 45, links: [['See what’s on', q('Shimokitazawa live house schedule April 2027')]] },
  { id: 'hakonemuseums', pool: 'hakone', on: true, name: 'Hakone Open-Air Museum and Pola Museum', when: 'Pay at the door; the Freepass gets small discounts.', cost: 55, links: [['Open-Air Museum', 'https://www.hakone-oam.or.jp/en/'], ['Pola Museum', 'https://www.polamuseum.or.jp/en/']] },
  { id: 'kyotosights', pool: 'kyoto', on: true, name: 'Kyoto temples, gardens and spring illuminations', when: 'Mostly pay at the gate; Nijo Castle sells timed tickets online.', cost: 90, links: [['Nijo Castle', 'https://nijo-jocastle.city.kyoto.lg.jp/?lang=en'], ['Spring illuminations', q('Kyoto spring illumination 2027 cherry blossom')]] },
  { id: 'naoshimaart', pool: 'naoshima', on: true, name: 'Naoshima museums, including Chichu', when: 'Chichu and Minamidera need timed tickets.', cost: 130, links: [['Benesse Art Site tickets', 'https://benesse-artsite.jp/en/']] },
  { id: 'omakase', pool: 'tokyo2', on: false, name: 'Omakase sushi farewell dinner', when: 'In Ginza. Book 1 to 2 months ahead.', cost: 400, links: [['Find a counter', 'https://omakase.in/en']] }
];
export const GIANTS = { skip: 0, cheap: 40, infield: 120, front: 220 };
export const GIANTS_LABEL = { skip: 'Skip it', cheap: 'Cheap seats', infield: 'Infield', front: 'Front row' };
export const FOOD = { easy: 40, balanced: 65, treat: 115 };   // per person a day
export const FOOD_LABEL = { easy: 'Easy', balanced: 'Balanced', treat: 'Treat ourselves' };
export const MEAL_CREDIT = { db: 80, b: 25 };                 // per night for two, taken off food
export const TRANSIT = 130, BAGS = 77, BIKES = 50, FIXED_EXTRAS = 250;

const has = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export function findOpt(pool, id) { return (pool && has(POOLS, pool) && POOLS[pool].find(o => o.id === id)) || null; }
export function legOpt(key, id) { const L = LEGS[key]; return L.options.find(o => o.id === id) || L.options.find(o => o.id === L.def); }

/* Route stops -> pool per stop (null: no options for that city). */
export function poolsFor(stops) {
  let tokyo = 0;
  return stops.map(s => {
    const c = String(s.city || '').trim().toLowerCase();
    if (c === 'tokyo') return tokyo++ ? 'tokyo2' : 'tokyo';
    return ['hakone', 'kyoto', 'naoshima'].includes(c) ? c : null;
  });
}
/* The leg into each stop: 'airport' for the first, a known pool pair, or null. */
export function legKeys(pools) {
  return pools.map((p, i) => i === 0 ? 'airport' : (pools[i - 1] && p && LEGS[pools[i - 1] + '>' + p] ? pools[i - 1] + '>' + p : null));
}

/* stops: [{ id, pool, nights, island, plan: { usd, meals } | null }] where plan is what's on the plan for that city now. */
export function defaultStay(s) { return s.plan ? 'plan' : (findOpt(s.pool, DEFAULT_STAY[s.pool]) ? DEFAULT_STAY[s.pool] : null); }

/* The trust boundary for settings/picks: anything unknown falls back to the default (no doc = what's on the plan). */
export function readPicks(doc, stops) {
  const d = obj(doc), ds = obj(d.stays), dl = obj(d.legs), dx = obj(d.extras);
  const stays = {}, legs = {}, extras = {};
  for (const s of stops) {
    const v = obj(ds[s.id]);
    const a = (v.a === 'plan' && s.plan) || findOpt(s.pool, v.a) ? v.a : defaultStay(s);
    const catalog = !!a && a !== 'plan';
    const b = catalog && v.b !== a && findOpt(s.pool, v.b) ? v.b : null;
    const bn = Math.min(Math.max(Math.round(Number(v.bn)) || 1, 1), Math.max(1, s.nights - 1));
    stays[s.id] = { a, split: catalog && v.split === true && s.nights > 1, b, bn };
  }
  for (const k of legKeys(stops.map(s => s.pool))) if (k) legs[k] = legOpt(k, dl[k]).id;
  for (const e of EXTRAS) extras[e.id] = typeof dx[e.id] === 'boolean' ? dx[e.id] : e.on;
  const num = (v, d, max) => typeof v === 'number' && v >= 0 && v <= max ? v : d;
  return {
    stays, legs, extras,
    food: has(FOOD, d.food) ? d.food : 'balanced', giants: has(GIANTS, d.giants) ? d.giants : 'infield',
    bags: typeof d.bags === 'boolean' ? d.bags : true, bikes: typeof d.bikes === 'boolean' ? d.bikes : true,
    shopping: num(d.shopping, 200, 5000), flights: num(d.flights, 0, 100000)
  };
}

/* One stop's stay as parts: [{ o, n, lo, hi, meals }]. The plan row has a known cost, so lo = hi. */
export function stayParts(s, v) {
  if (!v || !v.a) return [];
  if (v.a === 'plan') return s.plan ? [{ o: { id: 'plan', name: s.plan.name || 'On the plan' }, n: s.nights, lo: s.plan.usd, hi: s.plan.usd, meals: s.plan.meals }] : [];
  const a = findOpt(s.pool, v.a); if (!a) return [];
  const b = v.split && v.b ? findOpt(s.pool, v.b) : null;
  const bn = b ? Math.min(v.bn, s.nights - 1) : 0;
  const part = (o, n) => ({ o, n, lo: o.lo * n, hi: o.hi * n, meals: o.meals });
  return [part(a, s.nights - bn), ...(b && bn > 0 ? [part(b, bn)] : [])];
}

/* The expected total for two. Only cities, legs and extras that are on the route count. */
export function estimate(p, stops) {
  let lo = 0, hi = 0, credit = 0;
  const stays = [];
  for (const s of stops) for (const x of stayParts(s, p.stays[s.id])) {
    lo += x.lo; hi += x.hi; credit += (MEAL_CREDIT[x.meals] || 0) * x.n; stays.push({ stop: s.id, ...x });
  }
  const nights = stops.reduce((n, s) => n + s.nights, 0);
  const food = Math.max(0, FOOD[p.food] * 2 * nights - credit);
  let legs = 0; for (const [k, id] of Object.entries(p.legs)) if (LEGS[k]) legs += legOpt(k, id).cost;
  const island = stops.some(s => s.island);
  const transport = legs + TRANSIT + (p.bags ? BAGS : 0) + (p.bikes && island ? BIKES : 0);
  const pools = new Set(stops.map(s => s.pool));
  let activities = pools.has('tokyo') ? GIANTS[p.giants] : 0;
  for (const e of EXTRAS) if (p.extras[e.id] && pools.has(e.pool)) activities += e.cost;
  const other = FIXED_EXTRAS + p.shopping, flights = p.flights;
  const rest = food + transport + activities + other + flights;
  return { staysLo: lo, staysHi: hi, staysMid: (lo + hi) / 2, credit, food, transport, activities, other, flights, nights,
    lo: lo + rest, hi: hi + rest, mid: (lo + hi) / 2 + rest, stays };
}
