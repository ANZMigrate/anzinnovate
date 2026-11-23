import nodemailer from "nodemailer";

const RECIPIENT = "info@anzinnovate.com";
const MAX_BODY_CHARS = 3_900_000;
const MAX_RESUME_BYTES = 2 * 1024 * 1024;
const MAX_ENCODED_RESUME_CHARS = 2_800_000;
const CURRENCIES = new Set(["AUD", "USD", "GBP", "EUR", "SGD", "NZD", "CAD", "AED", "INR", "CNY", "HKD", "MYR", "IDR", "JPY"]);
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const getText = (value, max) => typeof value === "string" ? value.trim().slice(0, max + 1) : "";
const bad = (message) => json({ ok: false, error: message }, 400);

function validLinkedIn(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && (u.hostname === "linkedin.com" || u.hostname === "www.linkedin.com");
  } catch {
    return false;
  }
}

function parseResume(file) {
  if (!file) return null;
  if (typeof file !== "object" || Array.isArray(file)) throw new Error("The CV attachment is invalid.");
  const filename = getText(file.name, 160).replace(/[\\/\r\n]/g, "").replace(/[^a-zA-Z0-9._ ()-]/g, "_");
  const content = typeof file.data === "string" ? file.data : "";
  const ext = filename.toLowerCase().split(".").pop();
  if (!["pdf", "doc", "docx"].includes(ext)) throw new Error("CV must be PDF, DOC or DOCX.");
  if (!content || content.length > MAX_ENCODED_RESUME_CHARS ||
      content.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
    throw new Error("CV is invalid or exceeds the 2 MB limit.");
  }
  const buffer = Buffer.from(content, "base64");
  if (!buffer.length || buffer.length > MAX_RESUME_BYTES) throw new Error("CV exceeds the 2 MB limit.");
  const pdf = ext === "pdf" && buffer.subarray(0, 4).toString() === "%PDF";
  const word = ext === "doc" && buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  const docx = ext === "docx" && buffer.subarray(0, 2).toString() === "PK";
  if (!pdf && !word && !docx) throw new Error("The CV file format does not match its extension.");
  const contentType = ext === "pdf" ? "application/pdf"
    : ext === "doc" ? "application/msword"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return { filename, content: buffer, contentType };
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const siteHost = request.headers.get("x-forwarded-host") || new URL(request.url).host;
      if (new URL(origin).host.toLowerCase() !== siteHost.toLowerCase()) {
        return json({ ok: false, error: "Invalid request origin." }, 403);
      }
    } catch {
      return json({ ok: false, error: "Invalid request origin." }, 403);
    }
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "Only JSON submissions are accepted." }, 415);
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_CHARS) {
    return json({ ok: false, error: "Submission too large." }, 413);
  }
  let data;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return json({ ok: false, error: "Submission too large." }, 413);
    data = JSON.parse(raw);
  } catch {
    return bad("Please check your information and try again.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return bad("Invalid enquiry.");
  // A hidden honeypot discourages simple form bots; no email is sent.
  if (getText(data.website, 200)) return json({ ok: true });
  const name = getText(data.name, 120);
  const email = getText(data.email, 254);
  const phone = getText(data.phone, 60);
  const field = getText(data.field, 150);
  const linkedin = getText(data.linkedin, 400);
  const patents = getText(data.patents, 2500);
  const speaking = getText(data.speaking, 2500);
  const media = getText(data.media, 2500);
  const rawSalary = typeof data.salary === "number" || typeof data.salary === "string" ? String(data.salary).trim() : "";
  const salary = Number(rawSalary);
  const chosenCurrency = getText(data.currency, 6).toUpperCase();
  const currency = chosenCurrency === "OTHER" ? getText(data.otherCurrency, 3).toUpperCase() : chosenCurrency;
  if (!name || name.length > 120 || /[\r\n]/.test(name)) return bad("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || /[\r\n]/.test(email)) return bad("Enter a valid email address.");
  if (phone.length > 60 || field.length > 150 || [patents, speaking, media].some(v => v.length > 2500)) return bad("One or more fields are too long.");
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(rawSalary) || !Number.isFinite(salary) || salary <= 0 || salary > 1e15) return bad("Enter your current annual base salary.");
  if (!/^[A-Z]{3}$/.test(currency) || (chosenCurrency !== "OTHER" && !CURRENCIES.has(chosenCurrency))) return bad("Select a valid salary currency.");
  if (linkedin && !validLinkedIn(linkedin)) return bad("Enter a valid https://linkedin.com profile URL.");
  if (data.consent !== true) return bad("Please confirm the privacy consent checkbox.");
  let resume;
  try {
    resume = parseResume(data.resume);
  } catch (error) {
    return bad(error.message);
  }
  if (!linkedin && !resume) return bad("Add a LinkedIn profile or attach a CV / résumé.");
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !Number.isInteger(port) || port < 1 || port > 65535) {
    return json({ ok: false, error: "The enquiry form is not available yet. Please email info@anzinnovate.com directly." }, 503);
  }
  const secure = process.env.SMTP_SECURE === "true" || (!process.env.SMTP_SECURE && port === 465);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port, secure, requireTLS: !secure,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
  });
  const body = [
    "New ANZInnovate NIV eligibility enquiry", "",
    "Name: " + name,
    "Email: " + email,
    "Phone / WhatsApp: " + (phone || "Not provided"),
    "Role / field: " + (field || "Not provided"),
    "LinkedIn: " + (linkedin || "Not provided"),
    "CV attachment: " + (resume ? resume.filename : "Not provided"),
    "Current annual base salary: " + rawSalary + " " + currency, "",
    "International patents / IP:", patents || "Not provided", "",
    "International speaking engagements:", speaking || "Not provided", "",
    "Media / press:", media || "Not provided", "",
    "Privacy consent: Confirmed",
    "Submitted (UTC): " + new Date().toISOString(),
    "Source: anzinnovate.com eligibility enquiry"
  ].join("\n");
  try {
    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: RECIPIENT,
      replyTo: email,
      subject: "ANZInnovate NIV enquiry: " + name,
      text: body,
      attachments: resume ? [resume] : []
    });
    return json({ ok: true, message: "Your enquiry has been sent to ANZInnovate." });
  } catch (error) {
    console.error("ANZInnovate SMTP delivery failed:", error.code || error.name || "SMTP_ERROR");
    return json({ ok: false, error: "We couldn't send your enquiry. Please try again or email info@anzinnovate.com." }, 502);
  } finally {
    transporter.close();
  }
}
