import { useState } from "react";

import type { TimeView } from "@mui/x-date-pickers";
import { DatePicker, DateTimePicker, TimePicker } from "@mui/x-date-pickers";
import type { Dayjs } from "dayjs";

import styles from "./DateInput.module.scss";

export type DateInputMode = "date" | "time" | "datetime";

type Props = {
  mode: DateInputMode;
  value: Dayjs | null;
  onChange: (val: Dayjs | null) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  disablePast?: boolean;
  shouldDisableDate?: (date: Dayjs) => boolean;
  shouldDisableTime?: (val: Dayjs, view: TimeView) => boolean;
  className?: string;
};

const FORMAT: Record<DateInputMode, string> = {
  date: "D MMM YYYY",
  time: "HH:mm",
  datetime: "D MMM YYYY, HH:mm",
};

const textFieldSx = {
  width: "100%",
  "& .MuiInputBase-root": {
    background: "var(--bg-muted)",
    borderRadius: "var(--r-md)",
    border: "1.5px solid var(--border)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "0.9rem",
    transition: "border-color var(--transition-base)",
    "&.Mui-focused": { borderColor: "var(--border-focus)" },
    "&.Mui-disabled": { opacity: 0.5 },
  },
  "& .MuiOutlinedInput-notchedOutline": { border: "none" },
  "& .MuiInputBase-input": {
    padding: "10px 14px",
    cursor: "pointer",
    color: "var(--text-primary)",
    "&.Mui-disabled": { WebkitTextFillColor: "var(--text-muted)" },
  },
  "& .MuiInputAdornment-root .MuiButtonBase-root": {
    color: "var(--text-muted)",
    "&:hover": { color: "var(--text-secondary)", background: "transparent" },
  },
};

const paperSx = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-md)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
  color: "var(--text-primary)",
  "& *": { fontFamily: "var(--font-sans)" },
  "& .MuiPickersCalendarHeader-label": { color: "var(--text-primary)" },
  "& .MuiPickersCalendarHeader-switchViewButton, & .MuiPickersArrowSwitcher-button": {
    color: "var(--text-muted)",
    "&:hover": { background: "var(--bg-muted)" },
  },
  "& .MuiDayCalendar-weekDayLabel": { color: "var(--text-muted)" },
  "& .MuiPickersDay-root": {
    color: "var(--text-primary)",
    background: "transparent",
    "&:hover": { background: "var(--bg-muted)" },
    "&.Mui-selected": { background: "var(--accent) !important", color: "#fff" },
    "&.MuiPickersDay-today": { borderColor: "var(--accent)" },
    "&.Mui-disabled": { color: "var(--text-muted)", opacity: 0.4 },
  },
  "& .MuiYearCalendar-root .MuiPickersYear-yearButton": {
    color: "var(--text-primary)",
    "&.Mui-selected": { background: "var(--accent)", color: "#fff" },
    "&:hover": { background: "var(--bg-muted)" },
  },
  "& .MuiMonthCalendar-root .MuiPickersMonth-monthButton": {
    color: "var(--text-primary)",
    "&.Mui-selected": { background: "var(--accent)", color: "#fff" },
    "&:hover": { background: "var(--bg-muted)" },
  },
  "& .MuiPickersToolbar-root": {
    background: "var(--bg-muted)",
    color: "var(--text-primary)",
    "& .MuiTypography-root, & .MuiButtonBase-root": { color: "var(--text-primary)" },
  },
  "& .MuiPickersLayout-actionBar .MuiButton-root": {
    color: "var(--accent)",
    textTransform: "none",
    fontFamily: "var(--font-sans)",
  },
  "& .MuiTabs-root .MuiTab-root": { color: "var(--text-muted)" },
  "& .MuiTabs-root .MuiTab-root.Mui-selected": { color: "var(--accent)" },
  "& .MuiTabs-indicator": { background: "var(--accent)" },
  "& .MuiClock-root": { background: "var(--bg-muted)" },
  "& .MuiClock-pin, & .MuiClockPointer-root": { background: "var(--accent)" },
  "& .MuiClockPointer-thumb": { background: "var(--accent)", borderColor: "var(--accent)" },
  "& .MuiClockNumber-root": {
    color: "var(--text-primary)",
    "&.Mui-selected": { background: "var(--accent)", color: "#fff" },
  },
  "& .MuiMultiSectionDigitalClock-root": {
    background: "var(--bg-card)",
    "& .MuiMenuItem-root": {
      color: "var(--text-primary)",
      "&:hover": { background: "var(--bg-muted)" },
      "&.Mui-selected": {
        background: "var(--accent)",
        color: "#fff",
        "&:hover": { background: "var(--accent)" },
      },
    },
  },
};

export default function DateInput({
  mode,
  value,
  onChange,
  label,
  ariaLabel,
  disabled,
  disablePast,
  shouldDisableDate,
  shouldDisableTime,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const pickerProps = {
    value,
    onChange,
    open,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
    disabled,
    disablePast,
    shouldDisableDate,
    shouldDisableTime,
    ampm: false,
    format: FORMAT[mode],
    slotProps: {
      field: { readOnly: true },
      textField: {
        fullWidth: true,
        sx: textFieldSx,
        inputProps: ariaLabel ? { "aria-label": ariaLabel } : undefined,
      },
      desktopPaper: { sx: paperSx },
    },
  };

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      {label && <span className={styles.label}>{label}</span>}
      {mode === "date" && <DatePicker {...pickerProps} />}
      {mode === "time" && <TimePicker {...pickerProps} />}
      {mode === "datetime" && <DateTimePicker {...pickerProps} />}
    </div>
  );
}
