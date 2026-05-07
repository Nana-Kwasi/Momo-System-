import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

const handleFirestoreError = (error, context) => {
  if (
    (error.code === "failed-precondition" || error.code === 9) &&
    (error.message?.includes("index") || error.message?.includes("Index"))
  ) {
    console.warn(`Firestore index required for: ${context}`);
    console.warn("The query will work once the index is created. Check the Firebase console for the index creation link.");
    if (error.message?.includes("create it here")) {
      const urlMatch = error.message.match(/https:\/\/[^\s]+/);
      if (urlMatch) {
        console.warn(`Index creation link: ${urlMatch[0]}`);
      }
    }
    return null;
  }
  throw error;
};

const generateId = () => doc(collection(db, "_temp")).id;

export const agentBusinessService = {
  async create(data) {
    const businessId = generateId();
    const businessData = {
      businessId,
      businessAbbreviation: data.businessAbbreviation?.toUpperCase().slice(0, 4),
      createdAt: Timestamp.now(),
      status: "active",
      ...data,
    };
    await addDoc(collection(db, "agent_businesses"), businessData);
    return businessId;
  },

  async getAll() {
    const snapshot = await getDocs(collection(db, "agent_businesses"));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getById(businessId) {
    const q = query(collection(db, "agent_businesses"), where("businessId", "==", businessId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async update(businessId, data) {
    const q = query(collection(db, "agent_businesses"), where("businessId", "==", businessId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      await updateDoc(doc(db, "agent_businesses", snapshot.docs[0].id), data);
    }
  },
  async lock(businessId) {
    await this.update(businessId, { status: "locked", updatedAt: Timestamp.now() });
  },
  async unlock(businessId) {
    await this.update(businessId, { status: "active", updatedAt: Timestamp.now() });
  },
  async delete(businessId) {
    await this.update(businessId, { status: "deleted", updatedAt: Timestamp.now() });
  },
};

export const branchService = {
  async create(data) {
    const branchId = generateId();
    const branchData = {
      branchId,
      branchCode: data.branchCode,
      createdAt: Timestamp.now(),
      status: "active",
      ...data,
    };
    await addDoc(collection(db, "branches"), branchData);
    return branchId;
  },

  async getByBusinessId(businessId) {
    const q = query(collection(db, "branches"), where("businessId", "==", businessId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getById(branchId) {
    const q = query(collection(db, "branches"), where("branchId", "==", branchId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async update(branchId, data) {
    const q = query(collection(db, "branches"), where("branchId", "==", branchId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      await updateDoc(doc(db, "branches", snapshot.docs[0].id), data);
    }
  },
  async lock(branchId) {
    await this.update(branchId, { status: "locked", updatedAt: Timestamp.now() });
  },
  async suspend(branchId) {
    await this.update(branchId, { status: "suspended", updatedAt: Timestamp.now() });
  },
  async activate(branchId) {
    await this.update(branchId, { status: "active", updatedAt: Timestamp.now() });
  },
};

export const bankService = {
  async getByBusinessId(businessId) {
    if (!businessId) return [];
    const q = query(collection(db, "banks"), where("businessId", "==", businessId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async create(data) {
    const bankId = generateId();
    await addDoc(collection(db, "banks"), {
      bankId,
      businessId: data.businessId,
      bankName: (data.bankName || "").trim(),
      createdAt: Timestamp.now(),
    });
    return bankId;
  },
  async update(bankId, data) {
    const q = query(collection(db, "banks"), where("bankId", "==", bankId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      await updateDoc(doc(db, "banks", snapshot.docs[0].id), { ...data, updatedAt: Timestamp.now() });
    }
  },
  async delete(bankId) {
    const q = query(collection(db, "banks"), where("bankId", "==", bankId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      await deleteDoc(doc(db, "banks", snapshot.docs[0].id));
    }
  },
};

// Commission configuration per branch (doc id = branchId)
// Holds activeConfig (used by transactions) and optional pendingConfig awaiting branch manager approval.
export const commissionConfigService = {
  async getByBranch(branchId) {
    if (!branchId) return null;
    const ref = doc(db, "commission_configs", branchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  },

  // Save commission config as draft or immediately activate.
  // If autoApprove is true (branch manager), pending is skipped and activeConfig is updated directly.
  async saveForBranch({ businessId, branchId, config, user, autoApprove = false }) {
    if (!businessId || !branchId) {
      throw new Error("businessId and branchId are required for commission config");
    }
    const ref = doc(db, "commission_configs", branchId);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    const now = Timestamp.now();

    if (autoApprove) {
      const data = {
        ...existing,
        businessId,
        branchId,
        activeConfig: config,
        pendingConfig: null,
        pendingStatus: "none",
        hasPending: false,
        approvedBy: user?.userId || null,
        approvedByName: user?.name || user?.email || null,
        approvedAt: now,
        updatedAt: now,
        createdAt: existing.createdAt || now,
      };
      await setDoc(ref, data);
      return { id: ref.id, ...data };
    }

    const data = {
      ...existing,
      businessId,
      branchId,
      activeConfig: existing.activeConfig || null,
      pendingConfig: config,
      pendingStatus: "pending_approval",
      hasPending: true,
      pendingCreatedBy: user?.userId || null,
      pendingCreatedByName: user?.name || user?.email || null,
      pendingCreatedAt: now,
      updatedAt: now,
      createdAt: existing.createdAt || now,
    };
    await setDoc(ref, data);
    return { id: ref.id, ...data };
  },

  async approvePending({ branchId, approver }) {
    if (!branchId) {
      throw new Error("branchId is required to approve commission config");
    }
    const ref = doc(db, "commission_configs", branchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error("No commission config found for this branch");
    }
    const existing = snap.data();
    if (!existing.pendingConfig) {
      return { id: ref.id, ...existing };
    }
    const now = Timestamp.now();
    const data = {
      ...existing,
      activeConfig: existing.pendingConfig,
      pendingConfig: null,
      pendingStatus: "none",
      hasPending: false,
      approvedBy: approver?.userId || null,
      approvedByName: approver?.name || approver?.email || null,
      approvedAt: now,
      updatedAt: now,
    };
    await setDoc(ref, data);
    return { id: ref.id, ...data };
  },

  async discardPending({ branchId }) {
    if (!branchId) {
      throw new Error("branchId is required to discard pending commission config");
    }
    const ref = doc(db, "commission_configs", branchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const existing = snap.data();
    const data = {
      ...existing,
      pendingConfig: null,
      pendingStatus: "none",
      hasPending: false,
      updatedAt: Timestamp.now(),
    };
    await setDoc(ref, data);
    return { id: ref.id, ...data };
  },
};

export const userService = {
  async create(data) {
    const userId = data.userId;
    if (!userId) {
      throw new Error("userId (Firebase Auth UID) is required");
    }
    const userData = {
      userId,
      defaultPassword: data.defaultPassword !== undefined ? data.defaultPassword : true,
      status: data.status || "active",
      createdAt: Timestamp.now(),
      lastLogin: null,
      ...data,
    };
    await setDoc(doc(db, "users", userId), userData);
    return userId;
  },

  async getAll(businessId = null, branchId = null) {
    let q = query(collection(db, "users"));
    if (businessId) {
      q = query(q, where("businessId", "==", businessId));
    }
    if (branchId) {
      q = query(q, where("branchId", "==", branchId));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getById(userId) {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) return null;
    return { id: userDoc.id, ...userDoc.data() };
  },

  async getByUserId(userId) {
    const q = query(collection(db, "users"), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async update(userId, data) {
    await updateDoc(doc(db, "users", userId), {
      ...data,
      updatedAt: Timestamp.now(),
    });
  },

  async updateLastLogin(userId) {
    await updateDoc(doc(db, "users", userId), {
      lastLogin: Timestamp.now(),
    });
  },
  async lock(userId) {
    await this.update(userId, { status: "locked", updatedAt: Timestamp.now() });
  },
  async unlock(userId) {
    await this.update(userId, { status: "active", updatedAt: Timestamp.now() });
  },
};

export const dailyFloatService = {
  async create(data) {
    const floatId = generateId();
    const floatData = {
      floatId,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now(),
      status: "pending",
      ...data,
    };
    await addDoc(collection(db, "daily_float"), floatData);
    return floatId;
  },

  async getByBranchAndDate(branchId, date) {
    try {
      const dateString = new Date(date).toISOString().split("T")[0]; // Format: YYYY-MM-DD

      // Try string date query first (data is stored as string in Firestore)
      try {
        const q = query(
          collection(db, "daily_float"),
          where("branchId", "==", branchId),
          where("date", "==", dateString)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        }
      } catch (stringError) {
        const result = handleFirestoreError(stringError, "daily_float getByBranchAndDate (string)");
        if (result === null) {
          // If string query fails due to index, try fallback
          return await this.getByBranchAndDateFallback(branchId, dateString);
        }
        // If it's not an index error, try Timestamp query as fallback
      }

      // Fallback: Try Timestamp query (in case data was stored as Timestamp)
      try {
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);
    const q = query(
      collection(db, "daily_float"),
      where("branchId", "==", branchId),
      where("date", ">=", Timestamp.fromDate(dateStart)),
      where("date", "<=", Timestamp.fromDate(dateEnd))
    );
    const snapshot = await getDocs(q);
        if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        }
      } catch (timestampError) {
        // If Timestamp query also fails, use fallback
        handleFirestoreError(timestampError, "daily_float getByBranchAndDate (timestamp)");
      }

      // Last resort: fallback method (get all and filter in memory)
      return await this.getByBranchAndDateFallback(branchId, dateString);
    } catch (error) {
      const result = handleFirestoreError(error, "daily_float getByBranchAndDate");
      if (result === null) {
        // Last resort: try fallback method
        const dateString = new Date(date).toISOString().split("T")[0];
        return await this.getByBranchAndDateFallback(branchId, dateString);
      }
      throw error;
    }
  },

  async getByBranchAndDateFallback(branchId, dateString) {
    try {
      // Fallback: Get all floats for branch (without orderBy to avoid index requirement) and filter by date in memory
      let snapshot;
      try {
        // Try with orderBy first (might require index)
        const qWithOrder = query(
          collection(db, "daily_float"),
          where("branchId", "==", branchId),
          orderBy("date", "desc"),
          limit(30)
        );
        snapshot = await getDocs(qWithOrder);
      } catch (orderByError) {
        // If orderBy fails, just query by branchId (no index needed)
        const qWithoutOrder = query(
          collection(db, "daily_float"),
          where("branchId", "==", branchId),
          limit(30)
        );
        snapshot = await getDocs(qWithoutOrder);
      }
      
      const floats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      
      // Filter by date string in memory
      const matchingFloat = floats.find((float) => {
        if (!float.date) return false;
        // Handle both Timestamp and string formats
        if (float.date.toDate) {
          const floatDateString = float.date.toDate().toISOString().split("T")[0];
          return floatDateString === dateString;
        }
        // Handle string dates
        if (typeof float.date === 'string') {
          return float.date === dateString || float.date.startsWith(dateString);
        }
        return float.date.toString() === dateString;
      });
      
      return matchingFloat || null;
    } catch (error) {
      console.error("Fallback query also failed:", error);
      return null;
    }
  },

  dateMatches(float, dateString) {
    if (!float?.date) return false;
    if (float.date.toDate) {
      return float.date.toDate().toISOString().split("T")[0] === dateString;
    }
    if (typeof float.date === "string") {
      return float.date === dateString || float.date.startsWith(dateString);
    }
    return String(float.date) === dateString;
  },

  async getByBranchDateAndUser(branchId, date, userId) {
    if (!branchId || !userId) return null;
    const dateString = new Date(date).toISOString().split("T")[0];
    const floats = await this.getByBranch(branchId, 50);
    const match = floats.find(
      (f) => this.dateMatches(f, dateString) && f.recordedBy === userId
    );
    return match || null;
  },

  async getFloatsByBranchAndDate(branchId, date) {
    if (!branchId) return [];
    const dateString = new Date(date).toISOString().split("T")[0];
    const floats = await this.getByBranch(branchId, 50);
    return floats.filter((f) => this.dateMatches(f, dateString));
  },

  async getByBranch(branchId, limitCount = 30) {
    try {
      // Try with orderBy first
      try {
    const q = query(
      collection(db, "daily_float"),
      where("branchId", "==", branchId),
      orderBy("date", "desc"),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      } catch (orderByError) {
        // If orderBy fails (missing index), try without orderBy
        handleFirestoreError(orderByError, "daily_float getByBranch (with orderBy)");
        const q = query(
          collection(db, "daily_float"),
          where("branchId", "==", branchId),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        const floats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        // Sort in memory by date (handle both string and Timestamp)
        floats.sort((a, b) => {
          const dateA = a.date?.toDate ? a.date.toDate().getTime() : (typeof a.date === 'string' ? new Date(a.date).getTime() : 0);
          const dateB = b.date?.toDate ? b.date.toDate().getTime() : (typeof b.date === 'string' ? new Date(b.date).getTime() : 0);
          return dateB - dateA; // Descending order
        });
        return floats.slice(0, limitCount);
      }
    } catch (error) {
      const result = handleFirestoreError(error, "daily_float getByBranch");
      if (result === null) return [];
      throw error;
    }
  },

  async update(floatId, data) {
    const q = query(collection(db, "daily_float"), where("floatId", "==", floatId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      await updateDoc(doc(db, "daily_float", snapshot.docs[0].id), {
        ...data,
        updatedAt: Timestamp.now(),
      });
    }
  },
};

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export const transactionService = {
  async createMoMoTransaction(data) {
    const transactionId = generateId();
    const transactionData = stripUndefined({
      transactionId,
      date: Timestamp.fromDate(new Date(data.date)),
      time: data.time || new Date().toLocaleTimeString(),
      createdAt: Timestamp.now(),
      ...data,
    });
    await addDoc(collection(db, "momo_transactions"), transactionData);
    return transactionId;
  },

  async createBankTransaction(data) {
    const transactionId = generateId();
    const transactionData = {
      transactionId,
      date: Timestamp.fromDate(new Date(data.date)),
      time: data.time || new Date().toLocaleTimeString(),
      createdAt: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "bank_transactions"), transactionData);
    return transactionId;
  },

  async getMoMoTransactions(branchId, date = null, limitCount = 50, userId = null, userRole = null) {
    try {
      // Normal users can only see their own transactions
      const isAdmin = userRole === "admin" || userRole === "branch_manager" || userRole === "it_admin";
      
    let q = query(
      collection(db, "momo_transactions"),
      where("branchId", "==", branchId),
      orderBy("date", "desc"),
      limit(limitCount)
    );
      
      // Add user filter for normal users
      if (!isAdmin && userId) {
        q = query(
          collection(db, "momo_transactions"),
          where("branchId", "==", branchId),
          where("recordedBy", "==", userId),
          orderBy("date", "desc"),
          limit(limitCount)
        );
      }
      
    if (date) {
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);
      q = query(
        collection(db, "momo_transactions"),
        where("branchId", "==", branchId),
          where("date", ">=", Timestamp.fromDate(dateStart)),
          where("date", "<=", Timestamp.fromDate(dateEnd)),
          orderBy("date", "desc")
        );
        // Add user filter for normal users
        if (!isAdmin && userId) {
          q = query(
            collection(db, "momo_transactions"),
            where("branchId", "==", branchId),
            where("recordedBy", "==", userId),
        where("date", ">=", Timestamp.fromDate(dateStart)),
        where("date", "<=", Timestamp.fromDate(dateEnd)),
        orderBy("date", "desc")
      );
    }
      }
      
      const snapshot = await getDocs(q).catch((err) => {
        handleFirestoreError(err, "momo_transactions getMoMoTransactions");
        return { docs: [] };
      });
      
      let results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      
      // Additional in-memory filter for normal users (fallback)
      if (!isAdmin && userId) {
        results = results.filter(t => t.recordedBy === userId);
      }
      
      return results;
    } catch (error) {
      const result = handleFirestoreError(error, "momo_transactions getMoMoTransactions");
      if (result === null) return [];
      throw error;
    }
  },

  async getTodayTransactions(branchId, userId = null, userRole = null) {
    try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
      const todayString = today.toISOString().split("T")[0]; // Format: YYYY-MM-DD
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

      // Normal users can only see their own transactions
      const isAdmin = userRole === "admin" || userRole === "branch_manager" || userRole === "it_admin";
      
      // Try string date query first (data is stored as string in Firestore)
      let momoResults = [];
      let bankResults = [];
      
      try {
        let momoQ = query(
          collection(db, "momo_transactions"),
          where("branchId", "==", branchId),
          where("date", "==", todayString)
        );

        let bankQ = query(
          collection(db, "bank_transactions"),
          where("branchId", "==", branchId),
          where("date", "==", todayString)
        );

        // Add user filter for normal users
        if (!isAdmin && userId) {
          momoQ = query(
            collection(db, "momo_transactions"),
            where("branchId", "==", branchId),
            where("date", "==", todayString),
            where("recordedBy", "==", userId)
          );
          bankQ = query(
            collection(db, "bank_transactions"),
            where("branchId", "==", branchId),
            where("date", "==", todayString),
            where("recordedBy", "==", userId)
          );
        }

        const [momoSnapshot, bankSnapshot] = await Promise.all([
          getDocs(momoQ).catch((err) => {
            handleFirestoreError(err, "momo_transactions getTodayTransactions (string)");
            return { docs: [] };
          }),
          getDocs(bankQ).catch((err) => {
            handleFirestoreError(err, "bank_transactions getTodayTransactions (string)");
            return { docs: [] };
          }),
        ]);

        momoResults = momoSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        bankResults = bankSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      } catch (stringError) {
        // If string query fails, try Timestamp query as fallback
        try {
          let momoQ = query(
      collection(db, "momo_transactions"),
      where("branchId", "==", branchId),
      where("date", ">=", Timestamp.fromDate(today)),
      where("date", "<", Timestamp.fromDate(tomorrow))
    );

          let bankQ = query(
      collection(db, "bank_transactions"),
      where("branchId", "==", branchId),
      where("date", ">=", Timestamp.fromDate(today)),
      where("date", "<", Timestamp.fromDate(tomorrow))
    );

          // Add user filter for normal users
          if (!isAdmin && userId) {
            momoQ = query(momoQ, where("recordedBy", "==", userId));
            bankQ = query(bankQ, where("recordedBy", "==", userId));
          }

    const [momoSnapshot, bankSnapshot] = await Promise.all([
            getDocs(momoQ).catch((err) => {
              handleFirestoreError(err, "momo_transactions getTodayTransactions (timestamp)");
              return { docs: [] };
            }),
            getDocs(bankQ).catch((err) => {
              handleFirestoreError(err, "bank_transactions getTodayTransactions (timestamp)");
              return { docs: [] };
            }),
          ]);

          momoResults = momoSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          bankResults = bankSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (timestampError) {
          handleFirestoreError(timestampError, "getTodayTransactions (timestamp fallback)");
        }
      }

      // If no results from queries, try fallback: get all branch transactions and filter in memory
      if (momoResults.length === 0 && bankResults.length === 0) {
        console.log("getTodayTransactions: No results from indexed queries, trying fallback...");
        try {
          // Get all transactions for branch (no date filter, no index needed)
          const fallbackMomoQ = query(
            collection(db, "momo_transactions"),
            where("branchId", "==", branchId),
            limit(1000) // Get up to 1000 transactions
          );
          
          const fallbackBankQ = query(
            collection(db, "bank_transactions"),
            where("branchId", "==", branchId),
            limit(1000)
          );
          
          const [fallbackMomoSnapshot, fallbackBankSnapshot] = await Promise.all([
            getDocs(fallbackMomoQ).catch(() => ({ docs: [] })),
            getDocs(fallbackBankQ).catch(() => ({ docs: [] })),
          ]);
          
          momoResults = fallbackMomoSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          bankResults = fallbackBankSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          
          console.log(`getTodayTransactions: Fallback loaded ${momoResults.length} MoMo and ${bankResults.length} Bank transactions`);
        } catch (fallbackError) {
          console.error("getTodayTransactions: Fallback also failed:", fallbackError);
        }
      }

      // Filter by date in memory (handle both string and Timestamp formats)
      const todayDateString = todayString;
      const beforeFilter = momoResults.length;
      momoResults = momoResults.filter(t => {
        if (!t.date) return false;
        if (typeof t.date === 'string') {
          return t.date === todayDateString || t.date.startsWith(todayDateString);
        }
        if (t.date.toDate) {
          const tDateString = t.date.toDate().toISOString().split("T")[0];
          return tDateString === todayDateString;
        }
        return false;
      });
      
      const beforeBankFilter = bankResults.length;
      bankResults = bankResults.filter(t => {
        if (!t.date) return false;
        if (typeof t.date === 'string') {
          return t.date === todayDateString || t.date.startsWith(todayDateString);
        }
        if (t.date.toDate) {
          const tDateString = t.date.toDate().toISOString().split("T")[0];
          return tDateString === todayDateString;
        }
        return false;
      });
      
      console.log(`getTodayTransactions: Filtered to ${momoResults.length} MoMo (from ${beforeFilter}) and ${bankResults.length} Bank (from ${beforeBankFilter}) transactions for ${todayDateString}`);

      // Additional in-memory filter for normal users (fallback)
      if (!isAdmin && userId) {
        momoResults = momoResults.filter(t => t.recordedBy === userId);
        bankResults = bankResults.filter(t => t.recordedBy === userId);
      }

    return {
        momo: momoResults,
        bank: bankResults,
      };
    } catch (error) {
      const result = handleFirestoreError(error, "getTodayTransactions");
      if (result === null) return { momo: [], bank: [] };
      throw error;
    }
  },

  async getTransactionsByDateRange(branchId, fromDate, toDate, userId = null, userRole = null) {
    try {
      if (!branchId) return { momo: [], bank: [] };

      const isAdmin = userRole === "admin" || userRole === "branch_manager" || userRole === "it_admin";

      // Normalize inputs (accept string "YYYY-MM-DD" or Date)
      const from =
        typeof fromDate === "string" ? new Date(fromDate) : new Date(fromDate || new Date());
      const to =
        typeof toDate === "string" ? new Date(toDate) : new Date(toDate || new Date());

      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);

      let momoQ = query(
        collection(db, "momo_transactions"),
        where("branchId", "==", branchId),
        where("date", ">=", Timestamp.fromDate(from)),
        where("date", "<=", Timestamp.fromDate(to))
      );

      let bankQ = query(
        collection(db, "bank_transactions"),
        where("branchId", "==", branchId),
        where("date", ">=", Timestamp.fromDate(from)),
        where("date", "<=", Timestamp.fromDate(to))
      );

      if (!isAdmin && userId) {
        momoQ = query(momoQ, where("recordedBy", "==", userId));
        bankQ = query(bankQ, where("recordedBy", "==", userId));
      }

      const [momoSnapshot, bankSnapshot] = await Promise.all([
        getDocs(momoQ).catch((err) => {
          handleFirestoreError(err, "momo_transactions getTransactionsByDateRange");
          return { docs: [] };
        }),
        getDocs(bankQ).catch((err) => {
          handleFirestoreError(err, "bank_transactions getTransactionsByDateRange");
          return { docs: [] };
        }),
      ]);

      let momoResults = momoSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      let bankResults = bankSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Fallback in-memory filter to be safe against any date type inconsistencies
      const inRange = (t) => {
        if (!t.date) return false;
        let d;
        if (typeof t.date === "string") {
          d = new Date(t.date);
        } else if (t.date.toDate) {
          d = t.date.toDate();
        } else {
          d = new Date(t.date);
        }
        if (isNaN(d.getTime())) return false;
        return d >= from && d <= to;
      };

      momoResults = momoResults.filter(inRange);
      bankResults = bankResults.filter(inRange);

      // Additional in-memory filter for non-admin as final fallback
      if (!isAdmin && userId) {
        momoResults = momoResults.filter((t) => t.recordedBy === userId);
        bankResults = bankResults.filter((t) => t.recordedBy === userId);
      }

      // If nothing returned, try branch-only fallback (handles string dates)
      if (momoResults.length === 0 && bankResults.length === 0) {
        console.info("getTransactionsByDateRange: No results from indexed query, attempting branch-only fallback");
        try {
          let fallbackMomoQ = query(collection(db, "momo_transactions"), where("branchId", "==", branchId), limit(2000));
          let fallbackBankQ = query(collection(db, "bank_transactions"), where("branchId", "==", branchId), limit(2000));

          if (!isAdmin && userId) {
            fallbackMomoQ = query(
              collection(db, "momo_transactions"),
              where("branchId", "==", branchId),
              where("recordedBy", "==", userId),
              limit(2000)
            );
            fallbackBankQ = query(
              collection(db, "bank_transactions"),
              where("branchId", "==", branchId),
              where("recordedBy", "==", userId),
              limit(2000)
            );
          }

          const [mFallback, bFallback] = await Promise.all([
            getDocs(fallbackMomoQ).catch(() => ({ docs: [] })),
            getDocs(fallbackBankQ).catch(() => ({ docs: [] })),
          ]);

          momoResults = mFallback.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(inRange);
          bankResults = bFallback.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(inRange);

          if (!isAdmin && userId) {
            momoResults = momoResults.filter((t) => t.recordedBy === userId);
            bankResults = bankResults.filter((t) => t.recordedBy === userId);
          }
        } catch (fallbackError) {
          console.error("Branch-only fallback failed:", fallbackError);
        }
      }

      return {
        momo: momoResults,
        bank: bankResults,
      };
    } catch (error) {
      const result = handleFirestoreError(error, "getTransactionsByDateRange");
      // If index is missing, fall back to branch-only query and filter in memory
      if (result === null) {
        try {
          console.warn("getTransactionsByDateRange: Using fallback (no index) — in-memory date filtering");
          const isAdmin = userRole === "admin" || userRole === "branch_manager" || userRole === "it_admin";
          // Fallback: load up to 2000 records by branch (no date filter), then filter in memory
          let fallbackMomoQ = query(collection(db, "momo_transactions"), where("branchId", "==", branchId), limit(2000));
          let fallbackBankQ = query(collection(db, "bank_transactions"), where("branchId", "==", branchId), limit(2000));

          if (!isAdmin && userId) {
            fallbackMomoQ = query(collection(db, "momo_transactions"), where("branchId", "==", branchId), where("recordedBy", "==", userId), limit(2000));
            fallbackBankQ = query(collection(db, "bank_transactions"), where("branchId", "==", branchId), where("recordedBy", "==", userId), limit(2000));
          }

          const [mFallback, bFallback] = await Promise.all([
            getDocs(fallbackMomoQ).catch(() => ({ docs: [] })),
            getDocs(fallbackBankQ).catch(() => ({ docs: [] })),
          ]);

          let momoResults = mFallback.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          let bankResults = bFallback.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

          // In-memory date filter
          const from =
            typeof fromDate === "string" ? new Date(fromDate) : new Date(fromDate || new Date());
          const to = typeof toDate === "string" ? new Date(toDate) : new Date(toDate || new Date());
          from.setHours(0, 0, 0, 0);
          to.setHours(23, 59, 59, 999);

          const inRange = (t) => {
            if (!t.date) return false;
            let d;
            if (typeof t.date === "string") {
              d = new Date(t.date);
            } else if (t.date.toDate) {
              d = t.date.toDate();
            } else {
              d = new Date(t.date);
            }
            if (isNaN(d.getTime())) return false;
            return d >= from && d <= to;
          };

          momoResults = momoResults.filter(inRange);
          bankResults = bankResults.filter(inRange);

          // Additional user filter fallback
          if (!isAdmin && userId) {
            momoResults = momoResults.filter((t) => t.recordedBy === userId);
            bankResults = bankResults.filter((t) => t.recordedBy === userId);
          }

          return { momo: momoResults, bank: bankResults };
        } catch (fallbackError) {
          console.error("Fallback getTransactionsByDateRange failed:", fallbackError);
          return { momo: [], bank: [] };
        }
      }
      throw error;
    }
  },
};

export const commissionService = {
  async createBankCommission(data) {
    const commissionId = generateId();
    const commissionData = {
      commissionId,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "bank_commissions"), commissionData);
    return commissionId;
  },

  async createMoMoCommission(data) {
    const commissionId = generateId();
    const commissionData = {
      commissionId,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "momo_ecash_commissions"), commissionData);
    return commissionId;
  },

  async getAll(filters = {}) {
    try {
      const collectionName = filters.type === "bank" ? "bank_commissions" : "momo_ecash_commissions";
      let q = query(collection(db, collectionName));

      if (filters.branchId) {
        q = query(q, where("branchId", "==", filters.branchId));
      }
      if (filters.date) {
        const dateStart = new Date(filters.date);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(filters.date);
        dateEnd.setHours(23, 59, 59, 999);
        q = query(q, where("date", ">=", Timestamp.fromDate(dateStart)), where("date", "<=", Timestamp.fromDate(dateEnd)));
      } else if (filters.dateFrom && filters.dateTo) {
        const dateStart = new Date(filters.dateFrom);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(filters.dateTo);
        dateEnd.setHours(23, 59, 59, 999);
        q = query(q, where("date", ">=", Timestamp.fromDate(dateStart)), where("date", "<=", Timestamp.fromDate(dateEnd)));
      }
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      handleFirestoreError(error, "commissionService.getAll");
      return [];
    }
  },
};

export const reconciliationService = {
  async create(data) {
    const reconciliationId = generateId();
    const reconciliationData = {
      reconciliationId,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now(),
      status: "pending",
      ...data,
    };
    await addDoc(collection(db, "daily_reconciliation"), reconciliationData);
    return reconciliationId;
  },

  async getByBranch(branchId, limitCount = 50) {
    try {
      // Try with orderBy first
      try {
        const q = query(
          collection(db, "daily_reconciliation"),
          where("branchId", "==", branchId),
          orderBy("createdAt", "desc"),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      } catch (orderByError) {
        // If orderBy fails (missing index), try without orderBy and sort in memory
        const result = handleFirestoreError(
          orderByError,
          "daily_reconciliation getByBranch (with orderBy)"
        );
        if (result === null) {
          // Query without orderBy
          const q = query(
            collection(db, "daily_reconciliation"),
            where("branchId", "==", branchId),
            limit(limitCount)
          );
          const snapshot = await getDocs(q);
          const recs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          // Sort in memory by createdAt (handle both Timestamp and plain date)
          recs.sort((a, b) => {
            const getTime = (val) => {
              if (!val) return 0;
              if (val.toDate) return val.toDate().getTime();
              if (val.seconds) return val.seconds * 1000;
              if (typeof val === "string") return new Date(val).getTime() || 0;
              return 0;
            };
            return getTime(b.createdAt) - getTime(a.createdAt);
          });
          return recs;
        }
        throw orderByError;
      }
    } catch (error) {
      const result = handleFirestoreError(error, "daily_reconciliation getByBranch");
      if (result === null) return [];
      throw error;
    }
  },

  async getByBranchAndDate(branchId, date, userId = null, userRole = null) {
    try {
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

      // Normal users can only see their own reconciliation data
      // Admins and IT admins should also only see their own (not all branch data)
      const isAdmin = userRole === "admin" || userRole === "branch_manager" || userRole === "it_admin";
      
      // For reconciliation privacy, even admins should only see their own reconciliation
      // Only branch managers can see all branch reconciliations
      let q = query(
      collection(db, "daily_reconciliation"),
      where("branchId", "==", branchId),
      where("date", ">=", Timestamp.fromDate(dateStart)),
      where("date", "<=", Timestamp.fromDate(dateEnd))
    );

      // Filter by user - only branch managers can see all, others see only their own
      if (!isAdmin || (isAdmin && userRole !== "branch_manager")) {
        if (userId) {
          q = query(
            collection(db, "daily_reconciliation"),
            where("branchId", "==", branchId),
            where("reconciledBy", "==", userId),
            where("date", ">=", Timestamp.fromDate(dateStart)),
            where("date", "<=", Timestamp.fromDate(dateEnd))
          );
        }
      }

      const snapshot = await getDocs(q).catch((err) => {
        handleFirestoreError(err, "daily_reconciliation getByBranchAndDate");
        return { docs: [] };
      });
      
    if (snapshot.empty) return null;
      
      // Additional in-memory filter for user privacy (fallback)
      let results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (!isAdmin || (isAdmin && userRole !== "branch_manager")) {
        if (userId) {
          results = results.filter(r => r.reconciledBy === userId);
        }
      }
      
      if (results.length === 0) return null;
      return results[0]; // Return first match
    } catch (error) {
      const result = handleFirestoreError(error, "daily_reconciliation getByBranchAndDate");
      if (result === null) return null;
      throw error;
    }
  },

  async updateStatus(reconciliationId, data) {
    if (!reconciliationId) return;
    const q = query(
      collection(db, "daily_reconciliation"),
      where("reconciliationId", "==", reconciliationId)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    const docRef = doc(db, "daily_reconciliation", snapshot.docs[0].id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
  },
};

export const expenseService = {
  async create(data) {
    const expenseId = generateId();
    const expenseData = {
      expenseId,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "expense_petty_cash"), expenseData);
    return expenseId;
  },

  async getByBranch(branchId, date = null) {
    try {
      // Try with orderBy first
      try {
    let q = query(
      collection(db, "expense_petty_cash"),
      where("branchId", "==", branchId),
      orderBy("date", "desc")
    );
    if (date) {
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);
      q = query(
        collection(db, "expense_petty_cash"),
        where("branchId", "==", branchId),
        where("date", ">=", Timestamp.fromDate(dateStart)),
        where("date", "<=", Timestamp.fromDate(dateEnd)),
        orderBy("date", "desc")
      );
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      } catch (orderByError) {
        // If orderBy fails (missing index), try without orderBy
        handleFirestoreError(orderByError, "expense_petty_cash getByBranch (with orderBy)");
        
        // Query without orderBy
        let q = query(
          collection(db, "expense_petty_cash"),
          where("branchId", "==", branchId)
        );
        
        if (date) {
          const dateStart = new Date(date);
          dateStart.setHours(0, 0, 0, 0);
          const dateEnd = new Date(date);
          dateEnd.setHours(23, 59, 59, 999);
          q = query(
            collection(db, "expense_petty_cash"),
            where("branchId", "==", branchId),
            where("date", ">=", Timestamp.fromDate(dateStart)),
            where("date", "<=", Timestamp.fromDate(dateEnd))
          );
        }
        
        const snapshot = await getDocs(q);
        let expenses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        
        // Sort in memory by date (handle both string and Timestamp)
        expenses.sort((a, b) => {
          const dateA = a.date?.toDate ? a.date.toDate().getTime() : (typeof a.date === 'string' ? new Date(a.date).getTime() : 0);
          const dateB = b.date?.toDate ? b.date.toDate().getTime() : (typeof b.date === 'string' ? new Date(b.date).getTime() : 0);
          return dateB - dateA; // Descending order
        });
        
        return expenses;
      }
    } catch (error) {
      const result = handleFirestoreError(error, "expense_petty_cash getByBranch");
      if (result === null) return [];
      throw error;
    }
  },
};

export const disbursementService = {
  async create(data) {
    const disbursementId = generateId();
    const disbursementData = {
      disbursementId,
      date: Timestamp.fromDate(new Date(data.date || new Date())),
      createdAt: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "disbursements"), disbursementData);
    return disbursementId;
  },

  async getLatestByBranch(branchId) {
    try {
      // Try with orderBy first
      try {
        const q = query(
          collection(db, "disbursements"),
          where("branchId", "==", branchId),
          orderBy("createdAt", "desc"),
          limit(1)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      } catch (orderByError) {
        // If orderBy fails (missing index), try without orderBy and sort in memory
        handleFirestoreError(orderByError, "disbursements getLatestByBranch (with orderBy)");
        const q = query(
          collection(db, "disbursements"),
          where("branchId", "==", branchId),
          limit(50) // Get more to sort in memory
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        
        // Sort by createdAt in memory
        const disbursements = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        disbursements.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return dateB - dateA; // Descending order
        });
        
        return disbursements[0] || null;
      }
    } catch (error) {
      const result = handleFirestoreError(error, "disbursements getLatestByBranch");
      if (result === null) return null;
      throw error;
    }
  },

  async getByBranch(branchId, limitCount = 50) {
    try {
      const q = query(
        collection(db, "disbursements"),
        where("branchId", "==", branchId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      const result = handleFirestoreError(error, "disbursements getByBranch");
      if (result === null) return [];
      throw error;
    }
  },
};

// Disbursement Types - allow branches to define custom disbursement buttons/forms
export const disbursementTypeService = {
  async create(data) {
    const typeId = generateId();
    const typeData = {
      typeId,
      createdAt: Timestamp.now(),
      status: "active",
      ...data,
    };
    await addDoc(collection(db, "disbursement_types"), typeData);
    return typeId;
  },

  async getByBranch(branchId) {
    try {
      const q = query(
        collection(db, "disbursement_types"),
        where("branchId", "==", branchId),
        where("status", "==", "active")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      const result = handleFirestoreError(error, "disbursement_types getByBranch");
      if (result === null) return [];
      throw error;
    }
  },

  async archive(typeId) {
    // Soft-delete / deactivate a type
    const q = query(
      collection(db, "disbursement_types"),
      where("typeId", "==", typeId)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    await updateDoc(doc(db, "disbursement_types", snapshot.docs[0].id), {
      status: "inactive",
      updatedAt: Timestamp.now(),
    });
  },
};

export const simSaleService = {
  async create(data) {
    const saleId = generateId();
    const saleData = {
      saleId,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "sim_sales"), saleData);
    return saleId;
  },
};

export const cashMovementService = {
  async create(data) {
    const movementId = generateId();
    const movementData = {
      movementId,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "cash_movements"), movementData);
    return movementId;
  },

  async getByBranch(branchId, date = null) {
    try {
    let q = query(
      collection(db, "cash_movements"),
      where("branchId", "==", branchId),
      orderBy("date", "desc")
    );
    if (date) {
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);
      q = query(
        collection(db, "cash_movements"),
        where("branchId", "==", branchId),
        where("date", ">=", Timestamp.fromDate(dateStart)),
        where("date", "<=", Timestamp.fromDate(dateEnd)),
        orderBy("date", "desc")
      );
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      const result = handleFirestoreError(error, "cash_movements getByBranch");
      if (result === null) return [];
      throw error;
    }
  },
};

export const generalDailyCommissionService = {
  async create(data) {
    const commissionId = generateId();
    const commissionData = {
      commissionId,
      date: Timestamp.fromDate(new Date(data.date)),
      createdAt: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "general_daily_commission"), commissionData);
    return commissionId;
  },

  async getByBranchAndDate(branchId, date) {
    try {
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, "general_daily_commission"),
      where("branchId", "==", branchId),
      where("date", ">=", Timestamp.fromDate(dateStart)),
      where("date", "<=", Timestamp.fromDate(dateEnd))
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    } catch (error) {
      const result = handleFirestoreError(error, "general_daily_commission getByBranchAndDate");
      if (result === null) return null;
      throw error;
    }
  },

  async getByBranch(branchId, limitCount = 30) {
    try {
    const q = query(
      collection(db, "general_daily_commission"),
      where("branchId", "==", branchId),
      orderBy("date", "desc"),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      const result = handleFirestoreError(error, "general_daily_commission getByBranch");
      if (result === null) return [];
      throw error;
    }
  },
};

export const activityLogService = {
  async log(data) {
    const logData = {
      timestamp: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "activity_logs"), logData);
  },

  async getAll(filters = {}) {
    try {
    let q = query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(1000));

    if (filters.userId) {
      q = query(q, where("userId", "==", filters.userId));
    }
    if (filters.branchId) {
      q = query(q, where("branchId", "==", filters.branchId));
    }
    if (filters.actionType) {
      q = query(q, where("actionType", "==", filters.actionType));
    }
    if (filters.dateFrom) {
      const dateStart = new Date(filters.dateFrom);
      dateStart.setHours(0, 0, 0, 0);
      q = query(q, where("timestamp", ">=", Timestamp.fromDate(dateStart)));
    }
    if (filters.dateTo) {
      const dateEnd = new Date(filters.dateTo);
      dateEnd.setHours(23, 59, 59, 999);
      q = query(q, where("timestamp", "<=", Timestamp.fromDate(dateEnd)));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      const result = handleFirestoreError(error, "activity_logs getAll");
      // Fallback when index is missing: load by branch/user without date ordering and filter in memory
      if (result === null) {
        try {
          console.warn("activity_logs getAll: Using fallback (no index) — in-memory date filtering");
          let fallbackQ = collection(db, "activity_logs");
          const constraints = [];
          if (filters.branchId) constraints.push(where("branchId", "==", filters.branchId));
          if (filters.userId) constraints.push(where("userId", "==", filters.userId));
          if (filters.actionType) constraints.push(where("actionType", "==", filters.actionType));
          // No orderBy to avoid composite index; limit to 1000
          fallbackQ = constraints.length
            ? query(fallbackQ, ...constraints, limit(1000))
            : query(fallbackQ, limit(1000));

          const snapshot = await getDocs(fallbackQ);
          let results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

          // In-memory date filtering
          if (filters.dateFrom) {
            const dateStart = new Date(filters.dateFrom);
            dateStart.setHours(0, 0, 0, 0);
            results = results.filter((r) => {
              const ts = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
              return ts >= dateStart;
            });
          }
          if (filters.dateTo) {
            const dateEnd = new Date(filters.dateTo);
            dateEnd.setHours(23, 59, 59, 999);
            results = results.filter((r) => {
              const ts = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
              return ts <= dateEnd;
            });
          }

          // Sort in memory by timestamp desc
          results.sort((a, b) => {
            const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
            const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
            return tb - ta;
          });

          return results;
        } catch (fallbackError) {
          console.error("Fallback activity_logs getAll failed:", fallbackError);
          return [];
        }
      }
      throw error;
    }
  },
};

export const topUpService = {
  async create(data) {
    const topUpId = generateId();
    const topUpData = {
      topUpId,
      date: Timestamp.fromDate(new Date(data.date || new Date())),
      time: data.time || new Date().toLocaleTimeString(),
      createdAt: Timestamp.now(),
      ...data,
    };
    await addDoc(collection(db, "float_topups"), topUpData);
    return topUpId;
  },

  async getByBranchAndDate(branchId, date) {
    try {
      const dateString = new Date(date).toISOString().split("T")[0];
      
      // Try string date query first
      try {
        const q = query(
          collection(db, "float_topups"),
          where("branchId", "==", branchId),
          where("date", "==", dateString)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      } catch (stringError) {
        handleFirestoreError(stringError, "float_topups getByBranchAndDate (string)");
        
        // Fallback: Try Timestamp query
        const dateStart = new Date(date);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(date);
        dateEnd.setHours(23, 59, 59, 999);
        const q = query(
          collection(db, "float_topups"),
          where("branchId", "==", branchId),
          where("date", ">=", Timestamp.fromDate(dateStart)),
          where("date", "<=", Timestamp.fromDate(dateEnd))
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      }
    } catch (error) {
      handleFirestoreError(error, "float_topups getByBranchAndDate");
      return [];
    }
  },

  async getByBranch(branchId, limitCount = 100) {
    try {
      try {
        const q = query(
          collection(db, "float_topups"),
          where("branchId", "==", branchId),
          orderBy("createdAt", "desc"),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      } catch (orderByError) {
        handleFirestoreError(orderByError, "float_topups getByBranch (with orderBy)");
        const q = query(
          collection(db, "float_topups"),
          where("branchId", "==", branchId),
          limit(limitCount)
        );
        const snapshot = await getDocs(q);
        const topUps = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        // Sort in memory
        topUps.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return dateB - dateA;
        });
        return topUps;
      }
    } catch (error) {
      handleFirestoreError(error, "float_topups getByBranch");
      return [];
    }
  },
};

const SYSTEM_SETTINGS_DOC_ID = "global";

function stripUndefinedFromObject(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export const systemSettingsService = {
  async get() {
    const snap = await getDoc(doc(db, "system_settings", SYSTEM_SETTINGS_DOC_ID));
    return snap.exists() ? snap.data() : null;
  },
  async update(data) {
    const payload = stripUndefinedFromObject({ ...data, updatedAt: Timestamp.now() });
    await setDoc(doc(db, "system_settings", SYSTEM_SETTINGS_DOC_ID), payload, { merge: true });
  },
};

export const businessScreenAccessService = {
  async get(businessId) {
    const snap = await getDoc(doc(db, "business_screen_access", businessId));
    return snap.exists() ? (snap.data().screens || []) : [];
  },
  async set(businessId, screens) {
    await setDoc(doc(db, "business_screen_access", businessId), { screens, updatedAt: Timestamp.now() }, { merge: true });
  },
};

export const userScreenAccessService = {
  async get(userId, branchId) {
    const key = `${userId}_${branchId}`;
    const snap = await getDoc(doc(db, "user_screen_access", key));
    return snap.exists() ? (snap.data().screens || []) : null;
  },
  async set(userId, branchId, screens) {
    const key = `${userId}_${branchId}`;
    await setDoc(doc(db, "user_screen_access", key), { userId, branchId, screens, updatedAt: Timestamp.now() }, { merge: true });
  },
};

export const supportTicketService = {
  async create(data) {
    const ref = await addDoc(collection(db, "support_tickets"), {
      ...data,
      createdAt: Timestamp.now(),
      status: "open",
    });
    return ref.id;
  },
  async getByUser(userId) {
    const q = query(collection(db, "support_tickets"), where("fromUserId", "==", userId), orderBy("createdAt", "desc"), limit(100));
    try {
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      handleFirestoreError(e, "support_tickets getByUser");
      const q2 = query(collection(db, "support_tickets"), where("fromUserId", "==", userId), limit(100));
      const snap = await getDocs(q2);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0));
      return list;
    }
  },
  async getAllForAdmin(limitCount = 200) {
    const q = query(collection(db, "support_tickets"), orderBy("createdAt", "desc"), limit(limitCount));
    try {
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      handleFirestoreError(e, "support_tickets getAll");
      const snap = await getDocs(collection(db, "support_tickets"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0));
      return list.slice(0, limitCount);
    }
  },
  async respond(ticketId, responseText, respondedBy) {
    await updateDoc(doc(db, "support_tickets", ticketId), {
      response: responseText,
      respondedAt: Timestamp.now(),
      respondedBy,
      status: "closed",
    });
  },
};

export const contactMessageService = {
  async create(data) {
    const ref = await addDoc(collection(db, "contact_messages"), { ...data, createdAt: Timestamp.now(), status: "new" });
    return ref.id;
  },
  async getAllForAdmin(limitCount = 200) {
    const q = query(collection(db, "contact_messages"), orderBy("createdAt", "desc"), limit(limitCount));
    try {
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      const snap = await getDocs(collection(db, "contact_messages"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0));
      return list.slice(0, limitCount);
    }
  },
  async respond(messageId, responseText, respondedBy) {
    await updateDoc(doc(db, "contact_messages", messageId), {
      response: responseText,
      respondedAt: Timestamp.now(),
      respondedBy,
      status: "replied",
    });
  },
};

export const reportBugService = {
  async create(data) {
    const ref = await addDoc(collection(db, "report_bug"), { ...data, createdAt: Timestamp.now(), status: "new" });
    return ref.id;
  },
  async getAllForAdmin(limitCount = 200) {
    const q = query(collection(db, "report_bug"), orderBy("createdAt", "desc"), limit(limitCount));
    try {
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      const snap = await getDocs(collection(db, "report_bug"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0));
      return list.slice(0, limitCount);
    }
  },
  async respond(messageId, responseText, respondedBy) {
    await updateDoc(doc(db, "report_bug", messageId), {
      response: responseText,
      respondedAt: Timestamp.now(),
      respondedBy,
      status: "replied",
    });
  },
};

const HUBTEL_SMS_ENDPOINT = "https://smsc.hubtel.com/v1/messages/send";
const HUBTEL_CLIENT_ID = "vxojxzbs";
const HUBTEL_CLIENT_SECRET = "uznaitfd";
const OTP_EXPIRY_MINUTES = 5;
const OTP_DISABLE_HOURS = 24;

export function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendSMS(phoneNumber, message) {
  const settings = await systemSettingsService.get();
  const from = settings?.smsSenderId || settings?.hubtelSenderId || "Methodist";
  const auth = btoa(`${HUBTEL_CLIENT_ID}:${HUBTEL_CLIENT_SECRET}`);
  const raw = (phoneNumber || "").trim().replace(/\s/g, "");
  const digits = raw.replace(/\D/g, "");
  const to = digits.startsWith("233") ? digits : digits.startsWith("0") ? digits : digits ? "233" + digits : "";
  const res = await fetch(HUBTEL_SMS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      From: from,
      To: to || raw,
      Content: message,
    }),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(data.statusDescription || data.message || `SMS failed: ${res.status} ${text}`);
  }
  if (data.status !== undefined && data.status !== 0 && data.status !== 1) {
    throw new Error(data.statusDescription || data.message || "SMS delivery failed");
  }
  return data;
}

export const otpService = {
  async saveOTP(email, otp, phoneNumber) {
    const ref = doc(collection(db, "otp"));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await setDoc(ref, {
      email: email.toLowerCase().trim(),
      otp,
      phoneNumber,
      used: false,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(expiresAt),
    });
    return ref.id;
  },
  async getByEmail(email) {
    const q = query(
      collection(db, "otp"),
      where("email", "==", (email || "").toLowerCase().trim()),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async markUsed(docId) {
    await updateDoc(doc(db, "otp", docId), {
      used: true,
      usedAt: Timestamp.now(),
    });
  },
};

export const otpDisableService = {
  async checkActive(email) {
    const q = query(
      collection(db, "otp_disable"),
      where("email", "==", (email || "").toLowerCase().trim()),
      where("disableUntil", ">", Timestamp.now()),
      limit(1)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  },
  async add(email, reason, requestedByName) {
    const now = new Date();
    const disableUntil = new Date(now.getTime() + OTP_DISABLE_HOURS * 60 * 60 * 1000);
    await addDoc(collection(db, "otp_disable"), {
      email: (email || "").toLowerCase().trim(),
      reason: reason || "",
      requestedByName: requestedByName || "",
      disableUntil: Timestamp.fromDate(disableUntil),
      createdAt: Timestamp.now(),
    });
  },
};

