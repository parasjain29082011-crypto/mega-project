// api/images.js — Vercel Serverless Function — Unsplash photo proxy
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
    if (!ACCESS_KEY) return res.status(500).json({ error: 'Unsplash not configured', results: [] });

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Client-ID ${ACCESS_KEY}`,
        'Accept-Version': 'v1'
      }
    });

    const data = await response.json();

    // Unsplash returns errors array on failure
    if (!response.ok) {
      return res.status(200).json({ results: [] });
    }

    const results = (data.results || []).map(photo => ({
      thumbUrl:        photo.urls.small,
      fullUrl:         photo.urls.regular,
      description:     photo.description || photo.alt_description || '',
      photographerName: photo.user.name,
      // Unsplash requires UTM params on all links back to their site
      photographerUrl: `${photo.user.links.html}?utm_source=ancient_trace&utm_medium=referral`,
      photoPageUrl:    `${photo.links.html}?utm_source=ancient_trace&utm_medium=referral`
    }));

    return res.status(200).json({ results });
  } catch (err) {
    // Always return a safe response — never crash the calling code
    return res.status(200).json({ results: [], error: err.message });
  }
}
