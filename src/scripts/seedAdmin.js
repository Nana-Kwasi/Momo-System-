import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const seedITAdmin = async () => {
  const email = "franciskontoh4@gmail.com";
  const password = "0000000000";
  let uid = null;
  let needsSignOut = false;

  try {
    console.log("Creating IT Admin user in Firebase Authentication...");
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    uid = userCredential.user.uid;
    console.log("User created in Authentication with UID:", uid);
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      console.log("⚠️  User already exists in Authentication. Signing in to get UID...");
      try {
        const signInCredential = await signInWithEmailAndPassword(auth, email, password);
        uid = signInCredential.user.uid;
        needsSignOut = true;
        console.log("Signed in, UID:", uid);
      } catch (signInError) {
        throw new Error("Could not sign in to existing user: " + signInError.message);
      }
    } else {
      throw error;
    }
  }

  try {
    const userData = {
      userId: uid,
      name: "IT Admin",
      email: email,
      role: "it_admin",
      status: "active",
      defaultPassword: false,
      createdAt: Timestamp.now(),
    };

    console.log("Creating/updating user document in Firestore...");
    await setDoc(doc(db, "users", uid), userData, { merge: true });

    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      console.log("✅ IT Admin user seeded successfully!");
      console.log("Email:", email);
      console.log("Password:", password);
      console.log("UID:", uid);
      console.log("Role: it_admin");
      
      if (needsSignOut) {
        await signOut(auth);
        console.log("Signed out after seeding");
      }
      
      return { success: true, uid, email };
    } else {
      throw new Error("Failed to create user document");
    }
  } catch (error) {
    console.error("❌ Error creating Firestore document:", error);
    if (needsSignOut) {
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.error("Error signing out:", signOutError);
      }
    }
    throw error;
  }
};

export default seedITAdmin;

