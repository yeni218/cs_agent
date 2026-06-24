import twilio from 'twilio';

export async function transferToHuman({ callSid, reason }) {
  const handoffNumber = process.env.HUMAN_HANDOFF_NUMBER;
  if (!handoffNumber) {
    return { success: false, error: 'HUMAN_HANDOFF_NUMBER is not configured.' };
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const publicUrl = process.env.PUBLIC_URL;

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    { language: 'tr-TR', voice: 'Google.tr-TR-Standard-A' },
    'Sizi bir arkadaşımıza aktarıyorum, lütfen hatta kalın.'
  );
  const dial = twiml.dial({
    timeout: 30,
    callerId: process.env.TWILIO_PHONE_NUMBER,
    ...(publicUrl ? { action: `${publicUrl}/handoff-status` } : {})
  });
  dial.number(handoffNumber);

  await client.calls(callSid).update({ twiml: twiml.toString() });
  return { success: true, reason, handoffNumber };
}
