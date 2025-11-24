import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/login")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
            <CardTitle className="text-3xl font-bold">About Us</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-4">MoMo Agency Management System</h2>
            <p className="text-muted-foreground leading-relaxed">
              The MoMo Agency Management System is a comprehensive digital solution designed to streamline 
              and manage mobile money (MoMo) agency operations efficiently. Our platform provides real-time 
              transaction tracking, float management, reconciliation, and comprehensive reporting capabilities 
              for mobile money agents and their administrators.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">Our Mission</h3>
            <p className="text-muted-foreground leading-relaxed">
              To empower mobile money agents with cutting-edge technology that simplifies daily operations, 
              enhances accuracy, and provides actionable insights for better business decisions. We are committed 
              to delivering reliable, secure, and user-friendly solutions that drive operational excellence.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">Key Features</h3>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Real-time transaction recording and tracking</li>
              <li>Comprehensive float management (opening and closing)</li>
              <li>Automated daily reconciliation</li>
              <li>Multi-provider support (MTN, Vodafone, AirtelTigo, Telecel)</li>
              <li>Merchant SIM management for multiple accounts</li>
              <li>Role-based access control for secure operations</li>
              <li>Detailed reporting and analytics</li>
              <li>Activity logging and audit trails</li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">Who We Serve</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our system is designed for mobile money agents, branch managers, administrators, and IT 
              administrators who need a robust platform to manage their MoMo operations. Whether you're 
              a single agent or managing multiple branches, our scalable solution adapts to your needs.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">Technology</h3>
            <p className="text-muted-foreground leading-relaxed">
              Built with modern web technologies, our platform ensures fast, secure, and reliable access 
              from any device. We prioritize data security, user experience, and system reliability in 
              everything we build.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

