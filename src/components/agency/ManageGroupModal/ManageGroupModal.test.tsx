import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgencyClient, AgencyMemberWithUser } from "@models/agency";
import groupsReducer, { type GroupWithRows } from "@store/slices/groupsSlice";

import ManageGroupModal from "./ManageGroupModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockShowToast = vi.fn();
vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const { tableSpies, nextResults } = vi.hoisted(() => ({
  tableSpies: { insert: vi.fn(), delete: vi.fn() },
  nextResults: {
    insert: { value: { data: { id: "row-new" }, error: null as unknown } },
    notify: { value: { data: null as unknown, error: null as unknown } },
    delete: { value: { error: null as unknown } },
  },
}));
vi.mock("@/lib/supabase.js", () => ({
  supabase: {
    from: (table: string) => ({
      // group_staff/group_members chain .select().single(); the plain
      // notifications insert in groupsSlice is awaited directly with no
      // chaining — insert() has to be a real Promise (awaitable as-is) AND
      // carry .select() for the other callers, same trick as elsewhere.
      insert: (payload: unknown) => {
        tableSpies.insert({ table, payload });
        const result = table === "notifications" ? nextResults.notify.value : nextResults.insert.value;
        return Object.assign(Promise.resolve(result), { select: () => ({ single: () => Promise.resolve(result) }) });
      },
      delete: () => ({
        eq: (_col: string, id: string) => {
          tableSpies.delete({ table, id });
          return Promise.resolve(nextResults.delete.value);
        },
      }),
    }),
  },
}));

const client: AgencyClient = {
  id: "stub-1",
  first_name: "Ada",
  last_name: "Lovelace",
  email: null,
  codename: null,
  agency_id: "agency-1",
  default_rate_pence: null,
  allow_staff_custom_rate: false,
  availability_note: null,
  created_by: "manager-1",
  created_at: "",
  linked_user_id: null,
  previously_counselled: false,
  assignment: null,
};

const staffMember: AgencyMemberWithUser = {
  id: "m-1",
  agency_id: "agency-1",
  user_id: "staff-1",
  role: "counsellor",
  employment_type: "employee",
  counselling_enabled: true,
  status: "active",
  invited_at: null,
  joined_at: "",
  agreement_accepted_at: null,
  agreement_accepted_version: null,
  agreement_signed_name: null,
  settlement_direction: null,
  color: null,
  deletion_requested_at: null,
  deletion_requested_reason: null,
  first_name: "Sam",
  last_name: "Staff",
  display_name: null,
  email: "sam@example.com",
  avatar_url: null,
};

const baseGroup: GroupWithRows = {
  id: "g-1",
  agency_id: "agency-1",
  name: "Tuesday group",
  description: "For anxiety",
  created_by: "manager-1",
  created_at: "",
  members: [],
  staff: [],
};

function renderModal(group: GroupWithRows, clients: AgencyClient[] = [client], staffOptions = [staffMember]) {
  const store = configureStore({ reducer: { groups: groupsReducer } });
  const onClose = vi.fn();
  render(
    <Provider store={store}>
      <ManageGroupModal group={group} clients={clients} staffOptions={staffOptions} onClose={onClose} />
    </Provider>,
  );
  return { onClose };
}

describe("ManageGroupModal", () => {
  it("shows empty states and the add pickers when a group has no members or staff (happy path)", () => {
    renderModal(baseGroup);
    expect(screen.getByText("No clients in this group yet.")).toBeInTheDocument();
    expect(screen.getByText("No staff assigned to this group yet.")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a client to this group")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a staff member to this group")).toBeInTheDocument();
  });

  it("adds a client via group_members with the group_id and stub_id (happy path)", async () => {
    renderModal(baseGroup);
    const picker = screen.getByLabelText("Add a client to this group");
    fireEvent.change(picker, { target: { value: "stub-1" } });
    fireEvent.click(within(picker.parentElement as HTMLElement).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(tableSpies.insert).toHaveBeenCalled());
    expect(tableSpies.insert).toHaveBeenCalledWith({
      table: "group_members",
      payload: { group_id: "g-1", stub_id: "stub-1" },
    });
  });

  it("hides a client from the add picker once they're already a member (edge case)", () => {
    const group = {
      ...baseGroup,
      members: [{ id: "gm-1", group_id: "g-1", client_id: null, stub_id: "stub-1", added_at: "" }],
    };
    renderModal(group);
    // No "add a client" picker left since the only client is already in the group.
    expect(screen.queryByLabelText("Add a client to this group")).not.toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("removes a member via its row id (happy path)", async () => {
    const group = {
      ...baseGroup,
      members: [{ id: "gm-1", group_id: "g-1", client_id: null, stub_id: "stub-1", added_at: "" }],
    };
    renderModal(group);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(tableSpies.delete).toHaveBeenCalledWith({ table: "group_members", id: "gm-1" }));
  });

  it("adds staff via group_staff with the group_id and user_id, and hides them once added", async () => {
    renderModal(baseGroup);
    const picker = screen.getByLabelText("Add a staff member to this group");
    fireEvent.change(picker, { target: { value: "staff-1" } });
    fireEvent.click(within(picker.parentElement as HTMLElement).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(tableSpies.insert).toHaveBeenCalled());
    expect(tableSpies.insert).toHaveBeenCalledWith({
      table: "group_staff",
      payload: { group_id: "g-1", user_id: "staff-1" },
    });
  });

  it("notifies the newly-added staff member in-app, naming the group (regression — silent group assignment)", async () => {
    renderModal(baseGroup);
    const picker = screen.getByLabelText("Add a staff member to this group");
    fireEvent.change(picker, { target: { value: "staff-1" } });
    fireEvent.click(within(picker.parentElement as HTMLElement).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(tableSpies.insert).toHaveBeenCalledWith({
        table: "notifications",
        payload: {
          user_id: "staff-1",
          type: "group_assignment",
          message: 'You\'ve been added to the group "Tuesday group"',
          url: "/agency/groups",
        },
      }),
    );
  });

  it("still adds the staff member even if the notification insert fails (sad path — best-effort, not blocking)", async () => {
    // Real Supabase never THROWS on an RLS/schema failure here — it resolves
    // with { error } — so the mock returns that shape rather than rejecting,
    // to actually exercise the code path this test claims to cover.
    nextResults.notify.value = { data: null, error: { message: "permission denied" } };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderModal(baseGroup);
    const picker = screen.getByLabelText("Add a staff member to this group");
    fireEvent.change(picker, { target: { value: "staff-1" } });
    fireEvent.click(within(picker.parentElement as HTMLElement).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(screen.getByText("Sam Staff")).toBeInTheDocument());
    expect(consoleErrorSpy).toHaveBeenCalledWith("Couldn't notify the new group member:", "permission denied");
    consoleErrorSpy.mockRestore();
  });

  it("opens a confirm dialog before deleting the group, and does not delete on cancel (sad path)", async () => {
    renderModal(baseGroup);
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));

    const dialogTitle = await screen.findByText('Delete "Tuesday group"?');
    expect(dialogTitle).toBeInTheDocument();

    const dialog = dialogTitle.closest("div")?.parentElement as HTMLElement;
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(tableSpies.delete).not.toHaveBeenCalled();
  });

  it("deletes the group and closes the modal on confirm (happy path)", async () => {
    const { onClose } = renderModal(baseGroup);
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, delete group" }));

    await waitFor(() => expect(tableSpies.delete).toHaveBeenCalledWith({ table: "groups", id: "g-1" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
