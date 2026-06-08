// Google Apps Script for kaanbalci.com project request form + Google Forms fallback
// Bound to the "Kaan Balcı - Proje Talepleri" spreadsheet.
// Web App deployment: Execute as Me / Who has access: Anyone.

const OWNER_EMAIL = "kaanb8776@gmail.com";
const WEBSITE_SHEET_NAME = "Website Talepleri";

function safe(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function valueOrDash_(value) {
  const text = String(value || "").trim();
  return text || "-";
}

function getOrCreateWebsiteSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Active spreadsheet bulunamadı. Script'i Google Sheet içinden açtığından emin ol.");

  let sheet = ss.getSheetByName(WEBSITE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(WEBSITE_SHEET_NAME);

  const headers = [
    "Timestamp",
    "Source",
    "Name",
    "Email",
    "Phone / WhatsApp",
    "Company / Brand",
    "Project Type",
    "Estimated Budget",
    "Timeline",
    "Preferred Contact",
    "Details",
    "Page URL"
  ];

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = currentHeaders.every((cell) => !cell);
  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function normalizePayload_(data) {
  data = data || {};
  return {
    source: valueOrDash_(data.source || "kaanbalci.com request page"),
    name: valueOrDash_(data.name),
    email: valueOrDash_(data.email),
    phone: valueOrDash_(data.phone),
    company: valueOrDash_(data.company),
    serviceType: valueOrDash_(data.serviceType),
    budget: valueOrDash_(data.budget),
    timeline: valueOrDash_(data.timeline),
    preferredContact: valueOrDash_(data.preferredContact),
    details: valueOrDash_(data.details),
    pageUrl: valueOrDash_(data.pageUrl)
  };
}

function appendWebsiteRequest_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateWebsiteSheet_();
    sheet.appendRow([
      new Date(),
      payload.source,
      payload.name,
      payload.email,
      payload.phone,
      payload.company,
      payload.serviceType,
      payload.budget,
      payload.timeline,
      payload.preferredContact,
      payload.details,
      payload.pageUrl
    ]);
  } finally {
    lock.releaseLock();
  }
}

function sendOwnerMail_(payload) {
  const rows = [
    ["Name", payload.name],
    ["Email", payload.email],
    ["Phone / WhatsApp", payload.phone],
    ["Company / Brand", payload.company],
    ["Project Type", payload.serviceType],
    ["Estimated Budget", payload.budget],
    ["Timeline", payload.timeline],
    ["Preferred Contact", payload.preferredContact],
    ["Source", payload.source],
    ["Page URL", payload.pageUrl],
    ["Submitted At", new Date().toLocaleString("tr-TR")],
    ["Details", payload.details]
  ];

  const htmlRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;border:1px solid #ddd;font-weight:700;vertical-align:top;">${safe(label)}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;white-space:pre-wrap;">${safe(value)}</td>
    </tr>
  `).join("");

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    replyTo: payload.email && payload.email !== "-" ? payload.email : OWNER_EMAIL,
    subject: `Yeni proje talebi - ${payload.name !== "-" ? payload.name : payload.serviceType}`,
    htmlBody: `
      <h2>Yeni Proje Talebi Geldi</h2>
      <p>Kaynak: <strong>${safe(payload.source)}</strong></p>
      <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">${htmlRows}</table>
    `
  });
}

function sendUserConfirmation_(payload) {
  if (!payload.email || payload.email === "-") return;

  MailApp.sendEmail({
    to: payload.email,
    subject: "Proje talebiniz alındı | Kaan Balcı",
    htmlBody: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
        <h2>Proje talebiniz alındı.</h2>
        <p>Merhaba ${safe(payload.name !== "-" ? payload.name : "")},</p>
        <p>Proje talebiniz başarıyla tarafıma iletildi. Detayları inceleyip en kısa sürede dönüş yapacağım.</p>
        <p><strong>Talep türü:</strong> ${safe(payload.serviceType)}</p>
        <p><strong>Tercih edilen iletişim:</strong> ${safe(payload.preferredContact)}</p>
        <br>
        <p>Teşekkürler,</p>
        <p><strong>Kaan Balcı</strong><br>AI Designer & Software Developer</p>
      </div>
    `
  });
}

function parsePostData_(e) {
  if (e && e.parameter && Object.keys(e.parameter).length) {
    return e.parameter;
  }

  if (e && e.postData && e.postData.contents) {
    const content = e.postData.contents;
    const type = String(e.postData.type || "").toLowerCase();

    if (type.includes("application/json")) {
      return JSON.parse(content);
    }

    // x-www-form-urlencoded fallback
    return content.split("&").reduce((acc, pair) => {
      const [rawKey, rawValue] = pair.split("=");
      if (!rawKey) return acc;
      acc[decodeURIComponent(rawKey.replace(/\+/g, " "))] = decodeURIComponent(String(rawValue || "").replace(/\+/g, " "));
      return acc;
    }, {});
  }

  return {};
}

function jsonOutput_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

// Browser'da /exec açınca endpoint'in çalıştığını test etmek için.
function doGet() {
  return jsonOutput_({ ok: true, message: "Kaan request endpoint is live.", time: new Date().toISOString() });
}

// Website formu buraya POST atıyor. Trigger gerekmez.
function doPost(e) {
  try {
    const data = parsePostData_(e);
    const payload = normalizePayload_(data);

    appendWebsiteRequest_(payload);
    sendOwnerMail_(payload);
    sendUserConfirmation_(payload);

    return jsonOutput_({ ok: true });
  } catch (error) {
    MailApp.sendEmail({
      to: OWNER_EMAIL,
      subject: "Proje talebi script hatası",
      body: String(error && error.stack ? error.stack : error)
    });

    return jsonOutput_({ ok: false, error: String(error) });
  }
}

// Google Forms fallback trigger'ı için.
// Trigger settings: From spreadsheet -> On form submit.
function onFormSubmit(e) {
  // Apps Script editöründen manuel çalıştırırsan event objesi gelmez.
  // Bu yüzden manuel testte otomatik test verisi kullanıyoruz.
  if (!e || !e.namedValues) {
    return testGoogleFormSubmit_();
  }

  const data = e.namedValues || {};
  const get = (key) => (data[key] && data[key][0]) ? data[key][0] : "-";

  const payload = normalizePayload_({
    source: "Google Forms",
    name: get("Adınız Soyadınız"),
    email: get("E-posta Adresiniz"),
    phone: get("Telefon / WhatsApp Numaranız"),
    company: get("Şirket / Marka / Proje Adı"),
    serviceType: get("Talep Ettiğiniz Proje Türü"),
    budget: get("Tahmini Bütçe Aralığı"),
    timeline: get("Hedef Teslim Süresi"),
    preferredContact: get("Tercih Ettiğiniz İletişim Kanalı"),
    details: [
      get("Projenin Mevcut Durumu"),
      get("Projeyi Kısaca Anlatır mısınız?"),
      get("İstediğiniz Özellikler"),
      get("Referans Site / Örnek Linkler"),
      get("Ek Notunuz")
    ].filter((item) => item && item !== "-").join("\n\n"),
    pageUrl: "Google Forms"
  });

  appendWebsiteRequest_(payload);
  sendOwnerMail_(payload);
  sendUserConfirmation_(payload);
}

// Manuel test: Apps Script içinde bu fonksiyonu seçip Çalıştır.
function testWebsiteRequest_() {
  const payload = normalizePayload_({
    source: "Manual Apps Script Test",
    name: "Test Kullanıcı",
    email: OWNER_EMAIL,
    phone: "+90 test",
    company: "Test Marka",
    serviceType: "Website / portfolio / landing page",
    budget: "Test bütçe",
    timeline: "Test timeline",
    preferredContact: "E-posta",
    details: "Bu Apps Script manuel test kaydıdır. Bu mail geldiyse sistem çalışıyor.",
    pageUrl: "Apps Script manual test"
  });

  appendWebsiteRequest_(payload);
  sendOwnerMail_(payload);
  sendUserConfirmation_(payload);
  return "OK - testWebsiteRequest_ mail ve sheet testi tamamlandı.";
}

// Manuel test: onFormSubmit event simülasyonu.
function testGoogleFormSubmit_() {
  const fakeEvent = {
    namedValues: {
      "Adınız Soyadınız": ["Google Form Test Kullanıcı"],
      "E-posta Adresiniz": [OWNER_EMAIL],
      "Telefon / WhatsApp Numaranız": ["+90 test"],
      "Şirket / Marka / Proje Adı": ["Test Marka"],
      "Talep Ettiğiniz Proje Türü": ["Web Sitesi"],
      "Tahmini Bütçe Aralığı": ["Teklif almak istiyorum"],
      "Hedef Teslim Süresi": ["Esnek"],
      "Tercih Ettiğiniz İletişim Kanalı": ["E-posta"],
      "Projenin Mevcut Durumu": ["Fikrim var ama netleştirmek istiyorum"],
      "Projeyi Kısaca Anlatır mısınız?": ["Bu Google Forms trigger testidir."],
      "İstediğiniz Özellikler": ["Responsive tasarım, Form / mail gönderimi"],
      "Referans Site / Örnek Linkler": ["-"],
      "Ek Notunuz": ["Test notu"]
    }
  };

  return onFormSubmit(fakeEvent);
}

// Public wrappers so they appear in the Apps Script function dropdown.
function testWebsiteRequest() {
  return testWebsiteRequest_();
}

function testGoogleFormSubmit() {
  return testGoogleFormSubmit_();
}
