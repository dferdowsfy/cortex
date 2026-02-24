import { adminDb } from "./firebase/admin";
import { localStorage } from "./local-storage";
import crypto from "crypto";

const ENTERPRISE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCeaWCk4AEsixZq
QxkLt8hJvY7IkcmUPqNWQUVMrDEqz/a2wYMb4+ph91GX8Bda8OntjNjorN0U+L09
npYCE2wh9bdnhZpoRQFcyx6itZPbBhnSiDXgXMkahnZy/S16AkZ4V0Vgkp9VIV9F
SdBUyCdBNZViw+N6ret97D7E5RwhAAyHNzhGZboNWRVLqkNpmuS3Ln9vSo2g9IQj
941JSa2ee3ul5lPI6Vy57sTMzH5mvwbNk/antnpzmX1DPZvxW8X2x6QchWbqgDr0
Prq7pib3nsIJ4b54v/RankhTbsXIPWABapHuuTQBmbc7hq66bGI8b7fG4gXNqKro
64LBFecNAgMBAAECggEAC6xtTEkbnQo04SjHqDbnYhO/eWVQ6wVAqSMPNcq8ptCD
eE1DWaNOiuCcWSt+tRtqybAm7eKLOjfoTimpGUcQIWKHnO/aBJQNOSbYv5nM5weI
kJysB7ges78z7F5e4w5W3hhkSu0TI8VdTXBWk2Daj7Igq5IO6eP2JiXqLD1L+Nx3
4cHp8i83ZPfBRKVT4N7o7rHbaNU7hkb8xbnB+jfDmHXN55Qg1leBMfNdzBVFl4tv
hKShR/6xWu0Jkz7RHAEnqn9M9JYmjETnKmmW4lJXWRcaYX2g9cRCV5sC9KCY0ajK
sjpCBuPvyS08SfVF48Cbd2o+B8tJrO3/Jbehbpz3SwKBgQDJsDdTqpRs5a5UiRp0
tF1MGeN69kemp9T350yZ8NEmkl1by1mBeifoazwaEufpDF2DgqsJQ3iuYYnokfuT
pM7oCrQLlPlaDrGF7JhvmrMayLORnpkYvTRy+FpnQHORTpnxI6zd68qwu+xgdtFc
WzvZZJnb6Sd9DhfkVQ98tijSlwKBgQDJEcu5B/9VksmQebKh05lBs/cFfwvylM5I
2mPiF8nuNvP9lyz9Ab57484PBOUarUG7Q7Fn6XNlTyGadIsjNbdsRBIj/5O6rLZ8
dD+g7RiYLgvzCAbQiq/WGNuBCyjtRbz2wAGXpQEVJJlo8JGaTT8nLO2OXf11NBfw
3cOGtKKb+wKBgFbhUMP6vBs4yWLi+IGDXJk2obZLNsxEicoMWgQKJ55s+EhdjX3n
6B8Haol00W+jgvjupczEwsyjeau0juGn4fU0/x/qGYvAvpoJNBUHV9XW1PuKjTqJ
7nkEILVPnzjd2hR1ILcsJlEBcq6PIFqfdmWMH3cKtZb6JjKWrag0M9ubAoGBAMJF
UHoJkRnERr4x53dV9Bi4Yi7MTuXmAt3/LEyyQWfJbrsRSuV1vu8C7wAx8Y5x4jWm
NQ26UMWMzGHowtqVNxEDQCfJ85mE8JiU1TmOe5nlu6PomHT72uLYh5VKDBQcsnQS
ljdHtSERiKwM7BGTGzalwS0yAQcx+wO9sQJBG2/rAoGBAMBq6btYmlk+RO0+poIp
SPNkV7TZhk4HUY+oOhJObuKF7Gm6tNw2dqDVOKKmRsGwCJoUweJ1QDEtDR9MPpbo
s9a8iPX8uETpQq+ZTIS/i7JI2UNjlAn92uN96xde4NY/DjLKAeSpHPK23hvU6u8A
1wHhmAReCPFwLfFIkHRQ9rvh
-----END PRIVATE KEY-----`;

export interface Organization {
    org_id: string;
    name: string;
    created_at: string;
    policy_version: number;
    policy_config: Record<string, any>;
    signing_secret: string;
}

export interface EnrollmentToken {
    token_id: string;
    org_id: string;
    token_hash: string;
    expires_at: string;
    max_uses: number | null;
    uses_count: number;
    revoked: boolean;
    created_at: string;
}

export interface Device {
    device_id: string;
    org_id: string;
    device_secret_hash: string;
    device_name?: string;
    os_type: string;
    agent_version: string;
    enrolled_at: string;
    last_heartbeat: string;
    status: 'active' | 'revoked';
}

const ORGS_PATH = "organizations";
const TOKENS_PATH = "enrollment_tokens";
const DEVICES_PATH = "devices";

class EnrollmentStore {
    // Organizations
    async createOrganization(name: string, workspaceId: string = "default"): Promise<Organization> {
        const org_id = crypto.randomUUID();
        const signing_secret = crypto.randomBytes(32).toString('hex');
        const org: Organization = {
            org_id,
            name,
            created_at: new Date().toISOString(),
            policy_version: 1,
            policy_config: {},
            signing_secret,
        };

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${ORGS_PATH}/${org_id}`).set(org);
        } else {
            const orgs = localStorage.getWorkspaceData(workspaceId, "organizations", {}) as Record<string, Organization>;
            orgs[org_id] = org;
            localStorage.setWorkspaceData(workspaceId, "organizations", orgs);
        }
        return org;
    }

    async getOrganization(org_id: string, workspaceId: string = "default"): Promise<Organization | null> {
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(`${ORGS_PATH}/${org_id}`).get();
            if (snap.exists()) return snap.val() as Organization;
        } else {
            const orgs = localStorage.getWorkspaceData(workspaceId, "organizations", {}) as Record<string, Organization>;
            return orgs[org_id] || null;
        }
        return null;
    }

    async updatePolicy(org_id: string, policy_config: Record<string, any>, workspaceId: string = "default"): Promise<Organization | null> {
        const org = await this.getOrganization(org_id, workspaceId);
        if (!org) return null;

        org.policy_config = policy_config;
        org.policy_version += 1;

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${ORGS_PATH}/${org_id}`).set(org);
        } else {
            const orgs = localStorage.getWorkspaceData(workspaceId, "organizations", {}) as Record<string, Organization>;
            orgs[org_id] = org;
            localStorage.setWorkspaceData(workspaceId, "organizations", orgs);
        }
        return org;
    }

    async listOrganizations(workspaceId: string = "default"): Promise<Organization[]> {
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(ORGS_PATH).get();
            if (snap.exists()) return Object.values(snap.val());
        } else {
            const orgs = localStorage.getWorkspaceData(workspaceId, "organizations", {}) as Record<string, Organization>;
            return Object.values(orgs);
        }
        return [];
    }

    // Tokens
    async createToken(org_id: string, expiresInHours: number, max_uses: number | null, workspaceId: string = "default"): Promise<EnrollmentToken & { plain_token: string }> {
        const token_id = crypto.randomUUID();
        const secret = crypto.randomBytes(24).toString('base64url');
        const token_value = `${token_id}.${secret}`;
        const token_hash = crypto.createHash('sha256').update(token_value).digest('hex');

        const expires_at = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

        const token: EnrollmentToken = {
            token_id,
            org_id,
            token_hash,
            expires_at,
            max_uses,
            uses_count: 0,
            revoked: false,
            created_at: new Date().toISOString(),
        };

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${TOKENS_PATH}/${token_id}`).set(token);
        } else {
            const tokens = localStorage.getWorkspaceData(workspaceId, "enrollment_tokens", {}) as Record<string, EnrollmentToken>;
            tokens[token_id] = token;
            localStorage.setWorkspaceData(workspaceId, "enrollment_tokens", tokens);
        }
        return { ...token, plain_token: token_value };
    }

    async getToken(token_value: string, workspaceId?: string): Promise<EnrollmentToken | null> {
        const parts = token_value.split('.');
        if (parts.length !== 2) return null;
        const [token_id] = parts;

        const resolvedWorkspaceId = workspaceId || localStorage.findWorkspaceForToken(token_id) || "default";
        const token = await this.getTokenById(token_id, resolvedWorkspaceId);
        if (!token) return null;

        const expectedHash = crypto.createHash('sha256').update(token_value).digest('hex');
        if (token.token_hash !== expectedHash) return null;

        return token;
    }

    async getTokenById(token_id: string, workspaceId: string = "default"): Promise<EnrollmentToken | null> {
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(`${TOKENS_PATH}/${token_id}`).get();
            if (snap.exists()) return snap.val() as EnrollmentToken;
        } else {
            const tokens = localStorage.getWorkspaceData(workspaceId, "enrollment_tokens", {}) as Record<string, EnrollmentToken>;
            return tokens[token_id] || null;
        }
        return null;
    }

    async listTokens(org_id: string, workspaceId: string = "default"): Promise<EnrollmentToken[]> {
        let tokens: EnrollmentToken[] = [];
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(TOKENS_PATH).orderByChild('org_id').equalTo(org_id).get();
            if (snap.exists()) tokens = Object.values(snap.val());
        } else {
            const allTokens = localStorage.getWorkspaceData(workspaceId, "enrollment_tokens", {}) as Record<string, EnrollmentToken>;
            tokens = Object.values(allTokens).filter((t: any) => t.org_id === org_id);
        }
        return tokens;
    }

    async revokeToken(token_id: string, workspaceId?: string): Promise<void> {
        const resolvedWorkspaceId = workspaceId || localStorage.findWorkspaceForToken(token_id) || "default";
        const token = await this.getTokenById(token_id, resolvedWorkspaceId);
        if (!token) return;

        token.revoked = true;
        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${TOKENS_PATH}/${token_id}`).set(token);
        } else {
            const tokens = localStorage.getWorkspaceData(resolvedWorkspaceId, "enrollment_tokens", {}) as Record<string, EnrollmentToken>;
            tokens[token_id] = token;
            localStorage.setWorkspaceData(resolvedWorkspaceId, "enrollment_tokens", tokens);
        }
    }

    async incrementTokenUsage(token_value: string, workspaceId?: string): Promise<void> {
        const token = await this.getToken(token_value, workspaceId);
        if (!token) return;
        token.uses_count += 1;
        const resolvedWorkspaceId = workspaceId || localStorage.findWorkspaceForToken(token.token_id) || "default";

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${TOKENS_PATH}/${token.token_id}`).set(token);
        } else {
            const tokens = localStorage.getWorkspaceData(resolvedWorkspaceId, "enrollment_tokens", {}) as Record<string, EnrollmentToken>;
            tokens[token.token_id] = token;
            localStorage.setWorkspaceData(resolvedWorkspaceId, "enrollment_tokens", tokens);
        }
    }

    // Devices
    async createDevice(device_id: string, org_id: string, os_type: string, agent_version: string, device_secret_hash: string, device_name?: string, workspaceId: string = "default"): Promise<Device> {
        const device: Device = {
            device_id,
            org_id,
            device_secret_hash,
            device_name,
            os_type,
            agent_version,
            enrolled_at: new Date().toISOString(),
            last_heartbeat: new Date().toISOString(),
            status: 'active',
        };

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${DEVICES_PATH}/${device_id}`).set(device);
        } else {
            const devices = localStorage.getWorkspaceData(workspaceId, "devices", {}) as Record<string, Device>;
            devices[device_id] = device;
            localStorage.setWorkspaceData(workspaceId, "devices", devices);
        }
        return device;
    }

    async getDevice(device_id: string, workspaceId?: string): Promise<Device | null> {
        const resolvedWorkspaceId = workspaceId || localStorage.findWorkspaceForDevice(device_id) || "default";

        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(`${DEVICES_PATH}/${device_id}`).get();
            if (snap.exists()) return snap.val() as Device;
        } else {
            const devices = localStorage.getWorkspaceData(resolvedWorkspaceId, "devices", {}) as Record<string, Device>;
            return devices[device_id] || null;
        }
        return null;
    }

    async revokeDevice(device_id: string, workspaceId?: string): Promise<void> {
        const resolvedWorkspaceId = workspaceId || localStorage.findWorkspaceForDevice(device_id) || "default";
        const device = await this.getDevice(device_id, resolvedWorkspaceId);
        if (!device) return;
        device.status = 'revoked';

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${DEVICES_PATH}/${device_id}`).set(device);
        } else {
            const devices = localStorage.getWorkspaceData(resolvedWorkspaceId, "devices", {}) as Record<string, Device>;
            devices[device_id] = device;
            localStorage.setWorkspaceData(resolvedWorkspaceId, "devices", devices);
        }
    }

    async listDevices(org_id: string, workspaceId: string = "default"): Promise<Device[]> {
        let devices: Device[] = [];
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(DEVICES_PATH).orderByChild('org_id').equalTo(org_id).get();
            if (snap.exists()) devices = Object.values(snap.val());
        } else {
            const allDevices = localStorage.getWorkspaceData(workspaceId, "devices", {}) as Record<string, Device>;
            devices = Object.values(allDevices).filter((d: any) => d.org_id === org_id);
        }
        return devices;
    }

    async updateHeartbeat(device_id: string, status: 'active' | 'revoked', agent_version: string, workspaceId?: string): Promise<void> {
        const resolvedWorkspaceId = workspaceId || localStorage.findWorkspaceForDevice(device_id) || "default";
        const device = await this.getDevice(device_id, resolvedWorkspaceId);
        if (!device) return;
        device.last_heartbeat = new Date().toISOString();
        device.status = status;
        device.agent_version = agent_version;

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${DEVICES_PATH}/${device_id}`).set(device);
        } else {
            const devices = localStorage.getWorkspaceData(resolvedWorkspaceId, "devices", {}) as Record<string, Device>;
            devices[device_id] = device;
            localStorage.setWorkspaceData(resolvedWorkspaceId, "devices", devices);
        }
    }

    // Utilities
    signPolicy(org: Organization): any {
        const payload = {
            org_id: org.org_id,
            policy_version: org.policy_version,
            policy_config: org.policy_config,
            issued_at: new Date().toISOString()
        };

        const payloadString = JSON.stringify(payload);
        const signature = crypto.sign("sha256", Buffer.from(payloadString), ENTERPRISE_PRIVATE_KEY).toString('base64');

        return {
            ...payload,
            payload_json: payloadString,
            signature
        };
    }
}

export const enrollmentStore = new EnrollmentStore();
