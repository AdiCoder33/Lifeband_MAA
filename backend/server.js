// HTTP service: download report file, extract text (OCR/PDF), summarize with Meditron, save to Firestore.
import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import fetch from 'node-fetch';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import admin from 'firebase-admin';

// -----------------------------------------------------------------------------
// Env + credentials
// -----------------------------------------------------------------------------
const { MEDITRON_URL, MEDITRON_KEY } = process.env;
if (!MEDITRON_URL || !MEDITRON_KEY) {
  console.error('Missing MEDITRON_URL or MEDITRON_KEY');
  process.exit(1);
}

const rawCred =
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_B64 ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!rawCred) {
  console.error('Missing service account: set GOOGLE_APPLICATION_CREDENTIALS (path) or GOOGLE_APPLICATION_CREDENTIALS_JSON / _JSON_B64');
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

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '25mb' }));

async function downloadBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function ocrBuffer(buf, mime = '') {
  const isPdf =
    mime.toLowerCase().includes('pdf') ||
    buf.slice(0, 4).toString('utf8') === '%PDF';

  if (isPdf) {
    try {
      const parsed = await pdfParse(buf);
      return parsed.text || '';
    } catch (err) {
      console.warn('pdf-parse failed, falling back to Tesseract PDF image conversion', err.message);
    }
  }

  try {
    const worker = await createWorker('eng');
    const {
      data: { text },
    } = await worker.recognize(buf);
    await worker.terminate();
    return text || '';
  } catch (err) {
    console.error('Tesseract failed', err.message);
    return '';
  }
}

async function summarizeWithMeditron(text) {
  const prompt = `
You are Meditron, an obstetric assistant. From the report, write EXACTLY 5 short bullet points (<=18 words each).
- Use ONLY clinical findings (diagnoses, vitals, labs, risks, treatments, follow-ups). Do NOT include hospital names, addresses, phones, emails, registration numbers, IDs, or boilerplate.
- If the text lacks clinical findings, output: "- No clear clinical findings in the provided text."
- Format strictly as "- point". No numbering, no extra text.
- End with: "This is general information only. A pregnant woman must follow her doctor’s advice."

Report text (truncated):
${text.slice(0, 3500)}
  `.trim();

  const resp = await fetch(`${MEDITRON_URL}/v1/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MEDITRON_KEY}`,
    },
    body: JSON.stringify({
      model: 'meditron-7b',
      prompt,
      max_tokens: 240,
      temperature: 0.2,
      stop: ['Question:'],
    }),
  });

  if (!resp.ok) throw new Error(`Meditron failed: ${resp.status}`);
  const json = await resp.json();
  const txt = json?.choices?.[0]?.text?.trim() || '';
  return txt;
}

function scrubText(raw = '') {
  return raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '')
    .replace(/\b(?:tel|phone|ph|mobile)[:\s]*\+?\d[\d\s().-]{6,}\b/gi, '')
    .trim();
}

// -----------------------------------------------------------------------------
// Route
// -----------------------------------------------------------------------------
app.post('/process', async (req, res) => {
  try {
    const { appointmentId, reportId, fileUrl, mimeType = 'image/jpeg' } = req.body || {};
    if (!appointmentId || !reportId || !fileUrl) {
      return res.status(400).json({ error: 'appointmentId, reportId, fileUrl are required' });
    }

    const buf = await downloadBuffer(fileUrl);
    const effMime = fileUrl.toLowerCase().endsWith('.pdf') ? 'application/pdf' : mimeType;
    const extractedText = await ocrBuffer(buf, effMime);

    const normalized = (extractedText || '').trim().replace(/\s+/g, ' ');
    if (normalized.length < 30) {
      await db.doc(`appointments/${appointmentId}/reports/${reportId}`).set(
        {
          extractedText,
          analysis: {
            summary: 'No readable text detected in this report. Please upload a clearer image or PDF.',
            model: 'meditron-7b',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
      return res.json({ ok: true, summary: 'No readable text detected in this report. Please upload a clearer image or PDF.' });
    }

    const cleaned = scrubText(normalized);
    const summaryRaw = await summarizeWithMeditron(cleaned || normalized);
    const lettersOnly = (summaryRaw || '').replace(/[^a-zA-Z]/g, '');
    const finalSummary =
      !lettersOnly || lettersOnly.length < 30
        ? 'The report text could not be summarized reliably. Please upload a clearer image or PDF.'
        : summaryRaw;

    await db.doc(`appointments/${appointmentId}/reports/${reportId}`).set(
      {
        extractedText,
        analysis: {
          summary: finalSummary,
          model: 'meditron-7b',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    res.json({ ok: true, summary: finalSummary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// -----------------------------------------------------------------------------
// Start
// -----------------------------------------------------------------------------
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`OCR+Meditron server running on port ${port}`);
});
