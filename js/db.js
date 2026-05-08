import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let _db;
let _uid;

export function initDb(app, uid) {
  _db  = getFirestore(app);
  _uid = uid;
}

const col = () => collection(_db, `users/${_uid}/books`);
const ref = (id) => doc(_db, `users/${_uid}/books`, id);

export const addBook    = (data)        => addDoc(col(), { ...data, addedAt: serverTimestamp() });
export const updateBook = (id, updates) => updateDoc(ref(id), updates);
export const deleteBook = (id)          => deleteDoc(ref(id));

export async function getBookByIsbn(isbn) {
  const snap = await getDocs(query(col(), where("isbn", "==", isbn)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export function subscribeToBooks(callback) {
  return onSnapshot(col(), (snap) => {
    const books = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(books);
  });
}
