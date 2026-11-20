// auth.js — Email/Password Authentication
import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";

// DOM references
const authSection  = document.getElementById("auth-section");
const appSection   = document.getElementById("app-section");
const authForm     = document.getElementById("auth-form");
const authTitle    = document.getElementById("auth-title");
const authBtn      = document.getElementById("auth-btn");
const toggleLink   = document.getElementById("toggle-link");
const authToggle   = document.getElementById("auth-toggle");
const authError    = document.getElementById("auth-error");
const emailInput   = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signOutBtn   = document.getElementById("sign-out-btn");
const userEmailEl  = document.getElementById("user-email");

let isSignUp = false;

// Toggle between Sign In / Sign Up
toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  isSignUp = !isSignUp;
  authTitle.textContent = isSignUp ? "Sign Up" : "Sign In";
  authBtn.textContent   = isSignUp ? "Sign Up" : "Sign In";
  toggleLink.textContent = isSignUp ? "Sign In" : "Sign Up";
  authToggle.firstChild.textContent = isSignUp
    ? "Already have an account? "
    : "Don't have an account? ";
  authError.textContent = "";
});

// Handle form submit (sign in or sign up)
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    if (isSignUp) {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    authError.textContent = friendlyError(error.code);
  }
});

// Sign out
signOutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    userEmailEl.textContent = user.email;

    // Dispatch a custom event so app.js can load data
    window.dispatchEvent(new CustomEvent("user-signed-in", { detail: user }));
  } else {
    // User is signed out
    authSection.classList.remove("hidden");
    appSection.classList.add("hidden");
    userEmailEl.textContent = "";
  }
});

// Map Firebase error codes to friendly messages
function friendlyError(code) {
  const map = {
    "auth/email-already-in-use": "This email is already registered. Try signing in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Invalid credentials. Check your email and password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
  };
  return map[code] || `Error: ${code}`;
}
