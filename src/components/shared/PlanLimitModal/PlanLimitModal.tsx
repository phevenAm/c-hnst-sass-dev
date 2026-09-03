import { useNavigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

type Props = {
  /** Which cap was hit. */
  kind: "active" | "archived";
  /** Raw message from the DB trigger, shown small for context. */
  detail?: string;
  onClose: () => void;
};

const SUBSCRIPTION_SETTINGS = "/settings?tab=billing&section=subscription";

/**
 * Shown when a client add / invite / unarchive is blocked by the plan's
 * client cap (DB triggers raise PLAN_LIMIT_ACTIVE / PLAN_LIMIT_ARCHIVED).
 */
export default function PlanLimitModal({ kind, detail, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <Modal
      title="You've reached your plan's limit"
      onClose={onClose}
      size="sm"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate(SUBSCRIPTION_SETTINGS);
            }}
          >
            See plans
          </Button>
        </>
      }
    >
      {kind === "active" ? (
        <>
          <p>Your current plan doesn't have room for another active client.</p>
          <p>Archive a client you're no longer seeing to free up a space, or move to a larger plan.</p>
        </>
      ) : (
        <>
          <p>Your current plan doesn't have room for another archived client.</p>
          <p>Move to a larger plan to keep more archived records, or permanently remove one.</p>
        </>
      )}
      {detail && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{detail}</p>}
    </Modal>
  );
}
