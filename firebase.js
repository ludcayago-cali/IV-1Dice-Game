import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  push,
  remove
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCltt4RFaPvr5d00TMsg3pJ2R277XoUF9I",
  authDomain: "dice-corner-duel.firebaseapp.com",
  databaseURL: "https://dice-corner-duel-default-rtdb.firebaseio.com",
  projectId: "dice-corner-duel",
  storageBucket: "dice-corner-duel.firebasestorage.app",
  messagingSenderId: "555671248976",
  appId: "1:555671248976:web:8dbea50c71e630a693b155",
  measurementId: "G-KERHC3XWYZ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, update, get, onValue, push, remove };