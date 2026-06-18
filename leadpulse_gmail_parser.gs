// ═══════════════════════════════════════════════════════════════════
// LEADPULSE — Gmail Lead Parser
// Agency: 88gravity | Author: Kuldeep
// Runs every 15 minutes via time-based trigger.
// Reads unread emails from each client's Gmail label,
// parses lead data, and writes one row per lead to Raw_Leads sheet.
// ═══════════════════════════════════════════════════════════════════

// ── CONSTANTS ────────────────────────────────────────────────────────
const RAW_LEADS_TAB   = "Raw_Leads";
const LOOKBACK_HOURS  = 24;
const COLUMNS = [
  "Date", "Client", "Source", "Lead Type", "Lead Status", "Duplicate Status",
  "UTM Source", "UTM Medium", "UTM Campaign",
  "Lead Name", "Phone", "Email", "Message",
  "Source URL", "Email Subject"
];

// Column index of Email in COLUMNS (0-based) — used for duplicate detection
const EMAIL_COL_INDEX = 11; // "Email" is the 12th column

// ── CLIENT LABEL MAP ─────────────────────────────────────────────────
const CLIENT_LABEL_MAP = [
  { client: "Chalk Studio",     labelId: "Label_170925233263157408",  labelName: "Chalk Studio Leads"     },
  { client: "AWL",              labelId: "Label_1786267971699733691",  labelName: "AWL Leads"              },
  { client: "Interia",          labelId: "Label_1944307932008765760",  labelName: "Interia Leads"          },
  { client: "Mobility Infotech",labelId: "Label_1982045651977137468",  labelName: "Mobility Infotech Leads"},
  { client: "Fly with Ananta",  labelId: "Label_202394399153479593",   labelName: "Fly with Ananta Leads"  },
  { client: "The Dental Roots", labelId: "Label_2178437063601175599",  labelName: "The Dental Roots"       },
  { client: "MWM",              labelId: "Label_226916058875380533",   labelName: "MWM Leads"              },
  { client: "SKIL Events",      labelId: "Label_272776415966359363",   labelName: "SKIL Events Leads"      },
  { client: "Tia",              labelId: "Label_2774823024885345903",  labelName: "Tia Leads"              },
  { client: "Propfly",          labelId: "Label_3400619482837110121",  labelName: "Propfly Leads"          },
  { client: "SKIL Cabs",        labelId: "Label_4029609723634936772",  labelName: "SKIL Cabs Leads"        },
  { client: "Neon",             labelId: "Label_4855141033479419652",  labelName: "Neon Google Leads"      },
  { client: "88gravity",        labelId: "Label_4985710503901429883",  labelName: "88gravity Leads"        },
  { client: "RBTB",             labelId: "Label_6019375562585653087",  labelName: "RBTB Leads"             },
  { client: "Tiaraa",           labelId: "Label_6178162255177179520",  labelName: "Tiaraa Leads"           },
  { client: "Saysha",           labelId: "Label_649989171643179397",   labelName: "Saysha Leads"           },
  { client: "SKIL Travel",      labelId: "Label_6557504963848788210",  labelName: "SKIL Travel Leads"      },
  { client: "BigBin",           labelId: "Label_6592522697195268423",  labelName: "BigBin Leads"           },
  { client: "IP Travel",        labelId: "Label_7007504701265892023",  labelName: "IP Travel Leads"        },
  { client: "Native",           labelId: "Label_7325704174077083418",  labelName: "Native leads"           },
  { client: "Studio GENESIS",   labelId: "Label_7563124787013724392",  labelName: "Studio GENESIS Leads"   },
  { client: "LPS",              labelId: "Label_82331853379761787",    labelName: "LPS Leads"              },
  { client: "Colonelz",         labelId: "Label_85704354528803656",    labelName: "Colonelz Leads"         },
];

// ── MASTER SHEET — all 23 clients write to a single sheet, one Raw_Leads tab ──
const MASTER_SHEET_ID = "1EHYpYGrQYTqmpV0KZsCfeI6LFqGR9ePEGIK17IfpoDE";

// ═══════════════════════════════════════════════════════════════════
// DEDUPLICATION via Script Properties
// Tracks processed message IDs so emails are never written twice,
// regardless of read/unread status.
// ═══════════════════════════════════════════════════════════════════

function getProcessedIds() {
  var raw = PropertiesService.getScriptProperties().getProperty("processedIds");
  return raw ? JSON.parse(raw) : {};
}

function markProcessed(msgId) {
  // Re-read, update, write back — keeps the stored set accurate
  var props = PropertiesService.getScriptProperties();
  var ids   = getProcessedIds();
  ids[msgId] = true;

  // Prune to last 5000 IDs to stay within Properties storage limits
  var keys = Object.keys(ids);
  if (keys.length > 5000) {
    keys.slice(0, keys.length - 5000).forEach(function(k) { delete ids[k]; });
  }

  props.setProperty("processedIds", JSON.stringify(ids));
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

/**
 * Loops all client labels, parses emails from the last 24 h,
 * skips already-processed message IDs, writes new rows to sheet.
 * Run automatically once daily at 10 AM via trigger.
 */
function processAllClientLeads() {
  var cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
  // Load processed IDs once — avoids a Properties read on every message
  var processedIds = getProcessedIds();
  // Load existing emails from sheet once — used for duplicate detection
  var seenEmails = loadExistingEmails();

  CLIENT_LABEL_MAP.forEach(function(clientEntry) {
    try {
      processClientLabel(clientEntry, cutoff, processedIds, seenEmails);
    } catch (e) {
      console.error("Error processing client [" + clientEntry.client + "]: " + e.message);
    }
    Utilities.sleep(3000); // 1.5 s between clients — stays within per-minute rate limit
  });
}

/**
 * ONE-TIME backfill — run manually once to catch emails already marked read.
 * Looks back 7 days. Uses same dedup so nothing is double-written.
 */
function backfillLeads() {
  var cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2-day lookback keeps API calls manageable
  var processedIds = getProcessedIds();
  var seenEmails   = loadExistingEmails();

  CLIENT_LABEL_MAP.forEach(function(clientEntry) {
    try {
      processClientLabel(clientEntry, cutoff, processedIds, seenEmails);
    } catch (e) {
      console.error("Backfill error [" + clientEntry.client + "]: " + e.message);
    }
    Utilities.sleep(3000);
  });

  console.log("✅ Backfill complete.");
}

// ── PER-CLIENT PROCESSOR ─────────────────────────────────────────────

function processClientLabel(clientEntry, cutoff, processedIds, seenEmails) {
  // Build a Gmail search query — only fetches threads that actually have
  // recent messages, drastically cutting API calls vs getThreads(0,50)
  var afterDate = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), "yyyy/MM/dd");
  var query = 'label:"' + clientEntry.labelName + '" after:' + afterDate;

  var threads = GmailApp.search(query, 0, 8); // max 8 threads per client per run

  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      if (msg.getDate() < cutoff) return;

      var msgId = msg.getId();
      if (processedIds[msgId]) return; // already written

      try {
        var rowData = parseLeadEmail(msg, clientEntry.client, seenEmails);
        writeToSheet(MASTER_SHEET_ID, rowData);

        // Mark email as seen for subsequent leads in this same run
        var leadEmail = rowData[EMAIL_COL_INDEX];
        if (leadEmail) seenEmails[leadEmail.toLowerCase()] = true;

        // Update in-memory map AND persist
        processedIds[msgId] = true;
        markProcessed(msgId);
        msg.markRead();
      } catch (e) {
        console.error("Error on message [" + msg.getSubject() + "] for " + clientEntry.client + ": " + e.message);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// EMAIL PARSER
// ═══════════════════════════════════════════════════════════════════

/**
 * Extracts all lead fields from a single GmailMessage.
 * Returns an array matching COLUMNS order.
 */
function parseLeadEmail(msg, clientName, seenEmails) {
  // Use only plainBody — skips one API call per message (getBody is expensive)
  var plainBody = msg.getPlainBody() || "";
  var sender    = msg.getFrom()      || "";
  var subject   = msg.getSubject()   || "";
  var date      = msg.getDate();

  // 1. Extract source URL (prefer URL with UTM params)
  var sourceUrl = extractSourceUrl(plainBody, plainBody); // pass plainBody twice, htmlBody dropped

  // 2. Parse UTM params from URL
  var utmParams = parseUtmParams(sourceUrl);
  var leadType  = (utmParams.utm_source || utmParams.utm_medium) ? "Paid" : "Organic";

  // 3. Determine lead source: BotPenguin or Website Form
  var source = detectSource(plainBody, plainBody, sender, subject);

  // 4. Extract lead contact fields
  var leadName        = extractLeadName(plainBody);
  var phone           = extractPhone(plainBody);
  var leadEmail       = extractLeadEmail(plainBody, sender);
  var message         = extractMessage(plainBody);
  var leadStatus      = classifyLead(message, subject, plainBody, clientName);
  var duplicateStatus = (seenEmails && leadEmail && seenEmails[leadEmail.toLowerCase()])
                        ? "Duplicate"
                        : "New Lead";

  return [
    Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    clientName,
    source,
    leadType,
    leadStatus,
    duplicateStatus,
    utmParams.utm_source   || "",
    utmParams.utm_medium   || "",
    utmParams.utm_campaign || "",
    leadName,
    phone,
    leadEmail,
    message,
    sourceUrl,
    subject
  ];
}

// ═══════════════════════════════════════════════════════════════════
// URL & UTM PARSING
// ═══════════════════════════════════════════════════════════════════

/**
 * Searches plain + HTML body for URLs.
 * Prefers URLs that carry UTM params.
 */
function extractSourceUrl(plainBody, htmlBody) {
  var combined = plainBody + " " + htmlBody;

  // Match all http/https URLs
  var urlPattern = /https?:\/\/[^\s"'<>\]]+/gi;
  var urls = combined.match(urlPattern) || [];

  // Clean trailing punctuation artifacts from each URL
  urls = urls.map(function(u) {
    return u.replace(/[.,;)>\]'"]+$/, "");
  });

  // Prefer a URL that contains UTM params
  var utmUrl = urls.filter(function(u) {
    return u.indexOf("utm_") !== -1;
  })[0];
  if (utmUrl) return utmUrl;

  // Fall back to first non-noise URL
  var cleanUrl = urls.filter(function(u) {
    var lower = u.toLowerCase();
    return (
      lower.indexOf("unsubscribe") === -1 &&
      lower.indexOf("mailto")      === -1 &&
      lower.indexOf("goo.gl")      === -1 &&
      lower.indexOf("google.com/maps") === -1
    );
  })[0];

  return cleanUrl || "";
}

/**
 * Parses query string of a URL and returns an object of all params.
 * Keys are lowercased for reliable matching.
 */
function parseUtmParams(url) {
  var params = {};
  if (!url) return params;

  var qIndex = url.indexOf("?");
  if (qIndex === -1) return params;

  var queryString = url.substring(qIndex + 1);
  queryString.split("&").forEach(function(part) {
    var eqIndex = part.indexOf("=");
    if (eqIndex === -1) return;
    var key   = decodeURIComponent(part.substring(0, eqIndex)).toLowerCase().trim();
    var value = decodeURIComponent(part.substring(eqIndex + 1).replace(/\+/g, " ")).trim();
    if (key) params[key] = value;
  });

  return params;
}

// ═══════════════════════════════════════════════════════════════════
// SOURCE DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns "BotPenguin" or "Website Form".
 */
function detectSource(plainBody, htmlBody, sender, subject) {
  var haystack = (plainBody + " " + htmlBody + " " + sender + " " + subject).toLowerCase();
  if (
    haystack.indexOf("botpenguin") !== -1 ||
    sender.toLowerCase().indexOf("botpenguin") !== -1
  ) {
    return "BotPenguin";
  }
  return "Website Form";
}

// ═══════════════════════════════════════════════════════════════════
// LEAD FIELD EXTRACTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Tries common "Name:" label patterns in the email body.
 * Returns the extracted name string, or "" if not found.
 */
function extractLeadName(body) {
  var patterns = [
    /(?:full[\s_-]?name|visitor[\s_-]?name|your[\s_-]?name|name)\s*[:\-]\s*(.+)/i,
    /^name\s*[:\-]\s*(.+)/im,
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = body.match(patterns[i]);
    if (match && match[1]) {
      var name = match[1].split(/[\r\n]/)[0].trim();
      // Sanity check: between 2 and 60 chars, mostly letters/spaces
      if (name.length >= 2 && name.length <= 60 && /^[A-Za-z\s.\-']+$/.test(name)) {
        return name;
      }
    }
  }
  return "";
}

/**
 * Tries labelled phone patterns first, then bare Indian mobile patterns.
 * Returns the first credible match, or "".
 */
function extractPhone(body) {
  // Labelled: "Phone: +91 9876543210"
  var labelledPattern = /(?:phone|mobile|contact[\s_-]?no|tel|number|mob)\s*[:\-]\s*([+\d\s\(\)\-\.]{7,20})/i;
  var match = body.match(labelledPattern);
  if (match && match[1]) {
    var phone = match[1].trim();
    if (phone.replace(/\D/g, "").length >= 7) return phone.replace(/\s+/g, " ");
  }

  // Bare Indian mobile (10 digits starting 6–9, optional +91 prefix)
  var indiaPattern = /(?<!\d)(\+?91[\s\-]?)?([6-9]\d{9})(?!\d)/;
  match = body.match(indiaPattern);
  if (match) {
    var prefix = match[1] ? match[1].trim() : "";
    return (prefix ? prefix + " " : "") + match[2];
  }

  // International: +X (XXX) XXX-XXXX style
  var intlPattern = /(?<!\d)(\+\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{4})(?!\d)/;
  match = body.match(intlPattern);
  if (match) return match[1].trim();

  return "";
}

/**
 * Looks for an email address in the body, excluding noreply/system addresses.
 * Falls back to parsing the sender field.
 */
function extractLeadEmail(body, sender) {
  var emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  // Search body first
  var matches = body.match(emailPattern) || [];
  var blocklist = ["noreply", "no-reply", "donotreply", "botpenguin", "88gravity", "mailer", "notification"];

  var leadEmail = matches.filter(function(e) {
    var lower = e.toLowerCase();
    return !blocklist.some(function(b) { return lower.indexOf(b) !== -1; });
  })[0];

  if (leadEmail) return leadEmail;

  // Fall back to sender
  var senderMatches = sender.match(emailPattern);
  return senderMatches ? senderMatches[0] : "";
}

/**
 * Classifies a lead as "Lead" or "Not a Lead".
 * Checks message + subject + body for blogger/SEO/guest-post pitcher signals.
 * Returns "Not a Lead" if ANY signal matches, otherwise "Lead".
 */
// Clients exempt from "Not a Lead" classification — all their submissions count as leads.
var CLASSIFY_EXEMPT_CLIENTS = ["88gravity"];

function classifyLead(message, subject, body, clientName) {
  // Skip classification for exempt clients
  if (CLASSIFY_EXEMPT_CLIENTS.indexOf(clientName) !== -1) return "Lead";

  var haystack = (message + " " + subject + " " + body).toLowerCase();

  // ── KEYWORD SIGNALS ───────────────────────────────────────────────
  var spamKeywords = [
    // Guest posting / blogging pitches
    "guest post", "guest blog", "guest article", "write for you",
    "write for your", "write for us", "content writer", "content writing",
    "blogger", "i am a writer", "i'm a writer", "blog post",
    "article submission", "publish my article", "publish an article",

    // SEO / backlink pitches
    "seo service", "seo agency", "seo expert", "seo specialist",
    "i can help you rank", "rank your website", "rank your site",
    "increase your ranking", "improve your ranking",
    "backlink", "link building", "link insertion", "link exchange",
    "sponsored post", "paid post", "paid link",
    "increase your traffic", "increase traffic to your",
    "boost your website", "boost your seo",
    "domain authority", "da ", " da score",

    // Digital marketing vendor pitches
    "i provide digital marketing", "digital marketing services",
    "i offer digital marketing", "social media marketing services",
    "ppc services", "google ads services", "facebook ads services",
    "we are a digital agency", "our agency",

    // Generic spam openers
    "i came across your website", "i found your website",
    "i visited your website", "i noticed your website",
    "i was browsing your", "i recently visited",
    "collaboration opportunity", "business proposal",
    "partnership opportunity", "mutual benefit",
    "i can help your business", "help your website grow",
  ];

  for (var i = 0; i < spamKeywords.length; i++) {
    if (haystack.indexOf(spamKeywords[i]) !== -1) {
      return "Not a Lead";
    }
  }

  // ── URL-IN-MESSAGE SIGNAL ─────────────────────────────────────────
  // Legitimate leads rarely paste their own website URLs in the message.
  // Bloggers/SEO pitchers almost always do.
  var urlPattern = /https?:\/\/[^\s"'<>\]]{8,}/gi;
  var msgUrls = (message || "").match(urlPattern) || [];
  if (msgUrls.length > 0) {
    return "Not a Lead";
  }

  return "Lead";
}

/**
 * Extracts the message / enquiry text from the form submission body.
 * Tries labelled patterns first ("Message:", "Query:", etc.),
 * then falls back to the longest unlabelled paragraph in the body.
 */
function extractMessage(body) {
  // Labelled field patterns
  var patterns = [
    /(?:message|your[\s_-]?message|enquiry|query|requirement|description|comments?|notes?|details?)\s*[:\-]\s*([\s\S]+?)(?:\n{2,}|$)/i,
    /(?:^|\n)(?:message|query|enquiry)\s*[:\-]\s*(.+)/im,
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = body.match(patterns[i]);
    if (match && match[1]) {
      var msg = match[1].trim();
      // Stop at the next labelled field (e.g. "Phone: ..." on the next line)
      msg = msg.split(/\n[A-Za-z\s]+\s*:/)[0].trim();
      if (msg.length > 1 && msg.length <= 1000) return msg;
    }
  }

  // Fallback: find the longest paragraph that isn't a URL or field label
  var paragraphs = body.split(/\n{2,}/);
  var best = "";
  paragraphs.forEach(function(para) {
    para = para.trim();
    if (
      para.length > best.length &&
      para.length <= 1000 &&
      para.indexOf("http") === -1 &&
      !/^[A-Za-z\s]+\s*:/.test(para)   // not a "Label: value" line
    ) {
      best = para;
    }
  });

  return best;
}

// ═══════════════════════════════════════════════════════════════════
// DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Reads the Email column from Raw_Leads and returns a lowercase-keyed
 * object for O(1) duplicate lookup.
 * Returns empty object if the tab doesn't exist yet.
 */
function loadExistingEmails() {
  var seen = {};
  try {
    var ss    = SpreadsheetApp.openById(MASTER_SHEET_ID);
    var sheet = ss.getSheetByName(RAW_LEADS_TAB);
    if (!sheet || sheet.getLastRow() < 2) return seen;

    // EMAIL_COL_INDEX is 0-based; getRange uses 1-based columns
    var emailCol  = EMAIL_COL_INDEX + 1;
    var lastRow   = sheet.getLastRow();
    var values    = sheet.getRange(2, emailCol, lastRow - 1, 1).getValues();

    values.forEach(function(row) {
      var email = (row[0] || "").toString().trim().toLowerCase();
      if (email) seen[email] = true;
    });
  } catch (e) {
    console.warn("Could not load existing emails: " + e.message);
  }
  return seen;
}

// ═══════════════════════════════════════════════════════════════════
// SHEET WRITER
// ═══════════════════════════════════════════════════════════════════

/**
 * Opens the spreadsheet by ID.
 * Creates "Raw_Leads" tab with styled headers if it doesn't exist.
 * Appends the row data.
 */
function writeToSheet(sheetId, rowData) {
  var ss    = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(RAW_LEADS_TAB);

  // Auto-create tab with headers if missing
  if (!sheet) {
    sheet = ss.insertSheet(RAW_LEADS_TAB);

    var headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
    headerRange.setValues([COLUMNS]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#4a86e8");
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);

    // Set sensible column widths
    sheet.setColumnWidth(1,  160); // Date
    sheet.setColumnWidth(2,  130); // Client
    sheet.setColumnWidth(3,  120); // Source
    sheet.setColumnWidth(4,  90);  // Lead Type
    sheet.setColumnWidth(5,  110); // Lead Status
    sheet.setColumnWidth(6,  110); // Duplicate Status
    sheet.setColumnWidth(7,  110); // UTM Source
    sheet.setColumnWidth(8,  110); // UTM Medium
    sheet.setColumnWidth(9,  130); // UTM Campaign
    sheet.setColumnWidth(10, 140); // Lead Name
    sheet.setColumnWidth(11, 120); // Phone
    sheet.setColumnWidth(12, 190); // Email
    sheet.setColumnWidth(13, 260); // Message
    sheet.setColumnWidth(14, 260); // Source URL
    sheet.setColumnWidth(15, 220); // Email Subject
  }

  sheet.appendRow(rowData);
}

// ═══════════════════════════════════════════════════════════════════
// TRIGGER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Run ONCE manually from the Apps Script editor to install the trigger.
 * Deletes any existing triggers first to avoid duplicates.
 */
function createTrigger() {
  // Remove existing triggers for both functions
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === "processAllClientLeads" || fn === "pullAllMetaLeads") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Gmail leads — daily at 10 AM
  ScriptApp.newTrigger("processAllClientLeads")
    .timeBased()
    .atHour(10)
    .everyDays(1)
    .create();

  // Meta leads — daily at 10 AM (runs after Gmail, staggered by Apps Script scheduler)
  ScriptApp.newTrigger("pullAllMetaLeads")
    .timeBased()
    .atHour(10)
    .everyDays(1)
    .create();

  console.log("✅ Triggers created: Gmail + Meta leads will run daily at 10 AM.");
}

/**
 * Utility: delete ALL project triggers (use to clean up during re-deploy).
 */
function deleteAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  console.log("All triggers deleted.");
}

// ═══════════════════════════════════════════════════════════════════
// META LEADS — Pull from client Google Sheets
// Each client has a Meta-connected Google Sheet (Sheet1 tab).
// This section reads all those sheets and merges into Meta_Leads tab.
// ═══════════════════════════════════════════════════════════════════

const META_LEADS_TAB     = "Meta_Leads";
// Destination for Meta leads (same master sheet, separate tab)
const META_MASTER_SHEET_ID = MASTER_SHEET_ID;

// ── Meta-connected source sheets ──────────────────────────────────
// isInternal: true  → client name kept exactly as-is (not matched to Gmail clients)
// isInternal: false → clientName matches the Gmail client name
const META_SOURCE_SHEETS = [
  // ── Internal sheets (7) — full name preserved ─────────────────
  { clientName: "Internal Interior Leads",    sheetId: "1-ZqAMljGFc-Vp-6c28CZNYxSSProlwcrABkjhiG0D6s", isInternal: true  },
  { clientName: "Internal MIL Leads",         sheetId: "1EwM-ObVqk_Mg62-YlZBGpQaYkUukKpqqxWfH1MVTBh4", isInternal: true  },
  { clientName: "Internal Mobility Leads",    sheetId: "1Jbnr7FN_yZ6XJV2E0RWknpm6aYYee2PqSYZK1m1wlq4", isInternal: true  },
  { clientName: "Internal IP Travel Leads",   sheetId: "1hg8KdTEQqv1AcCQvMyasUnIzKB4REYmXVdY6WMZVSFY", isInternal: true  },
  { clientName: "Internal SKIL Travel Leads", sheetId: "1bm94Vdey-mOgnVxgtYURPnWHlUPLURSut0iYJ6auvN0", isInternal: true  },
  { clientName: "Internal Saysha leads",      sheetId: "1DdwoxwhSBpbyo90oCw_jOJewtfUFcn8TUoN4QyqPaMA", isInternal: true  },
  { clientName: "Internal FWA Leads",         sheetId: "1FcqWEwFsdt1Rkd76MhiGiB6yWuyGJttH_rdhqW3AKXk", isInternal: true  },
  // ── Regular client sheets (5) — matched to Gmail client names ─
  { clientName: "88Global",  sheetId: "1lhidGanxpUqJuyiRZs1_R8Rz1MR-DjeeWJBIY4YGQcw", isInternal: false },
  { clientName: "Alpine",    sheetId: "11QfK79EqW3luHHIh2NXR6g7OW180Zsp0J_Ogturz7fo", isInternal: false },
  { clientName: "Saysha",    sheetId: "1hrJAg_P_za4qkmMLBrXQVgAqWSTmPu9tDdyn0bTk3gs", isInternal: false },
  { clientName: "Capstone",  sheetId: "1IEjQIg4B-W7fQf9Z4zR5RmmE0Lt3J-BbWwtElr9Jews", isInternal: false },
  { clientName: "Propfly",   sheetId: "1xPwom2cTTOwEPnjKCgIvFCJM8M_nFYbNGREUq24dzIw", isInternal: false },
];

// Destination tab columns in Leadpulse master sheet
const META_DEST_COLUMNS = [
  "Date", "Client", "Campaign", "Ad Set", "Ad Name", "Form Name",
  "Lead Name", "Phone", "Email", "Other Fields",
  "Duplicate Status", "Lead ID"
];
const META_DEST_EMAIL_COL = 8; // 0-based index of Email in META_DEST_COLUMNS

// ── MAIN META PULLER ──────────────────────────────────────────────

/**
 * Loops through all client Meta sheets, reads new leads,
 * and merges them into the Meta_Leads tab in the master sheet.
 * Safe to run repeatedly — Lead ID dedup prevents double-writing.
 */
function pullAllMetaLeads() {
  var processedIds = getProcessedMetaIds();
  var seenEmails   = loadMetaDestEmails();
  // Open destination sheet ONCE — avoids repeated openById calls inside the loop
  var destSheet    = getOrCreateMetaSheet();

  META_SOURCE_SHEETS.forEach(function(entry) {
    try {
      pullMetaLeadsFromSheet(entry, processedIds, seenEmails, destSheet);
    } catch (e) {
      console.error("Meta pull error [" + entry.clientName + "]: " + e.message);
    }
    Utilities.sleep(1000);
  });

  console.log("✅ Meta leads pull complete.");
}

function pullMetaLeadsFromSheet(entry, processedIds, seenEmails, destSheet) {
  var ss    = SpreadsheetApp.openById(entry.sheetId);
  // Try "Sheet1" first; fall back to the first sheet (some Meta sheets use a different tab name)
  var sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
  if (!sheet || sheet.getLastRow() < 2) {
    console.log("No data found for: " + entry.clientName);
    return;
  }

  var allData = sheet.getDataRange().getValues();
  var headers = allData[0].map(function(h) { return h.toString().toLowerCase().trim(); });

  // Build column index map from header row
  var colMap = buildMetaColMap(headers);

  var newLeads = 0;

  for (var i = 1; i < allData.length; i++) {
    var row    = allData[i];
    var leadId = getCellValue(row, colMap.id);

    if (!leadId) continue;
    if (processedIds[leadId]) continue; // already in master sheet

    var email      = getCellValue(row, colMap.email).toLowerCase().trim();
    var leadName   = getCellValue(row, colMap.full_name)
                     || (getCellValue(row, colMap.first_name) + " " + getCellValue(row, colMap.last_name)).trim();
    var phone      = getCellValue(row, colMap.phone_number) || getCellValue(row, colMap.phone);
    var campaign   = getCellValue(row, colMap.campaign_name);
    var adSet      = getCellValue(row, colMap.adset_name);
    var adName     = getCellValue(row, colMap.ad_name);
    var formName   = getCellValue(row, colMap.form_name);
    var createdRaw = getCellValue(row, colMap.created_time);
    var dateStr    = formatMetaDate(createdRaw);

    // Collect non-standard columns into Other Fields
    var standardCols = ["id","created_time","full_name","first_name","last_name",
                        "email","phone_number","phone","ad_id","ad_name",
                        "adset_id","adset_name","campaign_id","campaign_name",
                        "form_id","form_name","platform","is_organic"];
    var otherParts = [];
    headers.forEach(function(h, idx) {
      if (standardCols.indexOf(h) === -1 && row[idx] !== "" && row[idx] !== null && row[idx] !== undefined) {
        otherParts.push(h + ": " + row[idx]);
      }
    });
    var otherFields = otherParts.join(" | ");

    var dupStatus = (email && seenEmails[email]) ? "Duplicate" : "New Lead";

    var destRow = [
      dateStr,
      entry.clientName,
      campaign,
      adSet,
      adName,
      formName,
      leadName,
      phone,
      email,
      otherFields,
      dupStatus,
      leadId
    ];

    writeMetaDestRow(destRow, destSheet);

    // Update in-memory maps
    if (email) seenEmails[email] = true;
    processedIds[leadId] = true;
    markProcessedMetaId(leadId);
    newLeads++;
  }

  console.log("Meta [" + entry.clientName + "]: " + newLeads + " new lead(s) merged.");
}

// ── HELPERS ───────────────────────────────────────────────────────

/**
 * Maps known Meta column name variants to a unified index map.
 * Returns object where key = standard field, value = column index (or -1).
 */
function buildMetaColMap(headers) {
  var map = {};
  var known = {
    id:            ["id", "lead id", "leadid"],
    created_time:  ["created_time", "created time", "date", "timestamp"],
    full_name:     ["full_name", "full name", "name"],
    first_name:    ["first_name", "first name"],
    last_name:     ["last_name", "last name"],
    email:         ["email", "email address"],
    phone_number:  ["phone_number", "phone number", "phone", "mobile", "contact number"],
    campaign_name: ["campaign_name", "campaign name", "campaign"],
    adset_name:    ["adset_name", "adset name", "ad set name", "ad set"],
    ad_name:       ["ad_name", "ad name", "ad"],
    form_name:     ["form_name", "form name", "form"],
  };

  Object.keys(known).forEach(function(field) {
    map[field] = -1;
    known[field].forEach(function(variant) {
      if (map[field] === -1) {
        var idx = headers.indexOf(variant);
        if (idx !== -1) map[field] = idx;
      }
    });
  });

  return map;
}

function getCellValue(row, colIdx) {
  if (colIdx === -1 || colIdx === undefined) return "";
  var val = row[colIdx];
  return (val !== null && val !== undefined) ? val.toString().trim() : "";
}

function formatMetaDate(raw) {
  if (!raw) return "";
  try {
    var d = new Date(raw);
    if (isNaN(d.getTime())) return raw.toString();
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  } catch (e) {
    return raw.toString();
  }
}

// ── META DEST SHEET WRITER ────────────────────────────────────────

/**
 * Opens the Meta destination sheet ONCE and returns the tab (creating it if needed).
 * Call getOrCreateMetaSheet() once per run, then pass the sheet object directly.
 */
function getOrCreateMetaSheet() {
  var ss    = SpreadsheetApp.openById(META_MASTER_SHEET_ID);
  var sheet = ss.getSheetByName(META_LEADS_TAB);

  if (!sheet) {
    sheet = ss.insertSheet(META_LEADS_TAB);
    var headerRange = sheet.getRange(1, 1, 1, META_DEST_COLUMNS.length);
    headerRange.setValues([META_DEST_COLUMNS]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1877F2"); // Meta blue
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1,  160); // Date
    sheet.setColumnWidth(2,  130); // Client
    sheet.setColumnWidth(3,  180); // Campaign
    sheet.setColumnWidth(4,  160); // Ad Set
    sheet.setColumnWidth(5,  160); // Ad Name
    sheet.setColumnWidth(6,  160); // Form Name
    sheet.setColumnWidth(7,  140); // Lead Name
    sheet.setColumnWidth(8,  120); // Phone
    sheet.setColumnWidth(9,  190); // Email
    sheet.setColumnWidth(10, 240); // Other Fields
    sheet.setColumnWidth(11, 120); // Duplicate Status
    sheet.setColumnWidth(12, 180); // Lead ID
  }

  return sheet;
}

// Legacy single-row writer kept for compatibility — opens sheet once per row (slow).
// Use batch approach in pullAllMetaLeads instead.
function writeMetaDestRow(rowData, sheet) {
  if (!sheet) sheet = getOrCreateMetaSheet();
  sheet.appendRow(rowData);
}

// ── META DEDUP ────────────────────────────────────────────────────

/** Run once manually to reset Meta lead dedup cache (e.g. after a failed write run). */
function clearMetaProcessedIds() {
  PropertiesService.getScriptProperties().deleteProperty("processedMetaIds");
  console.log("✅ processedMetaIds cleared — re-run pullAllMetaLeads() now.");
}

function getProcessedMetaIds() {
  var raw = PropertiesService.getScriptProperties().getProperty("processedMetaIds");
  return raw ? JSON.parse(raw) : {};
}

function markProcessedMetaId(leadId) {
  var ids  = getProcessedMetaIds();
  ids[leadId] = true;
  var keys = Object.keys(ids);
  if (keys.length > 10000) {
    keys.slice(0, keys.length - 10000).forEach(function(k) { delete ids[k]; });
  }
  PropertiesService.getScriptProperties().setProperty("processedMetaIds", JSON.stringify(ids));
}

function loadMetaDestEmails() {
  var seen  = {};
  var ss    = SpreadsheetApp.openById(MASTER_SHEET_ID);
  var sheet = ss.getSheetByName(META_LEADS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return seen;
  var values = sheet.getRange(2, META_DEST_EMAIL_COL + 1, sheet.getLastRow() - 1, 1).getValues();
  values.forEach(function(row) {
    var email = (row[0] || "").toString().trim().toLowerCase();
    if (email) seen[email] = true;
  });
  return seen;
}

// ═══════════════════════════════════════════════════════════════════
// STEP 7 PLACEHOLDER
// ═══════════════════════════════════════════════════════════════════

function sendDailyAlertEmail() {
  /* Step 7 — placeholder */
}

// ═══════════════════════════════════════════════════════════════════
// LEADPULSE DASHBOARD API  ·  doGet()
// Serves lead data as JSON for the LeadPulse Dashboard web app.
//
// DEPLOY:
//   Apps Script → Deploy → New deployment → Web app
//   Execute as: Me
//   Who has access: Anyone
//   Copy the "/exec" URL → paste into index.html CONFIG block
// ═══════════════════════════════════════════════════════════════════

/**
 * HTTP GET entry point.
 * Query params:
 *   ?start=YYYY-MM-DD   (optional) inclusive start date filter
 *   ?end=YYYY-MM-DD     (optional) inclusive end date filter
 * Returns JSON: { ok, lastUpdated, rawLeads[], metaLeads[] }
 */
function doGet(e) {
  var params    = (e && e.parameter) ? e.parameter : {};
  var startDate = params.start    || "";
  var endDate   = params.end      || "";
  var callback  = params.callback || "";   // JSONP support — bypasses CORS

  var payload = JSON.stringify({
    ok:          true,
    lastUpdated: new Date().toISOString(),
    rawLeads:    _getRawLeadsData(startDate, endDate),
    metaLeads:   _getMetaLeadsData(startDate, endDate)
  });

  // If a callback name is provided, wrap as JSONP (avoids CORS entirely)
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + payload + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

/** Reads Raw_Leads tab, filters by date range, returns array of row-objects. */
function _getRawLeadsData(startDate, endDate) {
  try {
    var ss    = SpreadsheetApp.openById(MASTER_SHEET_ID);
    var sheet = ss.getSheetByName(RAW_LEADS_TAB);
    if (!sheet || sheet.getLastRow() < 2) return [];

    var data    = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return h.toString().trim(); });
    var start   = startDate ? new Date(startDate + "T00:00:00") : null;
    var end     = endDate   ? new Date(endDate   + "T23:59:59") : null;
    var result  = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      var rowDate = new Date(row[0]);
      if (start && rowDate < start) continue;
      if (end   && rowDate > end  ) continue;
      var obj = {};
      headers.forEach(function(h, idx) {
        obj[h] = (row[idx] !== null && row[idx] !== undefined) ? row[idx].toString() : "";
      });
      result.push(obj);
    }
    return result;
  } catch (err) {
    console.error("_getRawLeadsData: " + err.message);
    return [];
  }
}

/** Reads Meta_Leads tab, filters by date range, returns array of row-objects. */
function _getMetaLeadsData(startDate, endDate) {
  try {
    var ss    = SpreadsheetApp.openById(META_MASTER_SHEET_ID);
    var sheet = ss.getSheetByName(META_LEADS_TAB);
    if (!sheet || sheet.getLastRow() < 2) return [];

    var data    = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return h.toString().trim(); });
    var start   = startDate ? new Date(startDate + "T00:00:00") : null;
    var end     = endDate   ? new Date(endDate   + "T23:59:59") : null;
    var result  = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      var rowDate = new Date(row[0]);
      if (start && rowDate < start) continue;
      if (end   && rowDate > end  ) continue;
      var obj = {};
      headers.forEach(function(h, idx) {
        obj[h] = (row[idx] !== null && row[idx] !== undefined) ? row[idx].toString() : "";
      });
      result.push(obj);
    }
    return result;
  } catch (err) {
    console.error("_getMetaLeadsData: " + err.message);
    return [];
  }
}