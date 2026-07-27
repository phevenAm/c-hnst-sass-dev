import { useState } from "react";

import styles from "./ToggleButtonTabs.module.scss";

export type ToggleButtonTabsTypes = {
  leftButtonTitle: string;
  leftButtonAction: () => void;
  rightButtonTitle: string;
  rightButtonAction: () => void;
  activeTab: string;
  fullWidth?: boolean;
};
export type toggleTypes = "left" | "right";
const ToggleButtonTabs = ({
  leftButtonTitle,
  rightButtonTitle,
  leftButtonAction,
  rightButtonAction,
  activeTab,
  fullWidth,
}: ToggleButtonTabsTypes) => {
  return (
    <div className={`${styles.sessionTabs} ${fullWidth ? styles.sessionTabsFullWidth : ""}`}>
      <button
        type="button"
        className={activeTab === "left" ? styles.sessionTabActive : styles.sessionTab}
        onClick={leftButtonAction}
      >
        {leftButtonTitle}
      </button>
      <button
        type="button"
        className={activeTab === "right" ? styles.sessionTabActive : styles.sessionTab}
        onClick={rightButtonAction}
      >
        {rightButtonTitle}
      </button>
    </div>
  );
};

export default ToggleButtonTabs;
