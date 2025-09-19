// scripts/firebase.js
var firebaseConfig = {
  apiKey: "AIzaSyAjJ5scHda4eRM-6A-2AfHdFFncudmxiXA",
  authDomain: "airportinfo-9e5ba.firebaseapp.com",
  databaseURL: "https://airportinfo-9e5ba-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "airportinfo-9e5ba",
  storageBucket: "airportinfo-9e5ba.firebasestorage.app",
  messagingSenderId: "788689422638",
  appId: "1:788689422638:web:368b08549b15581e15d2bf"
};

firebase.initializeApp(firebaseConfig);
console.log("Firebase initialized:", firebase.apps[0]);

//THIS FIREBASE API KEY WILL BE DISCONTINUED/INVALID//
