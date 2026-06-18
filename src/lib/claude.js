export async function callClaude(prompt, imageB64 = null, imageMime = 'image/jpeg') {
  const apiKey = import.meta.env.VITE_ANTHROPIC_KEY;
  if (!apiKey) throw new Error('Falta VITE_ANTHROPIC_KEY');

  const content = imageB64
    ? [
        {
          type: 'image',
          source: { type: 'base64', media_type: imageMime, data: imageB64 },
        },
        { type: 'text', text: prompt },
      ]
    : [{ type: 'text', text: prompt }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Error llamando a Claude');
  }

  const data = await res.json();
  return data.content?.find((b) => b.type === 'text')?.text || '';
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
