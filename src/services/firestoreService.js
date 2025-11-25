import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
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

export const transactionService = {
  async createMoMoTransaction(data) {
    const transactionId = generateId();
    const transactionData = {
      transactionId,
      date: Timestamp.fromDate(new Date(data.date)),
      time: data.time || new Date().toLocaleTimeString(),
      createdAt: Timestamp.now(),
      ...data,
    };
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
      if (result === null) return [];
      throw error;
    }
  },
};

