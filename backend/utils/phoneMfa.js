const requiredKeys = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"];

function config() {
  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length) throw new Error("SMS verification is not configured. Set the Twilio Verify environment variables.");
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID
  };
}

export function normalizePhoneNumber(value) {
  const phone = String(value || "").trim().replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Enter a valid phone number with country code, for example +919876543210.");
  return phone;
}

async function request(path, body) {
  const { accountSid, authToken, serviceSid } = config();
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to send or verify the SMS code.");
  return data;
}

export async function sendPhoneCode(phoneNumber) {
  return request("Verifications", { To: phoneNumber, Channel: "sms" });
}

export async function checkPhoneCode(phoneNumber, code) {
  const data = await request("VerificationCheck", { To: phoneNumber, Code: String(code || "").trim() });
  return data.status === "approved";
}
