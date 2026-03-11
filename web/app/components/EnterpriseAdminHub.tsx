"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/hooks/use-toast";
import { ToastContainer } from "./ToastContainer";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { AI_TOOL_REGISTRY } from "@/lib/ai-tool-registry";

interface Organization { id: string; name: string; plan?: string; }
interface Group { group_id: string; org_id: string; name: string; policy_id: string | null; }
interface ManagedUser { user_id: string; org_id: string; group_id: string | null; email: string; display_name?: string; active: boolean; }
interface ExtensionStatus { status: string; }
interface PolicyRule { rule_id: string; type: string; target: string; action: "block" | "allow" | "audit_only" | "redact"; priority: number; enabled: boolean; }

const ACTIONS: PolicyRule["action"][] = ["block", "allow", "audit_only", "redact"];

export default function EnterpriseAdminHub() {
  const { user } = useAuth();
  const wid = user?.uid || "default";
  const { toasts, toast, dismiss } = useToast();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [devices, setDevices] = useState<ExtensionStatus[]>([]);

  const [policyTarget, setPolicyTarget] = useState<"org" | "group" | "user">("org");
  const [activeGroupId, setActiveGroupId] = useState("");
  const [activeUserId, setActiveUserId] = useState("");
  const [policyMap, setPolicyMap] = useState<Record<string, PolicyRule[]>>({});

  const [selectedTool, setSelectedTool] = useState("chatgpt");
  const [selectedAction, setSelectedAction] = useState<PolicyRule["action"]>("block");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [groupListOpen, setGroupListOpen] = useState(false);

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserGroup, setNewUserGroup] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const activeOrg = useMemo(() => organizations.find((o) => o.id === activeOrgId), [organizations, activeOrgId]);
  const activeExtensions = useMemo(() => devices.filter((d) => d.status === "active" || d.status === "Healthy").length, [devices]);

  const policyKey = useMemo(() => {
    if (policyTarget === "org") return `org:${activeOrgId}`;
    if (policyTarget === "group") return `group:${activeGroupId}`;
    return `user:${activeUserId}`;
  }, [policyTarget, activeGroupId, activeOrgId, activeUserId]);

  const currentPolicy = policyMap[policyKey] || [];

  const fetchOrgs = useCallback(async () => {
    const r = await fetch(`/api/admin/organizations?workspaceId=${wid}`);
    if (!r.ok) return;
    const { organizations: orgs } = await r.json();
    setOrganizations(orgs || []);
    setActiveOrgId((prev) => prev || orgs?.[0]?.id || "");
  }, [wid]);

  const fetchGroups = useCallback(async (orgId: string) => {
    const r = await fetch(`/api/admin/groups?org_id=${orgId}&workspaceId=${wid}`);
    if (!r.ok) return;
    const { groups: g } = await r.json();
    setGroups(g || []);
  }, [wid]);

  const fetchUsers = useCallback(async (orgId: string) => {
    const r = await fetch(`/api/admin/users?org_id=${orgId}&workspaceId=${wid}`);
    if (!r.ok) return;
    const { users: u } = await r.json();
    setUsers(u || []);
  }, [wid]);

  const fetchDevices = useCallback(async () => {
    const r = await fetch(`/api/agent/heartbeat?workspaceId=${wid}`);
    if (!r.ok) return;
    const { agents } = await r.json();
    setDevices(agents || []);
  }, [wid]);

  const loadPolicy = useCallback(async (scope: "org" | "group" | "user", id: string) => {
    if (!id) return;
    const key = `${scope}:${id}`;
    if (policyMap[key] !== undefined) return;
    const path = scope === "org" ? `/api/admin/orgs/${id}/policy` : scope === "group" ? `/api/admin/groups/${id}/policy` : `/api/admin/users/${id}/policy`;
    const r = await fetch(`${path}?workspaceId=${wid}`);
    if (!r.ok) return;
    const { policy } = await r.json();
    setPolicyMap((prev) => ({ ...prev, [key]: policy?.rules || [] }));
  }, [policyMap, wid]);

  useEffect(() => { fetchOrgs(); fetchDevices(); }, [fetchOrgs, fetchDevices]);

  useEffect(() => {
    if (!activeOrgId) return;
    fetchGroups(activeOrgId);
    fetchUsers(activeOrgId);
    loadPolicy("org", activeOrgId);
    setPolicyTarget("org");
  }, [activeOrgId, fetchGroups, fetchUsers, loadPolicy]);

  useEffect(() => {
    if (policyTarget === "group" && activeGroupId) loadPolicy("group", activeGroupId);
    if (policyTarget === "user" && activeUserId) loadPolicy("user", activeUserId);
  }, [policyTarget, activeGroupId, activeUserId, loadPolicy]);

  const handleInviteUser = async () => {
    if (!newUserEmail.trim() || !newUserName.trim() || !activeOrgId) return;
    const r = await fetch(`/api/admin/users?workspaceId=${wid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: activeOrgId, email: newUserEmail.trim(), display_name: newUserName.trim(), group_id: newUserGroup || null }),
    });
    if (!r.ok) return toast("Failed to invite user.", "error");
    setNewUserEmail(""); setNewUserName(""); setNewUserGroup(""); setInviteOpen(false);
    toast("User invited.", "success");
    fetchUsers(activeOrgId);
  };

  const handleRemoveUser = async (userId: string) => {
    const r = await fetch(`/api/admin/users?user_id=${userId}&workspaceId=${wid}`, { method: "DELETE" });
    if (!r.ok) return toast("Failed to remove user.", "error");
    setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    toast("User removed.", "warning");
  };

  const handleAssignGroup = async (userId: string, groupId: string | null) => {
    const r = await fetch(`/api/admin/users?workspaceId=${wid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, group_id: groupId }),
    });
    if (!r.ok) return toast("Failed to update group.", "error");
    setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, group_id: groupId } : u)));
    toast("Group updated.", "success");
  };

  const handleAddRule = (type = "ai_tool", target = selectedTool, action = selectedAction) => {
    const rule: PolicyRule = { rule_id: crypto.randomUUID(), type, target, action, priority: 50, enabled: true };
    setPolicyMap((prev) => ({ ...prev, [policyKey]: [...(prev[policyKey] || []), rule] }));
  };

  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    try {
      let path = "";
      let body: any = { rules: currentPolicy };
      if (policyTarget === "org") path = `/api/admin/orgs/${activeOrgId}/policy`;
      if (policyTarget === "group") { path = `/api/admin/groups/${activeGroupId}/policy`; body = { org_id: activeOrgId, rules: currentPolicy, inherit_org_default: true }; }
      if (policyTarget === "user") { path = `/api/admin/users/${activeUserId}/policy`; body = { org_id: activeOrgId, rules: currentPolicy }; }
      const r = await fetch(`${path}?workspaceId=${wid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) return toast("Failed to save policy.", "error");
      toast(`Saved ${policyTarget.toUpperCase()} policy.`, "success");
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-10 text-white space-y-6">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <h1 className="text-2xl font-black">Manage</h1>

      <section className="border border-white/10 rounded-xl px-4 py-3 flex items-center gap-4 text-sm bg-white/[0.02]">
        <select className="bg-transparent font-bold" value={activeOrgId} onChange={(e) => setActiveOrgId(e.target.value)}>
          {organizations.map((org) => <option key={org.id} value={org.id} className="text-black">{org.name}</option>)}
        </select>
        <span className="text-white/40">|</span>
        <span>{activeOrg?.plan || "Starter"} Plan</span>
        <span className="text-white/40">|</span>
        <span>{users.length} User{users.length === 1 ? "" : "s"}</span>
        <span className="text-white/40">|</span>
        <span>{activeExtensions} Active Extension{activeExtensions === 1 ? "" : "s"}</span>
      </section>

      <section className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.02]">
        <div className="p-4 flex items-center justify-between border-b border-white/10">
          <h2 className="font-bold">Users</h2>
          <button onClick={() => setInviteOpen((v) => !v)} className="px-3 py-2 rounded-md bg-[var(--brand-color)] text-xs font-bold uppercase tracking-wider">Invite User</button>
        </div>
        {inviteOpen && (
          <div className="p-4 border-b border-white/10 grid grid-cols-1 md:grid-cols-4 gap-2">
            <input className="bg-white/5 rounded-md px-3 py-2 text-sm" placeholder="Name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
            <input className="bg-white/5 rounded-md px-3 py-2 text-sm" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
            <select className="bg-white/5 rounded-md px-3 py-2 text-sm" value={newUserGroup} onChange={(e) => setNewUserGroup(e.target.value)}>
              <option value="">No group</option>
              {groups.map((g) => <option key={g.group_id} value={g.group_id}>{g.name}</option>)}
            </select>
            <button onClick={handleInviteUser} className="bg-white/10 rounded-md px-3 py-2 text-xs font-bold uppercase">Send Invite</button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="text-white/50 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Group</th><th className="text-left p-3">Policy Status</th><th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const group = groups.find((g) => g.group_id === u.group_id);
              const hasUserPolicy = (policyMap[`user:${u.user_id}`] || []).length > 0;
              const status = hasUserPolicy ? "Custom User Policy" : group?.policy_id ? "Inherits Group" : "Inherits Org";
              return (
                <tr key={u.user_id} className="border-t border-white/5">
                  <td className="p-3 font-medium">{u.display_name || "Unnamed"}</td>
                  <td className="p-3 text-white/80">{u.email}</td>
                  <td className="p-3">
                    <select className="bg-white/5 rounded px-2 py-1" value={u.group_id || ""} onChange={(e) => handleAssignGroup(u.user_id, e.target.value || null)}>
                      <option value="">No group</option>
                      {groups.map((g) => <option key={g.group_id} value={g.group_id}>{g.name}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-white/70">{status}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2 text-xs">
                      <button onClick={() => { setPolicyTarget("user"); setActiveUserId(u.user_id); }} className="px-2 py-1 bg-white/5 rounded">Edit Policy</button>
                      <button onClick={() => handleRemoveUser(u.user_id)} className="px-2 py-1 bg-red-500/20 text-red-300 rounded inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Remove</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="border border-white/10 rounded-xl p-4 bg-white/[0.02] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Policy Editor</h2>
          <button onClick={handleSavePolicy} disabled={savingPolicy} className="px-3 py-2 rounded-md bg-[var(--brand-color)] text-xs font-bold uppercase">{savingPolicy ? "Saving..." : `Save ${policyTarget.toUpperCase()} Policy`}</button>
        </div>

        <div className="flex gap-2">
          {(["org", "group", "user"] as const).map((t) => (
            <button key={t} onClick={() => setPolicyTarget(t)} className={`px-3 py-1 rounded-md text-xs uppercase font-bold ${policyTarget === t ? "bg-white/15" : "bg-white/5"}`}>{t}</button>
          ))}
        </div>

        {policyTarget === "group" && (
          <select className="bg-white/5 rounded-md px-3 py-2 text-sm" value={activeGroupId} onChange={(e) => setActiveGroupId(e.target.value)}>
            <option value="">Select Group</option>
            {groups.map((g) => <option key={g.group_id} value={g.group_id}>{g.name}</option>)}
          </select>
        )}
        {policyTarget === "user" && (
          <select className="bg-white/5 rounded-md px-3 py-2 text-sm" value={activeUserId} onChange={(e) => setActiveUserId(e.target.value)}>
            <option value="">Select User</option>
            {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.display_name || u.email}</option>)}
          </select>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <select className="bg-white/5 rounded-md px-3 py-2 text-sm" value={selectedTool} onChange={(e) => setSelectedTool(e.target.value)}>
            {AI_TOOL_REGISTRY.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
          </select>
          <div className="flex gap-2 flex-wrap">
            {ACTIONS.map((action) => (
              <button key={action} onClick={() => setSelectedAction(action)} className={`px-2 py-1 rounded text-xs uppercase font-bold ${selectedAction === action ? "bg-white/20" : "bg-white/5"}`}>{action === "audit_only" ? "AUDIT" : action}</button>
            ))}
          </div>
          <button onClick={() => handleAddRule()} className="bg-white/10 rounded-md px-3 py-2 text-xs uppercase font-bold">Add Rule</button>
        </div>

        <button onClick={() => setAdvancedOpen((v) => !v)} className="text-sm text-white/80 inline-flex items-center gap-1">Advanced Rules {advancedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>
        {advancedOpen && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button onClick={() => handleAddRule("domain", "example.com")} className="bg-white/5 rounded-md px-3 py-2 text-xs">Add Domain Filter</button>
            <button onClick={() => handleAddRule("dlp_pattern", "\\b\\d{3}-\\d{2}-\\d{4}\\b", "redact")} className="bg-white/5 rounded-md px-3 py-2 text-xs">Add Regex Pattern</button>
            <button onClick={() => handleAddRule("ai_category", "coding_assistant")} className="bg-white/5 rounded-md px-3 py-2 text-xs">Add Category Policy</button>
          </div>
        )}

        <div className="space-y-2">
          {currentPolicy.map((rule) => (
            <div key={rule.rule_id} className="border border-white/10 rounded-md px-3 py-2 flex items-center justify-between text-sm">
              <span>{rule.target}</span>
              <span className="uppercase text-xs font-bold text-white/70">{rule.action === "audit_only" ? "AUDIT" : rule.action}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-white/10 rounded-xl p-4 bg-white/[0.02]">
        <button onClick={() => setGroupListOpen((v) => !v)} className="w-full text-left inline-flex items-center justify-between">
          <span className="font-bold">Groups ({groups.length})</span>
          {groupListOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {groupListOpen && (
          <div className="mt-3 space-y-2">
            {groups.map((g) => (
              <div key={g.group_id} className="flex justify-between text-sm text-white/80">
                <span>{g.name}</span>
                <span>{users.filter((u) => u.group_id === g.group_id).length} user(s)</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
