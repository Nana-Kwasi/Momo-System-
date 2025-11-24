# MoMo Agency Management System

A comprehensive multi-tenant RBAC system for managing mobile money agent businesses in Ghana. The system manages multiple agent businesses, their branches, daily float operations, commissions, and transactions.

## Features

- **Multi-Tenant Architecture**: Support for multiple agent businesses
- **Role-Based Access Control**: IT Admin, Branch Manager, and Agent User roles
- **Mobile Money Operations**: MTN, Vodafone, AirtelTigo, Telecel support
- **Banking Services**: Ecobank, Fidelity, First Bank, GCB integration
- **Float Management**: Daily opening and closing float tracking
- **Reconciliation**: System vs actual balance reconciliation
- **Transaction Recording**: Comprehensive transaction management
- **Commission Tracking**: Automated commission calculations
- **Reporting**: Daily, weekly, monthly, and custom reports
- **Activity Logging**: Complete audit trail

## Tech Stack

- React.js
- Firebase (Firestore, Authentication)
- Tailwind CSS
- shadcn/ui components
- React Router
- Recharts for data visualization

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Firebase:
   - Copy `.env.example` to `.env`
   - Add your Firebase configuration values

3. Start development server:
```bash
npm start
```

## Project Structure

```
src/
├── components/
│   ├── ui/          # Reusable UI components
│   └── layout/      # Layout components (Sidebar, Layout)
├── pages/           # Page components
├── services/        # Firestore service layer
├── context/         # React context (Auth)
├── hooks/           # Custom hooks
├── utils/           # Utility functions
└── lib/             # Third-party library configs
```

## User Roles

- **IT Admin**: Full system access, can manage businesses, users, and branches
- **Branch Manager**: Can manage users and branches within their business
- **Agent User**: Can record transactions, manage float, and view reports

## Collections

The system uses the following Firestore collections:
- agent_businesses
- branches
- users
- daily_float
- daily_reconciliation
- momo_transactions
- bank_transactions
- commissions_tracking
- expense_petty_cash
- sim_sales
- And more...

## License

MIT
