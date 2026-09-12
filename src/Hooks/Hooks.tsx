import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import type { RootState } from "@store/index";
import { selectAllUsers } from "@/store/slices/userDirectorySlice";
import { UserProfile } from "@/models/globalTypes";
import { selectStubById } from "@/store/slices/clientStubsSlice";

// biome-ignore lint/suspicious/noExplicitAny: RTK async thunk action creators don't have a shared type
export function useFetchOnIdle<T>(selector: (state: RootState) => T, thunk: any, errorMessage: string) {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selector);

  useEffect(() => {
    if (status === "idle") {
      dispatch(thunk())
        .unwrap()
        .catch((err: unknown) => {
          console.error(errorMessage, err);
        });

      //!implement retry if status === error
    }
  }, [status, dispatch, thunk, errorMessage]);
}

export const useDoesClientHaveEmail = (clientId: string) => {
  const users = useAppSelector(selectAllUsers) as UserProfile[];
  const offlineClient = useAppSelector(selectStubById(clientId));

  //!the deletion modal doesnt even fire for offline clietns? only on calleation - cancellation doesnt respect the email either

  const client = users.find(
    (user) => user.role !== "admin" && !user.deleted_at && !user.archived_at && user.id === clientId,
  );

  return Boolean(client?.email || offlineClient?.email);
};
