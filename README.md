# SES bounce tracker

A small app to send emails through your Amazon SES SMTP credentials and see,
in near real time, whether each one was delivered, bounced, or complained
about — instead of finding out weeks later that a client never got your mail.

## How it works

```
Your app (this project) --SMTP--> Amazon SES --> SNS topic --> Lambda --> POST /api/email-events (this project)
```

1. You send an email from the dashboard. It goes out through SES SMTP.
2. SES is configured with a **Configuration Set** that has an **SNS destination**
   for Bounce/Complaint/Delivery events.
3. When SES processes a bounce or complaint, it publishes to that SNS topic.
4. A small Lambda function (see `lambda/index.mjs`) subscribed to the topic
   receives it and forwards the details to this app's `/api/email-events`
   endpoint.
5. The dashboard shows you the live status of every email you've sent.

## Setup

### 1. Install and configure this app

```bash
npm install
cp .env.example .env
```

Edit `.env`:
- `SES_SMTP_HOST` / `SES_SMTP_PORT` / `SES_SMTP_USER` / `SES_SMTP_PASS` — from
  SES Console → SMTP settings → Create SMTP credentials (NOT your IAM access keys)
- `SES_FROM_EMAIL` — a verified sender identity in SES
- `SES_CONFIGURATION_SET` — the name of the config set you'll create below
- `WEBHOOK_API_KEY` — any random string; the Lambda must send this back to you

Run it:

```bash
npm start
```

Visit `http://localhost:3000`.

### 2. Configure SES to publish bounce/complaint events to SNS

In the AWS Console:
1. **SES → Configuration sets** → create one (name it to match `SES_CONFIGURATION_SET`).
2. Inside it, **Event destinations → Add destination**.
3. Select event types: **Bounce**, **Complaint** (and optionally **Delivery**).
4. Destination type: **SNS**, pick or create a topic (e.g. `ses-bounce-notifications`).

### 3. Deploy the Lambda function

The code is in `lambda/index.mjs`. Deploy it (console, SAM, or Terraform — your
choice), then:
- Subscribe it to the SNS topic from step 2 (SNS Console → topic → Create subscription → protocol: Lambda).
- Set the Lambda's environment variables:
  - `APP_API_URL` — where this app is reachable, e.g. `https://your-domain.com/api/email-events`
    (for local testing, use a tunnel like `ngrok http 3000` and put the ngrok URL here)
  - `APP_API_KEY` — must match `WEBHOOK_API_KEY` in this app's `.env`

### 4. Test it without waiting for a real bounce

SES provides simulator addresses that trigger fake events instantly:
- `bounce@simulator.amazonses.com` → permanent bounce
- `complaint@simulator.amazonses.com` → complaint
- `success@simulator.amazonses.com` → delivered

Send to one of these from the dashboard and watch the status update within
a few seconds (the dashboard polls every 8s).

## Notes

- Email records are stored in `data/emails.json` — fine for testing, swap for
  a real database before production use.
- If an event arrives for a message this app didn't send (e.g. sent before
  this app existed), it still shows up in the log labeled "(unmatched message)".
