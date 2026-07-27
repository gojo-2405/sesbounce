import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { nanoid } from 'nanoid';
import { addEmail, getEmails, recordEvent } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// --- SES SMTP transporter ---
const transporter = nodemailer.createTransport({
  host: process.env.SES_SMTP_HOST,
  port: Number(process.env.SES_SMTP_PORT) || 587,
  secure: false, // upgrades to TLS via STARTTLS on port 587
  auth: {
    user: process.env.SES_SMTP_USER,
    pass: process.env.SES_SMTP_PASS,
  },
});

// --- Health check ---
app.get('/api/health', (req, res) => {
  const configured = !!(
    process.env.SES_SMTP_HOST &&
    process.env.SES_SMTP_USER &&
    process.env.SES_SMTP_PASS &&
    process.env.SES_FROM_EMAIL
  );
  res.json({ ok: true, sesConfigured: configured });
});

// --- Send an email ---
app.post('/api/send-email', async (req, res) => {
  const { to, subject, message } = req.body;

  if (!to || !subject || !message) {
    return res.status(400).json({ error: 'to, subject and message are all required' });
  }

  const localId = nanoid(10);

  try {
    const headers = {};
    if (process.env.SES_CONFIGURATION_SET) {
      headers['X-SES-CONFIGURATION-SET'] = process.env.SES_CONFIGURATION_SET;
    }

    const info = await transporter.sendMail({
      from: process.env.SES_FROM_EMAIL,
      to,
      subject,
      text: message,
      headers,
    });

    // IMPORTANT: info.messageId is a client-generated Message-ID header that
    // nodemailer creates itself — it is NOT the ID SES uses internally.
    // SES returns its own tracking ID in the raw SMTP response line, e.g.
    // "250 Ok 010001xxxxxxxx" or "250 Ok <uuid>". That's the ID that shows
    // up in mail.messageId inside bounce/complaint/delivery notifications,
    // so we must parse it out of info.response rather than using info.messageId.
    const responseMatch = /250\s+Ok\s+(\S+)/i.exec(info.response || '');
    const sesMessageId = responseMatch
      ? responseMatch[1]
      : (info.messageId || '').replace(/^<|>$/g, '').split('@')[0];

    console.log('Send OK:', { rawResponse: info.response, extractedSesMessageId: sesMessageId });

    await addEmail({
      id: localId,
      to,
      subject,
      message,
      sesMessageId,
      status: 'sent',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
    });

    res.json({ ok: true, id: localId, sesMessageId });
  } catch (err) {
    console.error('Send failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- List sent emails + their current status ---
app.get('/api/emails', async (req, res) => {
  const emails = await getEmails();
  res.json({ emails });
});

// --- Webhook: called by the Lambda function after SES -> SNS fires ---
app.post('/api/email-events', async (req, res) => {
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${process.env.WEBHOOK_API_KEY}`;

  if (!process.env.WEBHOOK_API_KEY || auth !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const payload = req.body;

  try {
    if (payload.type === 'bounce') {
      await recordEvent({
        messageId: payload.messageId,
        type: 'bounce',
        detail: payload,
      });
    } else if (payload.type === 'complaint') {
      await recordEvent({
        messageId: payload.messageId,
        type: 'complaint',
        detail: payload,
      });
    } else if (payload.type === 'delivery') {
      await recordEvent({
        messageId: payload.messageId,
        type: 'delivered',
        detail: payload,
      });
    } else if (payload.type === 'delivery_delay') {
      await recordEvent({
        messageId: payload.messageId,
        type: 'delayed',
        detail: payload,
      });
    } else if (payload.type === 'reject') {
      await recordEvent({
        messageId: payload.messageId,
        type: 'rejected',
        detail: payload,
      });
    } else {
      return res.status(400).json({ error: 'unknown event type' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook processing failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`SES bounce tracker running at http://localhost:${PORT}`);
});
