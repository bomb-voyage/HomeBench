import { queryOptions } from "@tanstack/react-query";
import { listProjects, getProject } from "./projects.functions";

export function projectsQuery(homeId: string | undefined) {
  return queryOptions({
    queryKey: ["homes", homeId, "projects"],
    queryFn: async () => {
      if (!homeId) return [];
      return listProjects({ data: { homeId } });
    },
    enabled: !!homeId,
  });
}

export function projectQuery(projectId: string | undefined) {
  return queryOptions({
    queryKey: ["projects", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return getProject({ data: { id: projectId } });
    },
    enabled: !!projectId,
  });
}

export function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatHours(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)} hr`;
}

export function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function statusLabel(status: string) {
  switch (status) {
    case "todo":
      return "To do";
    case "in_progress":
      return "In progress";
    case "done":
      return "Done";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

export function estimateStatusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Draft";
    case "estimating":
      return "Estimating…";
    case "estimated":
      return "Estimated";
    case "error":
      return "Error";
    default:
      return status;
  }
}
