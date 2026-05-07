import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { otpDisableService } from "../services/firestoreService";

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          
          const savedBusinessId = sessionStorage.getItem("selectedBusinessId");
          const savedBranchId = sessionStorage.getItem("selectedBranchId");
          
          if (savedBusinessId) setSelectedBusinessId(savedBusinessId);
          if (savedBranchId) setSelectedBranchId(savedBranchId);
        }
      } else {
        setCurrentUser(null);
        setUserData(null);
        setSelectedBusinessId(null);
        setSelectedBranchId(null);
        sessionStorage.removeItem("selectedBusinessId");
        sessionStorage.removeItem("selectedBranchId");
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email, password, options = {}) => {
    const { skipOtp = false } = options;
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));

    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.status === "locked") {
        await signOut(auth);
        throw new Error("Your account has been locked. Contact IT Admin.");
      }
      if (userData.role !== "it_admin" && (userData.businessId || userData.branchId)) {
        if (userData.businessId) {
          const bq = query(collection(db, "agent_businesses"), where("businessId", "==", userData.businessId));
          const bSnap = await getDocs(bq);
          if (!bSnap.empty) {
            const biz = bSnap.docs[0].data();
            if (biz.status === "locked" || biz.status === "deleted") {
              await signOut(auth);
              throw new Error(biz.status === "deleted" ? "Business account has been deleted. Contact IT Admin." : "Business account is locked. Contact IT Admin.");
            }
          }
        }
        if (userData.branchId) {
          const brq = query(collection(db, "branches"), where("branchId", "==", userData.branchId));
          const brSnap = await getDocs(brq);
          if (!brSnap.empty) {
            const br = brSnap.docs[0].data();
            if (br.status === "locked" || br.status === "suspended") {
              await signOut(auth);
              throw new Error(br.status === "suspended" ? "Branch is suspended. Contact IT Admin." : "Branch is locked. Contact IT Admin.");
            }
          }
        }
      }

      if (!skipOtp) {
        const otpDisabled = await otpDisableService.checkActive((email || "").toLowerCase().trim());
        if (!otpDisabled) {
          await signOut(auth);
          return {
            requiresOtp: true,
            userData,
            userDocId: userCredential.user.uid,
            email,
          };
        }
      }

      setUserData(userData);

      await updateDoc(doc(db, "users", userCredential.user.uid), {
        lastLogin: Timestamp.now(),
      });

      if (userData.defaultPassword === true || password === "AFB12345") {
        setRequiresPasswordChange(true);
        return { requiresPasswordChange: true, userCredential };
      }

      if (userData.role === "agent_user" || userData.role === "normal_user") {
        if (userData.businessId && userData.branchId) {
          setSelectedBusinessId(userData.businessId);
          setSelectedBranchId(userData.branchId);
          sessionStorage.setItem("selectedBusinessId", userData.businessId);
          sessionStorage.setItem("selectedBranchId", userData.branchId);
        }
      }
    }

    return { requiresPasswordChange: false, userCredential };
  };

  const changePassword = async (oldPassword, newPassword) => {
    if (!currentUser) throw new Error("No user logged in");
    
    const credential = EmailAuthProvider.credential(currentUser.email, oldPassword);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPassword);
    
    await updateDoc(doc(db, "users", currentUser.uid), {
      defaultPassword: false,
    });
    
    setRequiresPasswordChange(false);
  };

  const setSession = (businessId, branchId) => {
    setSelectedBusinessId(businessId);
    setSelectedBranchId(branchId);
    if (businessId) sessionStorage.setItem("selectedBusinessId", businessId);
    if (branchId) sessionStorage.setItem("selectedBranchId", branchId);
  };

  const updateMyProfile = async (updates) => {
    if (!currentUser) throw new Error("Not logged in");
    await updateDoc(doc(db, "users", currentUser.uid), {
      ...updates,
      updatedAt: Timestamp.now(),
    });
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    if (userDoc.exists()) setUserData(userDoc.data());
  };

  const logout = async () => {
    await signOut(auth);
    setUserData(null);
    setSelectedBusinessId(null);
    setSelectedBranchId(null);
    sessionStorage.removeItem("selectedBusinessId");
    sessionStorage.removeItem("selectedBranchId");
  };

  const value = {
    currentUser,
    userData,
    login,
    logout,
    changePassword,
    updateMyProfile,
    loading,
    selectedBusinessId,
    selectedBranchId,
    setSession,
    requiresPasswordChange,
    setRequiresPasswordChange,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
