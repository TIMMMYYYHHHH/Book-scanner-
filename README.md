# 📚 My Library

A personal book-collection web app. Scan barcodes (or enter ISBNs manually), track which books you own, see series progress, and spot what's missing — all synced across devices via Firebase.

---

## Features

- **📷 Scan** — point your phone camera at a book's barcode to look it up instantly
- **📖 Series tracker** — see a progress bar per series and exactly which numbered books are missing
- **✍️ Authors** — browse your collection grouped by author
- **📚 Collection** — search, sort, and browse all your books
- **🔄 Sync** — books are stored in Firebase so they appear on every device you sign in to

---

## Setup (one-time, ~10 minutes)

### 1. Create a Firebase project

1. Go to **[console.firebase.google.com](https://console.firebase.google.com)** and click **Add project**
2. Give it a name (e.g. `my-library`) and follow the prompts
3. When asked about Google Analytics, you can skip it

### 2. Enable Authentication

1. In the Firebase console, go to **Build → Authentication**
2. Click **Get started**
3. Under **Sign-in method**, enable **Email/Password**

### 3. Create a Firestore database

1. Go to **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode** → select a region → **Done**
4. Go to the **Rules** tab and paste in the contents of `firestore.rules` from this repo, then **Publish**

### 4. Add your domain to Firebase

1. Go to **Authentication → Settings → Authorised domains**
2. Add your GitHub Pages domain: `YOUR-USERNAME.github.io`

### 5. Get your Firebase config

1. In the Firebase console, click the ⚙️ gear → **Project settings**
2. Scroll to **Your apps** and click the **</>** (Web) icon
3. Register the app (any nickname), skip Firebase Hosting
4. Copy the `firebaseConfig` object shown

### 6. Add the config to this repo

Open `js/config.js` and replace the placeholder values with your real ones:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "my-library-xxxxx.firebaseapp.com",
  projectId:         "my-library-xxxxx",
  storageBucket:     "my-library-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abcdef"
};
```

Commit and push that change.

### 7. Enable GitHub Pages

1. In your GitHub repo, go to **Settings → Pages**
2. Under **Source**, choose **Deploy from a branch**
3. Select **main** branch and **/ (root)** folder
4. Click **Save** — your app will be live at `https://YOUR-USERNAME.github.io/REPO-NAME/` within a minute or two

---

## Usage

1. Open the app URL and create an account (or sign in)
2. Tap **Scan** → **Start Camera** and point it at a book's barcode
3. The app fetches the book details automatically — tap **Add to Collection**
4. Use **✏️ Series** on any book to set the series name, book number, and total in the series
5. Check the **Series** tab to see your progress and any missing books

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Hosting | GitHub Pages (static) |
| Auth + DB | Firebase (Firestore + Email Auth) |
| Book data | Open Library API + Google Books API |
| Barcode scanning | html5-qrcode |
| Frontend | Vanilla HTML / CSS / JS (no build step) |
