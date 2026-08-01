import Button from "@components/shared/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";

import { useToast } from "@/context/ToastContext";
import { useAppDispatch } from "@/store/hooks";
import { deleteSession } from "@/store/slices/sessionsSlice";

import styles from "./DeleteSessionModal.module.scss";

type DeleteModalProps = {
  id: string;
  onClose: () => void;
};

const DeleteSessionModal = ({ id, onClose }: DeleteModalProps) => {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isDemo } = useAuth();

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteSession(id)).unwrap();
      showToast("Session deleted", "success");
      onClose();
    } catch (error) {
      showToast(error.message as string, "danger");
    }
  };

  const actionsObj = (
    <div className={styles.modalActions}>
      <Button variant="danger" onClick={() => handleDelete(id)}>
        Yes, delete
      </Button>
      <Button variant="ghost" onClick={onClose} disabled={isDemo}>
        No, cancel
      </Button>
    </div>
  );

  return (
    <Modal actions={actionsObj} size={"sm"} onClose={onClose} title="Delete session?">
      <p>This action cannot be undone</p>
    </Modal>
  );
};

export default DeleteSessionModal;
