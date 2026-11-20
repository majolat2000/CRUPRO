// app.js — Birthday contacts CRUD + "Send Wishes" UI
import { db, auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
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

let unsubscribe = null;
const contactsMap = new Map();

// ============ Direct Auth State Observer ============
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadContacts(user.uid);
  } else {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    contactsMap.clear();
    contactsList.innerHTML = '<p class="placeholder">No contacts yet. Add one above!</p>';
    todaysList.innerHTML   = '<p class="placeholder">No birthdays today.</p>';
    resetForm();
  }
});

// ============ CRUD: Add / Update Contact ============
contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    showToast("Please sign in first ❌");
    return;
  }

  const nameVal = nameInput.value.trim();
  const emailVal = emailInput.value.trim();
  const birthdayVal = birthdayInput.value; // "YYYY-MM-DD"
  const wishVal = wishInput.value.trim() || defaultWish(nameVal);

  if (!nameVal || !emailVal || !birthdayVal) {
    showToast("Please fill in all required fields ❌");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const editId = editIdInput.value;
    if (editId) {
      // Update existing contact
      const contactRef = doc(db, "users", uid, "contacts", editId);
      await updateDoc(contactRef, {
        name: nameVal,
        email: emailVal,
        birthday: birthdayVal,
        wishMessage: wishVal,
        updatedAt: serverTimestamp()
      });
      showToast("Contact updated ✅");
    } else {
      // Add new contact
      await addDoc(collection(db, "users", uid, "contacts"), {
        name: nameVal,
        email: emailVal,
        birthday: birthdayVal,
        wishMessage: wishVal,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      showToast("Contact added 🎉");
    }
    resetForm();
  } catch (err) {
    console.error("Error saving contact:", err);
    showToast(`Error: ${err.message || "Could not save contact"} ❌`);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = editIdInput.value ? "Update Contact" : "Add Contact";
  }
});

// Cancel edit
cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

// ============ Real-time Listener ============
function loadContacts(uid) {
  if (unsubscribe) unsubscribe();

  const q = query(
    collection(db, "users", uid, "contacts"),
    orderBy("birthday")
  );

  unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      contactsMap.clear();
      snapshot.forEach((docSnap) => {
        contactsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      });
      const contacts = Array.from(contactsMap.values());
      renderContacts(contacts);
      renderTodaysBirthdays(contacts);
    },
    (error) => {
      console.error("Firestore listener error:", error);
      showToast("Error loading contacts from Firestore ❌");
    }
  );
}

// ============ Render All Contacts ============
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
            <button class="btn-secondary" onclick="window.__editContact('${c.id}')">Edit</button>
            <button class="btn-danger" onclick="window.__deleteContact('${c.id}')">Delete</button>
          </div>
        </div>`;
    })
    .join("");
}

// ============ Render Today's Birthdays ============
function renderTodaysBirthdays(contacts) {
  const today = todayMMDD();
  const matches = contacts.filter((c) => c.birthday && c.birthday.slice(5) === today);

  if (matches.length === 0) {
    todaysList.innerHTML = '<p class="placeholder">No birthdays today.</p>';
    return;
  }

  todaysList.innerHTML = matches
    .map((c) => {
      return `
        <div class="birthday-today">
          <div class="info">
            <strong>🎂 ${escapeHtml(c.name)}</strong>
            <span>${escapeHtml(c.email)}</span>
          </div>
          <button class="btn-send" onclick="window.__sendWish('${c.id}')">
            Send Wish ✉️
          </button>
        </div>`;
    })
    .join("");
}

// ============ Action Handlers ============
window.__editContact = (id) => {
  const c = contactsMap.get(id);
  if (!c) return;

  editIdInput.value = id;
  nameInput.value = c.name || "";
  emailInput.value = c.email || "";
  birthdayInput.value = c.birthday || "";
  wishInput.value = c.wishMessage || "";

  formTitle.textContent = "Edit Contact";
  saveBtn.textContent = "Update Contact";
  cancelEditBtn.classList.remove("hidden");
  contactForm.scrollIntoView({ behavior: "smooth" });
};

window.__deleteContact = async (id) => {
  const c = contactsMap.get(id);
  const contactName = c ? c.name : "this contact";
  if (!confirm(`Delete ${contactName}?`)) return;

  const uid = auth.currentUser?.uid;
  if (!uid) return;

  try {
    await deleteDoc(doc(db, "users", uid, "contacts", id));
    showToast("Contact deleted 🗑️");
  } catch (err) {
    console.error("Error deleting contact:", err);
    showToast("Error deleting contact ❌");
  }
};

window.__sendWish = (id) => {
  const c = contactsMap.get(id);
  if (!c) return;

  const email = c.email;
  const name = c.name;
  const message = c.wishMessage || defaultWish(name);

  const subject = encodeURIComponent(`Happy Birthday, ${name}! 🎂`);
  const body = encodeURIComponent(message);

  window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
  showToast(`Email draft opened for ${name} ✉️`);
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
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
  }
  return dateStr;
}

function defaultWish(name) {
  return `Happy Birthday, ${name}! 🎂🎉\n\nWishing you a wonderful day filled with joy and happiness. May this year bring you all the love and blessings you deserve!\n\nWith warm wishes ❤️`;
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
