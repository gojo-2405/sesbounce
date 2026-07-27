import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const DB_PATH = new URL('./data/emails.json', import.meta.url);

async function load() {
  if (!existsSync(DB_PATH)) {
    await writeFile(DB_PATH, JSON.stringify({ emails: [] }, null, 2));
  }
  const raw = await readFile(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function save(data) {
  await writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

export async function addEmail(record) {
  const data = await load();
  data.emails.unshift(record);
  await save(data);
  return record;
}

export async function getEmails() {
  const data = await load();
  return data.emails;
}

// Matches an incoming SES event (bounce/complaint/delivery) to a stored
// email by SES messageId, and updates its status + event history.
export async function recordEvent({ messageId, type, detail }) {
  const data = await load();
  const email = data.emails.find((e) => e.sesMessageId === messageId);

  if (!email) {
    // Event arrived for a message we don't have a local record of
    // (e.g. sent before this app existed, or from another sender).
    data.emails.unshift({
      id: `unmatched-${Date.now()}`,
      to: detail?.recipients?.[0]?.email || detail?.recipients?.[0] || 'unknown',
      subject: '(unmatched message)',
      sesMessageId: messageId,
      status: type,
      sentAt: null,
      updatedAt: new Date().toISOString(),
      events: [{ type, detail, at: new Date().toISOString() }],
    });
    await save(data);
    return;
  }

  email.status = type; // 'delivered' | 'bounce' | 'complaint'
  email.updatedAt = new Date().toISOString();
  email.events = email.events || [];
  email.events.push({ type, detail, at: new Date().toISOString() });

  await save(data);
}
