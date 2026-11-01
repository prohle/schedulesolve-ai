// ECharts options for the landing preview + analytics modal.
//
// Kept as plain objects (declarative gradients, no `echarts.graphic` calls) so
// the module stays import-safe on the server and the chart component can lazily
// load the ECharts runtime in the browser only.

import type { EChartsOption } from "echarts";

const barGradient = (from: string, to: string, horizontal = false) => ({
  type: "linear" as const,
  x: 0,
  y: 0,
  x2: horizontal ? 1 : 0,
  y2: horizontal ? 0 : 1,
  colorStops: [
    { offset: 0, color: from },
    { offset: 1, color: to },
  ],
});

const axisLabel = (color: string) => ({ fontSize: 9, color });

export const facilityUtilOption: EChartsOption = {
  animationDuration: 1200,
  animationEasing: "cubicOut",
  tooltip: { trigger: "axis", formatter: "{b}: {c}%" },
  grid: { top: 20, bottom: 20, left: 30, right: 15 },
  xAxis: {
    type: "category",
    data: ["Science", "Humanities", "Engineering", "Peak Avg"],
    axisLabel: axisLabel("#64748b"),
  },
  yAxis: {
    type: "value",
    max: 100,
    axisLabel: { formatter: "{value}%", fontSize: 9, color: "#94a3b8" },
  },
  series: [
    {
      type: "bar",
      barWidth: "38%",
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: "top", formatter: "{c}%", fontSize: 9, fontWeight: "bold" },
      data: [
        { value: 91, itemStyle: { color: barGradient("#3b82f6", "#1d4ed8") } },
        { value: 88, itemStyle: { color: barGradient("#60a5fa", "#2563eb") } },
        { value: 86, itemStyle: { color: barGradient("#93c5fd", "#3b82f6") } },
        { value: 88.6, itemStyle: { color: barGradient("#10b981", "#047857") } },
      ],
    },
  ],
};

export const uniqueChoiceOption: EChartsOption = {
  animationDuration: 1400,
  tooltip: { trigger: "axis", formatter: "{b}: {c} courses" },
  grid: { top: 15, bottom: 15, left: 75, right: 30 },
  xAxis: { type: "value", max: 10, axisLabel: { fontSize: 8, color: "#94a3b8" } },
  yAxis: {
    type: "category",
    data: ["Undergrad", "Master", "Ph.D."],
    axisLabel: axisLabel("#64748b"),
  },
  series: [
    {
      type: "bar",
      barWidth: "40%",
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", formatter: "{c}", fontSize: 9, fontWeight: "bold" },
      data: [
        { value: 9, itemStyle: { color: barGradient("#0478f6", "#6d28d9", true) } },
        { value: 6, itemStyle: { color: barGradient("#3b3ca6", "#6d28d9", true) } },
        { value: 6, itemStyle: { color: barGradient("#2563eb", "#1d4ed8", true) } },
      ],
    },
  ],
};

export const facultyLoadOption: EChartsOption = {
  animationDuration: 1500,
  tooltip: { trigger: "axis", formatter: "{b}: {c}% Required Load Met" },
  grid: { top: 20, bottom: 20, left: 70, right: 30 },
  xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%", fontSize: 8, color: "#94a3b8" } },
  yAxis: {
    type: "category",
    data: ["CS Dept", "Math Dept", "Phys Dept", "Bus Dept"],
    axisLabel: axisLabel("#047857"),
  },
  series: [
    {
      type: "bar",
      barWidth: "42%",
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", formatter: "{c}%", fontSize: 9, fontWeight: "bold" },
      data: [
        { value: 100, itemStyle: { color: "#10b981" } },
        { value: 100, itemStyle: { color: "#059669" } },
        { value: 100, itemStyle: { color: "#34d399" } },
        { value: 100, itemStyle: { color: "#10b981" } },
      ],
    },
  ],
};

export const facultyPrefRadarOption: EChartsOption = {
  animationDuration: 1600,
  tooltip: {},
  radar: {
    indicator: [
      { name: "Hard Constraint", max: 100 },
      { name: "Time Preference", max: 100 },
      { name: "Course Preference", max: 100 },
      { name: "Zone Travel", max: 100 },
      { name: "Soft Constraint", max: 100 },
    ],
    radius: "56%",
    axisName: { fontSize: 8, color: "#5b21b6" },
  },
  series: [
    {
      type: "radar",
      data: [
        {
          value: [100, 96, 100, 98, 98],
          name: "Faculty Preference Alignment",
          areaStyle: { color: "rgba(124, 58, 237, 0.25)" },
          lineStyle: { color: "#7c3aed", width: 2 },
        },
      ],
    },
  ],
};

export const instructorLoadOption: EChartsOption = {
  animationDuration: 1300,
  tooltip: { trigger: "axis", formatter: "{b}: {c} Credits" },
  grid: { top: 20, bottom: 20, left: 75, right: 35 },
  xAxis: { type: "value", max: 90, axisLabel: { fontSize: 8 } },
  yAxis: {
    type: "category",
    data: ["CS 101 Intro", "CS 401 Algo", "CS 241 Maths"],
    axisLabel: axisLabel("#4c1d95"),
  },
  series: [
    {
      type: "bar",
      barWidth: "45%",
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", formatter: "{c}", fontSize: 9, fontWeight: "bold" },
      data: [
        { value: 40.0, itemStyle: { color: "#7c3aed" } },
        { value: 30.0, itemStyle: { color: "#8b5cf6" } },
        { value: 80.0, itemStyle: { color: "#a78bfa" } },
      ],
    },
  ],
};

export const instructorPrefRadarOption: EChartsOption = {
  animationDuration: 1500,
  tooltip: {},
  radar: {
    indicator: [
      { name: "Hard Constraint", max: 100 },
      { name: "Time Preference", max: 100 },
      { name: "Course Preference", max: 100 },
      { name: "Zone Travel", max: 100 },
      { name: "Soft Constraint", max: 100 },
    ],
    radius: "58%",
    axisName: { fontSize: 8, color: "#5b21b6" },
  },
  series: [
    {
      type: "radar",
      data: [
        {
          value: [100, 96, 100, 98, 98],
          name: "Prof. Chen Preferences",
          areaStyle: { color: "rgba(124, 58, 237, 0.25)" },
          lineStyle: { color: "#7c3aed", width: 2 },
        },
      ],
    },
  ],
};

export const studentDegreeOption: EChartsOption = {
  animationDuration: 1400,
  tooltip: { trigger: "item", formatter: "{b}: {c} Courses ({d}%)" },
  legend: { bottom: "0%", left: "center", textStyle: { fontSize: 9, color: "#065f46" } },
  series: [
    {
      type: "pie",
      radius: ["42%", "70%"],
      center: ["50%", "40%"],
      avoidLabelOverlap: false,
      label: { show: false },
      data: [
        { value: 3, name: "Mandatory Core Required", itemStyle: { color: "#059669" } },
        { value: 1, name: "Degree Elective Choice", itemStyle: { color: "#7c3aed" } },
      ],
    },
  ],
};

export const studentWorkOption: EChartsOption = {
  animationDuration: 1500,
  tooltip: { trigger: "axis", formatter: "{b}: {c} Sections" },
  grid: { top: 20, bottom: 25, left: 35, right: 15 },
  xAxis: {
    type: "category",
    data: ["Day Core", "Evening 18:30+"],
    axisLabel: axisLabel("#047857"),
  },
  yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 8 } },
  series: [
    {
      type: "bar",
      barWidth: "40%",
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: "top", formatter: "{c} Sections", fontSize: 9, fontWeight: "bold" },
      data: [
        { value: 3, itemStyle: { color: "#10b981" } },
        { value: 1, itemStyle: { color: "#8b5cf6" } },
      ],
    },
  ],
};

export const modalCapacityOption: EChartsOption = {
  title: { text: "Zone Capacity Breakdown", textStyle: { fontSize: 11, color: "#334155" } },
  grid: { top: 30, bottom: 20, left: 35, right: 15 },
  xAxis: { type: "category", data: ["Sci 201", "Hall A", "Eng 104", "Annex 12"], axisLabel: { fontSize: 9 } },
  yAxis: { type: "value", max: 100, axisLabel: { fontSize: 9 } },
  series: [
    {
      type: "bar",
      data: [92, 85, 86, 88],
      itemStyle: { color: "#3b82f6", borderRadius: [4, 4, 0, 0] },
      barWidth: "35%",
    },
  ],
};

export const modalSpeedOption: EChartsOption = {
  title: { text: "Parallel Kernel Race Speed (s)", textStyle: { fontSize: 11, color: "#334155" } },
  grid: { top: 30, bottom: 20, left: 80, right: 20 },
  xAxis: { type: "value", max: 0.05, axisLabel: { fontSize: 9 } },
  yAxis: { type: "category", data: ["OR-Tools", "Z3 SMT"], axisLabel: { fontSize: 9 } },
  series: [
    {
      type: "bar",
      data: [0.038, 0.034],
      itemStyle: { color: "#7c3aed", borderRadius: [0, 4, 4, 0] },
      barWidth: "35%",
    },
  ],
};

// --- Campus matrix analytics (calendar-matrix-campus design) ----------------

const interAxis = {
  axisLine: { lineStyle: { color: "#94a3b8" } },
  axisLabel: { color: "#475569", fontSize: 9, fontWeight: "bold" as const },
};

export const campusTrafficOption: EChartsOption = {
  backgroundColor: "transparent",
  tooltip: {
    trigger: "axis",
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    textStyle: { color: "#0f172a", fontSize: 10 },
  },
  grid: { top: 15, bottom: 20, left: 42, right: 12 },
  xAxis: {
    type: "category",
    data: ["08:30", "10:00 Peak", "11:30", "13:00 Recess", "14:00", "16:00", "18:00 Eve"],
    ...interAxis,
  },
  yAxis: {
    type: "value",
    max: 16000,
    splitNumber: 4,
    ...interAxis,
    splitLine: { lineStyle: { color: "#f1f5f9" } },
  },
  series: [
    { name: "Main Campus", type: "line", smooth: true, data: [4600, 6800, 6000, 800, 5100, 3900, 2200], lineStyle: { color: "#2563eb", width: 2.5 }, symbolSize: 4 },
    { name: "Engineering", type: "line", smooth: true, data: [1500, 2150, 1900, 300, 1750, 1200, 750], lineStyle: { color: "#10b981", width: 2.5 }, symbolSize: 4 },
    { name: "Business", type: "line", smooth: true, data: [1600, 2250, 2050, 250, 1850, 1400, 850], lineStyle: { color: "#8b5cf6", width: 2.5 }, symbolSize: 4 },
    { name: "Life Sciences", type: "line", smooth: true, data: [1800, 2600, 2300, 350, 2100, 1550, 950], lineStyle: { color: "#f59e0b", width: 2.5 }, symbolSize: 4 },
  ],
};

export const campusQuadOption: EChartsOption = {
  backgroundColor: "transparent",
  tooltip: { trigger: "axis", formatter: "{b}: {c}%", textStyle: { fontSize: 10 } },
  grid: { top: 10, bottom: 15, left: 94, right: 15 },
  xAxis: { type: "value", max: 100, splitLine: { lineStyle: { color: "#f1f5f9" } }, axisLabel: { color: "#475569", fontSize: 9 } },
  yAxis: {
    type: "category",
    data: ["Main Core", "Engineering", "Business & Law", "Life Sciences"],
    axisLabel: { color: "#475569", fontSize: 9, fontWeight: "bold" as const },
  },
  series: [
    {
      type: "bar",
      data: [
        { value: 81.5, itemStyle: { color: "#2563eb" } },
        { value: 76.8, itemStyle: { color: "#10b981" } },
        { value: 84.2, itemStyle: { color: "#8b5cf6" } },
        { value: 79.1, itemStyle: { color: "#f59e0b" } },
      ],
      barWidth: "40%",
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", formatter: "{c}%", fontSize: 9, fontWeight: "bold" },
    },
  ],
};
