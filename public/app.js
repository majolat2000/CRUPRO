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
const todaysPagination   = document.getElementById("todays-pagination");
const todaysPrevBtn      = document.getElementById("todays-prev-btn");
const todaysNextBtn      = document.getElementById("todays-next-btn");
const todaysPageInfo     = document.getElementById("todays-page-info");

const upcomingList       = document.getElementById("upcoming-birthdays");
const upcomingCount      = document.getElementById("upcoming-count");
const upcomingPagination = document.getElementById("upcoming-pagination");
const upcomingPrevBtn    = document.getElementById("upcoming-prev-btn");
const upcomingNextBtn    = document.getElementById("upcoming-next-btn");
const upcomingPageInfo   = document.getElementById("upcoming-page-info");

const missedList         = document.getElementById("missed-birthdays");
const missedCount        = document.getElementById("missed-count");
const missedPagination   = document.getElementById("missed-pagination");
const missedPrevBtn      = document.getElementById("missed-prev-btn");
const missedNextBtn      = document.getElementById("missed-next-btn");
const missedPageInfo     = document.getElementById("missed-page-info");

const contactsPagination = document.getElementById("contacts-pagination");
const contactsPrevBtn    = document.getElementById("contacts-prev-btn");
const contactsNextBtn    = document.getElementById("contacts-next-btn");
const contactsPageInfo   = document.getElementById("contacts-page-info");

// Pagination configuration & per-section states (5 per row/page)
const PAGE_SIZE = 5;
const pageState = {
  todays: 1,
  upcoming: 1,
  missed: 1,
  contacts: 1
};

let cachedTodaysList = [];
let cachedUpcomingList = [];
let cachedMissedList = [];
let cachedContactsList = [];
let cachedContactsTotalCount = 0;

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
    pageState.contacts = 1;
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
    pageState.contacts = 1;
    clearSearchBtn.classList.add("hidden");
    filterAndRenderContacts();
    searchInput.focus();
  });
}

// ============ Realtime Database Contacts Listener ============
onAuthStateChanged(auth, (user) => {
  const authLoading = document.getElementById("auth-loading");
  if (authLoading) {
    authLoading.style.display = "none";
    authLoading.remove();
  }

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
    if (upcomingList) upcomingList.innerHTML = '<p class="placeholder">No upcoming birthdays in the next 7 days.</p>';
    missedList.innerHTML   = '<p class="placeholder">No missed birthdays! All past birthdays have been greeted. 🌟</p>';
    if (contactsCount) contactsCount.textContent = "0 contacts";
    if (todaysCount)   todaysCount.textContent   = "0 today";
    if (upcomingCount) upcomingCount.textContent = "0 upcoming";
    if (missedCount)   missedCount.textContent   = "0 missed";
    if (todaysPagination) todaysPagination.classList.add("hidden");
    if (upcomingPagination) upcomingPagination.classList.add("hidden");
    if (missedPagination) missedPagination.classList.add("hidden");
    if (contactsPagination) contactsPagination.classList.add("hidden");
    pageState.todays = 1;
    pageState.upcoming = 1;
    pageState.missed = 1;
    pageState.contacts = 1;
    resetForm();
  }
});

function listenToContacts() {
  if (unsubscribeRtdb) unsubscribeRtdb();

  const user = auth.currentUser;
  if (!user || !user.email) return;
  const currentUserEmail = user.email.toLowerCase().trim();

  const contactsRef = ref(rtdb, "contacts");
  unsubscribeRtdb = onValue(
    contactsRef,
    (snapshot) => {
      contactsMap.clear();
      const expiredContacts = [];
      const activeContacts = [];

      snapshot.forEach((childSnap) => {
        const val = childSnap.val();
        if (!val) return;
        const contact = { id: childSnap.key, ...val };
        const creator = (contact.createdBy || "").toLowerCase().trim();

        // Separate contacts: each account only sees and manages their own contacts
        if (creator !== currentUserEmail) {
          return;
        }

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

      // Sort all active contacts by nearest upcoming birthday
      activeContacts.sort((a, b) => {
        const daysA = getDaysUntilBirthday(a.birthday) ?? 999;
        const daysB = getDaysUntilBirthday(b.birthday) ?? 999;
        return daysA - daysB;
      });

      filterAndRenderContacts();
      renderTodaysBirthdays(activeContacts);
      renderUpcomingBirthdays(activeContacts);
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
    const match = String(c.expectedFinishDate).match(/\d{4}/);
    if (match) finishYear = parseInt(match[0], 10);
  }
  if (!finishYear) return false;

  const now = new Date();
  const currentYear = now.getFullYear();

  // Prune student contact once the finish year has completed
  if (currentYear > finishYear) return true;
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

// ============ Generic 5-Item Pagination Helper ============
function updatePaginationUI(container, infoEl, prevBtn, nextBtn, totalItems, currentPage, onPageChange) {
  if (!container || !infoEl || !prevBtn || !nextBtn) return;

  if (totalItems <= PAGE_SIZE) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const start = (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, totalItems);

  infoEl.textContent = `${start}–${end} of ${totalItems}`;

  prevBtn.disabled = safePage <= 1;
  nextBtn.disabled = safePage >= totalPages;

  prevBtn.onclick = () => {
    if (safePage > 1) {
      onPageChange(safePage - 1);
    }
  };

  nextBtn.onclick = () => {
    if (safePage < totalPages) {
      onPageChange(safePage + 1);
    }
  };
}

// ============ Render All Contacts (5 per page) ============
function renderContacts(contacts, totalCount) {
  cachedContactsList = contacts;
  cachedContactsTotalCount = totalCount;
  renderContactsPage();
}

function renderContactsPage() {
  const totalCount = cachedContactsTotalCount;
  const contacts = cachedContactsList;

  if (contactsCount) {
    if (currentSearchQuery) {
      contactsCount.textContent = `${contacts.length} of ${totalCount} matching`;
    } else {
      contactsCount.textContent = `${totalCount} contact${totalCount === 1 ? "" : "s"}`;
    }
  }

  if (contacts.length === 0) {
    if (contactsPagination) contactsPagination.classList.add("hidden");
    if (currentSearchQuery) {
      contactsList.innerHTML = `<p class="placeholder">No contacts match "<strong>${escapeHtml(currentSearchQuery)}</strong>".</p>`;
    } else {
      contactsList.innerHTML = '<p class="placeholder">No contacts yet. Add your first contact above!</p>';
    }
    return;
  }

  const totalPages = Math.ceil(contacts.length / PAGE_SIZE) || 1;
  pageState.contacts = Math.min(Math.max(1, pageState.contacts), totalPages);

  const startIdx = (pageState.contacts - 1) * PAGE_SIZE;
  const pageItems = contacts.slice(startIdx, startIdx + PAGE_SIZE);

  contactsList.innerHTML = pageItems
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

  updatePaginationUI(
    contactsPagination,
    contactsPageInfo,
    contactsPrevBtn,
    contactsNextBtn,
    contacts.length,
    pageState.contacts,
    (newPage) => {
      pageState.contacts = newPage;
      renderContactsPage();
    }
  );
}

// ============ Render Today's Birthdays (5 per page) ============
function renderTodaysBirthdays(contacts) {
  cachedTodaysList = contacts.filter((c) => getDaysUntilBirthday(c.birthday) === 0);
  renderTodaysBirthdaysPage();
}

function renderTodaysBirthdaysPage() {
  const matches = cachedTodaysList;

  if (todaysCount) {
    todaysCount.textContent = `${matches.length} today`;
  }

  if (matches.length === 0) {
    if (todaysPagination) todaysPagination.classList.add("hidden");
    todaysList.innerHTML = '<p class="placeholder">No birthdays today.</p>';
    return;
  }

  const totalPages = Math.ceil(matches.length / PAGE_SIZE) || 1;
  pageState.todays = Math.min(Math.max(1, pageState.todays), totalPages);

  const startIdx = (pageState.todays - 1) * PAGE_SIZE;
  const pageItems = matches.slice(startIdx, startIdx + PAGE_SIZE);

  todaysList.innerHTML = pageItems
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

  updatePaginationUI(
    todaysPagination,
    todaysPageInfo,
    todaysPrevBtn,
    todaysNextBtn,
    matches.length,
    pageState.todays,
    (newPage) => {
      pageState.todays = newPage;
      renderTodaysBirthdaysPage();
    }
  );
}

// ============ Render Upcoming Birthdays (Next 7 Days, 5 per page) ============
function renderUpcomingBirthdays(contacts) {
  if (!upcomingList) return;

  const upcoming = [];

  contacts.forEach((c) => {
    const daysUntil = getDaysUntilBirthday(c.birthday);
    if (daysUntil !== null && daysUntil >= 1 && daysUntil <= 7) {
      upcoming.push({
        ...c,
        daysUntil
      });
    }
  });

  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  cachedUpcomingList = upcoming;
  renderUpcomingBirthdaysPage();
}

function renderUpcomingBirthdaysPage() {
  if (!upcomingList) return;

  const upcoming = cachedUpcomingList;

  if (upcomingCount) {
    upcomingCount.textContent = `${upcoming.length} upcoming`;
  }

  if (upcoming.length === 0) {
    if (upcomingPagination) upcomingPagination.classList.add("hidden");
    upcomingList.innerHTML = '<p class="placeholder">No upcoming birthdays in the next 7 days.</p>';
    return;
  }

  const totalPages = Math.ceil(upcoming.length / PAGE_SIZE) || 1;
  pageState.upcoming = Math.min(Math.max(1, pageState.upcoming), totalPages);

  const startIdx = (pageState.upcoming - 1) * PAGE_SIZE;
  const pageItems = upcoming.slice(startIdx, startIdx + PAGE_SIZE);

  upcomingList.innerHTML = pageItems
    .map((c) => {
      const bday = formatBirthday(c.birthday);
      const pillText = c.daysUntil === 1 ? "Tomorrow ⏰" : `In ${c.daysUntil} days 📅`;

      return `
        <div class="birthday-upcoming-card">
          <div class="info">
            <strong>${escapeHtml(c.name)} <span class="upcoming-pill">${pillText}</span></strong>
            <span>🎂 Birthday is on ${bday} · ${escapeHtml(c.email)}</span>
          </div>
          <div class="birthday-today-actions">
            <button class="btn-send" onclick="window.__sendEmailWish('${c.id}', false)" title="Send Email Greeting">
              Email Wish ✉️
            </button>
            ${
              c.whatsapp
                ? `<button class="btn-whatsapp" onclick="window.__sendWhatsAppWish('${c.id}', false)" title="Send WhatsApp Greeting">
                    WhatsApp Wish 💬
                  </button>`
                : ""
            }
          </div>
        </div>`;
    })
    .join("");

  updatePaginationUI(
    upcomingPagination,
    upcomingPageInfo,
    upcomingPrevBtn,
    upcomingNextBtn,
    upcoming.length,
    pageState.upcoming,
    (newPage) => {
      pageState.upcoming = newPage;
      renderUpcomingBirthdaysPage();
    }
  );
}

// Calculate days from today until the contact's upcoming birthday (0 = today, 1..7 = upcoming week)
function getDaysUntilBirthday(birthdayStr) {
  if (!birthdayStr) return null;

  let month = null; // 0-11
  let day = null;   // 1-31

  const str = String(birthdayStr).trim().replace(/[T\s].*$/, "");

  // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    month = parseInt(isoMatch[2], 10) - 1;
    day = parseInt(isoMatch[3], 10);
  } else {
    // 2. Slash/dash format: DD/MM/YYYY or MM/DD/YYYY or DD/MM or MM/DD
    const slashMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})/);
    if (slashMatch) {
      const p1 = parseInt(slashMatch[1], 10);
      const p2 = parseInt(slashMatch[2], 10);
      if (p1 > 12) {
        day = p1;
        month = p2 - 1;
      } else {
        month = p1 - 1;
        day = p2;
      }
    }
  }

  // 3. Textual date: "April 15", "15 April", "Nov 20"
  if (month === null || day === null || isNaN(month) || isNaN(day)) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const lower = str.toLowerCase();
    for (let mIdx = 0; mIdx < months.length; mIdx++) {
      if (lower.includes(months[mIdx])) {
        const dayMatch = str.match(/\b([1-9]|[12][0-9]|3[01])(st|nd|rd|th)?\b/i);
        if (dayMatch) {
          month = mIdx;
          day = parseInt(dayMatch[1], 10);
          break;
        }
      }
    }
  }

  if (month === null || day === null || isNaN(month) || isNaN(day)) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const today = new Date(currentYear, now.getMonth(), now.getDate());

  let bdayDate = new Date(currentYear, month, day);

  // If birthday already passed earlier this year, check next year
  if (bdayDate < today) {
    bdayDate = new Date(currentYear + 1, month, day);
  }

  const diffMs = bdayDate.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

// ============ Render Missed Birthdays (5 per page) ============
function renderMissedBirthdays(contacts) {
  const currentYear = new Date().getFullYear();
  const missed = [];

  contacts.forEach((c) => {
    const diffDays = getDaysAgoThisYear(c.birthday);
    if (diffDays !== null && diffDays > 0) {
      if (c.lastWishedYear !== currentYear) {
        // Only count birthdays missed from the date the contact was added.
        // If a contact was added today but their birthday was last week,
        // it does not count as missed. But if added on/before that birthday, it counts.
        const createdDate = getContactCreatedDate(c);
        if (createdDate) {
          const bdayDateThisYear = getBirthdayDateThisYear(c.birthday, currentYear);
          if (bdayDateThisYear && bdayDateThisYear < createdDate) {
            return;
          }
        }

        missed.push({
          ...c,
          daysAgo: diffDays
        });
      }
    }
  });

  missed.sort((a, b) => a.daysAgo - b.daysAgo);
  cachedMissedList = missed;
  renderMissedBirthdaysPage();
}

function renderMissedBirthdaysPage() {
  const missed = cachedMissedList;

  if (missedCount) {
    missedCount.textContent = `${missed.length} missed`;
  }

  if (missed.length === 0) {
    if (missedPagination) missedPagination.classList.add("hidden");
    missedList.innerHTML = '<p class="placeholder">No missed birthdays! All past birthdays have been greeted. 🌟</p>';
    return;
  }

  const totalPages = Math.ceil(missed.length / PAGE_SIZE) || 1;
  pageState.missed = Math.min(Math.max(1, pageState.missed), totalPages);

  const startIdx = (pageState.missed - 1) * PAGE_SIZE;
  const pageItems = missed.slice(startIdx, startIdx + PAGE_SIZE);

  missedList.innerHTML = pageItems
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

  updatePaginationUI(
    missedPagination,
    missedPageInfo,
    missedPrevBtn,
    missedNextBtn,
    missed.length,
    pageState.missed,
    (newPage) => {
      pageState.missed = newPage;
      renderMissedBirthdaysPage();
    }
  );
}

function getDaysAgoThisYear(birthdayStr) {
  if (!birthdayStr) return null;
  let month = null;
  let day = null;

  const str = String(birthdayStr).trim().replace(/[T\s].*$/, "");
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    month = parseInt(isoMatch[2], 10) - 1;
    day = parseInt(isoMatch[3], 10);
  } else {
    const slashMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})/);
    if (slashMatch) {
      const p1 = parseInt(slashMatch[1], 10);
      const p2 = parseInt(slashMatch[2], 10);
      if (p1 > 12) {
        day = p1;
        month = p2 - 1;
      } else {
        month = p1 - 1;
        day = p2;
      }
    }
  }

  if (month === null || day === null || isNaN(month) || isNaN(day)) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const bdayThisYear = new Date(currentYear, month, day);
  const today = new Date(currentYear, now.getMonth(), now.getDate());

  const diffMs = today.getTime() - bdayThisYear.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Extract calendar date (midnight) when contact was added
function getContactCreatedDate(contact) {
  if (contact.createdAt) {
    const t = typeof contact.createdAt === "number" ? contact.createdAt : Date.parse(contact.createdAt);
    if (!isNaN(t) && t > 0) {
      const d = new Date(t);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  // Fallback: decode timestamp embedded in Firebase Push ID
  if (contact.id && typeof contact.id === "string" && contact.id.length >= 8) {
    try {
      const PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
      let time = 0;
      for (let i = 0; i < 8; i++) {
        const c = contact.id.charAt(i);
        const idx = PUSH_CHARS.indexOf(c);
        if (idx === -1) { time = 0; break; }
        time = time * 64 + idx;
      }
      if (time > 1577836800000) { // after 2020
        const d = new Date(time);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
    } catch (_) {}
  }
  return null;
}

// Get Date object (midnight) of birthday in a specific year
function getBirthdayDateThisYear(birthdayStr, year) {
  if (!birthdayStr) return null;
  const currentYear = year || new Date().getFullYear();
  let month = null;
  let day = null;

  const str = String(birthdayStr).trim().replace(/[T\s].*$/, "");
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    month = parseInt(isoMatch[2], 10) - 1;
    day = parseInt(isoMatch[3], 10);
  } else {
    const slashMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})/);
    if (slashMatch) {
      const p1 = parseInt(slashMatch[1], 10);
      const p2 = parseInt(slashMatch[2], 10);
      if (p1 > 12) {
        day = p1;
        month = p2 - 1;
      } else {
        month = p1 - 1;
        day = p2;
      }
    }
  }

  if (month === null || day === null || isNaN(month) || isNaN(day)) return null;
  return new Date(currentYear, month, day);
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
      payload.createdBy = (user.email || "").toLowerCase().trim();
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
    try {
      const text = event.target.result;
      processCsvData(text);
    } catch (err) {
      console.error("Error processing CSV data:", err);
      setCsvStatus(`Error reading CSV: ${err.message || err} ❌`, "error");
      showToast(`Error processing CSV: ${err.message || err} ❌`);
    }
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
      contact.createdBy = (user.email || "").toLowerCase().trim();
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

// ============ Helper Functions ============
function resetForm() {
  contactForm.reset();
  editIdInput.value = "";
  formTitle.textContent = "Add a Birthday Contact";
  saveBtn.textContent = "Add Contact";
  cancelEditBtn.classList.add("hidden");
  studentFinishGroup.classList.add("hidden");
  finishDateSelect.removeAttribute("required");
}

function todayMMDD() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

function formatBirthday(dateStr) {
  if (!dateStr) return "—";
  const str = String(dateStr).trim();
  const parts = str.split(/[-/.]/);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // YYYY-MM-DD
  if (parts.length === 3 && parts[0].length === 4) {
    const mIdx = parseInt(parts[1], 10) - 1;
    const mName = months[mIdx] || parts[1];
    return `${mName} ${parseInt(parts[2], 10)}`;
  }
  // DD-MM-YYYY or MM-DD-YYYY
  if (parts.length === 3 && parts[2].length === 4) {
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    if (p1 > 12) {
      const mName = months[p2 - 1] || p2;
      return `${mName} ${p1}`;
    } else {
      const mName = months[p1 - 1] || p1;
      return `${mName} ${p2}`;
    }
  }
  return dateStr;
}

function extractYear(str) {
  if (!str) return new Date().getFullYear();
  const match = String(str).match(/\d{4}/);
  return match ? parseInt(match[0], 10) : new Date().getFullYear();
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
