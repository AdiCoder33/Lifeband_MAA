// Simple HTTP endpoint to OCR a report file, summarize with Meditron, and save to Firestore.
// Intended to be deployable on Render/Cloud Run/VM.
// Environment variables required:
//   PORT (optional, default 4000)
//   GOOGLE_APPLICATION_CREDENTIALS (path to Firebase service account JSON)
//   MEDITRON_URL (e.g., https://bad4c252f1f9.ngrok-free.app)
//   MEDITRON_KEY (Bearer token)

import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import fetch from 'node-fetch';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import admin from 'firebase-admin';

const { MEDITRON_URL, MEDITRON_KEY } = process.env;
if (!MEDITRON_URL || !MEDITRON_KEY) {
  console.error('Missing MEDITRON_URL or MEDITRON_KEY');
  process.exit(1);
}

// Support either a path to the service account JSON or the raw JSON in env
const rawCred =
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_B64 ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!rawCred) {
  console.error('Missing service account: set GOOGLE_APPLICATION_CREDENTIALS (path) or GOOGLE_APPLICATION_CREDENTIALS_JSON (JSON string)');
  process.exit(1);
}

let credentialObj;
try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_B64) {
    const decoded = Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_B64, 'base64').toString('utf-8');
    credentialObj = JSON.parse(decoded);
  } else if (rawCred.trim().startsWith('{')) {
    credentialObj = JSON.parse(rawCred);
  } else {
    const fileData = fs.readFileSync(rawCred, 'utf-8');
    credentialObj = JSON.parse(fileData);
  }
  // Normalize private key newlines in case they arrived as \n literals
  if (credentialObj?.private_key) {
    credentialObj.private_key = credentialObj.private_key.replace(/\\n/g, '\n');
  }
} catch (err) {
  console.error('Failed to load service account credentials', err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(credentialObj),
  projectId: credentialObj.project_id,
});
const db = admin.firestore();

const app = express();
app.use(express.json({ limit: '25mb' }));

async function downloadBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function ocrBuffer(buf, mime = '') {
  if (mime.toLowerCase().includes('pdf')) {
    const parsed = await pdfParse(buf);
    return parsed.text || '';
  }
  const worker = await createWorker('eng');
  const { data: { text } } = await worker.recognize(buf);
  await worker.terminate();
  return text || '';
}

async function summarizeWithMeditron(text) {
  const prompt = `
You are Meditron, a careful obstetric assistant. Summarize key findings from this medical report in 5 short bullet points for a non-medical person.
Be conservative, avoid treatment advice, and end with:
"This is general information only. A pregnant woman must follow her doctor’s advice."

Report text:
${text.slice(0, 6000)}
  `.trim();

  const resp = await fetch(`${MEDITRON_URL}/v1/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MEDITRON_KEY}`,
    },
    body: JSON.stringify({
      model: 'meditron-7b',
      prompt,
      max_tokens: 320,
      temperature: 0.2,
      stop: ['Question:'],
    }),
  });
  if (!resp.ok) throw new Error(`Meditron failed: ${resp.status}`);
  const json = await resp.json();
  return json?.choices?.[0]?.text?.trim() || 'No summary';
}

app.post('/process', async (req, res) => {
  try {
    const { appointmentId, reportId, fileUrl, mimeType = 'image/jpeg' } = req.body || {};
    if (!appointmentId || !reportId || !fileUrl) {
      return res.status(400).json({ error: 'appointmentId, reportId, fileUrl are required' });
    }

    const buf = await downloadBuffer(fileUrl);
    const extractedText = await ocrBuffer(buf, mimeType);
    const summary = await summarizeWithMeditron(extractedText);

    await db.doc(`appointments/${appointmentId}/reports/${reportId}`).set(
      {
        extractedText,
        analysis: {
          summary,
          model: 'meditron-7b',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    res.json({ ok: true, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`OCR+Meditron server running on port ${port}`);
});
