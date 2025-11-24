import React from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { X } from "lucide-react";

export default function PrivacyPolicyModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-2xl font-bold">Privacy Policy</CardTitle>
            <CardDescription>Last updated: {new Date().toLocaleDateString()}</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">1. Introduction</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Welcome to the MoMo Agency Management System. We are committed to protecting your privacy and 
              ensuring the security of your personal information. This Privacy Policy explains how we collect, 
              use, disclose, and safeguard your information when you use our system.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">2. Information We Collect</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Personal identification information (name, email address, phone number)</li>
              <li>Business and branch information</li>
              <li>Transaction data and financial records</li>
              <li>Account credentials and authentication information</li>
              <li>Usage data and system activity logs</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">3. How We Use Your Information</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              We use the collected information for the following purposes:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>To provide and maintain our services</li>
              <li>To process transactions and manage accounts</li>
              <li>To authenticate users and ensure system security</li>
              <li>To generate reports and analytics</li>
              <li>To comply with legal obligations and regulatory requirements</li>
              <li>To improve our services and user experience</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">4. Data Security</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We implement appropriate technical and organizational security measures to protect your personal 
              information against unauthorized access, alteration, disclosure, or destruction. This includes 
              encryption, secure authentication, access controls, and regular security audits.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">5. Data Retention</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We retain your personal information only for as long as necessary to fulfill the purposes 
              outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. 
              Transaction records and financial data are retained in accordance with regulatory requirements.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">6. Data Sharing and Disclosure</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We do not sell, trade, or rent your personal information to third parties. We may share your 
              information only in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4 mt-2">
              <li>With your explicit consent</li>
              <li>To comply with legal obligations or court orders</li>
              <li>To protect our rights, privacy, safety, or property</li>
              <li>With service providers who assist in operating our system (under strict confidentiality agreements)</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">7. Your Rights</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              You have the right to:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Access and review your personal information</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your personal information (subject to legal requirements)</li>
              <li>Object to processing of your personal information</li>
              <li>Request data portability</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">8. Cookies and Tracking</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Our system may use cookies and similar tracking technologies to enhance user experience, 
              analyze usage patterns, and maintain session information. You can control cookie preferences 
              through your browser settings.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">9. Changes to This Privacy Policy</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by 
              posting the new Privacy Policy on this page and updating the "Last updated" date. You are 
              advised to review this Privacy Policy periodically for any changes.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">10. Contact Us</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, please contact us at:
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Email: privacy@momoagency.com<br />
              Phone: +233 XX XXX XXXX
            </p>
          </div>

          <div className="pt-4 border-t">
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

