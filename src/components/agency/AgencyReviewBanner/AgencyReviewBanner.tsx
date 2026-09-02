import { useEffect } from "react";
import { Link } from "react-router-dom";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import { fetchIncomingAssignments, selectIncomingAssignments, selectIsAgencyMember } from "@store/slices/agencySlice";

import styles from "./AgencyReviewBanner.module.scss";

// Thin strip on the counselling side: only appears for an agency member who has
// clients waiting to be accepted. Keeps the review flow reachable without the
// member having to open manage mode.
export default function AgencyReviewBanner() {
  const dispatch = useAppDispatch();
  const isMember = useAppSelector(selectIsAgencyMember);
  const incoming = useAppSelector(selectIncomingAssignments);

  useEffect(() => {
    if (isMember) dispatch(fetchIncomingAssignments());
  }, [dispatch, isMember]);

  if (!isMember || incoming.length === 0) return null;

  return (
    <Link to="/agency/incoming" className={styles.banner}>
      {incoming.length} {incoming.length === 1 ? "client is" : "clients are"} waiting for your review
      <span className={styles.cta}>Review →</span>
    </Link>
  );
}
