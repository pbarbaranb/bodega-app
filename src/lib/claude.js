export async function callClaude(prompt, imageB64 = null, imageMime = 'image/jpeg') {
  const apiKey = import.meta.env.VITE_GEMINI_KEY;
  if (!apiKey) throw new Error('Falta VITE_GEMINI_KEY');

  const parts = [];

  if (imageB64) {
    parts.push({
      inline_data: { mime_type: imageMime, data: imageB64 },
    });
  }

  parts.push({ text: prompt });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Error llamando a Gemini');
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export function parseClaudeJson(raw) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      const base64 = result.split(',')[1];
      resolve({ base64, dataUrl: result, mime: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function base64ToFile(base64, filename, mime = 'image/jpeg') {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}