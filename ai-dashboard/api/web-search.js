// Web search endpoint — uses DuckDuckGo (no API keys required) and Google Places API
// Combines the instant-answer API with HTML result scraping.

const DDG_API = 'https://api.duckduckgo.com/';
const DDG_HTML = 'https://html.duckduckgo.com/html/';

// 1. Try the instant-answer JSON API first (fast, structured)
async function instantAnswer(query) {
  const params = new URLSearchParams({ q: query, format: 'json', no_redirect: '1', skip_disambig: '1' });
  const res = await fetch(`${DDG_API}?${params}`, {
    headers: { 'User-Agent': 'BraydenAssistant/1.0' }
  });
  const data = await res.json();

  const results = [];

  // Abstract / instant answer
  if (data.Abstract) {
    results.push({ title: data.Heading || query, snippet: data.Abstract, link: data.AbstractURL || '' });
  }
  // Related topics
  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics.slice(0, 5)) {
      if (topic.Text && topic.FirstURL) {
        results.push({ title: topic.Text.slice(0, 80), snippet: topic.Text, link: topic.FirstURL });
      }
    }
  }
  // Answer box (calculations, conversions, etc.)
  if (data.Answer) {
    results.push({ title: 'Answer', snippet: data.Answer, link: '' });
  }

  return results;
}

// 2. Fallback: scrape the DuckDuckGo HTML search page
async function htmlSearch(query, num = 5) {
  const res = await fetch(DDG_HTML, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'BraydenAssistant/1.0'
    },
    body: new URLSearchParams({ q: query })
  });
  const html = await res.text();

  const results = [];
  // Match each result block: <a class="result__a" href="...">title</a> ... <a class="result__snippet">snippet</a>
  const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links = [...html.matchAll(linkRegex)];
  const snippets = [...html.matchAll(snippetRegex)];

  for (let i = 0; i < Math.min(links.length, num); i++) {
    const rawLink = links[i][1];
    const title = links[i][2].replace(/<[^>]+>/g, '').trim();
    const snippet = snippets[i] ? snippets[i][1].replace(/<[^>]+>/g, '').trim() : '';

    // DDG wraps links through a redirect; extract the actual URL
    let link = rawLink;
    const uddgMatch = rawLink.match(/uddg=([^&]+)/);
    if (uddgMatch) link = decodeURIComponent(uddgMatch[1]);

    if (title) results.push({ title, snippet, link });
  }

  return results;
}

// 3. Google Places API for location-based searches
async function googlePlacesSearch(query, location, radius = 10000, type) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured');
  }

  // Use personal location if not provided
  if (!location) {
    try {
      const personalInfo = require('../../../personal-info.json');
      if (personalInfo.location.coordinates.latitude && personalInfo.location.coordinates.longitude) {
        location = `${personalInfo.location.coordinates.latitude},${personalInfo.location.coordinates.longitude}`;
      }
    } catch (e) {
      console.log('No personal location info found, using query-based search');
    }
  }

  // Search for places
  const placesUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  placesUrl.searchParams.set('query', query);
  placesUrl.searchParams.set('key', apiKey);
  
  if (location) {
    placesUrl.searchParams.set('location', location);
    placesUrl.searchParams.set('radius', radius.toString());
  }
  
  if (type) {
    placesUrl.searchParams.set('type', type);
  }

  const response = await fetch(placesUrl.toString());
  const data = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || data.status);
  }

  // Format results for the AI
  const results = (data.results || []).slice(0, 5).map(place => ({
    name: place.name,
    address: place.formatted_address,
    phone: place.formatted_phone_number,
    rating: place.rating,
    priceLevel: place.price_level,
    isOpen: place.opening_hours?.open_now ?? null,
    types: place.types,
    placeId: place.place_id,
    location: place.geometry?.location
  }));

  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, num = 5, location, radius, type, usePlaces = false } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    // Use Google Places if requested or if query suggests location search
    if (usePlaces || /\b(near me|nearby|location|find|places)\b/i.test(query)) {
      try {
        const placesResults = await googlePlacesSearch(query, location, radius, type);
        const formatted = placesResults.length
          ? placesResults.map((r, i) => 
              `${i + 1}. ${r.name}\n` +
              `   Address: ${r.address}\n` +
              (r.phone ? `   Phone: ${r.phone}\n` : '') +
              (r.rating ? `   Rating: ${r.rating}/5\n` : '') +
              (r.isOpen !== null ? `   Open: ${r.isOpen ? 'Yes' : 'No'}\n` : '')
            ).join('\n')
          : 'No places found.';
        return res.status(200).json({ results: placesResults, formatted, source: 'google-places' });
      } catch (placesError) {
        console.error('Google Places error:', placesError);
        // Fall back to DuckDuckGo if Places fails
      }
    }

    // Try instant answer first, fall back to HTML scrape
    let results = await instantAnswer(query);
    if (results.length < 2) {
      const scraped = await htmlSearch(query, num);
      // Merge, avoiding duplicates
      const existingLinks = new Set(results.map(r => r.link));
      for (const r of scraped) {
        if (!existingLinks.has(r.link)) results.push(r);
      }
    }

    results = results.slice(0, num);

    const formatted = results.length
      ? results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`).join('\n\n')
      : 'No results found.';

    return res.status(200).json({ results, formatted, source: 'duckduckgo' });
  } catch (err) {
    console.error('web-search error:', err);
    return res.status(500).json({ error: err.message, formatted: `Search failed: ${err.message}` });
  }
}
