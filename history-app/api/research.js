// api/research.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { location } = req.body;
    if (!location) return res.status(400).json({ error: 'Location required' });
    const GEMINI_KEY = process.env.GEMINI_API_KEY_V2;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Write a comprehensive, detailed historical report about: ${location}` }] }],
        systemInstruction: { parts: [{ text: `You are Ancient Trace — an expert historian. Generate a thorough Wikipedia-quality historical report in markdown with EXACTLY these 7 section headings (## prefix). Each section minimum 300 words with specific names, dates, causes, consequences.\n\n## 🏛️ Historical Overview\n## 👥 Notable Figures\n## ⚔️ Major Events & Battles\n## 🎨 Culture & Architecture\n## 💰 Economic History\n## 🏛️ Political & Administrative History\n## 🔮 Legacy & Modern Significance\n\nRules: Each section min 300 words. Use **bold** for key names/dates/terms. Be factually accurate. For Notable Figures and Major Events: start with a 2-3 sentence overview paragraph, then cover each figure/event as a ### subheading.` }] },
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 16000 }
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'API error');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
