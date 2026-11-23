// app.js — Contacts CRUD, CSV Import (Google Forms), Search, Today's & Missed Birthdays, Auto-Pruning & Wishes
import { rtdb, auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import {
  ref,
  push,
  set,
  update,
  remove,
  onValue
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-database.js";

// DOM references — Tabs & Panels
const tabSingleBtn        = document.getElementById("tab-single-btn");
const tabCsvBtn           = document.getElementById("tab-csv-btn");
const singleContactPanel  = document.getElementById("single-contact-panel");
const csvImportPanel      = document.getElementById("csv-import-panel");

// DOM references — Single Contact Form
const contactForm        = document.getElementById("contact-form");
const formTitle          = document.getElementById("form-title");
const editIdInput        = document.getElementById("edit-id");
const nameInput          = document.getElementById("contact-name");
const birthdayInput      = document.getElementById("contact-birthday");
const emailInput         = document.getElementById("contact-email");
const whatsappInput      = document.getElementById("contact-whatsapp");
const statusSelect       = document.getElementById("contact-status");
const studentFinishGroup = document.getElementById("student-finish-group");
const finishDateSelect   = document.getElementById("expected-finish-date");
const wishInput          = document.getElementById("wish-message");
const saveBtn            = document.getElementById("save-btn");
const cancelEditBtn      = document.getElementById("cancel-edit-btn");

// DOM references — CSV Import
const csvDropZone            = document.getElementById("csv-drop-zone");
const csvFileInput           = document.getElementById("csv-file-input");
const browseCsvBtn           = document.getElementById("browse-csv-btn");
const csvFilenameText        = document.getElementById("csv-filename");
const csvStatusMsg           = document.getElementById("csv-status-msg");
const downloadTemplateBtn     = document.getElementById("download-template-btn");
const csvPreviewContainer     = document.getElementById("csv-preview-container");
const csvPreviewCount        = document.getElementById("csv-preview-count");
const csvPreviewTbody        = document.getElementById("csv-preview-tbody");
const importContactsBtn      = document.getElementById("import-contacts-btn");
const importContactsBottomBtn = document.getElementById("import-contacts-bottom-btn");
const switchCsvBtn           = document.getElementById("switch-to-csv-btn");

// DOM references — Search & Lists
const searchInput        = document.getElementById("contact-search");
const clearSearchBtn     = document.getElementById("clear-search-btn");
const contactsList       = document.getElementById("contacts-list");
const contactsCount      = document.getElementById("contacts-count");
const todaysList         = document.getElementById("todays-birthdays");
const todaysCount        = document.getElementById("todays-count");
const missedList         = document.getElementById("missed-birthdays");
const missedCount        = document.getElementById("missed-count");

let unsubscribeRtdb = null;
const contactsMap = new Map();
let currentSearchQuery = "";
let parsedCsvContacts = [];

// ============ Tab Switching (Manual Entry vs CSV Import) ============
if (tabSingleBtn && tabCsvBtn) {
  tabSingleBtn.addEventListener("click", () => {
    tabSingleBtn.classList.add("active");
    tabCsvBtn.classList.remove("active");
    singleContactPanel.classList.remove("hidden");
    csvImportPanel.classList.add("hidden");
  });

  tabCsvBtn.addEventListener("click", () => {
    tabCsvBtn.classList.add("active");
    tabSingleBtn.classList.remove("active");
    csvImportPanel.classList.remove("hidden");
    singleContactPanel.classList.add("hidden");
  });
}

if (switchCsvBtn && tabCsvBtn) {
  switchCsvBtn.addEventListener("click", () => {
    tabCsvBtn.click();
    if (csvDropZone) csvDropZone.scrollIntoView({ behavior: "smooth" });
  });
}

// ============ Populate Dynamic November Finish Dates ============
function populateExpectedFinishOptions() {
  finishDateSelect.innerHTML = "";
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  if (currentMonth < 11) {
    const opt = document.createElement("option");
    opt.value = `November ${currentYear}`;
    opt.dataset.year = currentYear;
    opt.textContent = `November ${currentYear} (Finishing this year)`;
    finishDateSelect.appendChild(opt);
  }

  for (let i = 1; i <= 6; i++) {
    const targetYear = currentYear + i;
    const opt = document.createElement("option");
    opt.value = `November ${targetYear}`;
    opt.dataset.year = targetYear;
    opt.textContent = `November ${targetYear} (${i} year${i > 1 ? "s" : ""} left)`;
    finishDateSelect.appendChild(opt);
  }
}

// Show/hide expected finish date depending on status
statusSelect.addEventListener("change", () => {
  if (statusSelect.value === "student") {
    studentFinishGroup.classList.remove("hidden");
    finishDateSelect.setAttribute("required", "required");
  } else {
    studentFinishGroup.classList.add("hidden");
    finishDateSelect.removeAttribute("required");
  }
});

// ============ Search Contacts Handler ============
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    currentSearchQuery = e.target.value.trim().toLowerCase();
    if (clearSearchBtn) {
      if (currentSearchQuery.length > 0) {
        clearSearchBtn.classList.remove("hidden");
      } else {
        clearSearchBtn.classList.add("hidden");
      }
    }
    filterAndRenderContacts();
  });
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    currentSearchQuery = "";
    clearSearchBtn.classList.add("hidden");
    filterAndRenderContacts();
    searchInput.focus();
  });
}

// ============ Realtime Database Contacts Listener ============
onAuthStateChanged(auth, (user) => {
  if (user) {
    populateExpectedFinishOptions();
    listenToContacts();
  } else {
    if (unsubscribeRtdb) {
      unsubscribeRtdb();
      unsubscribeRtdb = null;
    }
    contactsMap.clear();
    contactsList.innerHTML = '<p class="placeholder">No contacts yet. Add one above!</p>';
    todaysList.innerHTML   = '<p class="placeholder">No birthdays today.</p>';
    missedList.innerHTML   = '<p class="placeholder">No missed birthdays! All past birthdays have been greeted. 🌟</p>';
    if (contactsCount) contactsCount.textContent = "0 contacts";
    if (todaysCount)   todaysCount.textContent   = "0 today";
    if (missedCount)   missedCount.textContent   = "0 missed";
    resetForm();
  }
});

function listenToContacts() {
  if (unsubscribeRtdb) unsubscribeRtdb();

  const contactsRef = ref(rtdb, "contacts");
  unsubscribeRtdb = onValue(
    contactsRef,
    (snapshot) => {
      contactsMap.clear();
      const expiredContacts = [];
      const activeContacts = [];

      snapshot.forEach((childSnap) => {
        const contact = { id: childSnap.key, ...childSnap.val() };

        if (isStudentExpired(contact)) {
          expiredContacts.push(contact);
        } else {
          activeContacts.push(contact);
          contactsMap.set(contact.id, contact);
        }
      });

      // Automatically prune expired student contacts from database
      if (expiredContacts.length > 0) {
        for (const exp of expiredContacts) {
          remove(ref(rtdb, `contacts/${exp.id}`))
            .then(() => {
              console.log(`Auto-pruned expired student: ${exp.name} (${exp.expectedFinishDate})`);
              showToast(`Auto-deleted completed student: ${exp.name} (${exp.expectedFinishDate}) 🎓`);
            })
            .catch((err) => console.error("Error auto-deleting student:", err));
        }
      }

      // Sort all active contacts by upcoming birthday (MM-DD)
      activeContacts.sort((a, b) => {
        const bdayA = (a.birthday || "").slice(5);
        const bdayB = (b.birthday || "").slice(5);
        return bdayA.localeCompare(bdayB);
      });

      filterAndRenderContacts();
      renderTodaysBirthdays(activeContacts);
      renderMissedBirthdays(activeContacts);
    },
    (error) => {
      console.error("Realtime Database listener error:", error);
      showToast("Error loading contacts from Realtime Database ❌");
    }
  );
}

// ============ Check If Student Has Reached Expected Finish Date ============
function isStudentExpired(c) {
  if (c.status !== "student") return false;

  let finishYear = c.finishYear;
  if (!finishYear && c.expectedFinishDate) {
    const match = c.expectedFinishDate.match(/\d{4}/);
    if (match) finishYear = parseInt(match[0], 10);
  }
  if (!finishYear) return false;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // Reached or passed November (month 11) of their finish year
  if (currentYear > finishYear) return true;
  if (currentYear === finishYear && currentMonth >= 11) return true;
  return false;
}

// ============ Filter & Render All Contacts (Search) ============
function filterAndRenderContacts() {
  const all = Array.from(contactsMap.values());

  let filtered = all;
  if (currentSearchQuery) {
    filtered = all.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const email = (c.email || "").toLowerCase();
      const whatsapp = (c.whatsapp || "").toLowerCase();
      const status = (c.status || "").toLowerCase();
      const finishDate = (c.expectedFinishDate || "").toLowerCase();
      const bdayStr = formatBirthday(c.birthday).toLowerCase();

      return (
        name.includes(currentSearchQuery) ||
        email.includes(currentSearchQuery) ||
        whatsapp.includes(currentSearchQuery) ||
        status.includes(currentSearchQuery) ||
        finishDate.includes(currentSearchQuery) ||
        bdayStr.includes(currentSearchQuery)
      );
    });
  }

  renderContacts(filtered, all.length);
}

function renderContacts(contacts, totalCount) {
  if (contactsCount) {
    if (currentSearchQuery) {
      contactsCount.textContent = `${contacts.length} of ${totalCount} matching`;
    } else {
      contactsCount.textContent = `${totalCount} contact${totalCount === 1 ? "" : "s"}`;
    }
  }

  if (contacts.length === 0) {
    if (currentSearchQuery) {
      contactsList.innerHTML = `<p class="placeholder">No contacts match "<strong>${escapeHtml(currentSearchQuery)}</strong>".</p>`;
    } else {
      contactsList.innerHTML = '<p class="placeholder">No contacts yet. Add your first contact above!</p>';
    }
    return;
  }

  contactsList.innerHTML = contacts
    .map((c) => {
      const bday = formatBirthday(c.birthday);
      const isStudent = c.status === "student";
      const badgeClass = isStudent ? "badge badge-student" : "badge badge-staff";
      const statusText = isStudent
        ? `🎓 Student (Finishes ${escapeHtml(c.expectedFinishDate || "Nov")})`
        : `💼 Staff (Permanent)`;

      const currentYear = new Date().getFullYear();
      const wasWishedThisYear = c.lastWishedYear === currentYear;

      return `
        <div class="contact-item">
          <div class="contact-info">
            <div class="contact-header-line">
              <strong>${escapeHtml(c.name)}</strong>
              <span class="${badgeClass}">${statusText}</span>
              ${
                wasWishedThisYear
                  ? `<span class="badge" title="Birthday greeting was sent this year">✓ Wished ${currentYear}</span>`
                  : ""
              }
            </div>
            <div class="contact-meta">
              <span>🎂 ${bday}</span>
              <span>✉️ ${escapeHtml(c.email)}</span>
              <span>💬 ${escapeHtml(c.whatsapp || "—")}</span>
            </div>
          </div>
          <div class="contact-actions">
            <button class="btn-secondary" onclick="window.__editContact('${c.id}')" title="Edit Contact">Edit</button>
            <button class="btn-danger" onclick="window.__deleteContact('${c.id}')" title="Delete Contact">Delete</button>
          </div>
        </div>`;
    })
    .join("");
}

// ============ Render Today's Birthdays ============
function renderTodaysBirthdays(contacts) {
  const today = todayMMDD();
  const matches = contacts.filter((c) => c.birthday && c.birthday.slice(5) === today);

  if (todaysCount) {
    todaysCount.textContent = `${matches.length} today`;
  }

  if (matches.length === 0) {
    todaysList.innerHTML = '<p class="placeholder">No birthdays today.</p>';
    return;
  }

  todaysList.innerHTML = matches
    .map((c) => {
      return `
        <div class="birthday-today-card">
          <div class="info">
            <strong>🎂 ${escapeHtml(c.name)}</strong>
            <span>${escapeHtml(c.email)} · ${escapeHtml(c.whatsapp || "No WhatsApp")}</span>
          </div>
          <div class="birthday-today-actions">
            <button class="btn-send" onclick="window.__sendEmailWish('${c.id}', false)">
              Email Wish ✉️
            </button>
            ${
              c.whatsapp
                ? `<button class="btn-whatsapp" onclick="window.__sendWhatsAppWish('${c.id}', false)">
                    WhatsApp Wish 💬
                  </button>`
                : ""
            }
          </div>
        </div>`;
    })
    .join("");
}

// ============ Render Missed Birthdays ============
function renderMissedBirthdays(contacts) {
  const currentYear = new Date().getFullYear();
  const missed = [];

  contacts.forEach((c) => {
    const diffDays = getDaysAgoThisYear(c.birthday);
    if (diffDays !== null && diffDays > 0) {
      if (c.lastWishedYear !== currentYear) {
        missed.push({
          ...c,
          daysAgo: diffDays
        });
      }
    }
  });

  missed.sort((a, b) => a.daysAgo - b.daysAgo);

  if (missedCount) {
    missedCount.textContent = `${missed.length} missed`;
  }

  if (missed.length === 0) {
    missedList.innerHTML = '<p class="placeholder">No missed birthdays! All past birthdays have been greeted. 🌟</p>';
    return;
  }

  missedList.innerHTML = missed
    .map((c) => {
      const bday = formatBirthday(c.birthday);
      const daysText = c.daysAgo === 1 ? "1 day ago" : `${c.daysAgo} days ago`;

      return `
        <div class="birthday-missed-card">
          <div class="info">
            <strong>⚠️ ${escapeHtml(c.name)} <span class="days-ago-pill">${daysText}</span></strong>
            <span>🎂 Birthday was on ${bday} · ${escapeHtml(c.email)}</span>
          </div>
          <div class="birthday-today-actions">
            <button class="btn-send" onclick="window.__sendEmailWish('${c.id}', true)" title="Send Belated Email Wish">
              Belated Email ✉️
            </button>
            ${
              c.whatsapp
                ? `<button class="btn-whatsapp" onclick="window.__sendWhatsAppWish('${c.id}', true)" title="Send Belated WhatsApp Wish">
                    Belated WhatsApp 💬
                  </button>`
                : ""
            }
            <button class="btn-mark-done" onclick="window.__markWished('${c.id}')" title="Mark as greeted outside app">
              Mark as Sent ✓
            </button>
          </div>
        </div>`;
    })
    .join("");
}

function getDaysAgoThisYear(birthdayStr) {
  if (!birthdayStr) return null;
  const parts = birthdayStr.split("-");
  if (parts.length < 3) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const bdayThisYear = new Date(currentYear, month, day);
  const today = new Date(currentYear, now.getMonth(), now.getDate());

  const diffMs = today.getTime() - bdayThisYear.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

// ============ CRUD: Add / Update Single Contact ============
contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) {
    showToast("Please sign in first ❌");
    return;
  }

  const nameVal      = nameInput.value.trim();
  const birthdayVal  = birthdayInput.value; // "YYYY-MM-DD"
  const emailVal     = emailInput.value.trim();
  const whatsappVal  = whatsappInput.value.trim();
  const statusVal    = statusSelect.value; // "staff" or "student"
  const wishVal      = wishInput.value.trim();

  if (!nameVal || !birthdayVal || !emailVal || !whatsappVal || !statusVal) {
    showToast("Please complete all required fields ❌");
    return;
  }

  const payload = {
    name: nameVal,
    birthday: birthdayVal,
    email: emailVal,
    whatsapp: whatsappVal,
    status: statusVal,
    wishMessage: wishVal || "", // Leave blank if empty so official Crawford PRO greeting is rendered dynamically
    updatedAt: Date.now(),
    updatedBy: user.email
  };

  if (statusVal === "student") {
    const selectedOpt = finishDateSelect.options[finishDateSelect.selectedIndex];
    const yearNumber = selectedOpt ? parseInt(selectedOpt.dataset.year, 10) : extractYear(finishDateSelect.value);
    payload.expectedFinishDate = finishDateSelect.value;
    payload.finishYear = yearNumber;
    payload.finishMonth = 11; // November
  } else {
    payload.expectedFinishDate = null;
    payload.finishYear = null;
    payload.finishMonth = null;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const editId = editIdInput.value;
    if (editId) {
      await update(ref(rtdb, `contacts/${editId}`), payload);
      showToast("Contact updated in database ✅");
    } else {
      payload.createdAt = Date.now();
      payload.createdBy = user.email;
      const newRef = push(ref(rtdb, "contacts"));
      await set(newRef, payload);
      showToast("Contact added to database 🎉");
    }
    resetForm();
  } catch (err) {
    console.error("Save contact error:", err);
    showToast(`Error: ${err.message || "Could not save contact"} ❌`);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = editIdInput.value ? "Update Contact" : "Add Contact";
  }
});

// Cancel Edit
cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

// ============ CSV Upload & Parsing (Google Forms / Sheets) ============
function setCsvStatus(msg, type = "info") {
  if (!csvStatusMsg) return;
  csvStatusMsg.textContent = msg;
  csvStatusMsg.className = `csv-status-msg ${type}`;
}

if (csvFileInput) {
  csvFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleCsvFile(e.target.files[0]);
    }
  });
}

if (csvDropZone) {
  csvDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    csvDropZone.classList.add("dragover");
  });

  csvDropZone.addEventListener("dragleave", () => {
    csvDropZone.classList.remove("dragover");
  });

  csvDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    csvDropZone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleCsvFile(e.dataTransfer.files[0]);
    }
  });
}

function handleCsvFile(file) {
  if (!file) return;

  const validExts = [".csv", ".txt"];
  const isMatch = validExts.some((ext) => file.name.toLowerCase().endsWith(ext));
  if (!isMatch && file.type && !file.type.includes("csv") && !file.type.includes("text")) {
    setCsvStatus("Please select a .csv file (exported from Google Forms/Sheets) ❌", "error");
    showToast("Please upload a valid .csv file ❌");
    return;
  }

  if (csvFilenameText) {
    csvFilenameText.textContent = `📄 Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  }
  setCsvStatus("Reading file...", "info");

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    processCsvData(text);
  };
  reader.onerror = () => {
    setCsvStatus("Error reading CSV file from disk ❌", "error");
    showToast("Error reading CSV file ❌");
  };
  reader.readAsText(file);
}

// Auto-detect CSV delimiter (comma, semicolon, tab)
function detectDelimiter(text) {
  const firstLine = text.split(/\r\n|\r|\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount  = (firstLine.match(/;/g) || []).length;
  const tabCount   = (firstLine.match(/\t/g) || []).length;

  if (semiCount > commaCount && semiCount > tabCount) return ";";
  if (tabCount > commaCount && tabCount > semiCount) return "\t";
  return ",";
}

// RFC 4180 compliant CSV line tokenizer
function parseCsvRows(text, delimiter = ",") {
  const rows = [];
  let currentRow = [];
  let currentVal = "";
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentVal += '"';
        i++; // Skip escaped quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === delimiter && !insideQuote) {
      currentRow.push(currentVal.trim());
      currentVal = "";
    } else if ((char === "\r" || char === "\n") && !insideQuote) {
      if (char === "\r" && nextChar === "\n") {
        i++; // Skip \n
      }
      currentRow.push(currentVal.trim());
      if (currentRow.some((val) => val.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = "";
    } else {
      currentVal += char;
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((val) => val.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// Intelligently map Google Forms CSV columns
function processCsvData(csvText) {
  csvText = (csvText || "").replace(/^\uFEFF/, "");
  if (!csvText.trim()) {
    setCsvStatus("The selected file is empty ❌", "error");
    return;
  }

  const delimiter = detectDelimiter(csvText);
  const rows = parseCsvRows(csvText, delimiter);
  if (rows.length < 2) {
    setCsvStatus("CSV file must contain a header row and at least one contact row ❌", "error");
    return;
  }

  const headers = rows[0].map((h) => (h || "").trim().toLowerCase());

  // Find column indices by common Google Forms questions & headers
  const nameIdx     = headers.findIndex((h) => /name|respondent|student|staff|fullname|surname|person|who/i.test(h));
  const birthdayIdx = headers.findIndex((h) => /birth|bday|dob|born|date.*birth|day.*birth/i.test(h));
  const emailIdx    = headers.findIndex((h) => /email|e-mail|mail/i.test(h));
  const whatsappIdx = headers.findIndex((h) => /whatsapp|phone|mobile|tel|contact|number|cell/i.test(h));
  const statusIdx   = headers.findIndex((h) => /status|role|category|type|designation|cadre|level|student.*staff|staff.*student/i.test(h));
  const finishIdx   = headers.findIndex((h) => /finish|graduat|expected|completion|year.*left/i.test(h));

  if (nameIdx === -1 || birthdayIdx === -1) {
    const detectedCols = rows[0].slice(0, 5).join(", ");
    const missing = [];
    if (nameIdx === -1) missing.push("Name");
    if (birthdayIdx === -1) missing.push("Birthday");
    setCsvStatus(
      `Could not detect required ${missing.join(" & ")} columns. (Detected headers: ${detectedCols || "none"}). Please check your CSV header or download the template below.`,
      "error"
    );
    showToast(`Missing required CSV columns: ${missing.join(", ")} ❌`);
    return;
  }

  const currentYear = new Date().getFullYear();
  parsedCsvContacts = [];
  const skippedRows = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawName = nameIdx !== -1 ? (row[nameIdx] || "").trim() : "";
    const rawBday = birthdayIdx !== -1 ? (row[birthdayIdx] || "").trim() : "";

    if (!rawName && !rawBday) continue; // skip blank line

    if (!rawName || !rawBday) {
      skippedRows.push(`Row ${r + 1} (Missing ${!rawName ? "Name" : "Birthday"})`);
      continue;
    }

    const rawEmail    = emailIdx !== -1 ? (row[emailIdx] || "").trim() : "";
    const rawWhatsapp = whatsappIdx !== -1 ? (row[whatsappIdx] || "").trim() : "";
    const rawStatus   = statusIdx !== -1 ? (row[statusIdx] || "").trim().toLowerCase() : "";
    const rawFinish   = finishIdx !== -1 ? (row[finishIdx] || "").trim() : "";

    const normalizedBirthday = normalizeDate(rawBday);
    if (!normalizedBirthday) {
      skippedRows.push(`Row ${r + 1} "${rawName}" (Unrecognized date: "${rawBday}")`);
      continue;
    }

    const isStudent = /student|undergrad|pupil/i.test(rawStatus) || (rawFinish && !/staff|faculty|employee|lecturer/i.test(rawStatus));
    const status = isStudent ? "student" : "staff";

    let expectedFinishDate = null;
    let finishYear = null;
    let finishMonth = null;

    if (isStudent) {
      finishYear = extractYear(rawFinish) || (currentYear + 4);
      expectedFinishDate = `November ${finishYear}`;
      finishMonth = 11;
    }

    const cleanPhone = rawWhatsapp.replace(/[^\d+]/g, "");
    const cleanNameTag = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const emailDomain = isStudent ? "student.crawford.edu.ng" : "crawforduniversity.edu.ng";
    const finalEmail = rawEmail || `${cleanNameTag || "contact"}@${emailDomain}`;

    parsedCsvContacts.push({
      name: rawName,
      birthday: normalizedBirthday,
      email: finalEmail,
      whatsapp: cleanPhone || "",
      status: status,
      expectedFinishDate: expectedFinishDate,
      finishYear: finishYear,
      finishMonth: finishMonth,
      wishMessage: "", // empty so it dynamically displays official Crawford PRO greeting
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  if (parsedCsvContacts.length === 0) {
    setCsvStatus(
      `No valid contacts could be extracted from this CSV. ${skippedRows.length > 0 ? "Reasons: " + skippedRows.slice(0, 3).join("; ") : ""}`,
      "error"
    );
    showToast("No valid contacts found in CSV ❌");
    return;
  }

  let statusMsg = `✅ Successfully parsed ${parsedCsvContacts.length} contact${parsedCsvContacts.length === 1 ? "" : "s"}. Review preview below and click Import!`;
  if (skippedRows.length > 0) {
    statusMsg += ` (${skippedRows.length} invalid row${skippedRows.length === 1 ? "" : "s"} skipped)`;
  }
  setCsvStatus(statusMsg, "success");
  showToast(`Parsed ${parsedCsvContacts.length} contacts from CSV! 🎉`);

  renderCsvPreview(parsedCsvContacts);
}

// Convert various date formats (e.g., Google Forms DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, April 15, 20/11) to YYYY-MM-DD
function normalizeDate(raw) {
  if (!raw) return null;
  let str = String(raw).trim();

  // Strip timestamps if present (e.g. "2024-05-14 10:30:00" -> "2024-05-14")
  str = str.replace(/[T\s].*$/, "");

  // 1. Excel serial number check (e.g., 38000..50000)
  if (/^\d{4,5}$/.test(str)) {
    const num = parseInt(str, 10);
    if (num > 10000 && num < 60000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, "0");
        const d = String(date.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }
  }

  // 2. ISO format YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(isoMatch[2]).padStart(2, "0");
    const d = String(isoMatch[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 3. DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    let y = parseInt(slashMatch[3], 10);
    if (y < 100) y += 2000;

    let m, d;
    // If p1 > 12, p1 must be day, p2 is month (DD/MM/YYYY)
    if (p1 > 12) {
      d = String(p1).padStart(2, "0");
      m = String(p2).padStart(2, "0");
    } else {
      // Otherwise default to MM/DD/YYYY (standard Google Forms export)
      m = String(p1).padStart(2, "0");
      d = String(p2).padStart(2, "0");
    }
    return `${y}-${m}-${d}`;
  }

  // 4. DD/MM or MM/DD without year (very common for birthdays in Google Forms!)
  const shortDateMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (shortDateMatch) {
    const p1 = parseInt(shortDateMatch[1], 10);
    const p2 = parseInt(shortDateMatch[2], 10);
    let m, d;
    if (p1 > 12) {
      d = String(p1).padStart(2, "0");
      m = String(p2).padStart(2, "0");
    } else {
      m = String(p1).padStart(2, "0");
      d = String(p2).padStart(2, "0");
    }
    return `2000-${m}-${d}`;
  }

  // 5. Textual date: "April 15", "15 April", "15th April", "Nov 20th", "20 November 2002"
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const lower = str.toLowerCase();
  for (let mIdx = 0; mIdx < months.length; mIdx++) {
    if (lower.includes(months[mIdx])) {
      const dayMatch = str.match(/\b([1-9]|[12][0-9]|3[01])(st|nd|rd|th)?\b/i);
      const yearMatch = str.match(/\b(19\d\d|20\d\d)\b/);
      if (dayMatch) {
        const d = String(parseInt(dayMatch[1], 10)).padStart(2, "0");
        const m = String(mIdx + 1).padStart(2, "0");
        const y = yearMatch ? yearMatch[1] : "2000";
        return `${y}-${m}-${d}`;
      }
    }
  }

  return null;
}

function renderCsvPreview(contacts) {
  if (!csvPreviewContainer || !csvPreviewTbody) return;

  csvPreviewCount.textContent = contacts.length;
  csvPreviewTbody.innerHTML = contacts
    .map((c, i) => {
      const isStudent = c.status === "student";
      const statusPill = isStudent
        ? `<span class="badge badge-student">Student</span>`
        : `<span class="badge badge-staff">Staff</span>`;
      const finishText = isStudent ? (c.expectedFinishDate || "—") : "Permanent";

      return `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td>${formatBirthday(c.birthday)}</td>
          <td>${escapeHtml(c.email)}</td>
          <td>${escapeHtml(c.whatsapp || "—")}</td>
          <td>${statusPill}</td>
          <td>${escapeHtml(finishText)}</td>
        </tr>`;
    })
    .join("");

  csvPreviewContainer.classList.remove("hidden");
  csvPreviewContainer.scrollIntoView({ behavior: "smooth" });
}

// Batch import execution logic
async function executeBatchImport() {
  if (parsedCsvContacts.length === 0) {
    setCsvStatus("No contacts selected for import ❌", "error");
    showToast("No contacts selected for import ❌");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    setCsvStatus("Please sign in first to import contacts ❌", "error");
    showToast("Please sign in first ❌");
    return;
  }

  if (importContactsBtn) {
    importContactsBtn.disabled = true;
    importContactsBtn.textContent = `Importing ${parsedCsvContacts.length} contacts...`;
  }
  if (importContactsBottomBtn) {
    importContactsBottomBtn.disabled = true;
    importContactsBottomBtn.textContent = `Importing ${parsedCsvContacts.length} contacts...`;
  }
  setCsvStatus(`Importing ${parsedCsvContacts.length} contacts into Realtime Database...`, "info");

  try {
    const contactsRef = ref(rtdb, "contacts");
    let successCount = 0;

    for (const contact of parsedCsvContacts) {
      contact.createdBy = user.email;
      contact.createdAt = Date.now();
      contact.updatedAt = Date.now();
      const newRef = push(contactsRef);
      await set(newRef, contact);
      successCount++;
    }

    setCsvStatus(`Successfully imported ${successCount} contacts into database! 🎉`, "success");
    showToast(`Successfully imported ${successCount} contacts! 🎉`);

    // Reset CSV state
    parsedCsvContacts = [];
    if (csvFileInput) csvFileInput.value = "";
    if (csvFilenameText) csvFilenameText.textContent = "";
    if (csvPreviewContainer) csvPreviewContainer.classList.add("hidden");
    if (tabSingleBtn) tabSingleBtn.click();

  } catch (err) {
    console.error("Batch import error:", err);
    setCsvStatus(`Import error: ${err.message || "Failed to save contacts"} ❌`, "error");
    showToast(`Import error: ${err.message || "Failed to save contacts"} ❌`);
  } finally {
    if (importContactsBtn) {
      importContactsBtn.disabled = false;
      importContactsBtn.textContent = "Import All Contacts to Database 🚀";
    }
    if (importContactsBottomBtn) {
      importContactsBottomBtn.disabled = false;
      importContactsBottomBtn.textContent = "Import All Contacts to Database 🚀";
    }
  }
}

if (importContactsBtn) {
  importContactsBtn.addEventListener("click", executeBatchImport);
}

if (importContactsBottomBtn) {
  importContactsBottomBtn.addEventListener("click", executeBatchImport);
}

// Download Sample CSV Template
if (downloadTemplateBtn) {
  downloadTemplateBtn.addEventListener("click", () => {
    const csvContent =
      "Full Name,Birthday,Email,WhatsApp Number,Status,Expected Finish Date\n" +
      "Dr. Emmanuel Ade,1985-04-12,emmanuel.ade@crawforduniversity.edu.ng,+2348031234567,Staff,\n" +
      "Sarah Johnson,2004-11-20,sarah.johnson@student.crawford.edu.ng,+2348123456789,Student,November 2028\n" +
      "Michael Okon,2003-08-05,michael.okon@student.crawford.edu.ng,+2349012345678,Student,November 2027\n" +
      "Grace Oladipo,1992-01-15,grace.oladipo@crawforduniversity.edu.ng,+2348055554321,Staff,\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "crawford_university_birthday_contacts_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Template downloaded 📥");
  });
}

// ============ Global Actions ============
window.__editContact = (id) => {
  const c = contactsMap.get(id);
  if (!c) return;

  // Ensure Manual Entry tab is selected
  if (tabSingleBtn) tabSingleBtn.click();

  editIdInput.value   = id;
  nameInput.value     = c.name || "";
  birthdayInput.value = c.birthday || "";
  emailInput.value    = c.email || "";
  whatsappInput.value = c.whatsapp || "";
  statusSelect.value  = c.status || "staff";

  // Only display in textarea if user provided a custom wish, not the former generic default
  if (c.wishMessage && !c.wishMessage.includes("Crawford University's PRO Office")) {
    wishInput.value = "";
  } else {
    wishInput.value = c.wishMessage || "";
  }

  if (c.status === "student") {
    studentFinishGroup.classList.remove("hidden");
    finishDateSelect.setAttribute("required", "required");
    if (c.expectedFinishDate) {
      finishDateSelect.value = c.expectedFinishDate;
    }
  } else {
    studentFinishGroup.classList.add("hidden");
    finishDateSelect.removeAttribute("required");
  }

  formTitle.textContent = "Edit Contact";
  saveBtn.textContent   = "Update Contact";
  cancelEditBtn.classList.remove("hidden");
  contactForm.scrollIntoView({ behavior: "smooth" });
};

window.__deleteContact = async (id) => {
  const c = contactsMap.get(id);
  const name = c ? c.name : "this contact";
  if (!confirm(`Are you sure you want to delete ${name} from the database?`)) return;

  try {
    await remove(ref(rtdb, `contacts/${id}`));
    showToast("Contact deleted from database 🗑️");
  } catch (err) {
    console.error("Delete contact error:", err);
    showToast("Error deleting contact ❌");
  }
};

window.__sendEmailWish = async (id, isBelated = false) => {
  const c = contactsMap.get(id);
  if (!c) return;

  const currentYear = new Date().getFullYear();
  const subjectPrefix = isBelated ? "Happy Belated Birthday" : "Happy Birthday";
  const subject = encodeURIComponent(`${subjectPrefix}, ${c.name}! 🎂`);

  const message = getContactWishMessage(c, isBelated);
  const body = encodeURIComponent(message);
  window.open(`mailto:${c.email}?subject=${subject}&body=${body}`, "_blank");

  try {
    await update(ref(rtdb, `contacts/${id}`), {
      lastWishedYear: currentYear,
      lastWishedAt: Date.now(),
      lastWishedType: "email"
    });
    showToast(`Email draft opened & marked as wished for ${currentYear} ✉️`);
  } catch (err) {
    console.warn("Could not record wish timestamp:", err);
  }
};

window.__sendWhatsAppWish = async (id, isBelated = false) => {
  const c = contactsMap.get(id);
  if (!c || !c.whatsapp) return;

  const currentYear = new Date().getFullYear();
  const cleanPhone = c.whatsapp.replace(/[^0-9]/g, "");

  const message = getContactWishMessage(c, isBelated);
  const encodedText = encodeURIComponent(message);
  window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, "_blank");

  try {
    await update(ref(rtdb, `contacts/${id}`), {
      lastWishedYear: currentYear,
      lastWishedAt: Date.now(),
      lastWishedType: "whatsapp"
    });
    showToast(`WhatsApp opened & marked as wished for ${currentYear} 💬`);
  } catch (err) {
    console.warn("Could not record wish timestamp:", err);
  }
};

window.__markWished = async (id) => {
  const c = contactsMap.get(id);
  if (!c) return;

  const currentYear = new Date().getFullYear();
  try {
    await update(ref(rtdb, `contacts/${id}`), {
      lastWishedYear: currentYear,
      lastWishedAt: Date.now(),
      lastWishedType: "manual"
    });
    showToast(`Marked ${c.name}'s birthday as greeted for ${currentYear} ✓`);
  } catch (err) {
    console.error("Mark wish error:", err);
    showToast("Error updating status ❌");
  }
};

// Returns the contact's wish message, guaranteeing that it includes the official Crawford PRO branding
function getContactWishMessage(c, isBelated = false) {
  if (isBelated) {
    return defaultBelatedWish(c.name);
  }

  if (c.wishMessage && typeof c.wishMessage === "string" && c.wishMessage.trim()) {
    const msg = c.wishMessage.trim();
    // If it already has the official Crawford PRO branding, use it
    const hasCrawfordPRO = msg.includes("Crawford University's PRO Office") || (msg.includes("Crawford University") && msg.includes("PRO"));
    if (!hasCrawfordPRO) {
      // Stored text is the old generic message — automatically upgrade to Crawford PRO greeting!
      return defaultWish(c.name);
    }
    return msg;
  }

  return defaultWish(c.name);
}

// Customized Default Birthday Wish from Crawford University's PRO Office
function defaultWish(name) {
  return `Happy Birthday, ${name}! 🎂🎉\n\nWishing you a joyful and blessed birthday! May your new year be filled with abundant success, sound health, divine favor, and happiness.\n\nWith love from Crawford University's PRO Office ❤️`;
}

// Customized Belated Birthday Wish from Crawford University's PRO Office
function defaultBelatedWish(name) {
  return `Happy Belated Birthday, ${name}! 🎂🎉\n\nWe hope your special day was truly blessed and wonderful! Wishing you an incredible year ahead filled with divine favor, peace, and great success.\n\nWith love from Crawford University's PRO Office ❤️`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
