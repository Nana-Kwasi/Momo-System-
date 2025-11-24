import { agentBusinessService, branchService } from "../services/firestoreService";

const seedBusinessAndBranch = async () => {
  try {
    console.log("Creating Francis Agency business...");
    
    const businessData = {
      businessName: "Francis Agency",
      businessAbbreviation: "FRAN",
      ownerName: "Francis Kontoh",
      ownerPhone: "0244123456",
      ownerEmail: "francis@francisagency.com",
      ghanaCardNumber: "GHA-123456789-0",
      businessRegistrationNumber: "C123456789",
      tinNumber: "TIN123456789",
      physicalAddress: "123 Main Street, Accra",
      region: "Greater Accra",
      city: "Accra",
      digitalAddress: "GA-123-4567",
      agentCodes: {
        mtnAgentCode: "MTN123456",
        vodafoneAgentCode: "VOD123456",
        airtelTigoAgentCode: "AT123456",
        telecelAgentCode: "TEL123456",
      },
      bankAgentCodes: {
        ecobankAgentCode: "ECO123456",
        fidelityAgentCode: "FID123456",
        firstBankAgentCode: "FBN123456",
        gcbAgentCode: "GCB123456",
      },
      commissionRates: {
        mtn: "1.5",
        vodafone: "1.5",
        airtelTigo: "1.5",
        telecel: "1.5",
      },
      status: "active",
      createdBy: "system",
    };

    const businessId = await agentBusinessService.create(businessData);
    console.log("✅ Business created successfully!");
    console.log("Business ID:", businessId);
    console.log("Business Name:", businessData.businessName);

    console.log("\nCreating branch for Francis Agency...");
    
    const branchCode = `FRAN${Math.floor(1000 + Math.random() * 9000)}`;
    
    const branchData = {
      businessId: businessId,
      branchName: "Head Office",
      branchCode: branchCode,
      branchManager: "Francis Kontoh",
      branchPhone: "0244123456",
      branchEmail: "headoffice@francisagency.com",
      physicalAddress: "123 Main Street, Accra",
      region: "Greater Accra",
      city: "Accra",
      landmark: "Near Central Market",
      openingDate: new Date().toISOString().split("T")[0],
      operatingHours: "08:00 - 18:00",
      floatLimit: "50000",
      mtnAgentNumber: "MTN123456",
      vodafoneAgentNumber: "VOD123456",
      airtelTigoAgentNumber: "AT123456",
      telecelAgentNumber: "TEL123456",
      ecobankAgentNumber: "ECO123456",
      fidelityAgentNumber: "FID123456",
      firstBankAgentNumber: "FBN123456",
      gcbAgentNumber: "GCB123456",
      status: "active",
      createdBy: "system",
    };

    const branchId = await branchService.create(branchData);
    console.log("✅ Branch created successfully!");
    console.log("Branch ID:", branchId);
    console.log("Branch Name:", branchData.branchName);
    console.log("Branch Code:", branchData.branchCode);

    return {
      success: true,
      businessId,
      branchId,
      businessName: businessData.businessName,
      branchName: branchData.branchName,
    };
  } catch (error) {
    console.error("❌ Error seeding business and branch:", error);
    throw error;
  }
};

export default seedBusinessAndBranch;

