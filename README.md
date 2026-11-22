# 🎂 Birthday Wishes App

A lightweight, secure web application for easily managing birthday contacts and sending personalized birthday wishes to their emails and WhatsApp with one click.

Built with **vanilla HTML/CSS/JavaScript** and powered by **Firebase** (Firebase Authentication & Firebase Realtime Database).

---

## ✨ Features

- **Sign In Only (No Public Sign-Ups)**: Access is strictly restricted to authorized team members (`folafeye@gmail.com` and `majolat2000@gmail.com`).
- **Pre-Seeded Accounts with Initial Password**: Both authorized accounts are pre-seeded with the initial password `PASSWORD`.
- **In-App Account Settings & Password Change**: Signed-in users can update their password securely at any time with re-authentication verification.
- **Contact Management**: Add, view, edit, and delete contacts with:
  - **Full Name**
  - **Birthday** (Date picker)
  - **Email Address**
  - **WhatsApp Number**
  - **Status**:
    - **Staff**: Permanent contact; remains in the database until manually deleted.
    - **Student**: Dynamic expected finish date selection for **November** of future years (up to 6 years away from the current year).
- **Automated Expired Student Deletion**: When a student contact reaches or passes their expected finish month (November of that year), the contact is automatically pruned from the database!
- **Instant Contact Search**: Real-time search filter to instantly find any contact by name, email, WhatsApp number, status, or birth date.
- **⚠️ Missed Birthdays Tracker**: Automatically flags any birthdays that occurred earlier this year without an email or WhatsApp wish sent, showing how many days ago it was and providing one-click **Belated Email** and **Belated WhatsApp** greetings.
- **🎉 Today's Birthdays Spotlight**: Automatically detects and highlights contacts celebrating their birthday today.
- **One-Click Wishes**:
  - **✉️ Email Wish (`mailto:`)**: Generates pre-filled email drafts with customizable heartfelt birthday greetings.
  - **💬 WhatsApp Wish (`wa.me`)**: Opens WhatsApp directly with a pre-formatted birthday message to the contact's number.
- **Realtime Database**: Powered by **Firebase Realtime Database** with live bidirectional synchronization.

---

## 🛠️ Tech Stack & Firebase Services

- **Frontend**: Vanilla HTML5, modern CSS3, ES Modules.
- **Firebase Auth**: Email/Password authentication (restricted login).
- **Firebase Realtime Database**: Real-time NoSQL JSON database (`https://cruprosite-default-rtdb.firebaseio.com`).
- **Cloud Firestore**: Also connected with security rules.
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

## 🔐 Credentials & Security

- **Secrets protection**: `public/firebase-config.js` is ignored by Git and removed from GitHub commit history.
- **Template provided**: Copy `public/firebase-config.example.js` to `public/firebase-config.js` when setting up on a new environment.
- **Realtime Database Rules**: Configured in `database.rules.json` to allow read/write only to authenticated team users.

---

## 📁 Project Structure

```
CRUPRO/
├── public/
│   ├── index.html                  # Main application page
│   ├── style.css                   # Modern styles & responsive layout
│   ├── firebase-config.js          # Local Firebase Modular SDK initialization (gitignored)
│   ├── firebase-config.example.js  # Public template configuration
│   ├── auth.js                     # Sign-in only, auto-seeding & change password
│   └── app.js                      # Contacts CRUD, dynamic finish dates, auto-prune & wishes
├── database.rules.json             # Firebase Realtime Database security rules
├── firestore.rules                 # Cloud Firestore security rules
├── firestore.indexes.json          # Cloud Firestore indexes
├── firebase.json                   # Firebase configuration (Hosting, RTDB, Firestore, Auth)
├── .firebaserc                     # Firebase active project association
├── .gitignore                      # Git ignore rules
└── README.md                       # Project documentation
```
