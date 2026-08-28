import { useState } from "react";

import { BinIcon, EditIcon, IconButton, TickIcon } from "@/components/shared";
import { useToast } from "@/context/ToastContext";
import type { Todo } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { deleteTodoItem, updateTodoItem } from "@/store/slices/TodoSlice";
import TodoListModal from "../TodoListModal/TodoListModal";

import styles from "./TodoListItem.module.scss";

const PRIORITY_LABELS: Record<number, string> = { 1: "High", 2: "Med", 3: "Low" };
const PRIORITY_CLASSES: Record<number, string> = { 1: styles.p1, 2: styles.p2, 3: styles.p3 };

const TodoListItem = (todo: Todo) => {
  const { completed, text, priority, deadline, id } = todo;
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { showToast } = useToast();
  const dispatch = useAppDispatch();

  const handleDeleteTodo = async (id: string) => {
    setIsDeleting(true);
    try {
      await dispatch(deleteTodoItem(id)).unwrap();
      showToast("Task deleted", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete, please reload page and try again";
      showToast(message, "danger");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTodoUpdate = async () => {
    setIsUpdating(true);

    try {
      const now = new Date().toISOString();
      await dispatch(updateTodoItem({ ...todo, completed: true, completed_at: now })).unwrap();
      showToast("Task Updated", "success");
    } catch (_error) {
      showToast("Something went wrong, please refresh page", "danger");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <div className={`${styles.container} ${completed ? styles.completed : ""}`}>
        <div className={styles.header}>
          <span className={`${styles.priority} ${PRIORITY_CLASSES[priority]}`}>{PRIORITY_LABELS[priority]}</span>
          <p>{text}</p>
        </div>

        <div>
          <div className={styles.meta}>
            {deadline && new Date(deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </div>
          <div className={styles.actions}>
            <IconButton
              label="Mark as completed"
              icon={
                isUpdating ? (
                  <span className="buttonLoadingDots" aria-hidden="true">
                    ...
                  </span>
                ) : (
                  <TickIcon />
                )
              }
              onClick={handleTodoUpdate}
              disabled={isUpdating || completed}
            />
            <IconButton
              label="Edit item"
              icon={<EditIcon />}
              disabled={isUpdating || completed}
              onClick={() => setIsEditModalOpen(true)}
            />
            <IconButton
              variant="danger"
              label="Delete item"
              disabled={isDeleting}
              icon={
                isDeleting ? (
                  <span className="buttonLoadingDots" aria-hidden="true">
                    ...
                  </span>
                ) : (
                  <BinIcon />
                )
              }
              onClick={() => {
                handleDeleteTodo(id);
              }}
            />
          </div>
        </div>
      </div>

      {isEditModalOpen && (
        <TodoListModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} editingTask={todo} />
      )}
    </>
  );
};

export default TodoListItem;
