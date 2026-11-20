# 🎂 Birthday Wishes App

A lightweight, secure web application for easily managing birthday contacts and sending personalized birthday wishes to their emails with one click.

Built with **vanilla HTML/CSS/JavaScript** and powered by **Firebase** (Authentication & Cloud Firestore).

---

## ✨ Features

- **Email & Password Authentication**: Secure user sign-up and sign-in powered by Firebase Authentication.
- **Contact Management**: Add, view, edit, and delete birthday contacts (Name, Email, Birthday, Custom Wish Message).
- **🎉 Today's Birthdays Spotlight**: Automatically scans and highlights contacts who celebrate their birthday today.
- **One-Click Email Wish (`mailto:`)**: Generates pre-filled email drafts with customizable heartfelt birthday greetings.
- **Real-Time Database**: Powered by Cloud Firestore with real-time sync (`onSnapshot`).
- **Production-Grade Security Rules**: Granular, owner-only authorization (`users/{userId}/contacts`) with strict schema validation.

---

## 🛠️ Tech Stack & Firebase Services

- **Frontend**: Vanilla HTML5, modern CSS3, ES Modules.
- **Firebase Auth**: Email/Password authentication.
- **Cloud Firestore**: Real-time NoSQL document database.
- **Project ID**: `cruprosite`
- **GitHub Repository**: [https://github.com/majolat2000/CRUPRO.git](https://github.com/majolat2000/CRUPRO.git)

---

## 🚀 Running Locally

Because ES Modules are used, serve the `public/` directory via any local static server:

### Option 1: Using Python
```bash
cd public
python -m http.server 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option 2: Using npx serve
```bash
npx serve public -l 3000
```

---

## 🔒 Firestore Security Rules

The security rules in [`firestore.rules`](./firestore.rules) ensure:
1. **Default Deny**: All unauthenticated and unlisted paths are denied.
2. **Owner Isolation**: Users can only read and write their own contacts (`/users/{userId}/contacts/{contactId}`).
3. **Data Validation**: Fields (`name`, `email`, `birthday`) are strictly validated for type, length, and email format.
4. **Timestamp Integrity**: `createdAt` is immutable after creation, and `updatedAt` is enforced on writes.

---

## 📁 Project Structure

```
CRUPRO/
├── public/
│   ├── index.html          # Main application page
│   ├── style.css           # Modern styles & responsive layout
│   ├── firebase-config.js  # Firebase Modular SDK initialization
│   ├── auth.js             # Email/Password authentication logic
│   └── app.js              # Contacts CRUD & Birthday notification logic
├── firestore.rules         # Cloud Firestore security rules
├── firestore.indexes.json  # Cloud Firestore indexes
├── firebase.json           # Firebase configuration
├── .firebaserc             # Firebase active project association
├── .gitignore              # Git ignore rules
└── README.md               # Project documentation
```
