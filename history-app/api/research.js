// api/research.js — Vercel Serverless Function

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
        systemInstruction: {
          parts: [{ text: `You are an expert historian and researcher. Generate a thorough, detailed, Wikipedia-quality historical report in markdown with EXACTLY these seven section headings using ## prefix. Each section must be minimum 250 words. Do not summarize — provide full historical depth with specific names, dates, causes and consequences.

## 🏛️ Historical Overview
## 👥 Notable Figures
## ⚔️ Major Events & Battles
## 🎨 Culture & Architecture
## 💰 Economic History
## 🏛️ Political & Administrative History
## 🔮 Legacy & Modern Significance

Rules:
- Each section minimum 250 words
- Use **bold** for key terms, names and dates
- Include specific dates, causes and consequences
- Cover political, social, economic and cultural dimensions
- Multiple historical perspectives where relevant
- Be factually accurate — note uncertainty where it exists
- Do not fabricate facts or dates` }]
        },
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