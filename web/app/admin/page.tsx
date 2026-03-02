import type { Metadata } from "next";
import EnterpriseAdminHub from "../components/EnterpriseAdminHub";

export const metadata: Metadata = {
    title: "Enterprise Admin Hub | Complyze",
    description: "Manage device fleet, groups, users, policies, and enrollment tokens across your organization.",
};

export default function AdminPage() {
    return (
        <div className="min-h-screen">
            <EnterpriseAdminHub />
        </div>
    );
}
