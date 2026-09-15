import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import ConfigureMemberModal from "@components/agency/ConfigureMemberModal/ConfigureMemberModal";
import RemoveMemberModal from "@components/agency/RemoveMemberModal/RemoveMemberModal";
import Avatar from "@components/shared/Avatar/Avatar";
import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { isAgencyOwner } from "@models/agencyPermissions";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchAgencyClients,
  fetchAgencyMembers,
  selectAgency,
  selectAgencyClients,
  selectAgencyMembers,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";

type MemberPracticeDetails = {
  business_name: string | null;
  phone: string | null;
  address: string | null;
};

const displayName = (m: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) => m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member";

export default function AgencyMemberDetailPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const members = useAppSelector(selectAgencyMembers);
  const clients = useAppSelector(selectAgencyClients);

  const [details, setDetails] = useState<MemberPracticeDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [configuring, setConfiguring] = useState(false);

  useEffect(() => {
    dispatch(fetchAgencyMembers());
    if (agency) dispatch(fetchAgencyClients(agency.id));
  }, [dispatch, agency]);

  useEffect(() => {
    if (!memberId) return;
    setLoadingDetails(true);
    supabase
      .from("practice_settings")
      .select("business_name, phone, address")
      .eq("admin_id", memberId)
      .maybeSingle()
      .then(({ data }) => {
        setDetails((data as MemberPracticeDetails) ?? null);
        setLoadingDetails(false);
      });
  }, [memberId]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const member = members.find((m) => m.user_id === memberId);
  if (!member) {
    return (
      <div className="inner">
        <Button variant="ghost" size="sm" className={styles.backButton} onClick={() => navigate("/agency/members")}>
          ← Back to staff
        </Button>
        <p className={styles.empty}>{members.length === 0 ? "Loading…" : "This member wasn't found."}</p>
      </div>
    );
  }

  const owner = isAgencyOwner(member.user_id, agency);
  const caseload = clients.filter(
    (c) => c.assignment?.status === "accepted" && c.assignment.to_admin_id === member.user_id,
  ).length;

  return (
    <div className="inner">
      <Button variant="ghost" size="sm" className={styles.backButton} onClick={() => navigate("/agency/members")}>
        ← Back to staff
      </Button>

      <div className={styles.header} id="agency-member-header">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)" }}>
          {/* Distinct colour from AgencyClientDetailPage's Avatar (default "teal") so staff and
              clients are visually distinguishable at a glance, not just by their initials. */}
          <Avatar name={displayName(member)} imageSrc={member.avatar_url ?? undefined} size={56} color="sky" />
          <div>
            <h1 className={styles.title}>{displayName(member)}</h1>
            <p className={styles.subtitle}>
              <Badge variant={member.status === "active" ? "success" : "danger"}>
                {member.status === "active" ? "Active" : "Disabled"}
              </Badge>{" "}
              <Badge variant={member.role === "manager" ? "neutral" : "warning"}>
                {member.role === "manager" ? "Manager" : "Counsellor"}
              </Badge>{" "}
              <Badge variant={member.employment_type === "freelance" ? "neutral" : "success"}>
                {member.employment_type === "freelance" ? "External" : "Internal"}
              </Badge>
              {!member.counselling_enabled && <Badge variant="neutral">Manage-only</Badge>}
            </p>
          </div>
        </div>

        {owner ? (
          // No SplitButton — "Remove from agency" is the only secondary
          // option and it never applies to the owner (blocked server-side
          // too), so a single action gets a plain Button, same convention
          // as AgencyClientDetailPage's Assign/Reassign.
          <Button variant="secondary" size="sm" onClick={() => setConfiguring(true)}>
            Configure member
          </Button>
        ) : (
          <SplitButton
            variant="secondary"
            size="sm"
            primaryLabel="Configure member"
            primaryAction={() => setConfiguring(true)}
            options={[{ label: "Remove from agency", onClick: () => setRemoving(true) }]}
            secondaryLabel="More options"
          />
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Contact</h2>
        <div className={styles.settingRow}>
          <div className={styles.toggleText}>
            <strong>Email</strong>
            <span>{member.email || "Not set"}</span>
          </div>
        </div>
        <div className={styles.settingRow}>
          <div className={styles.toggleText}>
            <strong>Phone</strong>
            <span>{loadingDetails ? "Loading…" : details?.phone || "Not set"}</span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Business details</h2>
        <p className={styles.cardBlurb}>
          {member.employment_type === "freelance"
            ? "Set by this member themselves, under their own Settings — you're seeing it read-only here."
            : `Employed staff don't set their own — this reflects ${agency?.name ?? "the agency"}'s details, not theirs personally.`}
        </p>
        <div className={styles.settingRow}>
          <div className={styles.toggleText}>
            <strong>Business name</strong>
            <span>{loadingDetails ? "Loading…" : details?.business_name || "Not set"}</span>
          </div>
        </div>
        <div className={styles.settingRow}>
          <div className={styles.toggleText}>
            <strong>Address</strong>
            <span>{loadingDetails ? "Loading…" : details?.address || "Not set"}</span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Caseload</h2>
        <div className={styles.settingRow}>
          <div className={styles.toggleText}>
            <strong>Active agency clients</strong>
            <span>{member.counselling_enabled ? caseload : "Counselling switched off for this member"}</span>
          </div>
        </div>
      </div>

      {configuring && <ConfigureMemberModal member={member} isOwner={owner} onClose={() => setConfiguring(false)} />}
      {removing && <RemoveMemberModal member={member} members={members} onClose={() => setRemoving(false)} />}
    </div>
  );
}
