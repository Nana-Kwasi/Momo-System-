import React from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { X } from "lucide-react";

export default function TermsModal({ onClose, content }) {
  const body = content && content.trim() ? content : "Terms and Conditions. Content is managed by IT Admin in Settings.";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-2xl font-bold">Terms & Conditions</CardTitle>
            <CardDescription>Last updated: {new Date().toLocaleDateString()}</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{body}</div>
          <div className="pt-4 border-t mt-4">
            <Button onClick={onClose} className="w-full">Close</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
