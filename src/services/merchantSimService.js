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
    // Validate required fields
    if (!data.branchId) {
      throw new Error("branchId is required");
    }
    if (!data.provider) {
      throw new Error("provider is required");
    }
    if (!data.simName) {
      throw new Error("simName is required");
    }
    
    const merchantSimId = generateId();
    const merchantSimData = {
      merchantSimId,
      branchId: data.branchId,
      provider: data.provider, // MTN, Vodafone, AirtelTigo, Telecel
      simName: data.simName.trim(), // e.g., "MTN33", "MTN34"
      agentNumber: (data.agentNumber || "").trim(),
      createdAt: Timestamp.now(),
      status: "active",
    };
    
    // Only add optional fields if they have values
    if (data.businessId) {
      merchantSimData.businessId = data.businessId;
    }
    
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

