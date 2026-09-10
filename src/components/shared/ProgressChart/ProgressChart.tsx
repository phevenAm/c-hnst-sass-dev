import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { useInterfacePrefs } from "@/context/InterfacePrefsContext";
import type { Question, Response } from "../../../models/globalTypes";
import Card from "../Card/Card";
import SegmentedTabs, { type SegmentedTab } from "../SegmentedTabs/SegmentedTabs";

dayjs.extend(isoWeek);

import styles from "./ProgressChart.module.scss";

const LINE_COLORS = ["#4a665b", "#5f8073", "#3a7fa8", "#8a6a2d", "#a8633a", "#6a5b8a"];

export const scoreToHeatColor = (score: number) => {
  if (!score) return "var(--bg-muted)";

  const stops = [
    [220, 240, 235],
    [180, 220, 210],
    [90, 170, 150],
    [31, 73, 64],
  ] as const;

  const t = ((score - 1) / 9) * (stops.length - 1);
  const i = Math.floor(t);
  const f = t - i;

  const a = stops[Math.min(i, stops.length - 1)];
  const b = stops[Math.min(i + 1, stops.length - 1)];

  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)}, ${Math.round(
    a[1] + (b[1] - a[1]) * f,
  )}, ${Math.round(a[2] + (b[2] - a[2]) * f)})`;
};

export const formatDate = (iso?: string) => {
  if (!iso) return "Unknown";
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return `${date.getDate()}/${date.getMonth() + 1}`;
};

export const getResponseDate = (response: Response) => response.submitted_at ?? response.created_at ?? "";

export const getScore = (response: Response, questionId: string) => {
  const scores = response.scores as Record<string, number | string>;
  const raw = scores?.[questionId];

  if (raw === undefined || raw === null || raw === "") return 0;

  return Number(raw);
};

type TagRef = { id: string; name: string };

// Builds a questionId → tag lookup for scale questions that have a tag assigned.
const buildTagLookup = (questions: Question[]): Map<string, TagRef> => {
  const map = new Map<string, TagRef>();
  for (const q of questions) {
    if (q.type === "scale" && q.tag_id && q.tag) {
      map.set(q.id, { id: q.tag_id, name: q.tag.name });
    }
  }
  return map;
};

// For each response, averages scale scores across all questions that share the same tag.
// Returns an array of chart data points: [{ label, index, [tagId]: avg, ... }]
//
// Responses come from every questionnaire assigned to the client (see
// ClientDashboard's chartResponses), not just the one this chart is meant
// to track — e.g. a CORE-10 submission has no tagged questions at all. A
// response that touches none of this chart's tags is skipped entirely
// rather than injected as an empty point: an empty point still claims an
// x-axis slot (duplicate-looking dates) and — for a response that happens
// to touch exactly one tag — renders as a single stranded dot with no line
// connecting to it.
export const buildTagChartData = (responses: Response[], questions: Question[]): Record<string, string | number>[] => {
  const tagByQuestion = buildTagLookup(questions);
  const points: Record<string, string | number>[] = [];

  for (const response of responses) {
    const accum = new Map<string, { total: number; count: number }>();
    const scores = response.scores as Record<string, number | string>;

    for (const [questionId, rawScore] of Object.entries(scores)) {
      const tag = tagByQuestion.get(questionId);
      if (!tag) continue;
      const score = Number(rawScore);
      if (!score) continue; // skip 0 / empty
      const prev = accum.get(tag.id) ?? { total: 0, count: 0 };
      accum.set(tag.id, { total: prev.total + score, count: prev.count + 1 });
    }

    if (accum.size === 0) continue;

    const point: Record<string, string | number> = {
      label: formatDate(getResponseDate(response)),
      index: points.length + 1,
      date: getResponseDate(response),
    };
    for (const [tagId, { total, count }] of accum.entries()) {
      point[tagId] = Math.round((total / count) * 10) / 10;
    }
    points.push(point);
  }

  return points;
};

type TooltipEntry = { name: string; value: number; color: string };
type CustomTooltipProps = { active?: boolean; payload?: TooltipEntry[]; label?: string };

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "10px 14px",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <p
        style={{
          fontWeight: 600,
          marginBottom: 6,
          color: "var(--text-primary)",
          fontSize: 13,
        }}
      >
        {label}
      </p>

      {payload.map((entry) => (
        <p
          key={entry.name}
          style={{
            color: entry.color,
            fontSize: 12,
            marginBottom: 2,
          }}
        >
          {entry.name}: <strong>{entry.value}/10</strong>
        </p>
      ))}
    </div>
  );
};

type LineKey = { id: string; name: string };

// How many raw check-ins fit comfortably before the chart starts to feel
// cramped — past this the zoom control appears and the plot scrolls instead
// of squeezing every point into view.
export const ZOOM_THRESHOLD = 24;

// Min horizontal room per data point. Below the threshold the chart just
// fills its container; above it, this is what makes it overflow and scroll.
const PX_PER_POINT = 46;
const Y_AXIS_GUTTER = 44;
const CHART_HEIGHT = 300;

export type ZoomLevel = "all" | "week" | "month" | "year";

export const ZOOM_TABS: SegmentedTab<ZoomLevel>[] = [
  { value: "all", label: "All" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

const zoomLabel = (start: dayjs.Dayjs, level: Exclude<ZoomLevel, "all">): string => {
  if (level === "week") return start.format("D MMM");
  if (level === "month") return start.format("MMM YY");
  return start.format("YYYY");
};

// Collapses raw per-check-in points into week / month / year buckets, averaging
// each line's value across the bucket. "all" is a no-op. Points carry an ISO
// `date` (added in build*ChartData) which is what we bucket on.
export const aggregatePoints = (
  data: Record<string, string | number>[],
  lines: LineKey[],
  level: ZoomLevel,
): Record<string, string | number>[] => {
  if (level === "all") return data;

  const unit = level === "week" ? "isoWeek" : level;
  const groups = new Map<string, { start: dayjs.Dayjs; sums: Map<string, number>; counts: Map<string, number> }>();

  for (const point of data) {
    const iso = String(point.date ?? "");
    if (!iso) continue;
    const start = dayjs(iso).startOf(unit);
    const key = start.format("YYYY-MM-DD");
    let group = groups.get(key);
    if (!group) {
      group = { start, sums: new Map(), counts: new Map() };
      groups.set(key, group);
    }
    for (const line of lines) {
      const value = point[line.id];
      if (typeof value !== "number" || Number.isNaN(value)) continue;
      group.sums.set(line.id, (group.sums.get(line.id) ?? 0) + value);
      group.counts.set(line.id, (group.counts.get(line.id) ?? 0) + 1);
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.start.valueOf() - b.start.valueOf())
    .map((group, index) => {
      const point: Record<string, string | number> = {
        label: zoomLabel(group.start, level),
        index: index + 1,
        date: group.start.format("YYYY-MM-DD"),
      };
      for (const line of lines) {
        const count = group.counts.get(line.id) ?? 0;
        if (count > 0) point[line.id] = Math.round(((group.sums.get(line.id) as number) / count) * 10) / 10;
      }
      return point;
    });
};

function LineView({ data, lines }: { data: Record<string, string | number>[]; lines: LineKey[] }) {
  const { reduceMotion } = useInterfacePrefs();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWrapWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => setWrapWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fill the container when points are few; overflow (and scroll) when many.
  const naturalWidth = data.length * PX_PER_POINT + Y_AXIS_GUTTER;
  const chartWidth = Math.max(wrapWidth || 320, naturalWidth);

  // Land on the most recent check-in rather than the oldest whenever the
  // plotted width changes (new data, resize, or a zoom-level switch).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !data.length) return;
    el.scrollLeft = Math.max(0, chartWidth - el.clientWidth);
  }, [data.length, chartWidth]);

  return (
    // aria-hidden: title + legend above provide the accessible representation
    <div aria-hidden="true" ref={wrapRef} className={styles.scroller} data-testid="line-chart">
      <LineChart
        data={data}
        width={chartWidth}
        height={CHART_HEIGHT}
        margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />

        <YAxis
          domain={[0, 10]}
          ticks={[0, 2, 4, 6, 8, 10]}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />

        <Tooltip content={<CustomTooltip />} />

        <Legend
          wrapperStyle={{
            fontSize: 12,
            paddingTop: 14,
            color: "var(--text-secondary)",
          }}
        />

        {lines.map((line, index) => (
          <Line
            key={line.id}
            type="monotone"
            dataKey={line.id}
            name={line.name}
            stroke={LINE_COLORS[index % LINE_COLORS.length]}
            strokeWidth={2.5}
            dot={{
              r: 3,
              fill: LINE_COLORS[index % LINE_COLORS.length],
              strokeWidth: 0,
            }}
            activeDot={{ r: 5 }}
            isAnimationActive={!reduceMotion}
          />
        ))}
      </LineChart>
    </div>
  );
}

// Fallback used when no questions have tags assigned yet — plots raw scale questions.
const buildQuestionChartData = (responses: Response[], scaleQuestions: Question[]) =>
  responses.map((response, index) => {
    const point: Record<string, string | number> = {
      label: formatDate(getResponseDate(response)),
      index: index + 1,
      date: getResponseDate(response),
    };
    for (const q of scaleQuestions) {
      point[q.id] = getScore(response, q.id);
    }
    return point;
  });

interface ProgressChartProps {
  responses: Response[];
  questions: Question[];
  title?: string;
}

export default function ProgressChart({ responses, questions, title = "Your Progress" }: ProgressChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("all");

  const { tags, scaleQuestions } = useMemo(() => {
    const seen = new Map<string, TagRef>();
    const scale: Question[] = [];
    for (const q of questions) {
      if (q.type !== "scale") continue;
      scale.push(q);
      if (q.tag_id && q.tag && !seen.has(q.tag_id)) {
        seen.set(q.tag_id, { id: q.tag_id, name: q.tag.name });
      }
    }
    return { tags: Array.from(seen.values()), scaleQuestions: scale };
  }, [questions]);

  // Tag-based chart when tags are set up; falls back to per-question lines until then.
  const usingTags = tags.length > 0;
  const { chartData, lines } = useMemo(() => {
    const built = usingTags
      ? buildTagChartData(responses, questions)
      : buildQuestionChartData(responses, scaleQuestions);
    const keys: LineKey[] = usingTags ? tags : scaleQuestions.map((q) => ({ id: q.id, name: q.text }));
    return { chartData: built, lines: keys };
  }, [usingTags, tags, scaleQuestions, responses, questions]);

  // Only offer zoom once the raw plot starts to feel full.
  const showZoom = chartData.length > ZOOM_THRESHOLD;
  const effectiveZoom: ZoomLevel = showZoom ? zoom : "all";
  const viewData = useMemo(() => aggregatePoints(chartData, lines, effectiveZoom), [chartData, lines, effectiveZoom]);

  if (!responses || responses.length === 0) {
    return (
      <Card>
        <p className={styles.empty}>No responses yet. Complete your first check-in to see your progress.</p>
      </Card>
    );
  }

  if (scaleQuestions.length === 0) {
    return (
      <Card>
        <p className={styles.empty}>No scale questions found, so there is nothing to plot yet.</p>
      </Card>
    );
  }

  return (
    <Card className={styles.card}>
      <div className={styles.chartHeader}>
        <div className={styles.chartMeta}>
          <h2>{title}</h2>
          <p>
            {responses.length} check-in{responses.length !== 1 ? "s" : ""} tracked
            {effectiveZoom !== "all" && ` · ${effectiveZoom}ly average`}
          </p>
        </div>

        {showZoom && <SegmentedTabs tabs={ZOOM_TABS} value={zoom} onChange={setZoom} ariaLabel="Chart zoom level" />}
      </div>

      <LineView data={viewData} lines={lines} />
    </Card>
  );
}
