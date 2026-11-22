// app.js — Contacts CRUD, Search, Today's & Missed Birthdays, Auto-Pruning & Wishes
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

// DOM references — Forms & Controls
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

// ============ Populate Dynamic November Finish Dates ============
// Generates November dates up to 6 years ahead from the current year
function populateExpectedFinishOptions() {
  finishDateSelect.innerHTML = "";
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // If current date is prior to November of this year, include current year
  if (currentMonth < 11) {
    const opt = document.createElement("option");
    opt.value = `November ${currentYear}`;
    opt.dataset.year = currentYear;
    opt.textContent = `November ${currentYear} (Finishing this year)`;
    finishDateSelect.appendChild(opt);
  }

  // Future dates up to 6 years away
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

        // Check if student has reached or passed expected finish month (November)
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
// Detects birthdays that already passed this year where user did NOT click WhatsApp or Email wish
function renderMissedBirthdays(contacts) {
  const currentYear = new Date().getFullYear();
  const missed = [];

  contacts.forEach((c) => {
    const diffDays = getDaysAgoThisYear(c.birthday);
    // If birthday occurred in the past this calendar year AND was not wished this year:
    if (diffDays !== null && diffDays > 0) {
      if (c.lastWishedYear !== currentYear) {
        missed.push({
          ...c,
          daysAgo: diffDays
        });
      }
    }
  });

  // Sort missed birthdays by days ago (most recent first)
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

// Helper: Calculate days ago this calendar year
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

// ============ CRUD: Add / Update Contact ============
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
  const wishVal      = wishInput.value.trim() || defaultWish(nameVal);

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
    wishMessage: wishVal,
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

// ============ Global Actions ============
window.__editContact = (id) => {
  const c = contactsMap.get(id);
  if (!c) return;

  editIdInput.value   = id;
  nameInput.value     = c.name || "";
  birthdayInput.value = c.birthday || "";
  emailInput.value    = c.email || "";
  whatsappInput.value = c.whatsapp || "";
  statusSelect.value  = c.status || "staff";
  wishInput.value     = c.wishMessage || "";

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

  let message = c.wishMessage;
  if (isBelated) {
    message = `Happy Belated Birthday, ${c.name}! 🎂🎉\n\nI hope you had a wonderful birthday celebration! Wishing you an incredible year ahead filled with joy, peace, and abundance.\n\nWarm regards ❤️`;
  } else if (!message) {
    message = defaultWish(c.name);
  }

  const body = encodeURIComponent(message);
  window.open(`mailto:${c.email}?subject=${subject}&body=${body}`, "_blank");

  // Track that the wish was clicked/sent for this year
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

  let message = c.wishMessage;
  if (isBelated) {
    message = `Happy Belated Birthday, ${c.name}! 🎂🎉\n\nI hope you had a wonderful birthday celebration! Wishing you an amazing year ahead filled with joy and blessings.\n\nWarm regards ❤️`;
  } else if (!message) {
    message = defaultWish(c.name);
  }

  const encodedText = encodeURIComponent(message);
  window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, "_blank");

  // Track that the wish was clicked/sent for this year
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
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
  }
  return dateStr;
}

function extractYear(str) {
  if (!str) return new Date().getFullYear();
  const match = str.match(/\d{4}/);
  return match ? parseInt(match[0], 10) : new Date().getFullYear();
}

function defaultWish(name) {
  return `Happy Birthday, ${name}! 🎂🎉\n\nWishing you a wonderful day filled with joy and happiness. May this new year of your life bring abundant blessings and success!\n\nWarm regards ❤️`;
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
