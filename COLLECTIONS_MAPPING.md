# Firestore Collections Mapping & Report Data Sources

## All Collections in the System

Based on codebase analysis and Firebase console, here are ALL collections:

1. **agent_businesses** - Business/company information
2. **branches** - Branch locations and details
3. **users** - User accounts and profiles
4. **daily_float** - Daily opening/closing float records
5. **daily_reconciliation** - Daily reconciliation records
6. **momo_transactions** - Mobile Money (MoMo) transactions
7. **bank_transactions** - Bank transactions
8. **bank_commissions** - Bank commission records
9. **momo_ecash_commissions** - MoMo e-cash commission records
10. **expense_petty_cash** - Petty cash expenses
11. **disbursements** - Cash disbursements
12. **disbursement_types** - Custom disbursement type definitions
13. **sim_sales** - SIM card and airtime sales
14. **cash_movements** - Cash movement records
15. **general_daily_commission** - General daily commission summaries
16. **activity_logs** - System activity/audit logs
17. **merchant_sims** - Merchant SIM card registrations

---

## Report Data Sources

### 1. Date Range Report (`date_range`)
**Collections Used:**
- ✅ `momo_transactions` - via `transactionService.getTransactionsByDateRange()`
- ✅ `bank_transactions` - via `transactionService.getTransactionsByDateRange()`

**Data Fields Accessed:**
- `date`, `time`, `transactionType`, `amount`, `commissionEarned`
- `provider` (for MoMo), `bankName` (for Bank)
- `customerName`, `customerNumber`
- `recordedBy` (for user filtering)

**Status:** ✅ CORRECT - Using correct collections

---

### 2. Branch Comparison Report (`branch_comparison`)
**Collections Used:**
- ✅ `branches` - via `branchService.getByBusinessId()`
- ✅ `momo_transactions` - via `transactionService.getTransactionsByDateRange()` per branch
- ✅ `bank_transactions` - via `transactionService.getTransactionsByDateRange()` per branch

**Data Fields Accessed:**
- From `branches`: `branchId`, `branchName`, `businessId`
- From transactions: `amount`, `date` (for filtering)

**Status:** ✅ CORRECT - Using correct collections

---

### 3. User Performance Report (`user_performance`)
**Collections Used:**
- ✅ `users` - via `userService.getAll(businessId, branchId)`
- ✅ `momo_transactions` - via `transactionService.getTransactionsByDateRange()` per user
- ✅ `bank_transactions` - via `transactionService.getTransactionsByDateRange()` per user

**Data Fields Accessed:**
- From `users`: `userId`, `name`, `email`, `businessId`, `branchId`
- From transactions: `amount`, `date`, `recordedBy` (for filtering)

**Status:** ✅ CORRECT - Using correct collections

---

### 4. Provider Analysis Report (`provider_analysis`)
**Collections Used:**
- ✅ `momo_transactions` - via `transactionService.getTransactionsByDateRange()`
- ✅ `bank_transactions` - via `transactionService.getTransactionsByDateRange()`

**Data Fields Accessed:**
- `provider` (from MoMo transactions) - e.g., "MTN", "Vodafone", "AirtelTigo", "Telecel"
- `bankName` (from Bank transactions) - e.g., "GCB Bank", "Ecobank", etc.
- `amount` (for totaling)

**Status:** ✅ CORRECT - Using correct collections

---

### 5. Financial Summary Report (`financial_summary`)
**Collections Used:**
- ✅ `momo_transactions` - via `transactionService.getTransactionsByDateRange()`
- ✅ `bank_transactions` - via `transactionService.getTransactionsByDateRange()`

**Data Fields Accessed:**
- `amount` (for totaling MoMo and Bank separately)
- `commissionEarned` (from MoMo transactions)
- `date` (for filtering)

**Status:** ✅ CORRECT - Using correct collections

---

### 6. Audit Trail Report (`audit_trail`)
**Collections Used:**
- ✅ `activity_logs` - via `activityLogService.getAll()`

**Data Fields Accessed:**
- `timestamp` (for date filtering)
- `actionType` or `action` (for grouping)
- `userId`, `branchId` (for filtering)
- `userName`, `details`, `description`, `message`, `status`

**Status:** ✅ CORRECT - Using correct collection

---

## Collection Name Verification

All collection names match exactly with Firebase console:
- ✅ `momo_transactions` (not `momo_transaction`)
- ✅ `bank_transactions` (not `bank_transaction`)
- ✅ `daily_float` (not `daily_floats`)
- ✅ `daily_reconciliation` (not `daily_reconciliations`)
- ✅ `expense_petty_cash` (not `expenses` or `petty_cash`)
- ✅ `sim_sales` (not `sim_sale`)
- ✅ `merchant_sims` (not `merchant_sim`)
- ✅ `activity_logs` (not `activity_log`)

---

## Summary

All 6 custom report types are using the **correct collection names** that match your Firebase console:
- Date Range Report: ✅ `momo_transactions`, `bank_transactions`
- Branch Comparison Report: ✅ `branches`, `momo_transactions`, `bank_transactions`
- User Performance Report: ✅ `users`, `momo_transactions`, `bank_transactions`
- Provider Analysis Report: ✅ `momo_transactions`, `bank_transactions`
- Financial Summary Report: ✅ `momo_transactions`, `bank_transactions`
- Audit Trail Report: ✅ `activity_logs`

No collection name mismatches found. All reports are correctly configured.

