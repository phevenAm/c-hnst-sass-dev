import { useState } from "react";

import type { DateView, TimeView } from "@mui/x-date-pickers";
import { DatePicker, DateTimePicker, TimePicker } from "@mui/x-date-pickers";
import type { Dayjs } from "dayjs";

import styles from "./DateInput.module.scss";

export type DateInputMode = "date" | "time" | "datetime";

type Props = {
  mode: DateInputMode;
  value: Dayjs | null;
  onChange: (val: Dayjs | null) => void;
  label?: string;
  /** MUI floating label — sits inside the field, shrinks to the border when it has a value. */
  floatingLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  disablePast?: boolean;
  shouldDisableDate?: (date: Dayjs) => boolean;
  shouldDisableTime?: (val: Dayjs, view: TimeView) => boolean;
  /** Restrict the calendar to certain views, e.g. `["year", "month"]` for a month picker. */
  views?: DateView[];
  /** Which view the calendar opens on. */
  openTo?: DateView;
  /** Override the displayed value format (defaults per `mode`). */
  format?: string;
  className?: string;
  /** Shrink to the same height as the app's pill toggles (e.g. SegmentedTabs) — for control bars where the default MUI field reads oversized. */
  dense?: boolean;
};

const FORMAT: Record<DateInputMode, string> = {
  date: "D MMM YYYY",
  time: "HH:mm",
  datetime: "D MMM YYYY, HH:mm",
};

// MUI X's sectioned date/time fields render as PickersInputBase /
// PickersOutlinedInput, not the classic MUI TextField's InputBase /
// OutlinedInput — the class names below match that (verified against the
// rendered DOM; the old Mui*Input* selectors silently matched nothing).
const textFieldSx = {
  width: "100%",
  "& .MuiPickersInputBase-root": {
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
  // MUI's own default root padding is "0 4px 0 14px" — 4px on the end where
  // the calendar-icon button sits crams it right against the border.
  "& .MuiPickersInputBase-adornedEnd": { paddingRight: "10px" },
  "& .MuiPickersOutlinedInput-notchedOutline": { border: "none" },
  "& .MuiPickersInputBase-input": {
    padding: "10px 14px",
    cursor: "pointer",
    color: "var(--text-primary)",
    "&.Mui-disabled": { WebkitTextFillColor: "var(--text-muted)" },
  },
  "& [data-mui-picker-open-button]": {
    color: "var(--text-muted)",
    // MUI ships this button with a built-in -12px right margin (compensating
    // for its own hit-target padding so the icon lines up flush in MUI's own
    // layouts) — it was eating the adornedEnd padding above and then some,
    // crowding the icon right up against our border.
    marginRight: 0,
    "&:hover": { color: "var(--text-secondary)", background: "transparent" },
  },
  // Floating label (only rendered when `floatingLabel` is passed) — there's
  // no notched outline to cut a gap for it, so it just sits on the field's
  // background where it overlaps the top edge, same look as a filled variant.
  "& .MuiFormLabel-root": {
    color: "var(--text-muted)",
    fontFamily: "var(--font-sans)",
    background: "var(--bg-muted)",
    padding: "0 4px",
    "&.Mui-focused": { color: "var(--border-focus)" },
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
  views,
  openTo,
  format,
  className,
  dense,
  floatingLabel,
}: Props) {
  const [open, setOpen] = useState(false);

  // Props common to all three pickers. Date-only and time-only props are added
  // per picker below — spreading `shouldDisableTime` / `ampm` onto <DatePicker>
  // (or `shouldDisableDate` onto <TimePicker>) leaks them to the DOM and React
  // warns ("does not recognize the `shouldDisableTime` prop", "Received `false`
  // for a non-boolean attribute `ampm`").
  const commonProps = {
    value,
    onChange,
    open,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
    disabled,
    disablePast,
    format: format ?? FORMAT[mode],
    ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
    slotProps: {
      field: { readOnly: true },
      textField: { fullWidth: true, sx: textFieldSx, ...(floatingLabel ? { label: floatingLabel } : {}) },
      desktopPaper: { sx: paperSx },
    },
  };

  const dateProps = { shouldDisableDate, ...(views ? { views } : {}), ...(openTo ? { openTo } : {}) };
  const timeProps = { shouldDisableTime, ampm: false as const };

  return (
    <div className={[styles.wrapper, dense ? styles.dense : "", className].filter(Boolean).join(" ")}>
      {label && <span className={styles.label}>{label}</span>}
      {mode === "date" && <DatePicker {...commonProps} {...dateProps} />}
      {mode === "time" && <TimePicker {...commonProps} {...timeProps} />}
      {mode === "datetime" && <DateTimePicker {...commonProps} {...dateProps} {...timeProps} />}
    </div>
  );
}
