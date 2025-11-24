import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

const generateId = () => doc(collection(db, "_temp")).id;

export const merchantSimService = {
  async create(data) {
    const merchantSimId = generateId();
    const merchantSimData = {
      merchantSimId,
      branchId: data.branchId,
      provider: data.provider, // MTN, Vodafone, AirtelTigo, Telecel
      simName: data.simName, // e.g., "MTN33", "MTN34"
      agentNumber: data.agentNumber || "",
      createdAt: Timestamp.now(),
      status: "active",
      ...data,
    };
    await addDoc(collection(db, "merchant_sims"), merchantSimData);
    return merchantSimId;
  },

  async getByBranch(branchId) {
    try {
      const q = query(
        collection(db, "merchant_sims"),
        where("branchId", "==", branchId),
        where("status", "==", "active")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error getting merchant SIMs:", error);
      return [];
    }
  },

  async getByBranchAndProvider(branchId, provider) {
    try {
      const q = query(
        collection(db, "merchant_sims"),
        where("branchId", "==", branchId),
        where("provider", "==", provider),
        where("status", "==", "active")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error getting merchant SIMs by provider:", error);
      return [];
    }
  },

  async update(merchantSimId, data) {
    const q = query(collection(db, "merchant_sims"), where("merchantSimId", "==", merchantSimId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      await updateDoc(doc(db, "merchant_sims", snapshot.docs[0].id), {
        ...data,
        updatedAt: Timestamp.now(),
      });
    }
  },
};

