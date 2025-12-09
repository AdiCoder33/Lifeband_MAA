/**
 * Local, on-demand OCR + Meditron summarization.
 * Usage:
 *   set GOOGLE_APPLICATION_CREDENTIALS=E:\Lifeband_MAA\serviceAccount.json
 *   set MEDITRON_URL=https://your-meditron-host
 *   set MEDITRON_KEY=your-bearer-key
 *   node scripts/local-ocr-run.js <appointmentId> <reportId> <fileUrl> [mimeType]
 *
 * The script will:
 *   - Download the report file (public or signed URL).
 *   - OCR (Tesseract for images, pdf-parse for PDFs).
 *   - Call Meditron for a short summary.
 *   - Write { extractedText, analysis.summary } to Firestore at appointments/{appointmentId}/reports/{reportId}.
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch'); // v2
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');

const [,, appointmentId, reportId, fileUrl, mimeType = 'image/jpeg'] = process.argv;

if (!appointmentId || !reportId || !fileUrl) {
  console.log('Usage: node scripts/local-ocr-run.js <appointmentId> <reportId> <fileUrl> [mimeType]');
  process.exit(1);
}

const MEDITRON_URL = process.env.MEDITRON_URL;
const MEDITRON_KEY = process.env.MEDITRON_KEY;
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!MEDITRON_URL || !MEDITRON_KEY) {
  console.error('Missing MEDITRON_URL or MEDITRON_KEY env vars.');
  process.exit(1);
}
if (!SA_PATH) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(SA_PATH)),
});
const db = admin.firestore();

async function downloadBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function ocrBuffer(buf, mime) {
  if ((mime || '').toLowerCase().includes('pdf')) {
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

(async () => {
  try {
    console.log('Downloading file...');
    const buf = await downloadBuffer(fileUrl);

    console.log('Running OCR...');
    const extractedText = await ocrBuffer(buf, mimeType);

    console.log('Summarizing...');
    const summary = await summarizeWithMeditron(extractedText);

    console.log('Saving to Firestore...');
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

    console.log('Done. Summary saved.');
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
