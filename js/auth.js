import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let _auth;

export function initAuth(app) {
  _auth = getAuth(app);
  return _auth;
}

export const signIn  = (email, pw) => signInWithEmailAndPassword(_auth, email, pw);
export const signUp  = (email, pw) => createUserWithEmailAndPassword(_auth, email, pw);
export const signOut_ = ()         => signOut(_auth);
export const onAuthChange = (cb)   => onAuthStateChanged(_auth, cb);
