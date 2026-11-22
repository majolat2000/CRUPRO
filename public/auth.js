// auth.js — Authentication, Auto-Seeding & Password Management
import { auth, rtdb } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import {
  ref,
  set,
  get,
  update
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-database.js";

// Permitted users whitelist
const ALLOWED_EMAILS = [
  "folafeye@gmail.com",
  "majolat2000@gmail.com"
];

// DOM references — Auth
const authSection      = document.getElementById("auth-section");
const appSection       = document.getElementById("app-section");
const authForm         = document.getElementById("auth-form");
const authBtn          = document.getElementById("auth-btn");
const authError        = document.getElementById("auth-error");
const emailInput       = document.getElementById("email");
const passwordInput    = document.getElementById("password");
const signOutBtn       = document.getElementById("sign-out-btn");
const userEmailEl      = document.getElementById("user-email");

// DOM references — Settings & Change Password
const toggleSettingsBtn = document.getElementById("toggle-settings-btn");
const closeSettingsBtn  = document.getElementById("close-settings-btn");
const cancelPasswordBtn = document.getElementById("cancel-password-btn");
const settingsCard      = document.getElementById("settings-card");
const changePasswordForm = document.getElementById("change-password-form");
const currentPasswordInput = document.getElementById("current-password");
const newPasswordInput     = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const updatePasswordBtn    = document.getElementById("update-password-btn");
const passwordFeedback     = document.getElementById("password-feedback");

// ============ Sign In & Auto-Seeding ============
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  // Enforce allowed users
  if (!ALLOWED_EMAILS.includes(email)) {
    authError.textContent = "Access restricted: Only folafeye@gmail.com and majolat2000@gmail.com can sign in.";
    return;
  }

  authBtn.disabled = true;
  authBtn.textContent = "Signing In...";

  try {
    // 1. Attempt standard sign-in
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.warn("Sign in attempt code:", error.code);

    // 2. Auto-seed if the account does not yet exist in Firebase Auth
    // and the user provided the initial setup password ("PASSWORD")
    const isNewUserError =
      error.code === "auth/user-not-found" ||
      error.code === "auth/invalid-credential" ||
      error.code === "auth/invalid-login-credentials";

    if (isNewUserError && password === "PASSWORD") {
      try {
        authBtn.textContent = "Seeding account...";
        const userCredential = await createUserWithEmailAndPassword(auth, email, "PASSWORD");
        const user = userCredential.user;

        // Seed user profile in Realtime Database
        await set(ref(rtdb, `users/${user.uid}`), {
          email: user.email,
          role: "admin",
          initialPasswordChanged: false,
          createdAt: Date.now()
        });

        showToast("Welcome! Initial account seeded successfully 🎉");
      } catch (seedErr) {
        console.error("Seeding error:", seedErr);
        authError.textContent = friendlyError(seedErr.code);
      }
    } else {
      authError.textContent = friendlyError(error.code);
    }
  } finally {
    authBtn.disabled = false;
    authBtn.textContent = "Sign In";
  }
});

// ============ Sign Out ============
signOutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showToast("Signed out successfully");
  } catch (err) {
    console.error("Sign out error:", err);
  }
});

// ============ Session Observer ============
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const email = (user.email || "").toLowerCase();
    if (!ALLOWED_EMAILS.includes(email)) {
      await signOut(auth);
      authError.textContent = "Access denied: Unauthorized email account.";
      authSection.classList.remove("hidden");
      appSection.classList.add("hidden");
      return;
    }

    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    userEmailEl.textContent = user.email;

    // Check if initial profile exists in RTDB; if not, populate it
    try {
      const userRef = ref(rtdb, `users/${user.uid}`);
      const snapshot = await get(userRef);
      if (!snapshot.exists()) {
        await set(userRef, {
          email: user.email,
          role: "admin",
          initialPasswordChanged: false,
          createdAt: Date.now()
        });
      }
    } catch (e) {
      console.warn("User profile check notice:", e);
    }

  } else {
    authSection.classList.remove("hidden");
    appSection.classList.add("hidden");
    userEmailEl.textContent = "";
    settingsCard.classList.add("hidden");
  }
});

// ============ Account Settings — Change Password ============
toggleSettingsBtn.addEventListener("click", () => {
  settingsCard.classList.toggle("hidden");
  passwordFeedback.textContent = "";
  if (!settingsCard.classList.contains("hidden")) {
    settingsCard.scrollIntoView({ behavior: "smooth" });
  }
});

closeSettingsBtn.addEventListener("click", () => {
  settingsCard.classList.add("hidden");
});

cancelPasswordBtn.addEventListener("click", () => {
  settingsCard.classList.add("hidden");
  changePasswordForm.reset();
  passwordFeedback.textContent = "";
});

changePasswordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  passwordFeedback.textContent = "";
  passwordFeedback.className = "feedback-msg";

  const currentPassword = currentPasswordInput.value;
  const newPassword     = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (newPassword !== confirmPassword) {
    passwordFeedback.textContent = "New passwords do not match. Please verify.";
    passwordFeedback.classList.add("error");
    return;
  }

  if (newPassword.length < 6) {
    passwordFeedback.textContent = "New password must be at least 6 characters long.";
    passwordFeedback.classList.add("error");
    return;
  }

  const user = auth.currentUser;
  if (!user || !user.email) {
    passwordFeedback.textContent = "Session expired. Please sign in again.";
    passwordFeedback.classList.add("error");
    return;
  }

  updatePasswordBtn.disabled = true;
  updatePasswordBtn.textContent = "Updating...";

  try {
    // 1. Re-authenticate user to verify current password
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // 2. Apply new password
    await updatePassword(user, newPassword);

    // 3. Mark in Realtime Database that password has been customized
    await update(ref(rtdb, `users/${user.uid}`), {
      initialPasswordChanged: true,
      lastPasswordChange: Date.now()
    });

    changePasswordForm.reset();
    passwordFeedback.textContent = "Password changed successfully! ✅";
    passwordFeedback.classList.add("success");
    showToast("Password updated successfully ✅");

    setTimeout(() => {
      settingsCard.classList.add("hidden");
      passwordFeedback.textContent = "";
    }, 2500);

  } catch (error) {
    console.error("Password update error:", error);
    passwordFeedback.classList.add("error");
    if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
      passwordFeedback.textContent = "Current password is incorrect.";
    } else if (error.code === "auth/weak-password") {
      passwordFeedback.textContent = "The new password is too weak. Please use a stronger password.";
    } else {
      passwordFeedback.textContent = `Error: ${error.message || error.code}`;
    }
  } finally {
    updatePasswordBtn.disabled = false;
    updatePasswordBtn.textContent = "Update Password";
  }
});

// Helper: Friendly error messages
function friendlyError(code) {
  const map = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/user-not-found": "No account found. Check email or verify setup.",
    "auth/wrong-password": "Incorrect password. (Initial password is PASSWORD).",
    "auth/invalid-credential": "Invalid credentials. If this is your first time, use password 'PASSWORD'.",
    "auth/too-many-requests": "Too many failed attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Please check your internet connection."
  };
  return map[code] || `Authentication error (${code}).`;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
