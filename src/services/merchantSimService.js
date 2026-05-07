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
    if (!data.provider) {
      throw new Error("provider is required");
    }
    if (!data.simName) {
      throw new Error("simName is required");
    }

    const merchantSimId = generateId();
    const merchantSimData = {
      merchantSimId,
      branchId: data.branchId || "unassigned",
      businessId: data.businessId || null,
      provider: data.provider, // MTN, AirtelTigo, Telecel
      simName: data.simName.trim(), // e.g., "MTN33", "MTN34"
      agentNumber: (data.agentNumber || "").trim(),
      createdAt: Timestamp.now(),
      status: "active",
    };

    await addDoc(collection(db, "merchant_sims"), merchantSimData);
    return merchantSimId;
  },

  async getByBranch(branchId, businessId = null) {
    try {
      const queries = [];

      // Branch-specific active SIMs
      if (branchId) {
        queries.push(
          getDocs(
            query(
              collection(db, "merchant_sims"),
              where("branchId", "==", branchId),
              where("status", "==", "active")
            )
          )
        );
      }

      // Business-level unassigned SIMs (to sync across screens)
      if (businessId) {
        queries.push(
          getDocs(
            query(
              collection(db, "merchant_sims"),
              where("businessId", "==", businessId),
              where("branchId", "==", "unassigned"),
              where("status", "==", "active")
            )
          )
        );
      }

      const snapshots = await Promise.all(queries);
      const sims = snapshots.flatMap((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      return sims;
    } catch (error) {
      console.error("Error getting merchant SIMs:", error);
      return [];
    }
  },

  async getByBranchAndProvider(branchId, provider, businessId = null) {
    try {
      const sims = await this.getByBranch(branchId, businessId);
      return sims.filter((s) => s.provider === provider && s.status === "active");
    } catch (error) {
      console.error("Error getting merchant SIMs by provider:", error);
      return [];
    }
  },

  async getUnassignedByBusiness(businessId) {
    if (!businessId) return [];
    try {
      const snap = await getDocs(
        query(
          collection(db, "merchant_sims"),
          where("businessId", "==", businessId),
          where("branchId", "==", "unassigned"),
          where("status", "==", "active")
        )
      );
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error getting unassigned merchant SIMs by business:", error);
      return [];
    }
  },

  async syncBusinessSims(businessId, sims) {
    if (!businessId) return;
    const existing = await this.getUnassignedByBusiness(businessId);
    const existingMap = new Map(existing.map((s) => [s.merchantSimId, s]));

    const incomingIds = new Set(
      sims
        .map((s) => s.merchantSimId)
        .filter(Boolean)
    );

    // Deactivate removed sims
    for (const sim of existing) {
      if (!incomingIds.has(sim.merchantSimId)) {
        await this.update(sim.merchantSimId, { status: "inactive" });
      }
    }

    // Upsert incoming sims
    for (const sim of sims) {
      if (sim.merchantSimId && existingMap.has(sim.merchantSimId)) {
        await this.update(sim.merchantSimId, {
          provider: sim.provider,
          simName: sim.simName,
          agentNumber: sim.agentNumber || "",
          status: "active",
        });
      } else {
        await this.create({
          businessId,
          provider: sim.provider,
          simName: sim.simName,
          agentNumber: sim.agentNumber || "",
        });
      }
    }
  },

  async syncBranchSims(branchId, businessId, sims) {
    if (!branchId) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, "merchant_sims"),
          where("branchId", "==", branchId),
          where("status", "==", "active")
        )
      );
      const existing = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const existingMap = new Map(existing.map((s) => [s.merchantSimId, s]));

      const incomingIds = new Set(
        sims
          .map((s) => s.merchantSimId)
          .filter(Boolean)
      );

      // Deactivate removed sims
      for (const sim of existing) {
        if (!incomingIds.has(sim.merchantSimId)) {
          await this.update(sim.merchantSimId, { status: "inactive" });
        }
      }

      // Upsert incoming sims
      for (const sim of sims) {
        if (sim.merchantSimId && existingMap.has(sim.merchantSimId)) {
          await this.update(sim.merchantSimId, {
            provider: sim.provider,
            simName: sim.simName,
            agentNumber: sim.agentNumber || "",
            status: "active",
          });
        } else {
          await this.create({
            branchId,
            businessId,
            provider: sim.provider,
            simName: sim.simName,
            agentNumber: sim.agentNumber || "",
          });
        }
      }
    } catch (error) {
      console.error("Error syncing branch merchant SIMs:", error);
    }
  },

  async propagateNameChange(merchantSimId, newName) {
    if (!merchantSimId || !newName) return;
    const collectionsToUpdate = [
      { name: "momo_transactions", field: "merchantSimName" },
      { name: "sim_sales", field: "merchantSimName" },
      { name: "momo_ecash_commissions", field: "merchantSimName" },
    ];

    try {
      await Promise.all(
        collectionsToUpdate.map(async ({ name, field }) => {
          const snap = await getDocs(
            query(collection(db, name), where("merchantSimId", "==", merchantSimId))
          );
          for (const d of snap.docs) {
            await updateDoc(doc(db, name, d.id), { [field]: newName });
          }
        })
      );
    } catch (error) {
      console.error("Error propagating merchant SIM name change:", error);
    }
  },

  async updateNameEverywhere(merchantSimId, newName) {
    await this.update(merchantSimId, { simName: newName });
    await this.propagateNameChange(merchantSimId, newName);
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

