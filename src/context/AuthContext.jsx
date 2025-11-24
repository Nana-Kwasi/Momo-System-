import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

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

  const login = async (email, password) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
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
    loading,
    selectedBusinessId,
    selectedBranchId,
    setSession,
    requiresPasswordChange,
    setRequiresPasswordChange,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
