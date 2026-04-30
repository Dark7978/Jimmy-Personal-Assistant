// Google Places API endpoint for finding nearby businesses
// Requires: GOOGLE_PLACES_API_KEY in environment variables

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, location, radius = 10000, type } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY not configured' });
    }

    // Use personal location if not provided
    let searchLocation = location;
    if (!searchLocation) {
      try {
        const personalInfo = require('../../../personal-info.json');
        if (personalInfo.location.coordinates.latitude && personalInfo.location.coordinates.longitude) {
          searchLocation = `${personalInfo.location.coordinates.latitude},${personalInfo.location.coordinates.longitude}`;
        }
      } catch (e) {
        console.log('No personal location info found, using query-based search');
      }
    }

    // Search for places
    const placesUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    placesUrl.searchParams.set('query', query);
    placesUrl.searchParams.set('key', apiKey);
    
    if (searchLocation) {
      placesUrl.searchParams.set('location', searchLocation);
      placesUrl.searchParams.set('radius', radius.toString());
    }
    
    if (type) {
      placesUrl.searchParams.set('type', type);
    }

    const response = await fetch(placesUrl.toString());
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API error:', data.status, data.error_message);
      return res.status(500).json({ error: data.error_message || data.status });
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

    const formatted = results.length
      ? results.map((r, i) => 
          `${i + 1}. ${r.name}\n` +
          `   Address: ${r.address}\n` +
          (r.phone ? `   Phone: ${r.phone}\n` : '') +
          (r.rating ? `   Rating: ${r.rating}/5\n` : '') +
          (r.isOpen !== null ? `   Open: ${r.isOpen ? 'Yes' : 'No'}\n` : '')
        ).join('\n')
      : 'No places found.';

    return res.status(200).json({ results, formatted });

  } catch (err) {
    console.error('google-places error:', err);
    return res.status(500).json({ error: err.message, formatted: `Search failed: ${err.message}` });
  }
}
