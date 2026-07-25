import { useState } from "react";

import { RootState } from "@/store";

import { Button, Card } from "@/components/shared";
import { useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchAllTodos, selectCompletedTodos, selectOutstandingTodos } from "@/store/slices/TodoSlice";
import TodoList from "./TodoList";
import TodoListModal from "./TodoListModal/TodoListModal";

import styles from "./TodoListCard.module.scss";

const TodoListCard = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [isShowCompleted, setIsShowCompleted] = useState(false);

  useFetchOnIdle(
    (state: RootState) => state.todos.status,
    () => fetchAllTodos(),
    "Failed to fetch todo items",
  );

  // const todos = useAppSelector((state: RootState) => state.todos.todos);
  const todos = useAppSelector(selectOutstandingTodos);
  const todosCompleted = useAppSelector(selectCompletedTodos);

  return (
    <>
      <Card>
        <div className={styles.cardPad}>
          <div className={styles.cardHeader}>
            <h2>Todo list</h2>
            <div className={styles.todoButtons}>
              {todosCompleted && (
                <Button size="sm" variant="ghost" onClick={() => setIsShowCompleted(!isShowCompleted)}>
                  {isShowCompleted ? "Hide completed" : "Show completed"}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setModalOpen(true)}>
                + Todo
              </Button>
            </div>
          </div>
          <div className={styles.actionList}>
            <TodoList todos={todos} />
          </div>

          <div className={styles.completedSection}>
            {isShowCompleted && (
              <>
                <h3>Completed</h3>
                <TodoList todos={todosCompleted} />
              </>
            )}
          </div>
        </div>
      </Card>

      {modalOpen && <TodoListModal onClose={() => setModalOpen(false)} />}
    </>
  );
};

export default TodoListCard;
