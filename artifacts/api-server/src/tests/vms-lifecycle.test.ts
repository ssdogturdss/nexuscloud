/**
 * VM lifecycle integration tests.
 *
 * These tests cover the three scenarios flagged by the code reviewer:
 *   1. Creation rejected when agent is unavailable
 *   2. Power/delete blocked while VM is provisioning
 *   3. Background create failure flips VM to error state
 *
 * Tests use Jest with supertest and mock the agent module to control
 * agent availability without needing a real hypervisor.
 */

import express from "express";
import supertest from "supertest";
// ── Mock the agent module before importing routes ──────────────────────────
jest.mock("../lib/agent", () => ({
  isAgentConfigured: jest.fn(() => false),
  agentRequest: jest.fn(async () => ({ ok: false, status: 503, data: null })),
}));

// ── Mock the DB module to avoid needing a live database ───────────────────
const mockVm = {
  id: 1,
  name: "test-vm",
  hostname: "test.local",
  status: "provisioning",
  cpuCores: 2,
  ramMb: 2048,
  diskGb: 20,
  ipAddress: null,
  osImageId: 1,
  osImageName: "Ubuntu 22.04 LTS",
  sshKeyId: 1,
  region: "local",
  libvirtDomain: "vm1-test",
  startedAt: null,
  accumulatedSeconds: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockImage = {
  id: 1,
  name: "Ubuntu 22.04 LTS",
  version: "22.04",
  isoPath: "/var/lib/libvirt/images/jammy-server-cloudimg-amd64.img",
  isAvailable: true,
  sshUser: "ubuntu",
};

const mockKey = { id: 1, publicKey: "ssh-ed25519 AAAA..." };

const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn(async () => [mockVm]),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
};

/** Reset all mock state between tests so queued `mockResolvedValueOnce` values
 *  from one test don't bleed into the next. */
function resetMocks() {
  jest.clearAllMocks();
  // Re-apply default return-this implementations wiped by clearAllMocks
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.orderBy.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.returning.mockResolvedValue([mockVm]);
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
}

jest.mock("@workspace/db", () => ({
  db: mockDb,
  vmsTable: { id: "id", status: "status" },
  osImagesTable: { id: "id" },
  sshKeysTable: { id: "id" },
}));

import vmsRouter from "../routes/vms";
import * as agentModule from "../lib/agent";

const app = express();
app.use(express.json());
app.use(vmsRouter);

const agent = agentModule as jest.Mocked<typeof agentModule>;

// ─────────────────────────────────────────────────────────────────────────────
// 0. Image availability guard
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /vms — image availability guard", () => {
  beforeEach(() => {
    resetMocks();
    agent.isAgentConfigured.mockReturnValue(true);
  });

  it("returns 409 when the requested OS image is not available on the hypervisor", async () => {
    // isAgentConfigured returns true, but we need the route to reach the image lookup
    // The mock DB select chain returns an image with isAvailable: false
    mockDb.where.mockResolvedValueOnce([{ ...mockImage, isAvailable: false }]);

    const res = await supertest(app).post("/vms").send({
      name: "test-vm",
      hostname: "test.local",
      cpuCores: 2,
      ramMb: 2048,
      diskGb: 20,
      osImageId: 1,
      sshKeyId: 1,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("not yet available");
  });

  it("returns 400 when agent is available but osImageId does not exist", async () => {
    mockDb.where.mockResolvedValueOnce([]); // no image found

    const res = await supertest(app).post("/vms").send({
      name: "test-vm",
      hostname: "test.local",
      cpuCores: 2,
      ramMb: 2048,
      diskGb: 20,
      osImageId: 99,
      sshKeyId: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("OS image not found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Agent-unavailable creation
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /vms — agent unavailable", () => {
  beforeEach(() => {
    resetMocks();
    agent.isAgentConfigured.mockReturnValue(false);
  });

  it("returns 503 when AGENT_URL is not configured", async () => {
    const res = await supertest(app)
      .post("/vms")
      .send({
        name: "test-vm",
        hostname: "test.local",
        cpuCores: 2,
        ramMb: 2048,
        diskGb: 20,
        osImageId: 1,
        sshKeyId: 1,
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("hypervisor agent is not configured");
  });

  it("does not insert a VM record when agent is unavailable", async () => {
    mockDb.insert.mockClear();
    await supertest(app).post("/vms").send({ name: "x", hostname: "y", cpuCores: 1, ramMb: 512, diskGb: 1, osImageId: 1, sshKeyId: 1 });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Power/delete blocked during provisioning
// ─────────────────────────────────────────────────────────────────────────────
describe("VM lifecycle guards — provisioning state", () => {
  beforeEach(() => {
    resetMocks();
    agent.isAgentConfigured.mockReturnValue(true);
    // Wire the select chain to return the provisioning VM
    mockDb.where.mockResolvedValueOnce([{ ...mockVm, status: "provisioning" }]);
  });

  it("DELETE /vms/:id returns 409 when VM is provisioning", async () => {
    const res = await supertest(app).delete("/vms/1");
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("provisioning");
  });
});

describe("POST /vms/:id/power — provisioning guard", () => {
  beforeEach(() => {
    resetMocks();
    agent.isAgentConfigured.mockReturnValue(true);
    mockDb.where.mockResolvedValueOnce([{ ...mockVm, status: "provisioning" }]);
  });

  it("returns 409 when VM is provisioning", async () => {
    const res = await supertest(app).post("/vms/1/power").send({ action: "start" });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("provisioning");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Successful create flips VM to running (enabling stop/destroy)
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /vms — successful create transitions to running", () => {
  beforeEach(() => resetMocks());

  it("updates VM to running after agent returns ok, enabling subsequent lifecycle ops", async () => {
    agent.isAgentConfigured.mockReturnValue(true);

    // Mock DB chain for creation
    mockDb.where
      .mockResolvedValueOnce([{ ...mockImage, isAvailable: true }]) // image lookup
      .mockResolvedValueOnce([mockKey])                              // key lookup
      .mockResolvedValueOnce([])                                     // update domain
      .mockResolvedValueOnce([]);                                    // update status→running

    mockDb.returning.mockResolvedValueOnce([mockVm]);

    // Agent succeeds
    agent.agentRequest.mockResolvedValueOnce({ ok: true, status: 200, data: { ok: true } });

    const updateSpy = jest.spyOn(mockDb, "set");

    await supertest(app).post("/vms").send({
      name: "run-vm",
      hostname: "run.local",
      cpuCores: 2,
      ramMb: 2048,
      diskGb: 20,
      osImageId: 1,
      sshKeyId: 1,
    });

    // Wait for background dispatch
    await new Promise((r) => setTimeout(r, 50));

    // The update to status='running' (with startedAt) must have been called
    const runningUpdate = updateSpy.mock.calls.find(
      (call: unknown[]) =>
        call[0] &&
        typeof call[0] === "object" &&
        "status" in (call[0] as object) &&
        (call[0] as { status: string }).status === "running",
    );
    expect(runningUpdate).toBeDefined();
  });

  it("power action (stop) is accepted for a running VM without requiring manual sync", async () => {
    agent.isAgentConfigured.mockReturnValue(true);

    // VM is running (transitioned from provisioning by the create callback)
    mockDb.where.mockResolvedValueOnce([{ ...mockVm, status: "running", libvirtDomain: "vm1-test" }]);
    agent.agentRequest.mockResolvedValueOnce({ ok: true, status: 200, data: {} }); // stop ok
    mockDb.where.mockResolvedValueOnce([{ ...mockVm, status: "stopped" }]);

    const res = await supertest(app).post("/vms/1/power").send({ action: "stop" });

    // Should NOT receive 409 (provisioning guard) — VM is running
    expect(res.status).not.toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Background create failure flips VM to error
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /vms — background create failure", () => {
  beforeEach(() => resetMocks());

  it("flips VM to error status when agent rejects the create request", async () => {
    agent.isAgentConfigured.mockReturnValue(true);

    // Mock the full DB chain for VM creation:
    // select→from→where (image lookup) → key lookup → insert → update (domain) → update (error)
    mockDb.where
      .mockResolvedValueOnce([mockImage])  // OS image
      .mockResolvedValueOnce([mockKey])    // SSH key
      .mockResolvedValueOnce([])           // update domain (returns nothing meaningful)
      .mockResolvedValueOnce([]);          // update status

    mockDb.returning.mockResolvedValueOnce([mockVm]);

    // Agent will reject the create call
    agent.agentRequest.mockResolvedValueOnce({ ok: false, status: 500, data: null });

    const updateSpy = jest.spyOn(mockDb, "set");

    const res = await supertest(app).post("/vms").send({
      name: "fail-vm",
      hostname: "fail.local",
      cpuCores: 2,
      ramMb: 2048,
      diskGb: 20,
      osImageId: 1,
      sshKeyId: 1,
    });

    // The HTTP response is 201 (provisioning started) — the failure is async
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("provisioning");

    // Wait for the async background dispatch to complete
    await new Promise((r) => setTimeout(r, 50));

    // The update to set status='error' should have been called
    const errorUpdate = updateSpy.mock.calls.find(
      (call: unknown[]) => call[0] && typeof call[0] === "object" && "status" in (call[0] as object) && (call[0] as { status: string }).status === "error"
    );
    expect(errorUpdate).toBeDefined();
  });
});
