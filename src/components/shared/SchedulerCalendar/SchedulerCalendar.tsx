import type { CSSProperties, ReactNode } from "react";
import { Calendar, dayjsLocalizer, type View, Views } from "react-big-calendar";

import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "./SchedulerCalendar.scss";

import type { SchedulerEvent } from "./schedulerUtils";

// ============================================================
// SHARED SCHEDULER CALENDAR
//
// Wraps react-big-calendar with the app's localizer, theme, custom event
// chip and a role-free column header (for accessibility). Both the admin
// scheduler and the client calendar render this, passing their own events
// and event-click handler. Styling lives in SchedulerCalendar.scss, scoped
// to the .portal-calendar wrapper.
//
// Drag-and-drop is enabled for session events only (draggableAccessor).
// Buffer events (10 min post-session) are non-interactive visual indicators.
// ============================================================

dayjs.extend(localizedFormat);
const localizer = dayjsLocalizer(dayjs);

const DnDCalendar = withDragAndDrop<SchedulerEvent>(Calendar);

// Clamp the visible time axis so the grid isn't 24h tall.
const MIN_TIME = dayjs().hour(7).minute(0).second(0).toDate();
const MAX_TIME = dayjs().hour(21).minute(0).second(0).toDate();

export type { EventInteractionArgs };

type SchedulerCalendarProps = {
  events: SchedulerEvent[];
  date: Date;
  view: View;
  onNavigate: (date: Date) => void;
  onView: (view: View) => void;
  onSelectEvent?: (event: SchedulerEvent) => void;
  onEventDrop?: (args: EventInteractionArgs<SchedulerEvent>) => void;
  slotPropGetter?: (date: Date) => { className?: string; style?: CSSProperties };
  height?: string;
};

export default function SchedulerCalendar({
  events,
  date,
  view,
  onNavigate,
  onView,
  onSelectEvent,
  onEventDrop,
  slotPropGetter,
  height = "72vh",
}: SchedulerCalendarProps) {
  return (
    <div className="portal-calendar">
      <DnDCalendar
        localizer={localizer}
        events={events}
        date={date}
        view={view}
        onNavigate={onNavigate}
        onView={onView}
        views={[Views.WORK_WEEK, Views.WEEK, Views.DAY]}
        defaultView={Views.WORK_WEEK}
        min={MIN_TIME}
        max={MAX_TIME}
        step={30}
        timeslots={2}
        popup
        eventPropGetter={eventPropGetter}
        onSelectEvent={onSelectEvent}
        onEventDrop={onEventDrop}
        slotPropGetter={slotPropGetter}
        draggableAccessor={(event: SchedulerEvent) =>
          event.resource.type === "session" || event.resource.type === "stub-session"
        }
        resizableAccessor={() => false}
        components={{ event: EventChip, header: HeaderCell }}
        style={{ height }}
      />
    </div>
  );
}

// Colour each event by its resource type. Sessions are per-client solid fills;
// windows/blocks use the shared ghost classes.
function eventPropGetter(event: SchedulerEvent) {
  const r = event.resource;
  if (r.type === "session") {
    return { style: { backgroundColor: r.color, borderColor: r.color } };
  }
  if (r.type === "cancelled-session" || r.type === "cancelled-stub-session") {
    return { className: "cal-cancelled-session" };
  }
  if (r.type === "stub-session") {
    return { style: { backgroundColor: r.color, borderColor: r.color, borderStyle: "dashed" } };
  }
  if (r.type === "buffer") {
    return { className: "cal-buffer" };
  }
  if (r.type === "blocked") {
    return { className: "cal-blocked" };
  }
  if (r.type === "private") {
    return { className: "cal-private" };
  }
  return { className: "cal-window" };
}

// Role-free column header. RBC's default emits <span role="columnheader"> with
// no role="row" parent in time views, which axe flags — a plain span avoids it.
function HeaderCell({ label }: { label: ReactNode }) {
  return <span>{label}</span>;
}

// Custom event body. Sessions show title + time + location; windows/blocks
// show their label + time. Buffer events render nothing (styled via CSS only).
function EventChip({ event }: { event: SchedulerEvent }) {
  const r = event.resource;

  if (r.type === "buffer") {
    return null;
  }

  const time = `${dayjs(event.start).format("h:mm")}–${dayjs(event.end).format("h:mma")}`;

  if (r.type === "session") {
    const isOnline = r.session.location !== "in_person";
    return (
      <div className="cal-chip">
        <span className="cal-chipTitle">{r.clientName}</span>
        <span className="cal-chipMeta">
          {time} · {isOnline ? "Online" : "In person"}
        </span>
      </div>
    );
  }

  if (r.type === "cancelled-session") {
    const isOnline = r.session.location !== "in_person";
    return (
      <div className="cal-chip">
        <span className="cal-chipTitle">{r.clientName}</span>
        <span className="cal-chipMeta">
          {time} · {isOnline ? "Online" : "In person"} · Cancelled
        </span>
      </div>
    );
  }

  if (r.type === "stub-session") {
    return (
      <div className="cal-chip">
        <span className="cal-chipTitle">{r.clientName}</span>
        <span className="cal-chipMeta">{time} · Offline</span>
      </div>
    );
  }

  if (r.type === "cancelled-stub-session") {
    return (
      <div className="cal-chip">
        <span className="cal-chipTitle">{r.clientName}</span>
        <span className="cal-chipMeta">{time} · Offline · Cancelled</span>
      </div>
    );
  }

  return (
    <div className="cal-chip">
      <span className="cal-chipTitle">{event.title}</span>
      <span className="cal-chipMeta">{time}</span>
    </div>
  );
}
