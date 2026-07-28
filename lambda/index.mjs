// Deploy this as a Lambda function (Node.js 20.x runtime) and subscribe it
// to the SNS topic that receives your SES bounce/complaint/delivery events.
//
// Environment variables required on the Lambda:
//   APP_API_URL  - e.g. https://your-domain.com/api/email-events
//   APP_API_KEY  - must match WEBHOOK_API_KEY in the app's .env

export const handler = async (event) => {
  for (const record of event.Records) {
    let message;
    try {
      message = JSON.parse(record.Sns.Message);
    } catch (err) {
      console.error('Could not parse SNS message', err);
      continue;
    }

    const mail = message.mail || {};
    let payload;

    // Two different SES notification formats exist:
    // - Classic SNS notifications set up directly on an identity use `notificationType`
    // - Configuration Set event destinations (what most setups use, including this one)
    //   use `eventType` instead. Same underlying data shape either way, so we
    //   just check both field names.
    const eventKind = message.eventType || message.notificationType;

    if (eventKind === 'Bounce') {
      const bounce = message.bounce || {};
      payload = {
        type: 'bounce',
        messageId: mail.messageId,
        bounceType: bounce.bounceType,
        bounceSubType: bounce.bounceSubType,
        timestamp: bounce.timestamp,
        recipients: (bounce.bouncedRecipients || []).map((r) => ({
          email: r.emailAddress,
          status: r.status,
          diagnosticCode: r.diagnosticCode,
        })),
        source: mail.source,
        subject: mail.commonHeaders?.subject,
      };
    } else if (eventKind === 'Complaint') {
      const complaint = message.complaint || {};
      payload = {
        type: 'complaint',
        messageId: mail.messageId,
        complaintFeedbackType: complaint.complaintFeedbackType,
        timestamp: complaint.timestamp,
        recipients: (complaint.complainedRecipients || []).map((r) => ({
          email: r.emailAddress,
        })),
      };
    } else if (eventKind === 'Delivery') {
      const delivery = message.delivery || {};
      payload = {
        type: 'delivery',
        messageId: mail.messageId,
        timestamp: delivery.timestamp,
        recipients: (delivery.recipients || []).map((email) => ({ email })),
      };
    } else if (eventKind === 'DeliveryDelay') {
      const delay = message.deliveryDelay || {};
      payload = {
        type: 'delivery_delay',
        messageId: mail.messageId,
        delayType: delay.delayType,
        timestamp: delay.timestamp,
        recipients: (delay.delayedRecipients || []).map((r) => ({
          email: r.emailAddress,
          diagnosticCode: r.diagnosticCode,
        })),
      };
    } else if (eventKind === 'Reject') {
      const reject = message.reject || {};
      payload = {
        type: 'reject',
        messageId: mail.messageId,
        reason: reject.reason,
        recipients: (mail.destination || []).map((email) => ({ email })),
      };
    } else {
      console.log('Unhandled event kind:', eventKind, '| raw message:', JSON.stringify(message).slice(0, 500));
      continue;
    }

    try {
      const res = await fetch(process.env.APP_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.APP_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`App API responded with ${res.status}`);
      }
    } catch (err) {
      console.error('Failed to forward event to app:', err);
      throw err;
    }
  }

  return { ok: true };
};
