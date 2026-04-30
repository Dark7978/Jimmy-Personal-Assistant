// Web search endpoint — uses DuckDuckGo (no API keys required).
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, num = 5 } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

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

    return res.status(200).json({ results, formatted });
  } catch (err) {
    console.error('web-search error:', err);
    return res.status(500).json({ error: err.message, formatted: `Search failed: ${err.message}` });
  }
}
