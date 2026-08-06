import { useState } from "react";

import dayjs, { Dayjs } from "dayjs";

import { Button, DateInput, Modal } from "@/components/shared";
import { ModalProps } from "@/components/shared/Modal/Modal";
import { useToast } from "@/context/ToastContext";
import { Todo } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { createTodoItem, updateTodoItem } from "@/store/slices/TodoSlice";

import styles from "./TodoListModal.module.scss";

type Props = {
  onClose: () => void;
  editingTask?: Todo;
};

const TodoListModal = ({ onClose, editingTask }: Props) => {
  const [text, setText] = useState(editingTask?.text ?? "");
  const [date, setDate] = useState<Dayjs | null>(editingTask?.deadline ? dayjs(editingTask.deadline) : null);
  const [priority, setPriority] = useState<1 | 2 | 3>((editingTask?.priority ?? 2) as 1 | 2 | 3);
  const [createMultiple, setCreateMultiple] = useState(false);
  const [loading, setLoading] = useState(false);

  const { showToast } = useToast();
  const dispatch = useAppDispatch();

  const reset = () => {
    setText(editingTask?.text ?? "");
    setDate(editingTask?.deadline ? dayjs(editingTask.deadline) : null);
    setPriority((editingTask?.priority ?? 2) as 1 | 2 | 3);
    setLoading(false);
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    if (!text) {
      showToast("Your new task is missing text", "warning");
      return;
    }
    setLoading(true);
    try {
      await dispatch(createTodoItem({ text, priority, deadline: date ? date.toISOString() : null })).unwrap();
      showToast("Task created", "success");
      reset();
      if (!createMultiple) onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong, please reload and try again";
      showToast(message, "danger");
    }
    setLoading(false);
  };

  const handleUpdate = async () => {
    if (!editingTask) return;
    setLoading(true);
    try {
      await dispatch(
        updateTodoItem({ id: editingTask.id, text, priority, deadline: date ? date.toISOString() : null }),
      ).unwrap();
      showToast("Task updated", "success");
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong, please reload and try again";
      showToast(message, "danger");
    }
    setLoading(false);
  };

  const getButtonText = () => {
    if (loading) {
      return editingTask ? "Saving..." : "Creating...";
    }
    return editingTask ? "Save changes" : "Create";
  };

  const modalObj: ModalProps = {
    title: editingTask ? "Edit task" : "New task",
    onClose: handleCancel,
    actions: (
      <div className={styles.actionContainer}>
        {!editingTask && (
          <div className={styles.checkContainer}>
            <label htmlFor="createMultiple">Create another task</label>
            <input
              type="checkbox"
              id="createMultiple"
              checked={createMultiple}
              onClick={() => setCreateMultiple(!createMultiple)}
            />
          </div>
        )}
        <div className={styles.buttons}>
          <Button onClick={handleCancel} variant="ghost" disabled={loading}>
            Cancel
          </Button>
          <Button onClick={editingTask ? handleUpdate : handleCreate} disabled={loading}>
            {getButtonText()}
          </Button>
        </div>
      </div>
    ),
  };

  return (
    <Modal {...modalObj}>
      <div className={styles.newItem}>
        <div className={styles.field}>
          <label htmlFor="todoText">Task</label>
          <input
            id="todoText"
            type="text"
            placeholder="What needs doing?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="todoPriority">Priority</label>
          <select id="todoPriority" value={priority} onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}>
            <option value={1}>High</option>
            <option value={2}>Medium</option>
            <option value={3}>Low</option>
          </select>
        </div>
        <DateInput mode="date" value={date} onChange={setDate} label="Deadline (optional)" />
      </div>
    </Modal>
  );
};

export default TodoListModal;
