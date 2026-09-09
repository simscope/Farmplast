"use strict";
const { fail } = require("./core.cjs");
function supabaseAdapter(client) {
  const unwrap = async (q) => {
    const { data, error } = await q;
    if (error) throw error;
    return data;
  };
  return {
    pending: async (signal) =>
      (
        await unwrap(
          client
            .from("zkt_bridge_commands")
            .select("id,command,payload,created_at")
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(1)
            .abortSignal(signal),
        )
      )?.[0] || null,
    claim: async (id, pickedAt, signal) =>
      !!(
        await unwrap(
          client
            .from("zkt_bridge_commands")
            .update({ status: "running", picked_at: pickedAt, error: null })
            .eq("id", id)
            .eq("status", "pending")
            .select("id")
            .abortSignal(signal),
        )
      )?.length,
    finish: async (id, pickedAt, terminal, signal) =>
      unwrap(
        client
          .from("zkt_bridge_commands")
          .update(terminal)
          .eq("id", id)
          .eq("status", "running")
          .eq("picked_at", pickedAt)
          .select("id")
          .abortSignal(signal),
      ),
    employee: (id, signal) =>
      unwrap(
        client
          .from("employees")
          .select(
            "id,employee_number,first_name,last_name,active,zkt_user_id,zkt_name,zkt_password,zkt_card_number,zkt_privilege,zkt_enabled",
          )
          .eq("id", id)
          .single()
          .abortSignal(signal),
      ),
    employeeStatus: (id, patch, signal) =>
      unwrap(
        client.from("employees").update(patch).eq("id", id).abortSignal(signal),
      ),
    attendance: (rows, signal) =>
      unwrap(
        client
          .from("zkt_attendance_logs")
          .upsert(rows, {
            onConflict: "employee_number,punch_time",
            ignoreDuplicates: true,
          })
          .abortSignal(signal),
      ),
    processAttendance: (signal) =>
      unwrap(
        client.rpc("process_zkt_attendance_to_work_logs").abortSignal(signal),
      ),
  };
}
function memoryAdapter() {
  const rows = [],
    transitions = [],
    saved = [];
  let updates = 0;
  return {
    rows,
    transitions,
    saved,
    get updates() {
      return updates;
    },
    pending: async () => rows.find((r) => r.status === "pending") || null,
    claim: async (id, pickedAt) => {
      const r = rows.find((r) => r.id === id && r.status === "pending");
      if (!r) return false;
      Object.assign(r, { status: "running", picked_at: pickedAt });
      transitions.push("running");
      return true;
    },
    finish: async (id, pickedAt, t) => {
      const r = rows.find(
        (r) =>
          r.id === id && r.status === "running" && r.picked_at === pickedAt,
      );
      if (r) {
        Object.assign(r, t);
        transitions.push(t.status);
      }
      return r ? [{ id }] : [];
    },
    employee: async (id) => ({
      id,
      employee_number: 90001,
      first_name: "Offline",
      last_name: "Fixture",
      active: true,
      zkt_enabled: true,
      zkt_privilege: 0,
    }),
    employeeStatus: async () => {
      updates++;
    },
    attendance: async (batch) => saved.push(...batch),
    processAttendance: async () => ({ ok: true, offline: true }),
  };
}
async function mockSdk(request, { signal } = {}) {
  if (signal?.aborted) throw fail("Offline SDK aborted", "SDK_TIMEOUT");
  if (request.operation === "test")
    return {
      ok: true,
      message: "ZKT official SDK connection OK",
      device: { ip: request.ip, port: request.port, machine: request.machine },
      info: {
        userCount: 0,
        logCount: 0,
        serialNumber: "OFFLINE",
        firmware: "MOCK",
      },
    };
  if (request.operation === "sync_one_employee") {
    const { password, ...u } = request.user;
    return {
      ok: true,
      message: "SSR_SetUserInfo OK",
      errorCode: 0,
      user: { ...u, passwordSet: !!password },
      sdk: { cardResult: true, setResult: true, refreshResult: true },
    };
  }
  return {
    ok: true,
    message: "Attendance logs read OK",
    logs: [],
    count: 0,
    errorCode: 0,
  };
}
module.exports = { supabaseAdapter, memoryAdapter, mockSdk };
