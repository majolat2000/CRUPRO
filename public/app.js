// app.js — Birthday contacts CRUD + "send wishes" UI
import { db, auth } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

// DOM references
const contactForm    = document.getElementById("contact-form");
const formTitle      = document.getElementById("form-title");
const editIdInput    = document.getElementById("edit-id");
const nameInput      = document.getElementById("contact-name");
const emailInput     = document.getElementById("contact-email");
const birthdayInput  = document.getElementById("contact-birthday");
const wishInput      = document.getElementById("wish-message");
const saveBtn        = document.getElementById("save-btn");
const cancelEditBtn  = document.getElementById("cancel-edit-btn");
const contactsList   = document.getElementById("contacts-list");
const todaysList     = document.getElementById("todays-birthdays");

let unsubscribe = null; // Firestore listener

// ============ Listen for auth state ============
window.addEventListener("user-signed-in", (e) => {
  loadContacts(e.detail.uid);
});

// ============ CRUD — Add / Update Contact ============
contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const data = {
    name: nameInput.value.trim(),
    email: emailInput.value.trim(),
    birthday: birthdayInput.value,          // "YYYY-MM-DD"
    wishMessage: wishInput.value.trim() || defaultWish(nameInput.value.trim()),
    updatedAt: serverTimestamp()
  };

  try {
    const editId = editIdInput.value;
    if (editId) {
      // Update existing
      await updateDoc(doc(db, "users", uid, "contacts", editId), data);
      showToast("Contact updated ✅");
    } else {
      // Add new
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "users", uid, "contacts"), data);
      showToast("Contact added 🎉");
    }
    resetForm();
  } catch (err) {
    console.error("Error saving contact:", err);
    showToast("Error saving contact ❌");
  }
});

// Cancel edit mode
cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

// ============ Load contacts in real-time ============
function loadContacts(uid) {
  // Unsubscribe from any previous listener
  if (unsubscribe) unsubscribe();

  const q = query(
    collection(db, "users", uid, "contacts"),
    orderBy("birthday")
  );

  unsubscribe = onSnapshot(q, (snapshot) => {
    const contacts = [];
    snapshot.forEach((docSnap) => {
      contacts.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderContacts(contacts);
    renderTodaysBirthdays(contacts);
  });
}

// ============ Render all contacts ============
function renderContacts(contacts) {
  if (contacts.length === 0) {
    contactsList.innerHTML = '<p class="placeholder">No contacts yet. Add one above!</p>';
    return;
  }

  contactsList.innerHTML = contacts
    .map((c) => {
      const bday = formatBirthday(c.birthday);
      return `
        <div class="contact-item">
          <div class="contact-info">
            <strong>${escapeHtml(c.name)}</strong>
            <span>${escapeHtml(c.email)} · ${bday}</span>
          </div>
          <div class="contact-actions">
            <button class="btn-secondary" onclick="window.__editContact('${c.id}', ${JSON.stringify(JSON.stringify(c))})">Edit</button>
            <button class="btn-danger" onclick="window.__deleteContact('${c.id}')">Delete</button>
          </div>
        </div>`;
    })
    .join("");
}

// ============ Render today's birthdays ============
function renderTodaysBirthdays(contacts) {
  const today = todayMMDD();
  const matches = contacts.filter((c) => c.birthday && c.birthday.slice(5) === today);

  if (matches.length === 0) {
    todaysList.innerHTML = '<p class="placeholder">No birthdays today.</p>';
    return;
  }

  todaysList.innerHTML = matches
    .map((c) => {
      const msg = c.wishMessage || defaultWish(c.name);
      return `
        <div class="birthday-today">
          <div class="info">
            <strong>🎂 ${escapeHtml(c.name)}</strong>
            <span>${escapeHtml(c.email)}</span>
          </div>
          <button class="btn-send" onclick="window.__sendWish('${escapeHtml(c.email)}', '${escapeHtml(c.name)}', ${JSON.stringify(JSON.stringify(msg))})">
            Send Wish ✉️
          </button>
        </div>`;
    })
    .join("");
}

// ============ Actions exposed to inline onclick ============
window.__editContact = (id, jsonStr) => {
  const c = JSON.parse(jsonStr);
  editIdInput.value = id;
  nameInput.value = c.name;
  emailInput.value = c.email;
  birthdayInput.value = c.birthday;
  wishInput.value = c.wishMessage || "";
  formTitle.textContent = "Edit Contact";
  saveBtn.textContent = "Update Contact";
  cancelEditBtn.classList.remove("hidden");
  contactForm.scrollIntoView({ behavior: "smooth" });
};

window.__deleteContact = async (id) => {
  if (!confirm("Delete this contact?")) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await deleteDoc(doc(db, "users", uid, "contacts", id));
    showToast("Contact deleted 🗑️");
  } catch (err) {
    console.error("Error deleting contact:", err);
  }
};

window.__sendWish = (email, name, message) => {
  // Opens the user's default email client with a pre-filled birthday message
  const subject = encodeURIComponent(`Happy Birthday, ${name}! 🎂`);
  const body = encodeURIComponent(message);
  window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
  showToast(`Email client opened for ${name} ✉️`);
};

// ============ Helpers ============
function resetForm() {
  contactForm.reset();
  editIdInput.value = "";
  formTitle.textContent = "Add a Birthday Contact";
  saveBtn.textContent = "Add Contact";
  cancelEditBtn.classList.add("hidden");
}

function todayMMDD() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

function formatBirthday(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function defaultWish(name) {
  return `Happy Birthday, ${name}! 🎂🎉\n\nWishing you a wonderful day filled with joy and happiness. May this year bring you all the love and blessings you deserve!\n\nWith warm wishes ❤️`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
