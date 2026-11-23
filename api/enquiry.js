import nodemailer from "nodemailer";

const RECIPIENT = "info@anzinnovate.com";
const MAX_BODY_CHARS = 3_900_000;
const MAX_RESUME_BYTES = 2 * 1024 * 1024;
const MAX_ENCODED_RESUME_CHARS = 2_800_000;
const CURRENCIES = new Set(["AUD", "USD", "GBP", "EUR", "SGD", "NZD", "CAD", "AED", "INR", "CNY", "HKD", "MYR", "IDR", "JPY"]);
const getText = (value, max) => typeof value === "string" ? value.trim().slice(0, max + 1) : "";

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

export default async function handler(request, response) {
  // Both Vercel Node.js IncomingMessage/ServerResponse and Web Request/Response
  // may be used depending on the runtime. Always send a response in either mode.
  const reply = (payload, status = 200) => {
    if (response && typeof response.setHeader === "function" && typeof response.end === "function") {
      response.statusCode = status;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(JSON.stringify(payload));
      return;
    }
    return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
  };
  const invalid = (message) => reply({ ok: false, error: message }, 400);
  const header = (key) => {
    const headers = request.headers;
    if (headers && typeof headers.get === "function") return headers.get(key);
    const value = headers?.[key.toLowerCase()] ?? headers?.[key];
    return Array.isArray(value) ? value[0] : (typeof value === "string" ? value : null);
  };
  try {
  if (request.method !== "POST") return reply({ ok: false, error: "Method not allowed." }, 405);
  const origin = header("origin");
  if (origin) {
    try {
      const siteHost = header("x-forwarded-host") || header("host") || new URL(request.url).host;
      if (new URL(origin).host.toLowerCase() !== siteHost.toLowerCase()) {
        return reply({ ok: false, error: "Invalid request origin." }, 403);
      }
    } catch {
      return reply({ ok: false, error: "Invalid request origin." }, 403);
    }
  }
  if (!header("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply({ ok: false, error: "Only JSON submissions are accepted." }, 415);
  }
  if (Number(header("content-length") || 0) > MAX_BODY_CHARS) {
    return reply({ ok: false, error: "Submission too large." }, 413);
  }
  let data;
  try {
    // Vercel's Node.js handlers populate request.body. Web Request handlers use text().
    if (request.body !== undefined && request.body !== null) {
      if (typeof request.body === "string") data = JSON.parse(request.body);
      else if (Buffer.isBuffer(request.body)) data = JSON.parse(request.body.toString("utf8"));
      else data = request.body;
    } else if (typeof request.text === "function") {
      const raw = await request.text();
      if (raw.length > MAX_BODY_CHARS) return reply({ ok: false, error: "Submission too large." }, 413);
      data = JSON.parse(raw);
    } else {
      // Fallback for ordinary IncomingMessage streams without Vercel's body helper.
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_CHARS) return reply({ ok: false, error: "Submission too large." }, 413);
        chunks.push(chunk);
      }
      data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    if (JSON.stringify(data).length > MAX_BODY_CHARS) return reply({ ok: false, error: "Submission too large." }, 413);
  } catch {
    return invalid("Please check your information and try again.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return invalid("Invalid enquiry.");
  // A hidden honeypot discourages simple form bots; no email is sent.
  if (getText(data.website, 200)) return reply({ ok: true });
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
  if (!name || name.length > 120 || /[\r\n]/.test(name)) return invalid("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || /[\r\n]/.test(email)) return invalid("Enter a valid email address.");
  if (phone.length > 60 || field.length > 150 || [patents, speaking, media].some(v => v.length > 2500)) return invalid("One or more fields are too long.");
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(rawSalary) || !Number.isFinite(salary) || salary <= 0 || salary > 1e15) return invalid("Enter your current annual base salary.");
  if (!/^[A-Z]{3}$/.test(currency) || (chosenCurrency !== "OTHER" && !CURRENCIES.has(chosenCurrency))) return invalid("Select a valid salary currency.");
  if (linkedin && !validLinkedIn(linkedin)) return invalid("Enter a valid https://linkedin.com profile URL.");
  if (data.consent !== true) return invalid("Please confirm the privacy consent checkbox.");
  let resume;
  try {
    resume = parseResume(data.resume);
  } catch (error) {
    return invalid(error.message);
  }
  if (!linkedin && !resume) return invalid("Add a LinkedIn profile or attach a CV / résumé.");
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !Number.isInteger(port) || port < 1 || port > 65535) {
    return reply({ ok: false, error: "The enquiry form is not available yet. Please email info@anzinnovate.com directly." }, 503);
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
    return reply({ ok: true, message: "Your enquiry has been sent to ANZInnovate." });
  } catch (error) {
    console.error("ANZInnovate SMTP delivery failed:", error.code || error.name || "SMTP_ERROR");
    return reply({ ok: false, error: "We couldn't send your enquiry. Please try again or email info@anzinnovate.com." }, 502);
  } finally {
    transporter.close();
  }

  } catch (error) {
    // Do not log contact details, resume contents, email credentials or SMTP settings.
    console.error("ANZInnovate enquiry unhandled error:", error?.code || error?.name || "INTERNAL_ERROR");
    return reply({ ok: false, error: "The enquiry service had a problem. Please email info@anzinnovate.com directly." }, 500);
  }
}
